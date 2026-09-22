# I built a tiny library that makes your audit logs tamper-evident

Most apps keep an audit log — who did what, and when. An admin deleted a user, a payment went through, a permission changed. And most of those logs sit in a database table or a file that anyone with access can silently edit or delete after the fact. A rogue insider, an attacker covering their tracks, even an honest bug — nothing stops a past log line from being quietly rewritten, and nothing lets you *prove* it wasn't.

For a lot of systems that's fine. For anything where the log is evidence — compliance (SOC 2, ISO 27001, HIPAA), security investigations, billing disputes — it's a real problem. When someone later claims "that record was changed," you have no way to show it wasn't.

I kept running into this, and every time the answer online was a blog post explaining how to hand-roll a hash chain. So I turned it into a small library instead.

## chain-log

`chain-log` makes an existing audit log **tamper-evident**. Each entry stores a SHA-256 hash computed over its own contents plus the hash of the entry before it:

```
hash(entry) = SHA256( index + timestamp + data + prevHash )
```

Because each entry commits to the previous one, the entries form a chain. Alter any past entry, reorder them, or delete one, and every hash after it stops matching. A single `verify()` call walks the chain and tells you exactly where it broke.

```ts
import { ChainLog, FileStore } from "chain-log";

const log = new ChainLog({ store: new FileStore("./audit.log") });
log.append({ actor: "admin", action: "deleted_user", target: "user_42" });
log.append({ actor: "alice", action: "exported_report" });

log.verify(); // { valid: true, count: 2 }
```

And after someone edits a past entry in storage:

```ts
log.verify();
// { valid: false, count: 2, brokenAt: 0, reason: "entry 0: contents were altered (hash mismatch)" }
```

## A library, not a database

There are excellent heavyweight tools for verifiable data — Google's Trillian, or immudb if you want the database itself to be immutable. But they're infrastructure: you run a service or migrate your data into a new store. That's a lot of lift if all you want is for your *existing* app's audit log to be trustworthy.

chain-log is deliberately the small option. You don't run anything or migrate anything — you wrap the logging you already have. It has **zero runtime dependencies**, ships with in-memory and JSONL-file stores, and exposes a tiny `Store` interface (three methods) so you can back it with whatever you use.

## Honest about what it is

chain-log is tamper-*evident*, not tamper-*proof*. It lets you *detect* alteration; it doesn't physically prevent writes. An attacker who can rewrite the entire log and recompute every hash could still forge a consistent chain — so for strong guarantees you anchor the head hash somewhere outside the log (email it, commit it, or timestamp it), and `verify(expectedHead)` catches a full rewrite. It's a single-writer chain in v0.1, and it's not trying to be a distributed transparency log. It's the 80% that most apps actually need, in a few lines.

## Where it's going

The core is TypeScript with memory and file stores today, and zero dependencies. Next: SQLite, Postgres, MySQL, and MongoDB adapters, then Python and PHP ports, and an external anchoring helper. The `Store` interface is small, so adapters are a good first contribution.

It's open source (MIT), because nobody should trust a security library they can't read.

Repo: https://github.com/webfixerr/chain-log  ·  I'd like feedback — especially from anyone fighting audit-log integrity for compliance. What would you need it to do?
