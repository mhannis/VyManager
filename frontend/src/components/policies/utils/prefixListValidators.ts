export type PrefixListType = "ipv4" | "ipv6";

export function getPrefixLength(cidr: string): number | null {
  const parts = cidr.trim().split("/");
  if (parts.length !== 2) {
    return null;
  }
  const value = Number(parts[1]);
  return Number.isInteger(value) ? value : null;
}

export function validatePrefixCidr(cidr: string, listType: PrefixListType): boolean {
  if (!cidr) {
    return false;
  }

  const parts = cidr.trim().split("/");
  if (parts.length !== 2) {
    return false;
  }

  const [ip, prefixLenRaw] = parts;
  const prefixLength = Number(prefixLenRaw);
  if (!Number.isInteger(prefixLength)) {
    return false;
  }

  if (listType === "ipv4") {
    const ipParts = ip.split(".");
    if (ipParts.length !== 4) {
      return false;
    }
    if (
      !ipParts.every((part) => {
        if (!/^\d+$/.test(part)) {
          return false;
        }
        const num = Number(part);
        return num >= 0 && num <= 255;
      })
    ) {
      return false;
    }
    return prefixLength >= 0 && prefixLength <= 32;
  }

  return prefixLength >= 0 && prefixLength <= 128;
}

export function validatePrefixRange(
  ge: string,
  le: string,
  prefixLength: number,
  listType: PrefixListType,
): string | null {
  const maxLength = listType === "ipv4" ? 32 : 128;

  if (ge) {
    const geNum = Number(ge);
    if (!Number.isInteger(geNum)) {
      return "GE must be a valid number";
    }
    if (geNum < prefixLength || geNum > maxLength) {
      return `GE must be between ${prefixLength} (prefix length) and ${maxLength}`;
    }
  }

  if (le) {
    const leNum = Number(le);
    if (!Number.isInteger(leNum)) {
      return "LE must be a valid number";
    }
    if (leNum < prefixLength || leNum > maxLength) {
      return `LE must be between ${prefixLength} (prefix length) and ${maxLength}`;
    }
  }

  if (ge && le) {
    const geNum = Number(ge);
    const leNum = Number(le);
    if (geNum > leNum) {
      return "GE must be less than or equal to LE";
    }
  }

  return null;
}

export function cidrExample(listType: PrefixListType): string {
  return listType === "ipv4" ? "192.168.1.0/24" : "2001:db8::/32";
}
