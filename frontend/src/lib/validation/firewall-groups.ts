import type { GroupType } from "@/lib/api/types/firewall-groups";

const SIMPLE_INTERFACE_RE = /^[A-Za-z][A-Za-z0-9._:-]*$/;
const MAC_RE = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/;

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isIpv6(value: string): boolean {
  // Lightweight IPv6 structural check for UI pre-validation.
  if (!value.includes(":")) return false;
  if (/[^0-9a-fA-F:]/.test(value)) return false;
  const segments = value.split(":");
  if (segments.length < 2 || segments.length > 8) return false;
  return segments.every((segment) => segment === "" || /^[0-9a-fA-F]{1,4}$/.test(segment));
}

function isIpv4Cidr(value: string): boolean {
  const [ip, prefix] = value.split("/");
  if (!ip || prefix === undefined || prefix === "") return false;
  if (!isIpv4(ip)) return false;
  if (!/^\d+$/.test(prefix)) return false;
  const p = Number(prefix);
  return p >= 0 && p <= 32;
}

function isIpv6Cidr(value: string): boolean {
  const [ip, prefix] = value.split("/");
  if (!ip || prefix === undefined || prefix === "") return false;
  if (!isIpv6(ip)) return false;
  if (!/^\d+$/.test(prefix)) return false;
  const p = Number(prefix);
  return p >= 0 && p <= 128;
}

function isIpv4Range(value: string): boolean {
  const [start, end] = value.split("-");
  if (!start || !end) return false;
  return isIpv4(start.trim()) && isIpv4(end.trim());
}

function isIpv6Range(value: string): boolean {
  const [start, end] = value.split("-");
  if (!start || !end) return false;
  return isIpv6(start.trim()) && isIpv6(end.trim());
}

function isPortValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return n >= 1 && n <= 65535;
  }
  const [start, end] = trimmed.split("-");
  if (!start || !end) return false;
  if (!/^\d+$/.test(start.trim()) || !/^\d+$/.test(end.trim())) return false;
  const s = Number(start.trim());
  const e = Number(end.trim());
  return s >= 1 && s <= 65535 && e >= 1 && e <= 65535 && s <= e;
}

function isRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateGroupMember(type: GroupType, member: string): string | null {
  const value = member.trim();
  if (!value) return "Member value is required.";

  switch (type) {
    case "address-group":
      if (!isIpv4(value) && !isIpv4Range(value)) {
        return "IPv4 address groups require an IPv4 address or range.";
      }
      return null;
    case "ipv6-address-group":
      if (!isIpv6(value) && !isIpv6Range(value)) {
        return "IPv6 address groups require an IPv6 address or range.";
      }
      return null;
    case "network-group":
      return isIpv4Cidr(value) ? null : "IPv4 network groups require CIDR notation (example: 10.0.0.0/24).";
    case "ipv6-network-group":
      return isIpv6Cidr(value) ? null : "IPv6 network groups require CIDR notation (example: 2001:db8::/32).";
    case "port-group":
      return isPortValue(value) ? null : "Port groups require a port, range, or service name.";
    case "interface-group":
      return SIMPLE_INTERFACE_RE.test(value) ? null : "Interface group members must be valid interface names.";
    case "mac-group":
      return MAC_RE.test(value) ? null : "MAC groups require values like 00:11:22:33:44:55.";
    case "domain-group":
      return DOMAIN_RE.test(value) ? null : "Domain groups require a valid DNS domain name.";
    case "remote-group":
      return isRemoteUrl(value) ? null : "Remote groups require a valid HTTP/HTTPS URL.";
    default:
      return null;
  }
}
