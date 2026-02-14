feature_id: services-ia-and-system-telemetry-v1
status: in_progress
title: Service IA Restructure + CPU Temperature + Interface Label Consistency
branch: feature/containers-automation-v1
commits: []
notes:
  - Added best-effort CPU temperature parsing to system dashboard summary and surfaced CPU temp on the System Information dashboard card.
  - Expanded service navigation with direct service entries (NTP/LLDP/mDNS/SSH/DNS forwarder plus resolver/DDNS/DHCP relay placeholders).
  - System Services page now supports direct tab links via URL query (`/system/services?tab=...`) and is wrapped in Suspense for Next.js prerender compatibility.
  - Applied global "Description (ethX)" interface label formatting across major selectors/cards, excluding interface-description edit surfaces.
  - IPsec site-to-site wizard resized and proposal fields relabeled for readability.
