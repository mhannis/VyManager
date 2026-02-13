// Common IPsec/IKE/ESP option lists used across dialogs.
//
// These are best-effort defaults based on common strongSwan/VyOS usage.
// VyOS will reject invalid values at commit time, so keep the list practical
// while still allowing manual override where inputs support free-form typing.

export const IPSEC_HASH_OPTIONS = [
  "sha1",
  "sha256",
  "sha384",
  "sha512",
  "md5",
  "aesxcbc",
];

// IKE/ESP encryption algorithm strings are passed through to VyOS/strongSwan.
// Include common algorithms seen in VyOS docs and widely-used IPsec setups.
export const IPSEC_ENCRYPTION_OPTIONS = [
  // AES-CBC
  "aes128",
  "aes192",
  "aes256",

  // AES-GCM (ICV length variants: docs typically use the 128-bit ICV form)
  "aes128gcm128",
  "aes192gcm128",
  "aes256gcm128",

  // ChaCha20-Poly1305
  "chacha20poly1305",

  // Legacy / compatibility
  "3des",
  "des",

  // Null (rare; included for completeness)
  "null",
];

// Diffie-Hellman groups. VyOS uses numeric DH group identifiers in IKE proposals.
export const DH_GROUP_OPTIONS = [
  "1",
  "2",
  "5",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
];

// PRF values (IKEv2). VyOS docs/examples commonly use the prfsha* naming.
export const IKE_PRF_OPTIONS = [
  "prfsha1",
  "prfsha256",
  "prfsha384",
  "prfsha512",
  "prfaesxcbc",
  "prfmd5",
];

// ESP PFS values. VyOS accepts "enable"/"disable" or a DH group value.
export const ESP_PFS_OPTIONS = ["enable", "disable", ...DH_GROUP_OPTIONS];

export const IKE_CLOSE_ACTION_OPTIONS = ["none", "start", "trap"];

