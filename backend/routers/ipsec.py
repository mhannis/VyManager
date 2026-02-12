"""
IPsec Endpoints

Read-focused IPsec visibility for peers/groups/status.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
import re

from session_vyos_service import get_session_vyos_service
from fastapi_permissions import require_read_permission
from rbac_permissions import FeatureGroup


router = APIRouter(prefix="/vyos/vpn/ipsec", tags=["ipsec"])


class IPsecProposal(BaseModel):
    proposal_id: str
    encryption: Optional[str] = None
    hash: Optional[str] = None
    dh_group: Optional[str] = Field(default=None, alias="dh-group")
    prf: Optional[str] = None

    class Config:
        populate_by_name = True


class IKEGroup(BaseModel):
    name: str
    key_exchange: Optional[str] = Field(default=None, alias="key-exchange")
    lifetime: Optional[str] = None
    dead_peer_detection: Optional[Dict[str, Any]] = Field(default=None, alias="dead-peer-detection")
    ikev2_reauth: Optional[Dict[str, Any]] = Field(default=None, alias="ikev2-reauth")
    proposals: Dict[str, IPsecProposal] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class ESPGroup(BaseModel):
    name: str
    lifetime: Optional[str] = None
    mode: Optional[str] = None
    pfs: Optional[str] = None
    proposals: Dict[str, IPsecProposal] = Field(default_factory=dict)


class SiteToSitePeer(BaseModel):
    peer_id: str
    description: Optional[str] = None
    authentication: Optional[Dict[str, Any]] = None
    connection_type: Optional[str] = Field(default=None, alias="connection-type")
    ike_group: Optional[str] = Field(default=None, alias="ike-group")
    ikev2_reauth: Optional[str] = Field(default=None, alias="ikev2-reauth")
    local_address: Optional[str] = Field(default=None, alias="local-address")
    remote_address: Optional[str] = Field(default=None, alias="remote-address")
    vti: Optional[Dict[str, Any]] = None
    tunnels: Optional[Dict[str, Dict[str, Any]]] = None

    class Config:
        populate_by_name = True


class PSKAuthentication(BaseModel):
    psk_id: str
    ids: List[str] = Field(default_factory=list)
    secret: Optional[str] = None


class IPsecConfigResponse(BaseModel):
    ike_group: Dict[str, IKEGroup] = Field(default_factory=dict, alias="ike-group")
    esp_group: Dict[str, ESPGroup] = Field(default_factory=dict, alias="esp-group")
    site_to_site: Dict[str, SiteToSitePeer] = Field(default_factory=dict, alias="site-to-site")
    psk_secrets: Dict[str, PSKAuthentication] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class PeerSummary(BaseModel):
    peer_id: str
    description: Optional[str] = None
    local_address: Optional[str] = None
    remote_address: Optional[str] = None
    ike_group: Optional[str] = None
    connection_type: Optional[str] = None
    vti_interface: Optional[str] = None


class IPsecStatusResponse(BaseModel):
    available: bool
    established_count: int = 0
    connecting_count: int = 0
    down_count: int = 0
    raw_output: Optional[str] = None


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _extract_tag_values(value: Any) -> List[str]:
    if isinstance(value, dict):
        return sorted([str(item).strip() for item in value.keys() if str(item).strip()])
    if isinstance(value, list):
        return sorted([str(item).strip() for item in value if str(item).strip()])
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    return []


def _extract_show_output(result: Any) -> str:
    if isinstance(result, dict):
        data = result.get("data", "")
        return data if isinstance(data, str) else str(data or "")
    if isinstance(result, str):
        return result
    return str(result or "")


def _parse_proposals(proposal_root: Any) -> Dict[str, IPsecProposal]:
    proposals: Dict[str, IPsecProposal] = {}
    for proposal_id, proposal_data in _as_dict(proposal_root).items():
        data = _as_dict(proposal_data)
        proposal_key = str(proposal_id)
        proposals[proposal_key] = IPsecProposal(
            proposal_id=proposal_key,
            encryption=_as_str(data.get("encryption")),
            hash=_as_str(data.get("hash")),
            **{"dh-group": _as_str(data.get("dh-group"))},
            prf=_as_str(data.get("prf")),
        )
    return proposals


def _parse_ike_groups(root: Any) -> Dict[str, IKEGroup]:
    groups: Dict[str, IKEGroup] = {}
    for group_name, group_data in _as_dict(root).items():
        data = _as_dict(group_data)
        groups[str(group_name)] = IKEGroup(
            name=str(group_name),
            **{
                "key-exchange": _as_str(data.get("key-exchange")),
                "dead-peer-detection": _as_dict(data.get("dead-peer-detection")) or None,
                "ikev2-reauth": _as_dict(data.get("ikev2-reauth")) or None,
            },
            lifetime=_as_str(data.get("lifetime")),
            proposals=_parse_proposals(data.get("proposal")),
        )
    return groups


def _parse_esp_groups(root: Any) -> Dict[str, ESPGroup]:
    groups: Dict[str, ESPGroup] = {}
    for group_name, group_data in _as_dict(root).items():
        data = _as_dict(group_data)
        groups[str(group_name)] = ESPGroup(
            name=str(group_name),
            lifetime=_as_str(data.get("lifetime")),
            mode=_as_str(data.get("mode")),
            pfs=_as_str(data.get("pfs")),
            proposals=_parse_proposals(data.get("proposal")),
        )
    return groups


def _extract_site_to_site_peers(root: Any) -> Dict[str, Any]:
    data = _as_dict(root)
    peer_map = _as_dict(data.get("peer"))
    if peer_map:
        return peer_map
    return data


def _parse_site_to_site(root: Any) -> Dict[str, SiteToSitePeer]:
    peers: Dict[str, SiteToSitePeer] = {}
    peer_map = _extract_site_to_site_peers(root)
    for peer_id, peer_data in _as_dict(peer_map).items():
        data = _as_dict(peer_data)
        auth = _as_dict(data.get("authentication"))
        auth_public = {
            "mode": _as_str(auth.get("mode")),
            "local-id": _as_str(auth.get("local-id")),
            "remote-id": _as_str(auth.get("remote-id")),
        }
        auth_clean = {key: value for key, value in auth_public.items() if value}

        vti_data = _as_dict(data.get("vti"))
        vti_public = {
            "bind": _as_str(vti_data.get("bind")),
            "esp-group": _as_str(vti_data.get("esp-group")),
        }
        vti_clean = {key: value for key, value in vti_public.items() if value}

        tunnel_root = _as_dict(data.get("tunnel"))
        tunnels: Dict[str, Dict[str, Any]] = {}
        for tunnel_id, tunnel_data in tunnel_root.items():
            tunnel = _as_dict(tunnel_data)
            tunnels[str(tunnel_id)] = {
                key: value for key, value in tunnel.items() if value is not None
            }

        peers[str(peer_id)] = SiteToSitePeer(
            peer_id=str(peer_id),
            description=_as_str(data.get("description")),
            authentication=auth_clean or None,
            **{
                "connection-type": _as_str(data.get("connection-type")),
                "ike-group": _as_str(data.get("ike-group")),
                "ikev2-reauth": _as_str(data.get("ikev2-reauth")),
                "local-address": _as_str(data.get("local-address")),
                "remote-address": _as_str(data.get("remote-address")),
            },
            vti=vti_clean or None,
            tunnels=tunnels or None,
        )
    return peers


def _parse_psk_secrets(root: Any) -> Dict[str, PSKAuthentication]:
    auth_root = _as_dict(root)
    psk_root = _as_dict(auth_root.get("psk"))
    parsed: Dict[str, PSKAuthentication] = {}
    for psk_id, psk_data in psk_root.items():
        data = _as_dict(psk_data)
        parsed[str(psk_id)] = PSKAuthentication(
            psk_id=str(psk_id),
            ids=_extract_tag_values(data.get("id")),
            secret=_as_str(data.get("secret")),
        )
    return parsed


def _parse_ipsec_status(raw_output: str) -> IPsecStatusResponse:
    lines = [line.strip() for line in raw_output.splitlines() if line.strip()]
    established = 0
    connecting = 0
    down = 0

    for line in lines:
        lowered = line.lower()
        if "established" in lowered or "up" in lowered:
            established += 1
        elif "connecting" in lowered or "init" in lowered:
            connecting += 1
        elif "down" in lowered or "failed" in lowered:
            down += 1

    return IPsecStatusResponse(
        available=bool(lines),
        established_count=established,
        connecting_count=connecting,
        down_count=down,
        raw_output=raw_output or None,
    )


@router.get("/config", response_model=IPsecConfigResponse)
async def get_ipsec_config(request: Request, refresh: bool = False) -> IPsecConfigResponse:
    """Get parsed IPsec configuration from VyOS config tree."""
    await require_read_permission(request, FeatureGroup.IPSEC)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=refresh)
        vpn_root = _as_dict(full_config.get("vpn"))
        ipsec_root = _as_dict(vpn_root.get("ipsec"))

        return IPsecConfigResponse(
            **{
                "ike-group": _parse_ike_groups(ipsec_root.get("ike-group")),
                "esp-group": _parse_esp_groups(ipsec_root.get("esp-group")),
                "site-to-site": _parse_site_to_site(ipsec_root.get("site-to-site")),
            },
            psk_secrets=_parse_psk_secrets(ipsec_root.get("authentication")),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving IPsec configuration: {str(exc)}")


@router.get("/peers", response_model=List[PeerSummary])
async def get_ipsec_peers(request: Request, refresh: bool = False) -> List[PeerSummary]:
    """Get flat site-to-site peer summary list for VPN page."""
    config = await get_ipsec_config(request, refresh=refresh)
    peers: List[PeerSummary] = []

    for peer_id, peer in sorted(config.site_to_site.items(), key=lambda item: item[0]):
        vti_interface = None
        if peer.vti:
            vti_interface = _as_str(peer.vti.get("bind"))

        peers.append(
            PeerSummary(
                peer_id=peer_id,
                description=peer.description,
                local_address=peer.local_address,
                remote_address=peer.remote_address,
                ike_group=peer.ike_group,
                connection_type=peer.connection_type,
                vti_interface=vti_interface,
            )
        )

    return peers


@router.get("/status", response_model=IPsecStatusResponse)
async def get_ipsec_status(request: Request) -> IPsecStatusResponse:
    """Get runtime IPsec SA status (best-effort parser with command fallbacks)."""
    await require_read_permission(request, FeatureGroup.IPSEC)

    try:
        service = get_session_vyos_service(request)

        attempts = [
            ["vpn", "ipsec", "sa"],
            ["vpn", "ipsec", "status"],
            ["ipsec", "sa"],
            ["ipsec"],
        ]

        outputs: List[str] = []
        for path in attempts:
            response = await run_in_threadpool(service.device.show, path=path)
            if response.status != 200:
                continue
            output = _extract_show_output(response.result)
            if output.strip():
                outputs.append(output)
                if re.search(r"\b(ESTABLISHED|CONNECTING|down|UP)\b", output, re.IGNORECASE):
                    break

        if not outputs:
            return IPsecStatusResponse(available=False)

        return _parse_ipsec_status(outputs[0])
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving IPsec status: {str(exc)}")
