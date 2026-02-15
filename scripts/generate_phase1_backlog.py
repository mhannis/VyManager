#!/usr/bin/env python3
"""
Phase 1 coverage classification and prioritized backlog generator.

Inputs:
  - CONFIG_COVERAGE_MATRIX.json (crawler output)

Outputs:
  - CONFIG_COVERAGE_PHASE1.json
  - CONFIG_COVERAGE_PHASE1.md
  - PARITY_BACKLOG.json
  - PARITY_BACKLOG.md
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
MATRIX_PATH = REPO_ROOT / "CONFIG_COVERAGE_MATRIX.json"
PHASE1_JSON_PATH = REPO_ROOT / "CONFIG_COVERAGE_PHASE1.json"
PHASE1_MD_PATH = REPO_ROOT / "CONFIG_COVERAGE_PHASE1.md"
BACKLOG_JSON_PATH = REPO_ROOT / "PARITY_BACKLOG.json"
BACKLOG_MD_PATH = REPO_ROOT / "PARITY_BACKLOG.md"


SEGMENT_TO_DOMAIN = {
    "system": "system",
    "interfaces": "interfaces",
    "firewall": "firewall",
    "nat": "nat",
    "policy": "policy",
    "service": "services",
    "protocols": "protocols",
    "vpn": "vpn",
    "highavailability": "ha",
    "vrf": "vrf",
    "loadbalancing": "load_balancing",
    "trafficpolicy": "traffic_policy",
    "container": "container",
    "pki": "pki",
    "configuration": "meta",
}


DOMAIN_DISPLAY_ORDER = [
    "interfaces",
    "policy",
    "protocols",
    "firewall",
    "nat",
    "system",
    "services",
    "vpn",
    "ha",
    "vrf",
    "load_balancing",
    "traffic_policy",
    "container",
    "pki",
    "meta",
]


DOMAIN_RISK = {
    "interfaces": 100,
    "policy": 95,          # routing policy
    "protocols": 94,       # routing protocols
    "firewall": 93,
    "nat": 92,
    "system": 80,
    "services": 78,
    "vpn": 70,
    "ha": 65,
    "vrf": 60,
    "load_balancing": 55,
    "traffic_policy": 50,
    "container": 45,
    "pki": 35,
    "meta": 10,
}


DOMAIN_REUSE = {
    "interfaces": 95,
    "policy": 100,
    "protocols": 90,
    "firewall": 95,
    "nat": 85,
    "system": 75,
    "services": 88,
    "vpn": 72,
    "ha": 55,
    "vrf": 62,
    "load_balancing": 68,
    "traffic_policy": 78,
    "container": 64,
    "pki": 30,
    "meta": 10,
}


DOMAIN_EVIDENCE_PATTERNS = {
    "system": {
        "backend": [
            "backend/routers/system.py",
            "backend/routers/power.py",
            "backend/routers/config/config.py",
        ],
        "frontend": [
            "frontend/src/app/system/**/*.tsx",
            "frontend/src/components/system/**/*.tsx",
            "frontend/src/app/settings/page.tsx",
        ],
    },
    "interfaces": {
        "backend": ["backend/routers/interfaces/**/*.py"],
        "frontend": [
            "frontend/src/app/network/interfaces/page.tsx",
            "frontend/src/components/interfaces/**/*.tsx",
        ],
    },
    "firewall": {
        "backend": [
            "backend/routers/firewall/**/*.py",
            "backend/routers/firewall_global_options/**/*.py",
        ],
        "frontend": [
            "frontend/src/app/firewall/**/*.tsx",
            "frontend/src/components/firewall/**/*.tsx",
        ],
    },
    "nat": {
        "backend": ["backend/routers/nat/**/*.py"],
        "frontend": [
            "frontend/src/app/network/nat/page.tsx",
            "frontend/src/components/nat/**/*.tsx",
        ],
    },
    "policy": {
        "backend": [
            "backend/routers/access_list/**/*.py",
            "backend/routers/as_path_list/**/*.py",
            "backend/routers/community_list/**/*.py",
            "backend/routers/extcommunity_list/**/*.py",
            "backend/routers/large_community_list/**/*.py",
            "backend/routers/local_route/**/*.py",
            "backend/routers/prefix_list/**/*.py",
            "backend/routers/route/**/*.py",
            "backend/routers/route_map/**/*.py",
        ],
        "frontend": [
            "frontend/src/app/policies/**/*.tsx",
            "frontend/src/components/policies/**/*.tsx",
        ],
    },
    "services": {
        "backend": [
            "backend/routers/dhcp/**/*.py",
            "backend/routers/system.py",
        ],
        "frontend": [
            "frontend/src/app/system/services/page.tsx",
            "frontend/src/components/services/**/*.tsx",
            "frontend/src/components/system/*ServiceTab.tsx",
            "frontend/src/app/network/dhcp/page.tsx",
        ],
    },
    "protocols": {
        "backend": [
            "backend/routers/babel/**/*.py",
            "backend/routers/bfd/**/*.py",
            "backend/routers/bgp/**/*.py",
            "backend/routers/static_routes/**/*.py",
        ],
        "frontend": [
            "frontend/src/app/routing/**/*.tsx",
            "frontend/src/components/routing/**/*.tsx",
        ],
    },
    "vpn": {
        "backend": [
            "backend/routers/ipsec.py",
            "backend/routers/wireguard/**/*.py",
        ],
        "frontend": [
            "frontend/src/app/vpn/**/*.tsx",
            "frontend/src/components/vpn/**/*.tsx",
        ],
    },
    "vrf": {
        "backend": ["backend/routers/vrf/**/*.py"],
        "frontend": [
            "frontend/src/app/network/vrf/page.tsx",
            "frontend/src/components/vrf/**/*.tsx",
        ],
    },
    "load_balancing": {
        "backend": ["backend/routers/load_balancing/**/*.py"],
        "frontend": [
            "frontend/src/app/network/load-balancing/page.tsx",
            "frontend/src/components/network/load-balancing/**/*.tsx",
        ],
    },
    "traffic_policy": {
        "backend": ["backend/routers/traffic_policy/**/*.py"],
        "frontend": ["frontend/src/app/network/traffic-policy/page.tsx"],
    },
    "container": {
        "backend": ["backend/routers/containers.py"],
        "frontend": [
            "frontend/src/app/system/containers/page.tsx",
            "frontend/src/components/containers/**/*.tsx",
        ],
    },
    "ha": {
        "backend": ["backend/routers/high_availability/**/*.py"],
        "frontend": ["frontend/src/app/network/high-availability/page.tsx"],
    },
    "pki": {
        "backend": ["backend/routers/pki/**/*.py"],
        "frontend": ["frontend/src/app/system/pki/page.tsx"],
    },
    "meta": {
        "backend": [],
        "frontend": ["frontend/src/app/configuration/page.tsx"],
    },
}


DOC_ONLY_UI_COVERAGE = {
    "https://docs.vyos.io/en/latest/configuration/index.html",
    "https://docs.vyos.io/en/latest/configuration/policy/index.html",
    "https://docs.vyos.io/en/latest/configuration/policy/examples.html",
    "https://docs.vyos.io/en/latest/configuration/service/index.html",
}


def gather_paths(patterns: list[str]) -> list[str]:
    files: list[str] = []
    for pattern in patterns:
        for path in REPO_ROOT.glob(pattern):
            if path.is_file():
                files.append(path.relative_to(REPO_ROOT).as_posix())
    return sorted(set(files))


def derive_domain(url: str, cli_scope: str) -> str:
    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    # .../configuration/<segment>/...
    segment = "configuration"
    if "configuration" in parts:
        idx = parts.index("configuration")
        if idx + 1 < len(parts):
            segment = parts[idx + 1]
    segment = segment.lower()
    domain = SEGMENT_TO_DOMAIN.get(segment)
    if domain:
        return domain

    # fallback from cli scope first token
    token = (cli_scope or "").strip().split(" ")[0].lower() if cli_scope else "configuration"
    return SEGMENT_TO_DOMAIN.get(token, "meta")


def classify_item(
    raw_status: str,
    has_backend_evidence: bool,
    has_frontend_evidence: bool,
    url: str,
) -> str:
    if raw_status == "FRONTEND_ONLY" and has_frontend_evidence and url in DOC_ONLY_UI_COVERAGE:
        # Some docs pages are conceptual/index content; frontend representation is sufficient.
        return "implemented"
    if raw_status == "MISSING":
        return "not_started"
    if raw_status in {"FRONTEND_ONLY", "BACKEND_ONLY"}:
        return "partial"
    if raw_status == "DETECTED":
        return "implemented" if has_backend_evidence and has_frontend_evidence else "partial"
    return "partial"


def main() -> None:
    matrix = json.loads(MATRIX_PATH.read_text())
    items = matrix.get("items", [])

    domain_evidence: dict[str, dict[str, list[str]]] = {}
    for domain, patterns in DOMAIN_EVIDENCE_PATTERNS.items():
        domain_evidence[domain] = {
            "backend": gather_paths(patterns.get("backend", [])),
            "frontend": gather_paths(patterns.get("frontend", [])),
        }

    phase1_items = []
    domain_counts = defaultdict(lambda: {"implemented": 0, "partial": 0, "not_started": 0, "total": 0})

    for item in items:
        domain = derive_domain(item.get("url", ""), item.get("cli_scope", ""))
        evidence = domain_evidence.get(domain, {"backend": [], "frontend": []})
        status = classify_item(
            raw_status=item.get("status", "MISSING"),
            has_backend_evidence=bool(evidence["backend"]),
            has_frontend_evidence=bool(evidence["frontend"]),
            url=item.get("url", ""),
        )

        domain_counts[domain][status] += 1
        domain_counts[domain]["total"] += 1

        phase1_items.append(
            {
                "index": item.get("index"),
                "title": item.get("title"),
                "url": item.get("url"),
                "cli_scope": item.get("cli_scope"),
                "domain": domain,
                "raw_status": item.get("status"),
                "status": status,
                "evidence_files": {
                    "backend": evidence["backend"],
                    "frontend": evidence["frontend"],
                },
            }
        )

    backlog = []
    for domain in DOMAIN_DISPLAY_ORDER:
        counts = domain_counts.get(domain, {"implemented": 0, "partial": 0, "not_started": 0, "total": 0})
        breadth = counts["partial"] + counts["not_started"]
        risk = DOMAIN_RISK.get(domain, 0)
        reuse = DOMAIN_REUSE.get(domain, 0)
        backlog.append(
            {
                "domain": domain,
                "risk": risk,
                "breadth": breadth,
                "reuse": reuse,
                "total_pages": counts["total"],
                "implemented": counts["implemented"],
                "partial": counts["partial"],
                "not_started": counts["not_started"],
            }
        )

    backlog.sort(key=lambda row: (-row["risk"], -row["breadth"], -row["reuse"], row["domain"]))
    actionable_backlog = [row for row in backlog if row["breadth"] > 0]
    completed_domains = [row for row in backlog if row["breadth"] == 0]

    PHASE1_JSON_PATH.write_text(
        json.dumps(
            {
                "source_matrix_generated_at": matrix.get("generated_at"),
                "source": matrix.get("source"),
                "items": phase1_items,
            },
            indent=2,
        )
        + "\n"
    )

    md_lines = [
        "# CONFIG_COVERAGE_PHASE1",
        "",
        f"Source matrix generated: `{matrix.get('generated_at')}`",
        f"Source docs root: `{matrix.get('source')}`",
        "",
        "Status labels:",
        "- `implemented`: detected in matrix and evidence exists for backend+frontend domain paths",
        "- `partial`: only one side detected, or evidence is incomplete",
        "- `not_started`: matrix reports missing",
        "",
        "| # | Title | Domain | Status | Backend Evidence | Frontend Evidence |",
        "|---:|---|---|---|---|---|",
    ]
    for row in phase1_items:
        be = ", ".join(row["evidence_files"]["backend"][:2]) or "—"
        fe = ", ".join(row["evidence_files"]["frontend"][:2]) or "—"
        md_lines.append(
            f"| {row['index']} | [{row['title']}]({row['url']}) | `{row['domain']}` | "
            f"`{row['status']}` | `{be}` | `{fe}` |"
        )
    PHASE1_MD_PATH.write_text("\n".join(md_lines) + "\n")

    BACKLOG_JSON_PATH.write_text(
        json.dumps(
            {
                "prioritization_policy": [
                    "foundational risk (interfaces/routing/firewall/nat first)",
                    "breadth (more uncovered pages first)",
                    "reuse potential",
                ],
                "domains": actionable_backlog,
                "completed_domains": completed_domains,
            },
            indent=2,
        )
        + "\n"
    )

    backlog_lines = [
        "# PARITY_BACKLOG",
        "",
        "Prioritization policy:",
        "1. Foundational risk (interfaces/routing/firewall/nat first)",
        "2. Breadth (highest uncovered page count)",
        "3. Reuse potential",
        "",
        "| Priority | Domain | Risk | Breadth | Reuse | Implemented | Partial | Not Started | Total |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for index, row in enumerate(actionable_backlog, start=1):
        backlog_lines.append(
            f"| {index} | `{row['domain']}` | {row['risk']} | {row['breadth']} | {row['reuse']} | "
            f"{row['implemented']} | {row['partial']} | {row['not_started']} | {row['total_pages']} |"
        )
    backlog_lines.extend(
        [
            "",
            "Completed domains (no uncovered pages detected):",
            "",
            "| Domain | Implemented | Partial | Not Started | Total |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for row in completed_domains:
        backlog_lines.append(
            f"| `{row['domain']}` | {row['implemented']} | {row['partial']} | "
            f"{row['not_started']} | {row['total_pages']} |"
        )
    BACKLOG_MD_PATH.write_text("\n".join(backlog_lines) + "\n")

    print(f"Wrote {PHASE1_JSON_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {PHASE1_MD_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {BACKLOG_JSON_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {BACKLOG_MD_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
