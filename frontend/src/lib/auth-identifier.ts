const LOCAL_AUTH_DOMAIN = (
  process.env.NEXT_PUBLIC_LOCAL_AUTH_DOMAIN || "local.vymanager"
).toLowerCase();

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isLocalAuthEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${LOCAL_AUTH_DOMAIN}`);
}

export function authIdentifierFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (isLocalAuthEmail(normalized)) {
    return normalized.split("@")[0];
  }
  return normalized;
}

export function normalizeAuthIdentifier(identifier: string): {
  email: string;
  isLocalUsername: boolean;
  displayIdentifier: string;
} {
  const value = identifier.trim();
  if (!value) {
    throw new Error("Username or email is required");
  }

  if (looksLikeEmail(value)) {
    return {
      email: normalizeEmail(value),
      isLocalUsername: false,
      displayIdentifier: normalizeEmail(value),
    };
  }

  // Local username mode: map `admin` -> `admin@local.vymanager`
  const username = value.toLowerCase();
  const usernameRegex = /^[a-z0-9._-]{1,64}$/;
  if (!usernameRegex.test(username)) {
    throw new Error(
      "Username must be 1-64 chars and only use letters, numbers, dot, underscore, or hyphen"
    );
  }

  return {
    email: `${username}@${LOCAL_AUTH_DOMAIN}`,
    isLocalUsername: true,
    displayIdentifier: username,
  };
}

