"""
IPsec Endpoints

Supports viewing and managing VyOS IPsec configuration (groups, peers, PSKs),
plus best-effort runtime status.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
import ipaddress
import re

from session_vyos_service import get_session_vyos_service
from fastapi_permissions import require_read_permission, require_write_permission
from rbac_permissions import FeatureGroup


router = APIRouter(prefix="/vyos/vpn/ipsec", tags=["ipsec"])

RE_GROUP_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")
RE_PEER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$")
RE_PSK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$")
RE_NUMERIC_ID = re.compile(r"^[1-9][0-9]{0,3}$")
RE_INTERFACE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,62}$")


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


class DeadPeerDetectionRequest(BaseModel):
    action: Optional[str] = None
    interval: Optional[str] = None
    timeout: Optional[str] = None


class IPsecProposalUpsertRequest(BaseModel):
    proposal_id: str
    encryption: Optional[str] = None
    hash: Optional[str] = None
    dh_group: Optional[str] = None
    prf: Optional[str] = None


class IKEGroupUpsertRequest(BaseModel):
    key_exchange: Optional[str] = None
    lifetime: Optional[str] = None
    dead_peer_detection: Optional[DeadPeerDetectionRequest] = None
    proposals: List[IPsecProposalUpsertRequest] = Field(default_factory=list)


class ESPGroupUpsertRequest(BaseModel):
    lifetime: Optional[str] = None
    mode: Optional[str] = None
    pfs: Optional[str] = None
    proposals: List[IPsecProposalUpsertRequest] = Field(default_factory=list)


class TunnelUpsertRequest(BaseModel):
    tunnel_id: str
    local_prefix: Optional[str] = None
    remote_prefix: Optional[str] = None
    esp_group: Optional[str] = None


class PeerAuthenticationUpsertRequest(BaseModel):
    mode: Optional[str] = None
    local_id: Optional[str] = None
    remote_id: Optional[str] = None


class VTIBindingUpsertRequest(BaseModel):
    bind: Optional[str] = None
    esp_group: Optional[str] = None


class SiteToSitePeerUpsertRequest(BaseModel):
    description: Optional[str] = None
    connection_type: Optional[str] = None
    ike_group: Optional[str] = None
    local_address: Optional[str] = None
    remote_address: Optional[str] = None
    authentication: Optional[PeerAuthenticationUpsertRequest] = None
    vti: Optional[VTIBindingUpsertRequest] = None
    tunnels: List[TunnelUpsertRequest] = Field(default_factory=list)


class PSKUpsertRequest(BaseModel):
    ids: List[str] = Field(default_factory=list)
    secret: Optional[str] = None


class IPsecOperationResponse(BaseModel):
    success: bool
    resource: str
    name: str
    message: str


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


def _clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _normalize_token_or_400(value: str, *, label: str, pattern: re.Pattern[str]) -> str:
    clean = value.strip()
    if not clean:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    if not pattern.match(clean):
        raise HTTPException(status_code=400, detail=f"{label} '{clean}' is invalid")
    return clean


def _normalize_group_name_or_400(name: str) -> str:
    return _normalize_token_or_400(name, label="Group name", pattern=RE_GROUP_NAME)


def _normalize_peer_id_or_400(peer_id: str) -> str:
    return _normalize_token_or_400(peer_id, label="Peer ID", pattern=RE_PEER_ID)


def _normalize_psk_id_or_400(psk_id: str) -> str:
    return _normalize_token_or_400(psk_id, label="PSK ID", pattern=RE_PSK_ID)


def _normalize_numeric_id_or_400(value: str, *, label: str) -> str:
    return _normalize_token_or_400(value, label=label, pattern=RE_NUMERIC_ID)


def _normalize_interface_name_or_400(value: str, *, label: str = "Interface name") -> str:
    return _normalize_token_or_400(value, label=label, pattern=RE_INTERFACE_NAME)


def _normalize_cidr_or_400(value: str, *, label: str) -> str:
    clean = value.strip()
    if not clean:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    try:
        ipaddress.ip_network(clean, strict=False)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{label} '{clean}' is not a valid CIDR network")
    return clean


def _extract_ipsec_root(full_config: Dict[str, Any]) -> Dict[str, Any]:
    vpn_root = _as_dict(full_config.get("vpn"))
    return _as_dict(vpn_root.get("ipsec"))


async def _run_configure_or_500(service: Any, operations: List[Dict[str, Any]], *, label: str) -> None:
    if not operations:
        return

    response = await run_in_threadpool(service.device.configure_multiple_op, op_path=operations)
    if response.status == 200:
        return

    error_message = response.error or _extract_show_output(response.result) or "Unknown error"
    raise HTTPException(status_code=500, detail=f"VyOS rejected {label}: {error_message}")


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


# ========================================================================
# Write Endpoints
# ========================================================================


@router.put("/ike-group/{group_name}", response_model=IPsecOperationResponse)
async def upsert_ike_group(
    request: Request,
    group_name: str,
    body: IKEGroupUpsertRequest,
) -> IPsecOperationResponse:
    """Create/update one IKE group (replace proposals + DPD subtree)."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    name = _normalize_group_name_or_400(group_name)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        existing_root = _as_dict(ipsec_root.get("ike-group"))
        existing = _as_dict(existing_root.get(name))

        operations: List[Dict[str, Any]] = []

        key_exchange = _clean_optional(body.key_exchange)
        if key_exchange:
            operations.append(
                {"op": "set", "path": ["vpn", "ipsec", "ike-group", name, "key-exchange", key_exchange]}
            )
        elif "key-exchange" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "ike-group", name, "key-exchange"]})

        lifetime = _clean_optional(body.lifetime)
        if lifetime:
            operations.append({"op": "set", "path": ["vpn", "ipsec", "ike-group", name, "lifetime", lifetime]})
        elif "lifetime" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "ike-group", name, "lifetime"]})

        # Replace DPD subtree when present in config or request
        if "dead-peer-detection" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "ike-group", name, "dead-peer-detection"]})

        if body.dead_peer_detection:
            dpd_action = _clean_optional(body.dead_peer_detection.action)
            dpd_interval = _clean_optional(body.dead_peer_detection.interval)
            dpd_timeout = _clean_optional(body.dead_peer_detection.timeout)
            if dpd_action:
                operations.append(
                    {
                        "op": "set",
                        "path": ["vpn", "ipsec", "ike-group", name, "dead-peer-detection", "action", dpd_action],
                    }
                )
            if dpd_interval:
                operations.append(
                    {
                        "op": "set",
                        "path": ["vpn", "ipsec", "ike-group", name, "dead-peer-detection", "interval", dpd_interval],
                    }
                )
            if dpd_timeout:
                operations.append(
                    {
                        "op": "set",
                        "path": ["vpn", "ipsec", "ike-group", name, "dead-peer-detection", "timeout", dpd_timeout],
                    }
                )

        # Replace proposals subtree
        if "proposal" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "ike-group", name, "proposal"]})

        for proposal in body.proposals:
            proposal_id = _normalize_numeric_id_or_400(str(proposal.proposal_id), label="Proposal ID")
            enc = _clean_optional(proposal.encryption)
            hsh = _clean_optional(proposal.hash)
            if not enc or not hsh:
                raise HTTPException(status_code=400, detail=f"IKE proposal {proposal_id} requires encryption and hash")
            operations.append(
                {
                    "op": "set",
                    "path": ["vpn", "ipsec", "ike-group", name, "proposal", proposal_id, "encryption", enc],
                }
            )
            operations.append(
                {
                    "op": "set",
                    "path": ["vpn", "ipsec", "ike-group", name, "proposal", proposal_id, "hash", hsh],
                }
            )
            dh_group = _clean_optional(proposal.dh_group)
            if dh_group:
                operations.append(
                    {
                        "op": "set",
                        "path": ["vpn", "ipsec", "ike-group", name, "proposal", proposal_id, "dh-group", dh_group],
                    }
                )
            prf = _clean_optional(proposal.prf)
            if prf:
                operations.append(
                    {
                        "op": "set",
                        "path": ["vpn", "ipsec", "ike-group", name, "proposal", proposal_id, "prf", prf],
                    }
                )

        if not operations:
            return IPsecOperationResponse(success=True, resource="ike-group", name=name, message="No changes requested")

        await _run_configure_or_500(service, operations, label=f"IKE group '{name}' update")
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="ike-group", name=name, message="IKE group updated")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating IKE group: {str(exc)}")


@router.delete("/ike-group/{group_name}", response_model=IPsecOperationResponse)
async def delete_ike_group(request: Request, group_name: str) -> IPsecOperationResponse:
    """Delete one IKE group."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    name = _normalize_group_name_or_400(group_name)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        existing_root = _as_dict(ipsec_root.get("ike-group"))
        if name not in existing_root:
            raise HTTPException(status_code=404, detail=f"IKE group '{name}' not found")

        await _run_configure_or_500(
            service,
            [{"op": "delete", "path": ["vpn", "ipsec", "ike-group", name]}],
            label=f"IKE group '{name}' delete",
        )
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="ike-group", name=name, message="IKE group deleted")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting IKE group: {str(exc)}")


@router.put("/esp-group/{group_name}", response_model=IPsecOperationResponse)
async def upsert_esp_group(
    request: Request,
    group_name: str,
    body: ESPGroupUpsertRequest,
) -> IPsecOperationResponse:
    """Create/update one ESP group (replace proposals subtree)."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    name = _normalize_group_name_or_400(group_name)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        existing_root = _as_dict(ipsec_root.get("esp-group"))
        existing = _as_dict(existing_root.get(name))

        operations: List[Dict[str, Any]] = []

        lifetime = _clean_optional(body.lifetime)
        if lifetime:
            operations.append({"op": "set", "path": ["vpn", "ipsec", "esp-group", name, "lifetime", lifetime]})
        elif "lifetime" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "esp-group", name, "lifetime"]})

        mode = _clean_optional(body.mode)
        if mode:
            operations.append({"op": "set", "path": ["vpn", "ipsec", "esp-group", name, "mode", mode]})
        elif "mode" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "esp-group", name, "mode"]})

        pfs = _clean_optional(body.pfs)
        if pfs:
            operations.append({"op": "set", "path": ["vpn", "ipsec", "esp-group", name, "pfs", pfs]})
        elif "pfs" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "esp-group", name, "pfs"]})

        if "proposal" in existing:
            operations.append({"op": "delete", "path": ["vpn", "ipsec", "esp-group", name, "proposal"]})

        for proposal in body.proposals:
            proposal_id = _normalize_numeric_id_or_400(str(proposal.proposal_id), label="Proposal ID")
            enc = _clean_optional(proposal.encryption)
            hsh = _clean_optional(proposal.hash)
            if not enc or not hsh:
                raise HTTPException(status_code=400, detail=f"ESP proposal {proposal_id} requires encryption and hash")
            operations.append(
                {
                    "op": "set",
                    "path": ["vpn", "ipsec", "esp-group", name, "proposal", proposal_id, "encryption", enc],
                }
            )
            operations.append(
                {
                    "op": "set",
                    "path": ["vpn", "ipsec", "esp-group", name, "proposal", proposal_id, "hash", hsh],
                }
            )

        if not operations:
            return IPsecOperationResponse(success=True, resource="esp-group", name=name, message="No changes requested")

        await _run_configure_or_500(service, operations, label=f"ESP group '{name}' update")
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="esp-group", name=name, message="ESP group updated")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating ESP group: {str(exc)}")


@router.delete("/esp-group/{group_name}", response_model=IPsecOperationResponse)
async def delete_esp_group(request: Request, group_name: str) -> IPsecOperationResponse:
    """Delete one ESP group."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    name = _normalize_group_name_or_400(group_name)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        existing_root = _as_dict(ipsec_root.get("esp-group"))
        if name not in existing_root:
            raise HTTPException(status_code=404, detail=f"ESP group '{name}' not found")

        await _run_configure_or_500(
            service,
            [{"op": "delete", "path": ["vpn", "ipsec", "esp-group", name]}],
            label=f"ESP group '{name}' delete",
        )
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="esp-group", name=name, message="ESP group deleted")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting ESP group: {str(exc)}")


@router.put("/peer/{peer_id}", response_model=IPsecOperationResponse)
async def upsert_site_to_site_peer(
    request: Request,
    peer_id: str,
    body: SiteToSitePeerUpsertRequest,
) -> IPsecOperationResponse:
    """Create/update one site-to-site peer (replace auth/vti/tunnel subtrees)."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    peer_key = _normalize_peer_id_or_400(peer_id)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        s2s_root = _as_dict(ipsec_root.get("site-to-site"))
        peer_root = _as_dict(s2s_root.get("peer")) or _as_dict(s2s_root)
        existing = _as_dict(peer_root.get(peer_key))

        base = ["vpn", "ipsec", "site-to-site", "peer", peer_key]
        operations: List[Dict[str, Any]] = []

        description = _clean_optional(body.description)
        if description:
            operations.append({"op": "set", "path": base + ["description", description]})
        elif "description" in existing:
            operations.append({"op": "delete", "path": base + ["description"]})

        connection_type = _clean_optional(body.connection_type)
        if connection_type:
            operations.append({"op": "set", "path": base + ["connection-type", connection_type]})
        elif "connection-type" in existing:
            operations.append({"op": "delete", "path": base + ["connection-type"]})

        ike_group = _clean_optional(body.ike_group)
        if ike_group:
            operations.append({"op": "set", "path": base + ["ike-group", ike_group]})
        elif "ike-group" in existing:
            operations.append({"op": "delete", "path": base + ["ike-group"]})

        local_address = _clean_optional(body.local_address)
        if local_address:
            operations.append({"op": "set", "path": base + ["local-address", local_address]})
        elif "local-address" in existing:
            operations.append({"op": "delete", "path": base + ["local-address"]})

        remote_address = _clean_optional(body.remote_address) or peer_key
        if remote_address:
            operations.append({"op": "set", "path": base + ["remote-address", remote_address]})

        # Replace auth subtree when present in config or request
        if "authentication" in existing:
            operations.append({"op": "delete", "path": base + ["authentication"]})

        auth = body.authentication
        if auth:
            mode = _clean_optional(auth.mode) or "pre-shared-secret"
            operations.append({"op": "set", "path": base + ["authentication", "mode", mode]})
            local_id = _clean_optional(auth.local_id)
            if local_id:
                operations.append({"op": "set", "path": base + ["authentication", "local-id", local_id]})
            remote_id = _clean_optional(auth.remote_id)
            if remote_id:
                operations.append({"op": "set", "path": base + ["authentication", "remote-id", remote_id]})

        # Replace VTI subtree
        if "vti" in existing:
            operations.append({"op": "delete", "path": base + ["vti"]})
        if body.vti:
            vti_bind = _clean_optional(body.vti.bind)
            vti_esp = _clean_optional(body.vti.esp_group)
            if vti_bind:
                _normalize_interface_name_or_400(vti_bind, label="VTI bind interface")
                operations.append({"op": "set", "path": base + ["vti", "bind", vti_bind]})
            if vti_esp:
                operations.append({"op": "set", "path": base + ["vti", "esp-group", vti_esp]})

        # Replace tunnels subtree
        if "tunnel" in existing:
            operations.append({"op": "delete", "path": base + ["tunnel"]})
        for tunnel in body.tunnels:
            tunnel_id = _normalize_numeric_id_or_400(str(tunnel.tunnel_id), label="Tunnel ID")
            esp_group_name = _clean_optional(tunnel.esp_group)
            local_prefix = _clean_optional(tunnel.local_prefix)
            remote_prefix = _clean_optional(tunnel.remote_prefix)

            if local_prefix:
                local_prefix = _normalize_cidr_or_400(local_prefix, label=f"Tunnel {tunnel_id} local prefix")
                operations.append({"op": "set", "path": base + ["tunnel", tunnel_id, "local", "prefix", local_prefix]})
            if remote_prefix:
                remote_prefix = _normalize_cidr_or_400(remote_prefix, label=f"Tunnel {tunnel_id} remote prefix")
                operations.append({"op": "set", "path": base + ["tunnel", tunnel_id, "remote", "prefix", remote_prefix]})
            if esp_group_name:
                operations.append({"op": "set", "path": base + ["tunnel", tunnel_id, "esp-group", esp_group_name]})

        if not operations:
            return IPsecOperationResponse(success=True, resource="peer", name=peer_key, message="No changes requested")

        await _run_configure_or_500(service, operations, label=f"IPsec peer '{peer_key}' update")
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="peer", name=peer_key, message="Peer updated")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating IPsec peer: {str(exc)}")


@router.delete("/peer/{peer_id}", response_model=IPsecOperationResponse)
async def delete_site_to_site_peer(request: Request, peer_id: str) -> IPsecOperationResponse:
    """Delete one site-to-site peer."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    peer_key = _normalize_peer_id_or_400(peer_id)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        s2s_root = _as_dict(ipsec_root.get("site-to-site"))
        peer_root = _as_dict(s2s_root.get("peer")) or _as_dict(s2s_root)
        if peer_key not in peer_root:
            raise HTTPException(status_code=404, detail=f"Peer '{peer_key}' not found")

        await _run_configure_or_500(
            service,
            [{"op": "delete", "path": ["vpn", "ipsec", "site-to-site", "peer", peer_key]}],
            label=f"IPsec peer '{peer_key}' delete",
        )
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="peer", name=peer_key, message="Peer deleted")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting IPsec peer: {str(exc)}")


@router.put("/psk/{psk_id}", response_model=IPsecOperationResponse)
async def upsert_psk_entry(
    request: Request,
    psk_id: str,
    body: PSKUpsertRequest,
) -> IPsecOperationResponse:
    """Create/update one PSK entry (replace id list, optional secret update)."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    name = _normalize_psk_id_or_400(psk_id)

    try:
        ids = [item.strip() for item in (body.ids or []) if str(item).strip()]
        unique_ids: List[str] = []
        seen = set()
        for item in ids:
            if item in seen:
                continue
            seen.add(item)
            unique_ids.append(item)

        if not unique_ids:
            raise HTTPException(status_code=400, detail="At least one PSK id selector is required")

        secret = body.secret
        secret_clean = None if secret is None else str(secret)
        if secret_clean is not None and not secret_clean.strip():
            raise HTTPException(status_code=400, detail="PSK secret cannot be empty when provided")

        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        auth_root = _as_dict(ipsec_root.get("authentication"))
        psk_root = _as_dict(auth_root.get("psk"))
        existing = _as_dict(psk_root.get(name))
        existing_present = name in psk_root

        # New entry requires a secret (so VyOS can actually use it).
        if not existing_present and secret_clean is None:
            raise HTTPException(status_code=400, detail="PSK secret is required when creating a new PSK entry")

        base = ["vpn", "ipsec", "authentication", "psk", name]
        operations: List[Dict[str, Any]] = []

        if "id" in existing:
            operations.append({"op": "delete", "path": base + ["id"]})
        for selector in unique_ids:
            operations.append({"op": "set", "path": base + ["id", selector]})

        if secret_clean is not None:
            operations.append({"op": "set", "path": base + ["secret", secret_clean]})

        if not operations:
            return IPsecOperationResponse(success=True, resource="psk", name=name, message="No changes requested")

        await _run_configure_or_500(service, operations, label=f"PSK '{name}' update")
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="psk", name=name, message="PSK updated")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error updating PSK entry: {str(exc)}")


@router.delete("/psk/{psk_id}", response_model=IPsecOperationResponse)
async def delete_psk_entry(request: Request, psk_id: str) -> IPsecOperationResponse:
    """Delete one PSK entry."""
    await require_write_permission(request, FeatureGroup.IPSEC)

    name = _normalize_psk_id_or_400(psk_id)

    try:
        service = get_session_vyos_service(request)
        full_config = await run_in_threadpool(service.get_full_config, refresh=True)
        ipsec_root = _extract_ipsec_root(full_config)
        auth_root = _as_dict(ipsec_root.get("authentication"))
        psk_root = _as_dict(auth_root.get("psk"))
        if name not in psk_root:
            raise HTTPException(status_code=404, detail=f"PSK '{name}' not found")

        await _run_configure_or_500(
            service,
            [{"op": "delete", "path": ["vpn", "ipsec", "authentication", "psk", name]}],
            label=f"PSK '{name}' delete",
        )
        await run_in_threadpool(service.refresh_config)
        return IPsecOperationResponse(success=True, resource="psk", name=name, message="PSK deleted")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error deleting PSK entry: {str(exc)}")
