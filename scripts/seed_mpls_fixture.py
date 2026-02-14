#!/usr/bin/env python3
"""
Seed MPLS baseline configuration on the active VyManager instance.

Usage:
  set -a && source backend/.env && set +a
  PYTHONPATH=backend backend/.venv/bin/python scripts/seed_mpls_fixture.py

Optional:
  PYTHONPATH=backend backend/.venv/bin/python scripts/seed_mpls_fixture.py --force
  PYTHONPATH=backend backend/.venv/bin/python scripts/seed_mpls_fixture.py --clear
"""

from __future__ import annotations

import argparse
import asyncio
import ipaddress
import os
import sys
from typing import Any, Dict, Iterable, Optional, Tuple

import asyncpg

from vyos_service import VyOSDeviceConfig, VyOSService


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _flatten_addresses(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if isinstance(item, (str, int, float))]
    if isinstance(value, dict):
        return [str(key) for key in value.keys()]
    return []


def _first_static_ipv4_interface(config: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    interfaces = _as_dict(config.get("interfaces"))
    ethernet = _as_dict(interfaces.get("ethernet"))
    for iface in sorted(ethernet.keys()):
        entry = _as_dict(ethernet.get(iface))
        for address in _flatten_addresses(entry.get("address")):
            token = address.strip().lower()
            if token in {"dhcp", "dhcpv6", "dhcpv6-pd"}:
                continue
            try:
                ipi = ipaddress.ip_interface(address.strip())
            except ValueError:
                continue
            if ipi.version == 4:
                return iface, str(ipi)
    return None


def _has_path(node: Dict[str, Any], path: Iterable[str]) -> bool:
    current: Any = node
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    return True


def _safe_show_mpls_commands(service: VyOSService) -> list[str]:
    show = service.device.show(path=["configuration", "commands"])
    if getattr(show, "status", None) != 200:
        return []
    result = getattr(show, "result", "")
    if isinstance(result, str):
        return [line.strip() for line in result.splitlines() if "protocols mpls" in line]
    if isinstance(result, list):
        lines: list[str] = []
        for item in result:
            text = str(item).strip()
            if "protocols mpls" in text:
                lines.append(text)
        return lines
    return []


async def _load_active_instance() -> Optional[Dict[str, Any]]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set. Export backend/.env first.")

    conn = await asyncpg.connect(database_url)
    try:
        row = await conn.fetchrow(
            """
            SELECT
                i.name,
                i.host,
                i.port,
                COALESCE(i."apiKey", i.password) AS api_key,
                COALESCE(i.protocol, 'https') AS protocol,
                COALESCE(i."verifySsl", FALSE) AS verify_ssl,
                COALESCE(i."vyosVersion", '1.5') AS vyos_version
            FROM active_sessions a
            JOIN instances i ON i.id = a."instanceId"
            ORDER BY a."connectedAt" DESC
            LIMIT 1
            """
        )
        return dict(row) if row else None
    finally:
        await conn.close()


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed MPLS baseline configuration on active instance")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Apply baseline commands even if MPLS config already exists",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Delete full MPLS protocol subtree from active instance and exit",
    )
    args = parser.parse_args()

    active = await _load_active_instance()
    if not active:
        print("No active session found. Connect to a site instance first in the UI (/sites).")
        return 1

    service = VyOSService(
        VyOSDeviceConfig(
            hostname=str(active["host"]),
            apikey=str(active["api_key"]),
            version=str(active["vyos_version"]),
            protocol=str(active["protocol"]),
            port=int(active["port"]),
            verify=bool(active["verify_ssl"]),
        )
    )

    full = service.get_full_config(refresh=True)
    mpls_root = _as_dict(_as_dict(full.get("protocols")).get("mpls"))

    if args.clear:
        if not mpls_root:
            print("MPLS config is already empty; nothing to clear.")
            return 0
        response = service.apply_operations(
            [{"op": "delete", "path": ["protocols", "mpls"]}],
            reason="seed_mpls_fixture_clear",
        )
        if response.status != 200:
            print(f"Failed to clear MPLS: {response.error}")
            return 4
        print(f"Cleared MPLS config on {active['name']} ({active['host']}).")
        return 0

    if mpls_root and not args.force:
        print("MPLS config already exists; skipping seed. Use --force to re-apply baseline.")
        existing = _safe_show_mpls_commands(service)
        if existing:
            print("\nExisting MPLS commands:")
            for line in existing:
                print(f"  {line}")
        return 0

    iface_data = _first_static_ipv4_interface(full)
    if not iface_data:
        print("No interface with a static IPv4 address found; cannot build MPLS baseline.")
        return 2

    iface, iface_cidr = iface_data
    router_id = str(ipaddress.ip_interface(iface_cidr).ip)

    desired_paths = [
        ["protocols", "mpls", "interface", iface],
        ["protocols", "mpls", "ldp", "interface", iface],
        ["protocols", "mpls", "ldp", "router-id", router_id],
        ["protocols", "mpls", "ldp", "discovery", "transport-address", "ipv4", router_id],
        ["protocols", "mpls", "ldp", "discovery", "hello", "interval", "ipv4", "5"],
        ["protocols", "mpls", "ldp", "discovery", "hello", "holdtime", "ipv4", "15"],
        ["protocols", "mpls", "ldp", "session-holdtime", "ipv4", "180"],
        ["protocols", "mpls", "ldp", "parameter", "ordered-control"],
        ["protocols", "mpls", "ldp", "parameter", "transport-prefer-ipv4"],
        ["protocols", "mpls", "ldp", "targeted-hello", "accept", "ipv4"],
    ]

    operations = []
    for path in desired_paths:
        if args.force or not _has_path(full, path):
            operations.append({"op": "set", "path": path})

    if not operations:
        print("MPLS baseline already present; no changes required.")
        return 0

    print(f"Seeding MPLS baseline on {active['name']} ({active['host']}) using {iface}")
    response = service.apply_operations(operations, reason="seed_mpls_fixture")
    if response.status != 200:
        print(f"Failed to seed MPLS: {response.error}")
        return 3

    commands = _safe_show_mpls_commands(service)
    print("MPLS seed applied successfully.")
    if commands:
        print("\nResulting MPLS commands:")
        for line in commands:
            print(f"  {line}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

