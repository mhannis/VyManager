#!/usr/bin/env python3
"""
Run a reproducible robustness relook pass and write a report artifact.
"""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = REPO_ROOT / "ROBUSTNESS_RELOOK_REPORT.md"


@dataclass
class StepResult:
    name: str
    command: str
    success: bool
    returncode: int
    output: str


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()


def run_step(name: str, command: str, timeout: int) -> StepResult:
    completed = subprocess.run(
        ["bash", "-lc", command],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    output = (completed.stdout or "") + (completed.stderr or "")
    return StepResult(
        name=name,
        command=command,
        success=completed.returncode == 0,
        returncode=completed.returncode,
        output=output.strip(),
    )


def build_steps(skip_ui_smoke: bool) -> list[tuple[str, str]]:
    steps = [
        (
            "Backend protocol + wrapper tests",
            "cd backend && PYTHONPATH=. ./.venv/bin/pytest -q "
            "tests/test_protocol_capabilities.py "
            "tests/test_config_tree_wrapper_capabilities.py "
            "tests/test_fixture_save_apply_reload_loops.py "
            "tests/test_domain_config_snapshots.py",
        ),
        (
            "Frontend TypeScript",
            "cd frontend && npx tsc --noEmit --pretty false",
        ),
        (
            "Frontend build",
            "cd frontend && npm run -s build",
        ),
        (
            "Frontend runtime smoke",
            "cd frontend && npm run -s smoke:runtime",
        ),
    ]
    if not skip_ui_smoke:
        steps.append(
            (
                "Frontend browser smoke",
                "cd frontend && npm run -s smoke:ui",
            )
        )
    return steps


def write_report(results: list[StepResult], skip_ui_smoke: bool) -> None:
    lines = [
        "# ROBUSTNESS_RELOOK_REPORT.md",
        "",
        f"Generated: {now_iso()}",
        "",
        f"- `skip_ui_smoke`: `{str(skip_ui_smoke).lower()}`",
        "",
        "## Summary",
        "",
    ]

    passed = sum(1 for result in results if result.success)
    lines.append(f"- Passed: {passed}/{len(results)}")
    lines.append(f"- Failed: {len(results) - passed}/{len(results)}")
    lines.append("")
    lines.append("## Steps")
    lines.append("")

    for result in results:
        status = "PASS" if result.success else "FAIL"
        lines.append(f"### {result.name} [{status}]")
        lines.append(f"- Command: `{result.command}`")
        lines.append(f"- Return code: `{result.returncode}`")
        lines.append("")
        if result.output:
            lines.append("```text")
            lines.append(result.output[-4000:])
            lines.append("```")
            lines.append("")

    REPORT_PATH.write_text("\n".join(lines).rstrip() + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run robustness relook validation suite.")
    parser.add_argument(
        "--skip-ui-smoke",
        action="store_true",
        help="Skip Playwright browser smoke step (useful when host deps are unavailable).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=240,
        help="Timeout per step in seconds.",
    )
    args = parser.parse_args()

    steps = build_steps(skip_ui_smoke=args.skip_ui_smoke)
    results = [run_step(name, command, args.timeout_seconds) for name, command in steps]
    write_report(results, skip_ui_smoke=args.skip_ui_smoke)

    for result in results:
        print(f"[{'PASS' if result.success else 'FAIL'}] {result.name}")

    return 0 if all(result.success for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())

