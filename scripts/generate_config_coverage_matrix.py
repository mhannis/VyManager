#!/usr/bin/env python3
"""
Generate CONFIG_COVERAGE_MATRIX.md from the VyOS configuration guide.

Source of truth:
https://docs.vyos.io/en/latest/configuration/
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, Iterable, List, Set
from urllib.parse import urldefrag, urljoin, urlparse

import requests


DEFAULT_BASE_URL = "https://docs.vyos.io/en/latest/configuration/"
USER_AGENT = "Mozilla/5.0 (VyManager parity crawler)"


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: List[str] = []
        self._in_title = False
        self.title = ""

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        if tag == "a":
            data = dict(attrs)
            href = data.get("href")
            if href:
                self.links.append(href)
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:  # type: ignore[override]
        if self._in_title:
            self.title += data


@dataclass
class PageCoverage:
    index: int
    url: str
    title: str
    cli_scope: str
    backend_detected: bool
    frontend_detected: bool
    status: str


def normalize_doc_url(base_url: str, current_url: str, candidate: str) -> str | None:
    cleaned = urldefrag(candidate)[0]
    if not cleaned:
        return None
    if cleaned.startswith(("mailto:", "javascript:")):
        return None

    full = urljoin(current_url, cleaned)
    parsed = urlparse(full)
    if parsed.netloc != "docs.vyos.io":
        return None
    if "/en/latest/configuration/" not in parsed.path:
        return None
    if parsed.path.endswith(
        (".png", ".svg", ".jpg", ".jpeg", ".gif", ".css", ".js", ".txt", ".pdf", ".zip")
    ):
        return None

    path = parsed.path
    if path.endswith("/"):
        path += "index.html"
    elif not path.endswith(".html"):
        path += ".html"

    return f"{parsed.scheme}://{parsed.netloc}{path}"


def crawl_configuration_docs(base_url: str) -> Dict[str, str]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    root = normalize_doc_url(base_url, base_url, base_url) or f"{base_url.rstrip('/')}/index.html"
    queue: List[str] = [root]
    seen: Set[str] = set()
    titles: Dict[str, str] = {}

    while queue:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)

        try:
            response = session.get(current, timeout=20)
        except Exception:
            continue
        if response.status_code != 200:
            continue

        parser = LinkParser()
        parser.feed(response.text)
        titles[current] = html.unescape(parser.title).strip()

        for link in parser.links:
            normalized = normalize_doc_url(base_url, current, link)
            if normalized and normalized not in seen:
                queue.append(normalized)

    return dict(sorted(titles.items(), key=lambda item: item[0]))


def discover_backend_domains(repo_root: Path) -> Set[str]:
    router_root = repo_root / "backend" / "routers"
    if not router_root.exists():
        return set()

    domains: Set[str] = set()
    for path in router_root.rglob("*.py"):
        if path.name == "__init__.py":
            continue
        stem = path.stem.replace("-", "_").lower()
        parent = path.parent.name.replace("-", "_").lower()
        domains.add(stem)
        domains.add(parent)
    return domains


def discover_frontend_domains(repo_root: Path) -> Set[str]:
    app_root = repo_root / "frontend" / "src" / "app"
    if not app_root.exists():
        return set()

    domains: Set[str] = set()
    for page in app_root.rglob("page.tsx"):
        rel = page.relative_to(app_root).parts[:-1]
        for segment in rel:
            if segment.startswith("("):
                continue
            domains.add(segment.replace("-", "_").lower())
    return domains


def doc_path_to_tokens(url: str) -> List[str]:
    parsed = urlparse(url)
    suffix = parsed.path.split("/en/latest/configuration/", 1)[-1]
    suffix = suffix.replace(".html", "")
    parts = [p for p in suffix.split("/") if p and p != "index"]
    tokens: List[str] = []
    for part in parts:
        tokens.extend(re.split(r"[-_]", part.lower()))
    return [token for token in tokens if token]


def infer_cli_scope(url: str) -> str:
    parsed = urlparse(url)
    suffix = parsed.path.split("/en/latest/configuration/", 1)[-1].replace(".html", "")
    parts = [p for p in suffix.split("/") if p and p != "index"]
    if not parts:
        return "configuration"
    return " ".join(parts).replace("-", " ")


def detect_domain_coverage(
    tokens: Iterable[str],
    backend_domains: Set[str],
    frontend_domains: Set[str],
) -> tuple[bool, bool]:
    token_list = [token.replace("-", "_").lower() for token in tokens]
    normalized: Set[str] = set(token_list)

    aliases = {
        "container": {"containers"},
        "containers": {"container"},
        "policy": {"policies"},
        "policies": {"policy"},
        "service": {"services"},
        "services": {"service"},
        "zone": {"zones"},
        "zones": {"zone"},
        "loadbalancing": {"load_balancing"},
        "load_balancing": {"loadbalancing"},
        "wireguard": {"wire_guard"},
        "dhcp": {"dhcp_server", "dhcp_relay"},
    }

    for token in list(normalized):
        if token.endswith("s") and len(token) > 3:
            normalized.add(token[:-1])
        else:
            normalized.add(f"{token}s")

        if token in aliases:
            normalized.update(aliases[token])

    # Adjacent token n-grams preserve phrase order.
    for n in (2, 3):
        for i in range(0, max(0, len(token_list) - n + 1)):
            normalized.add("_".join(token_list[i : i + n]))

    # Include full path collapsed forms.
    if token_list:
        normalized.add("_".join(token_list))
        normalized.add("".join(token_list))

    # Service wrappers are often implemented as `<service>_service` or
    # `service_<service>` backend router module names.
    if len(token_list) > 1 and token_list[0] == "service":
        service_tail = "_".join(token_list[1:])
        normalized.add(f"{service_tail}_service")
        normalized.add(f"service_{service_tail}")

    backend_detected = any(token in backend_domains for token in normalized)
    frontend_detected = any(token in frontend_domains for token in normalized)
    return backend_detected, frontend_detected


def derive_status(backend_detected: bool, frontend_detected: bool) -> str:
    if backend_detected and frontend_detected:
        return "DETECTED"
    if backend_detected and not frontend_detected:
        return "BACKEND_ONLY"
    if frontend_detected and not backend_detected:
        return "FRONTEND_ONLY"
    return "MISSING"


def build_matrix(repo_root: Path, docs_pages: Dict[str, str]) -> List[PageCoverage]:
    backend_domains = discover_backend_domains(repo_root)
    frontend_domains = discover_frontend_domains(repo_root)

    rows: List[PageCoverage] = []
    for idx, (url, title) in enumerate(docs_pages.items(), start=1):
        tokens = doc_path_to_tokens(url)
        backend_detected, frontend_detected = detect_domain_coverage(
            tokens, backend_domains, frontend_domains
        )
        status = derive_status(backend_detected, frontend_detected)
        clean_title = title.split(" — ", 1)[0].strip() if title else ""
        rows.append(
            PageCoverage(
                index=idx,
                url=url,
                title=clean_title or "Untitled",
                cli_scope=infer_cli_scope(url),
                backend_detected=backend_detected,
                frontend_detected=frontend_detected,
                status=status,
            )
        )
    return rows


def write_markdown(output_file: Path, rows: List[PageCoverage], base_url: str) -> None:
    now = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    total = len(rows)
    detected = sum(1 for row in rows if row.status == "DETECTED")
    backend_only = sum(1 for row in rows if row.status == "BACKEND_ONLY")
    frontend_only = sum(1 for row in rows if row.status == "FRONTEND_ONLY")
    missing = sum(1 for row in rows if row.status == "MISSING")

    lines: List[str] = [
        "# CONFIG_COVERAGE_MATRIX",
        "",
        f"Generated: `{now}`",
        f"Source: `{base_url}`",
        "",
        "## Status Summary",
        "",
        f"- Total documentation pages discovered: **{total}**",
        f"- `DETECTED` (backend + frontend signal): **{detected}**",
        f"- `BACKEND_ONLY`: **{backend_only}**",
        f"- `FRONTEND_ONLY`: **{frontend_only}**",
        f"- `MISSING`: **{missing}**",
        "",
        "## Notes",
        "",
        "- This matrix is generated via URL/token detection and is intentionally conservative.",
        "- `DETECTED` does not imply full option-level parity; it indicates a likely implementation anchor exists.",
        "- Use this file as the execution backlog for parity slices and update statuses with verified coverage.",
        "",
        "## Matrix",
        "",
        "| # | Doc Section | CLI Scope (derived) | Backend | Frontend | Status |",
        "|---:|---|---|:---:|:---:|---|",
    ]

    for row in rows:
        backend = "Y" if row.backend_detected else "N"
        frontend = "Y" if row.frontend_detected else "N"
        label = f"[{row.title}]({row.url})"
        lines.append(
            f"| {row.index} | {label} | `{row.cli_scope}` | {backend} | {frontend} | `{row.status}` |"
        )

    output_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_json(output_file: Path, rows: List[PageCoverage], base_url: str) -> None:
    payload = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": base_url,
        "items": [
            {
                "index": row.index,
                "url": row.url,
                "title": row.title,
                "cli_scope": row.cli_scope,
                "backend_detected": row.backend_detected,
                "frontend_detected": row.frontend_detected,
                "status": row.status,
            }
            for row in rows
        ],
    }
    output_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate VyOS configuration coverage matrix")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Configuration guide base URL")
    parser.add_argument(
        "--output-md",
        default="CONFIG_COVERAGE_MATRIX.md",
        help="Markdown output path",
    )
    parser.add_argument(
        "--output-json",
        default="CONFIG_COVERAGE_MATRIX.json",
        help="JSON output path",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    docs_pages = crawl_configuration_docs(args.base_url)
    rows = build_matrix(repo_root, docs_pages)

    write_markdown(repo_root / args.output_md, rows, args.base_url)
    write_json(repo_root / args.output_json, rows, args.base_url)
    print(f"Discovered {len(rows)} documentation pages under {args.base_url}")
    print(f"Wrote: {args.output_md}")
    print(f"Wrote: {args.output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
