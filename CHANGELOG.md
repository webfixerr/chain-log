# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-09-22

Initial public release.

### Added

- `ChainLog` — a SHA-256 hash-chained, tamper-evident audit log with
  `append()`, `entries()`, `head()`, and `verify()`.
- `MemoryStore` and `FileStore` (JSONL), plus a three-method `Store`
  interface for custom backends.
- Optional anchored-head verification via `verify(expectedHead)`, which
  detects a full rewrite or truncation of the log.
- Canonical JSON hashing: object keys are sorted recursively, so key order
  never affects a hash.
- `ChainLogError`, `UnserializableDataError`, and `CorruptLogError`.
- Dual ESM and CommonJS builds; works with `import` and `require` on Node 18+.
- Zero runtime dependencies.

[0.1.0]: https://github.com/webfixerr/chain-log/releases/tag/v0.1.0
