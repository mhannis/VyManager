#!/usr/bin/env python3
"""
Option-level parity scorer.

This script complements detection-only parity by scoring docs command-leaf coverage
against command paths represented in backend/frontend code.

Inputs:
  - CONFIG_COVERAGE_MATRIX.json

Outputs:
  - OPTION_PARITY_SCORECARD.json
  - OPTION_PARITY_SCORECARD.md
"""

from __future__ import annotations

import html
import json
import re
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
MATRIX_PATH = REPO_ROOT / "CONFIG_COVERAGE_MATRIX.json"
OUTPUT_JSON_PATH = REPO_ROOT / "OPTION_PARITY_SCORECARD.json"
OUTPUT_MD_PATH = REPO_ROOT / "OPTION_PARITY_SCORECARD.md"


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


CODE_FILE_GLOBS = [
    "backend/**/*.py",
    "frontend/**/*.ts",
    "frontend/**/*.tsx",
    "frontend/**/*.js",
    "frontend/**/*.mjs",
]


COMMAND_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_-])(?:set|delete)\s+[A-Za-z0-9][^\"'\n\r`]{2,240}",
    re.IGNORECASE,
)
CFGCMD_PATTERN = re.compile(r"<span class=\"cfgcmd\"[^>]*>(.*?)</span>", re.IGNORECASE | re.DOTALL)
TAG_PATTERN = re.compile(r"<[^>]+>")
MULTISPACE_PATTERN = re.compile(r"\s+")
PLACEHOLDER_PATTERN = re.compile(r"<[^>]+>")
TEMPLATE_PATTERN = re.compile(r"\$\{[^}]+\}")


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()


def normalize_command(command: str) -> str:
    command = TEMPLATE_PATTERN.sub("<arg>", command)
    command = html.unescape(command)
    command = command.replace("\u00a0", " ")
    command = MULTISPACE_PATTERN.sub(" ", command).strip().lower()
    return command.rstrip(";,.:")


def command_tokens(command: str) -> list[str]:
    return [token for token in normalize_command(command).split(" ") if token]


def static_tokens(command: str) -> list[str]:
    tokens = command_tokens(command)
    result: list[str] = []
    for token in tokens:
        if token.startswith("<") and token.endswith(">"):
            continue
        if PLACEHOLDER_PATTERN.fullmatch(token):
            continue
        if any(marker in token for marker in ("|", "[", "]", "{", "}")):
            continue
        result.append(token)
    return result


def tokens_in_order(needle: Iterable[str], haystack: list[str]) -> bool:
    needle_list = list(needle)
    if not needle_list:
        return False
    index = 0
    for token in haystack:
        if token == needle_list[index]:
            index += 1
            if index == len(needle_list):
                return True
    return False


def gather_repo_command_corpus() -> list[str]:
    commands: set[str] = set()
    for pattern in CODE_FILE_GLOBS:
        for path in REPO_ROOT.glob(pattern):
            if not path.is_file():
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for match in COMMAND_PATTERN.findall(text):
                normalized = normalize_command(match)
                if normalized:
                    commands.add(normalized)
    return sorted(commands)


def derive_domain(url: str, cli_scope: str) -> str:
    parsed = urlparse(url)
    parts = [segment for segment in parsed.path.split("/") if segment]
    segment = "configuration"
    if "configuration" in parts:
        idx = parts.index("configuration")
        if idx + 1 < len(parts):
            segment = parts[idx + 1]
    segment = segment.lower()
    if segment in SEGMENT_TO_DOMAIN:
        return SEGMENT_TO_DOMAIN[segment]
    token = (cli_scope or "").strip().split(" ")[0].lower() if cli_scope else "configuration"
    return SEGMENT_TO_DOMAIN.get(token, "meta")


def fetch_cfg_commands(url: str) -> tuple[list[str], str | None]:
    try:
        result = subprocess.run(
            ["curl", "-fsSL", url],
            check=True,
            capture_output=True,
            text=True,
            timeout=45,
        )
    except subprocess.CalledProcessError as exc:
        return [], f"curl failed ({exc.returncode})"
    except subprocess.TimeoutExpired:
        return [], "curl timeout"

    html_text = result.stdout
    cfg_commands: list[str] = []

    for block in CFGCMD_PATTERN.findall(html_text):
        cleaned = TAG_PATTERN.sub(" ", block)
        cleaned = normalize_command(cleaned)
        if not cleaned.startswith("set "):
            continue
        cfg_commands.append(cleaned)

    return sorted(set(cfg_commands)), None


def coverage_status(percent: float) -> str:
    if percent >= 85.0:
        return "implemented"
    if percent >= 40.0:
        return "partial"
    return "missing"


@dataclass
class PageScore:
    index: int
    title: str
    url: str
    domain: str
    cli_scope: str
    total_cfgcmd: int
    matched_cfgcmd: int
    coverage_percent: float
    status: str
    parse_error: str | None
    unmatched_examples: list[str]


def main() -> int:
    if not MATRIX_PATH.exists():
        raise FileNotFoundError(f"Matrix file not found: {MATRIX_PATH}")

    matrix = json.loads(MATRIX_PATH.read_text())
    items = matrix.get("items", [])
    if not isinstance(items, list):
        raise ValueError("CONFIG_COVERAGE_MATRIX.json must contain an 'items' list")

    repo_commands = gather_repo_command_corpus()
    repo_tokens = [command_tokens(command) for command in repo_commands]

    page_scores: list[PageScore] = []
    domain_totals: dict[str, dict[str, int | list[str]]] = defaultdict(
        lambda: {"total": 0, "matched": 0, "unmatched_examples": []}
    )

    for item in items:
        index = int(item.get("index", 0))
        title = str(item.get("title", "Untitled"))
        url = str(item.get("url", ""))
        cli_scope = str(item.get("cli_scope", ""))
        domain = derive_domain(url, cli_scope)

        cfg_commands, parse_error = fetch_cfg_commands(url)
        matched_count = 0
        unmatched: list[str] = []

        for command in cfg_commands:
            needles = static_tokens(command)
            if any(tokens_in_order(needles, candidate) for candidate in repo_tokens):
                matched_count += 1
            else:
                unmatched.append(command)

        total_count = len(cfg_commands)
        percent = round((matched_count / total_count) * 100.0, 2) if total_count else 0.0
        status = coverage_status(percent) if total_count else "n/a"
        examples = unmatched[:5]

        page_scores.append(
            PageScore(
                index=index,
                title=title,
                url=url,
                domain=domain,
                cli_scope=cli_scope,
                total_cfgcmd=total_count,
                matched_cfgcmd=matched_count,
                coverage_percent=percent,
                status=status,
                parse_error=parse_error,
                unmatched_examples=examples,
            )
        )

        domain_totals[domain]["total"] += total_count
        domain_totals[domain]["matched"] += matched_count
        if examples:
            domain_totals[domain]["unmatched_examples"].extend(examples[:2])

    total_cfgcmd = sum(score.total_cfgcmd for score in page_scores)
    total_matched = sum(score.matched_cfgcmd for score in page_scores)
    overall_percent = round((total_matched / total_cfgcmd) * 100.0, 2) if total_cfgcmd else 0.0

    domain_rows = []
    for domain in sorted(domain_totals.keys()):
        total = int(domain_totals[domain]["total"])
        matched = int(domain_totals[domain]["matched"])
        percent = round((matched / total) * 100.0, 2) if total else 0.0
        status = coverage_status(percent) if total else "n/a"
        domain_rows.append(
            {
                "domain": domain,
                "total_cfgcmd": total,
                "matched_cfgcmd": matched,
                "coverage_percent": percent,
                "status": status,
                "unmatched_examples": sorted(set(domain_totals[domain]["unmatched_examples"]))[:8],
            }
        )

    output = {
        "generated_at": now_iso(),
        "source": str(MATRIX_PATH.name),
        "method": "docs_cfgcmd_leaf_match_against_repo_command_paths",
        "summary": {
            "total_pages": len(page_scores),
            "total_cfgcmd": total_cfgcmd,
            "matched_cfgcmd": total_matched,
            "coverage_percent": overall_percent,
        },
        "domains": domain_rows,
        "pages": [
            {
                "index": score.index,
                "title": score.title,
                "url": score.url,
                "domain": score.domain,
                "cli_scope": score.cli_scope,
                "total_cfgcmd": score.total_cfgcmd,
                "matched_cfgcmd": score.matched_cfgcmd,
                "coverage_percent": score.coverage_percent,
                "status": score.status,
                "parse_error": score.parse_error,
                "unmatched_examples": score.unmatched_examples,
            }
            for score in sorted(page_scores, key=lambda item: item.index)
        ],
    }
    OUTPUT_JSON_PATH.write_text(json.dumps(output, indent=2) + "\n")

    md_lines = [
        "# OPTION_PARITY_SCORECARD.md",
        "",
        f"Generated: {output['generated_at']}",
        "",
        "## Summary",
        f"- Pages: {output['summary']['total_pages']}",
        f"- Documented cfgcmd leaves: {output['summary']['total_cfgcmd']}",
        f"- Matched in repo command paths: {output['summary']['matched_cfgcmd']}",
        f"- Coverage: {output['summary']['coverage_percent']}%",
        "",
        "## Domain Coverage",
        "",
        "| Domain | Doc Leaves | Matched | Coverage | Status |",
        "|---|---:|---:|---:|---|",
    ]
    for row in domain_rows:
        md_lines.append(
            f"| {row['domain']} | {row['total_cfgcmd']} | {row['matched_cfgcmd']} | "
            f"{row['coverage_percent']}% | {row['status']} |"
        )

    md_lines.extend(
        [
            "",
            "## Lowest-Coverage Pages (Top 25)",
            "",
            "| # | Page | Domain | Doc Leaves | Matched | Coverage | Status |",
            "|---:|---|---|---:|---:|---:|---|",
        ]
    )
    scored_pages = [page for page in output["pages"] if page["total_cfgcmd"] > 0]
    for page in sorted(scored_pages, key=lambda item: item["coverage_percent"])[:25]:
        md_lines.append(
            f"| {page['index']} | [{page['title']}]({page['url']}) | {page['domain']} | "
            f"{page['total_cfgcmd']} | {page['matched_cfgcmd']} | {page['coverage_percent']}% | {page['status']} |"
        )

    OUTPUT_MD_PATH.write_text("\n".join(md_lines) + "\n")
    print(f"Wrote {OUTPUT_JSON_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {OUTPUT_MD_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

