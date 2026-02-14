#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3000}"
TMUX_SESSION="${SMOKE_TMUX_SESSION:-vm-ui}"

fatal_patterns=(
  "Invariant: The client reference manifest"
  "Failed to load static file for page: /500"
  "ENOENT: no such file or directory, open '*/.next/server/pages/500.html'"
)

echo "[runtime-check] Probing ${BASE_URL}"

critical_routes=(
  "/"
  "/login"
  "/routing"
  "/routing/static-failover/static-routes"
  "/routing/unicast-protocols/ospf"
  "/routing/unicast-protocols/openfabric"
  "/routing/infrastructure/mpls"
  "/routing/multicast/igmp-proxy"
  "/services/dhcp-server"
)

for route in "${critical_routes[@]}"; do
  output_file="/tmp/vymanager-runtime-head-$(sed 's#[^a-zA-Z0-9]#-#g' <<<"${route}")"
  if ! curl -sS -I "${BASE_URL}${route}" >"${output_file}"; then
    echo "[runtime-check] ERROR: Probe failed for ${route}"
    exit 1
  fi

  status="$(awk 'NR==1 {print $2}' "${output_file}")"
  if [[ "${status}" != "200" && "${status}" != "307" && "${status}" != "302" ]]; then
    echo "[runtime-check] ERROR: Unexpected status for ${route} : ${status}"
    exit 1
  fi
done

if tmux has-session -t "${TMUX_SESSION}" 2>/dev/null; then
  log_snippet="$(tmux capture-pane -pt "${TMUX_SESSION}:0" -S -350 || true)"
  for pattern in "${fatal_patterns[@]}"; do
    if grep -qE "${pattern}" <<<"${log_snippet}"; then
      echo "[runtime-check] ERROR: Detected fatal runtime signature in tmux session '${TMUX_SESSION}': ${pattern}"
      echo "[runtime-check] Hint: rebuild frontend and restart vm-ui session."
      exit 1
    fi
  done
else
  echo "[runtime-check] WARN: tmux session '${TMUX_SESSION}' not found; skipped log signature checks."
fi

echo "[runtime-check] OK: frontend responds and no known fatal runtime signatures were found."
