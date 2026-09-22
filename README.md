# chain-log

[![CI](https://github.com/webfixerr/chain-log/actions/workflows/ci.yml/badge.svg)](https://github.com/webfixerr/chain-log/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/chain-log.svg)](https://www.npmjs.com/package/chain-log)
[![license](https://img.shields.io/npm/l/chain-log.svg)](./LICENSE)

**Make your existing audit log tamper-evident in five minutes. A library, not a database, not infrastructure.**

Ordinary audit logs — a database table, a log file — can be silently edited or deleted after the fact. `chain-log` cryptographically links every entry to the one before it, so any later alteration, insertion, deletion, or reordering is **detectable** with a single `verify()` call.

No new database to migrate to. No service to run. **Zero runtime dependencies.** Just a library you drop into the app you already have.

```bash
npm install chain-log
```

Works with both `import` and `require`, on Node 18+.

## Quick start

```ts
import { ChainLog, FileStore } from "chain-log";

const log = new ChainLog({ store: new FileStore("./audit.log") });

log.append({ actor: "admin", action: "deleted_user", target: "user_42" });
log.append({ actor: "alice", action: "exported_report" });

log.verify(); // { valid: true, count: 2 }
```

If anyone tampers with a past entry, `verify()` catches it and tells you exactly where:

```ts
// after an attacker edits entry #0 in storage...
log.verify();
// { valid: false, count: 2, brokenAt: 0, reason: "entry 0: contents were altered (hash mismatch)" }
```

## How it works

Each entry stores a SHA-256 hash over its own contents **plus the hash of the previous entry**:

```
hash(entry) = SHA256( index + timestamp + data + prevHash )
```

Because every entry's hash depends on the one before it, the entries form a chain. Change any past entry — its data, its order, or remove it — and every hash after it stops matching. `verify()` walks the chain and reports the first break.

Hashing is over a **canonical** JSON form: object keys are sorted recursively, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` hash identically and a round trip through storage never breaks a chain.

## Storage

Ships with two stores; pick one, or implement the tiny `Store` interface (three methods) for your own backend:

```ts
import { MemoryStore, FileStore } from "chain-log";

new ChainLog({ store: new MemoryStore() });            // in-process
new ChainLog({ store: new FileStore("./audit.log") }); // JSONL file
```

`FileStore` keeps no cached state — every read goes to the file, and `last()` reads only the tail — so appending stays O(1) and a second process appending to the same file continues the same chain instead of forking it.

Database-backed stores (SQLite, Postgres, MySQL, MongoDB) are on the roadmap — the `Store` interface is small, so they're a great first contribution.

## Anchoring — read this before you rely on it

Hash-chaining makes tampering *evident* as long as an attacker can't rewrite the log freely. There are two gaps that only an **anchor** closes:

1. **Full rewrite.** Someone with write access can replace every entry and recompute every hash.
2. **Truncation.** Deleting entries from the *end* leaves a shorter chain that is still internally consistent — so an unanchored `verify()` returns `valid: true`.

Periodically publish the current head hash somewhere outside the log's control, and pass it back in:

```ts
const head = log.head(); // email it, commit it to git, or timestamp it
// later:
log.verify(head);
// { valid: false, count: 1, reason: "head hash does not match the anchored value ..." }
```

**Anchor the head if you need to detect truncation or a full rewrite.** Without an anchor, `verify()` proves only that the entries you still have are internally consistent.

## Error handling

`verify()` **never throws.** Corrupt, truncated, or hand-edited storage is reported as an invalid result, because that is exactly what verification exists to find:

```ts
log.verify();
// { valid: false, count: 1, brokenAt: 1, reason: "line 2 of the log is not valid JSON ..." }
```

Two errors are thrown deliberately, and both indicate a bug in the calling code rather than tampering:

| Error | When |
| --- | --- |
| `UnserializableDataError` | `append()` was given data that can't be hashed deterministically — a circular reference or a `BigInt`. |
| `CorruptLogError` | `entries()` couldn't read storage back. Use `verify()` instead if you want this reported rather than thrown. |

Payloads follow `JSON.stringify` semantics, including `toJSON()` — so a `Date` is hashed as its ISO string and survives a round trip through storage. Values JSON can't represent (`undefined` properties, functions, `Map`, `Set`) are dropped or emptied exactly as `JSON.stringify` drops them; convert them yourself before logging if they matter.

## Honest limitations

- **Tamper-evident, not tamper-proof.** chain-log lets you *detect* tampering; it does not physically prevent writes. Anchor the head externally for the strongest guarantee.
- **An unanchored chain cannot detect truncation.** See [Anchoring](#anchoring--read-this-before-you-rely-on-it).
- **No secret key.** Anyone who can read the log can compute valid hashes for it. Integrity here rests on the anchor, not on a secret.
- **Single chain, single writer** in v0.1. Two processes appending at the exact same instant can still interleave; concurrent multi-writer and distributed proofs are out of scope by design.
- If you need web-scale Merkle proofs, use [Trillian](https://github.com/google/trillian). If you want the database *itself* to be immutable, use [immudb](https://github.com/codenotary/immudb). chain-log is for the large middle ground those tools over-serve: real integrity, added to your existing app in minutes.

## API

| Member | Description |
| --- | --- |
| `new ChainLog({ store?, now? })` | Create a log. Defaults to `MemoryStore` and the system clock. |
| `append(data): Entry` | Append a payload and return the created entry. |
| `entries(): Entry[]` | All entries, in order. Throws `CorruptLogError` on unreadable storage. |
| `head(): string` | The current head hash — the value to anchor. |
| `verify(expectedHead?): VerifyResult` | Walk the chain. Never throws. |

`VerifyResult` is `{ valid, count, brokenAt?, reason? }`.

## Roadmap

- [x] TypeScript / Node core, zero dependencies
- [x] Memory and File (JSONL) stores
- [x] Dual ESM + CommonJS builds
- [ ] SQLite, Postgres, MySQL, and MongoDB store adapters
- [ ] Optional HMAC keying, so hashes can't be recomputed without the key
- [ ] Python port (same API, same hashing)
- [ ] PHP port
- [ ] External anchoring helper (trusted timestamping)

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). The `Store` interface is small and a great first PR.

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## License

MIT
