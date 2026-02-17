#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SMOKE_USER = process.env.SMOKE_USERNAME || "smoke-ui";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || "SmokeUiPass123!";
const SMOKE_ARTIFACT_DIR = process.env.SMOKE_ARTIFACT_DIR || "smoke-artifacts";

const ROUTES = (
  process.env.SMOKE_ROUTES ||
  [
    "/",
    "/routing",
    "/routing/protocols",
    "/routing/infrastructure",
    "/routing/multicast",
    "/routing/static-failover",
    "/routing/unicast-protocols",
    "/routing/static-failover/failover",
    "/routing/static-failover/static-routes",
    "/routing/unicast-protocols/static",
    "/routing/unicast-protocols/bgp",
    "/routing/unicast-protocols/ospf",
    "/routing/unicast-protocols/isis",
    "/routing/unicast-protocols/openfabric",
    "/routing/unicast-protocols/rip",
    "/routing/infrastructure/arp",
    "/routing/infrastructure/bfd",
    "/routing/infrastructure/mpls",
    "/routing/infrastructure/segment-routing",
    "/routing/infrastructure/rpki",
    "/routing/multicast/igmp-proxy",
    "/routing/multicast/pim",
    "/routing/multicast/pim6",
    "/services/dhcp-server",
    "/network/dhcp",
    "/network/vrf",
    "/network/vrf?section=l3vpn",
    "/network/load-balancing",
    "/network/high-availability",
    "/network/nat",
    "/network/routes",
    "/network/traffic-policy",
    "/network/interfaces?group=core-l2",
    "/network/interfaces?group=overlay-secure",
    "/network/interfaces?group=access-wan",
    "/network/interfaces/macsec",
    "/network/interfaces/l2tpv3",
    "/network/interfaces/loopback",
    "/network/interfaces/geneve",
    "/network/interfaces/bridge",
    "/network/interfaces/bonding",
    "/network/interfaces/openvpn",
    "/network/interfaces/pppoe",
    "/network/interfaces/pseudo-ethernet",
    "/network/interfaces/sstp-client",
    "/network/interfaces/virtual-ethernet",
    "/network/interfaces/tunnel",
    "/network/interfaces/vti",
    "/network/interfaces/vxlan",
    "/network/interfaces/wireless",
    "/network/interfaces/wwan",
    "/network/interfaces/dummy",
    "/network/setup-wizard",
    "/firewall/policies",
    "/firewall/bridge",
    "/firewall/global-options",
    "/firewall/groups",
    "/firewall/flowtables",
    "/policies/route",
    "/policies",
    "/policies/access-list",
    "/policies/bgp-as",
    "/policies/bgp-community",
    "/policies/bgp-extended-community",
    "/policies/bgp-large-community",
    "/policies/examples",
    "/policies/local-route",
    "/policies/prefix-list",
    "/policies/route-map",
    "/firewall/zones",
    "/settings",
    "/settings/navigation",
    "/sites",
    "/system/services",
    "/system/services?tab=broadcast-relay&view=single",
    "/system/services?tab=config-sync&view=single",
    "/system/services?tab=console-server&view=single",
    "/system/services?tab=conntrack-sync&view=single",
    "/system/services?tab=event-handler&view=single",
    "/system/services?tab=https-api&view=single",
    "/system/services?tab=ipoe-server&view=single",
    "/system/services?tab=monitoring&view=single",
    "/system/services?tab=pppoe-server&view=single",
    "/system/services?tab=router-advert&view=single",
    "/system/services?tab=salt-minion&view=single",
    "/system/services?tab=snmp&view=single",
    "/system/services?tab=suricata&view=single",
    "/system/services?tab=tftp-server&view=single",
    "/system/services?tab=webproxy&view=single",
    "/system/conntrack",
    "/system/default-route",
    "/system/frr",
    "/system/flow-accounting",
    "/system/ip",
    "/system/ipv6",
    "/system/lcd",
    "/system/pki",
    "/system/proxy",
    "/system/sflow",
    "/system/serial-console",
    "/system/task-scheduler",
    "/system/sysctl",
    "/system/acceleration",
    "/system/identification",
    "/system/options",
    "/system/update-check",
    "/system/watchdog",
    "/system/syslog",
    "/system/logs",
    "/system/users",
    "/configuration",
    "/system/containers",
    "/vpn",
    "/vpn/dmvpn",
    "/vpn/l2tp",
    "/vpn/openconnect",
    "/vpn/pptp",
    "/vpn/rsa-keys",
    "/vpn/sstp",
    "/vpn/ipsec",
    "/vpn/wireguard",
  ].join(",")
)
  .split(",")
  .map((route) => route.trim())
  .filter((route) => route.length > 0);

function routeToFileToken(route) {
  return route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-") || "root";
}

async function ensureSmokeUser() {
  const response = await fetch(`${BASE_URL}/api/internal/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: SMOKE_USER,
      password: SMOKE_PASSWORD,
      name: "UI Smoke User",
    }),
  });

  if (response.ok) return;

  let detail = "";
  try {
    const json = await response.json();
    detail = json?.error || JSON.stringify(json);
  } catch {
    detail = await response.text();
  }

  if (
    response.status === 400 &&
    /already exists|duplicate|identifier already exists|email already exists/i.test(detail)
  ) {
    return;
  }

  throw new Error(
    `Failed to ensure smoke user (HTTP ${response.status}): ${detail || "unknown error"}`
  );
}

async function run() {
  const failures = [];
  const pageErrors = [];

  await fs.mkdir(SMOKE_ARTIFACT_DIR, { recursive: true });
  await ensureSmokeUser();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("pageerror", (error) => {
    pageErrors.push({
      url: page.url(),
      message: error?.stack || error?.message || String(error),
    });
  });

  try {
    // Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.fill("#identifier", SMOKE_USER);
    await page.fill("#password", SMOKE_PASSWORD);
    await page.click("button[type='submit']");

    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
    } catch {
      const continueButton = page.getByRole("button", {
        name: /Continue & Sign Out Other Session/i,
      });
      if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await continueButton.click();
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
      } else {
        throw new Error("Login did not complete within timeout.");
      }
    }

    const probeRoute = async (url) => {
      const beforeErrors = pageErrors.length;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);

      const finalUrl = page.url();
      const appCrashVisible = await page
        .getByText("Application error: a client-side exception has occurred", {
          exact: false,
        })
        .first()
        .isVisible()
        .catch(() => false);

      const newErrors = pageErrors.slice(beforeErrors);
      return { finalUrl, appCrashVisible, newErrors };
    };

    // Route probes
    for (const route of ROUTES) {
      const url = `${BASE_URL}${route}`;
      let probe = await probeRoute(url);

      const sawChunkLoadError =
        probe.appCrashVisible ||
        probe.newErrors.some((entry) =>
          /ChunkLoadError|Failed to load chunk|Loading chunk/i.test(entry.message || "")
        );

      // Retry once with cache-busting query when Next.js chunk manifest races after rebuild.
      if (sawChunkLoadError) {
        const retryUrl = `${url}${url.includes("?") ? "&" : "?"}smoke_retry=${Date.now()}`;
        probe = await probeRoute(retryUrl);
      }

      if (new URL(probe.finalUrl).pathname.startsWith("/login")) {
        failures.push(`${route}: redirected to login`);
      }

      if (probe.appCrashVisible) {
        failures.push(`${route}: rendered client-side application error banner`);
      }

      if (probe.newErrors.length > 0) {
        for (const entry of probe.newErrors) {
          failures.push(`${route}: pageerror at ${entry.url} -> ${entry.message}`);
        }
      }

      if (failures.length > 0) {
        const fileToken = routeToFileToken(route);
        await page.screenshot({
          path: path.join(SMOKE_ARTIFACT_DIR, `failure-${fileToken}.png`),
          fullPage: true,
        });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (failures.length > 0) {
    console.error("UI smoke test FAILED:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(`Artifacts: ${SMOKE_ARTIFACT_DIR}/`);
    process.exit(1);
  }

  console.log("UI smoke test PASSED.");
}

run().catch((error) => {
  console.error(`UI smoke test failed to execute: ${error?.stack || error?.message || error}`);
  process.exit(1);
});
