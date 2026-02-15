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
  "/network/vrf"
  "/network/load-balancing"
  "/network/high-availability"
  "/network/traffic-policy"
  "/network/interfaces/macsec"
  "/network/interfaces/l2tpv3"
  "/network/interfaces/loopback"
  "/network/interfaces/geneve"
  "/network/interfaces/bridge"
  "/network/interfaces/bonding"
  "/network/interfaces/openvpn"
  "/network/interfaces/pppoe"
  "/network/interfaces/pseudo-ethernet"
  "/network/interfaces/sstp-client"
  "/network/interfaces/virtual-ethernet"
  "/network/interfaces/tunnel"
  "/network/interfaces/vti"
  "/network/interfaces/vxlan"
  "/network/interfaces/wireless"
  "/network/interfaces/wwan"
  "/network/interfaces/dummy"
  "/system/services?tab=broadcast-relay&view=single"
  "/system/services?tab=config-sync&view=single"
  "/system/services?tab=console-server&view=single"
  "/system/services?tab=conntrack-sync&view=single"
  "/system/services?tab=event-handler&view=single"
  "/system/services?tab=https-api&view=single"
  "/system/services?tab=ipoe-server&view=single"
  "/system/services?tab=monitoring&view=single"
  "/system/services?tab=pppoe-server&view=single"
  "/system/services?tab=router-advert&view=single"
  "/system/services?tab=salt-minion&view=single"
  "/system/services?tab=snmp&view=single"
  "/system/services?tab=suricata&view=single"
  "/system/services?tab=tftp-server&view=single"
  "/system/services?tab=webproxy&view=single"
  "/system/flow-accounting"
  "/system/pki"
  "/system/proxy"
  "/system/sysctl"
  "/system/containers"
  "/configuration"
  "/services/dhcp-server"
  "/vpn"
  "/vpn/dmvpn"
  "/vpn/l2tp"
  "/vpn/openconnect"
  "/vpn/pptp"
  "/vpn/rsa-keys"
  "/vpn/sstp"
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
