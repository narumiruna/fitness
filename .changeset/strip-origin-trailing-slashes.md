---
"@narumitw/fitness-api": patch
---

Accept trailing slashes in PASSKEY_ORIGIN and use the canonical HTTPS origin for startup, CSRF checks, and passkeys. Continue to reject paths, queries, fragments, credentials, and untrusted request origins.
