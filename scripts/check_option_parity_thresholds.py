#!/usr/bin/env python3
"""
Enforce non-regression thresholds for option parity scorecard coverage.

Inputs:
  - OPTION_PARITY_SCORECARD.json
  - scripts/option_parity_thresholds.json

Exits non-zero when overall/domain coverage falls below configured floors.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCORECARD_PATH = REPO_ROOT / "OPTION_PARITY_SCORECARD.json"
THRESHOLDS_PATH = REPO_ROOT / "scripts" / "option_parity_thresholds.json"


def load_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def as_float(value: object, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


def main() -> int:
    scorecard = load_json(SCORECARD_PATH)
    thresholds = load_json(THRESHOLDS_PATH)

    overall_coverage = as_float(scorecard.get("summary", {}).get("coverage_percent"), 0.0)
    overall_min = as_float(thresholds.get("overall_min_coverage"), 0.0)

    domain_rows = scorecard.get("domains", [])
    domain_map = {
        str(item.get("domain")): as_float(item.get("coverage_percent"), 0.0)
        for item in domain_rows
        if isinstance(item, dict) and item.get("domain")
    }

    failures: list[str] = []
    if overall_coverage < overall_min:
        failures.append(
            f"overall coverage {overall_coverage:.2f}% is below threshold {overall_min:.2f}%"
        )

    domain_thresholds = thresholds.get("domain_min_coverage", {})
    if isinstance(domain_thresholds, dict):
        for domain, minimum in domain_thresholds.items():
            domain_name = str(domain)
            expected = as_float(minimum, 0.0)
            actual = domain_map.get(domain_name)
            if actual is None:
                failures.append(
                    f"domain '{domain_name}' missing from scorecard (required threshold {expected:.2f}%)"
                )
                continue
            if actual < expected:
                failures.append(
                    f"domain '{domain_name}' coverage {actual:.2f}% is below threshold {expected:.2f}%"
                )

    if failures:
        print("Option parity threshold check FAILED:")
        for failure in failures:
            print(f"- {failure}")
        print(f"\nScorecard: {SCORECARD_PATH}")
        print(f"Thresholds: {THRESHOLDS_PATH}")
        return 1

    print("Option parity threshold check PASSED.")
    print(f"Overall coverage: {overall_coverage:.2f}% (threshold {overall_min:.2f}%)")
    if isinstance(domain_thresholds, dict) and domain_thresholds:
        print("Domains:")
        for domain, minimum in sorted(domain_thresholds.items()):
            actual = domain_map.get(str(domain), 0.0)
            print(f"- {domain}: {actual:.2f}% (threshold {as_float(minimum):.2f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
