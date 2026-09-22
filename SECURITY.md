# Security Policy

## Supported versions

While chain-log is pre-1.0, only the latest published version receives
security fixes.

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through
[GitHub Security Advisories](https://github.com/webfixerr/chain-log/security/advisories/new).
You should get an acknowledgement within 72 hours and an assessment within
seven days. Please give us 90 days to ship a fix before disclosing publicly.

## Threat model

chain-log is **tamper-evident, not tamper-proof**. Knowing what it does and
does not defend against is part of using it correctly.

### What it detects

An attacker with write access to the log who modifies, inserts, deletes, or
reorders entries **in place** breaks the chain, and `verify()` reports the
first broken entry.

### What it does not detect on its own

- **A full rewrite.** There is no secret key, so an attacker who can rewrite
  every entry can recompute every hash and produce a consistent chain.
- **Truncation.** Deleting entries from the end of the log leaves a shorter,
  internally consistent chain.

Both are closed by **anchoring**: publish `head()` somewhere outside the log's
control and pass it to `verify(expectedHead)`. Anchoring is not optional if
your threat model includes an attacker with write access to the log's storage.

### Out of scope

- Denial of service against the process doing the logging.
- Confidentiality of log contents — chain-log does not encrypt anything.
- Concurrent writers racing on the same `FileStore` file.

### In scope, and worth reporting

- Any input to `append()` that produces a chain `verify()` wrongly accepts.
- Any tampering with stored entries that `verify()` fails to detect.
- Any input that makes `verify()` throw instead of returning a result.
- Hash-canonicalization mismatches: two different payloads that hash alike,
  or one payload that hashes differently before and after storage.
