export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function objectKeys(value: unknown): string[] {
  return Object.keys(toRecord(value)).sort((left, right) => left.localeCompare(right));
}

export function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function quoteCliValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "''";
  if (/^[A-Za-z0-9._:/@-]+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, `'\"'\"'`)}'`;
}
