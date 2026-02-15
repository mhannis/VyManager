feature_id: pki-form-depth-2026-02-15
status: done
title: PKI parity deepening (CA metadata + certificate revoke/ACME options)
branch: feature/containers-automation-v1
commits:
  - 14d81a5
notes:
  - Expanded `/system/pki` to include CA CRL/description/private password-protected and certificate description/private password-protected/revoke/ACME fields.
  - Replaced non-guide passphrase model with guide-aligned `private password-protected` toggles.
  - Added ACME domain list + email/listen-address/rsa-key-size/url command generation with set/delete diffing.
  - Validated with tsc, lint (0 errors), build, runtime smoke, and browser smoke.
