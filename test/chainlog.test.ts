import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChainLog,
  FileStore,
  canonicalize,
  CorruptLogError,
  UnserializableDataError,
} from "../src/index.js";
import type { Entry, Store } from "../src/types.js";

/** A store that exposes its live array, so tests can simulate tampering. */
class RawStore implements Store {
  entries: Entry[] = [];
  append(entry: Entry): void {
    this.entries.push(entry);
  }
  all(): Entry[] {
    return this.entries;
  }
  last(): Entry | undefined {
    return this.entries[this.entries.length - 1];
  }
}

const fixedClock = () => "2026-01-01T00:00:00.000Z";

test("a valid chain verifies", () => {
  const log = new ChainLog({ now: fixedClock });
  log.append({ a: 1 });
  log.append({ b: 2 });
  log.append({ c: 3 });
  const r = log.verify();
  assert.equal(r.valid, true);
  assert.equal(r.count, 3);
});

test("indices increment and link to the previous hash", () => {
  const log = new ChainLog({ now: fixedClock });
  const e0 = log.append({ x: 1 });
  const e1 = log.append({ x: 2 });
  assert.equal(e0.index, 0);
  assert.equal(e1.index, 1);
  assert.equal(e1.prevHash, e0.hash);
});

test("detects an altered entry", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ amount: 100 });
  log.append({ amount: 200 });
  (store.entries[0].data as { amount: number }).amount = 999;
  const r = log.verify();
  assert.equal(r.valid, false);
  assert.equal(r.brokenAt, 0);
});

test("detects a deleted entry", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ n: 1 });
  log.append({ n: 2 });
  log.append({ n: 3 });
  store.entries.splice(1, 1);
  const r = log.verify();
  assert.equal(r.valid, false);
  assert.equal(r.brokenAt, 1);
});

test("detects a reordered pair of entries", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ n: 1 });
  log.append({ n: 2 });
  log.append({ n: 3 });
  const tmp = store.entries[0];
  store.entries[0] = store.entries[1];
  store.entries[1] = tmp;
  const r = log.verify();
  assert.equal(r.valid, false);
  assert.equal(r.brokenAt, 0);
});

test("detects an inserted forged entry", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ n: 1 });
  log.append({ n: 2 });
  const fake: Entry = {
    index: 1,
    timestamp: fixedClock(),
    data: { n: 999 },
    prevHash: store.entries[0].hash,
    hash: "not-a-real-hash",
  };
  store.entries.splice(1, 0, fake);
  const r = log.verify();
  assert.equal(r.valid, false);
});

test("detects a tampered timestamp", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ n: 1 });
  store.entries[0].timestamp = "2020-01-01T00:00:00.000Z";
  const r = log.verify();
  assert.equal(r.valid, false);
  assert.equal(r.brokenAt, 0);
});

test("detects a tampered stored hash", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ n: 1 });
  log.append({ n: 2 });
  store.entries[0].hash = "0".repeat(64);
  const r = log.verify();
  assert.equal(r.valid, false);
});

test("detects a mismatched anchored head", () => {
  const log = new ChainLog({ now: fixedClock });
  log.append({ hello: "world" });
  const r = log.verify("deadbeef");
  assert.equal(r.valid, false);
});

test("a correct anchored head passes", () => {
  const log = new ChainLog({ now: fixedClock });
  log.append({ hello: "world" });
  assert.equal(log.verify(log.head()).valid, true);
});

test("an empty log is valid", () => {
  const log = new ChainLog({ now: fixedClock });
  assert.equal(log.verify().valid, true);
});

test("hashing is independent of object key order (canonicalization)", () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
  assert.equal(
    canonicalize({ outer: { y: 1, x: 2 } }),
    canonicalize({ outer: { x: 2, y: 1 } }),
  );
});

test("FileStore persists and re-verifies across separate instances", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-file-"));
  const path = join(dir, "audit.log");
  try {
    const a = new ChainLog({ store: new FileStore(path), now: fixedClock });
    a.append({ actor: "alice", action: "login" });
    a.append({ actor: "admin", action: "deleted_user" });
    const head = a.head();

    const b = new ChainLog({ store: new FileStore(path) });
    assert.equal(b.verify().valid, true);
    assert.equal(b.verify(head).valid, true);

    const lines = readFileSync(path, "utf8").trim().split("\n");
    const t = JSON.parse(lines[0]);
    t.data.action = "viewed_user";
    lines[0] = JSON.stringify(t);
    writeFileSync(path, lines.join("\n") + "\n");

    const c = new ChainLog({ store: new FileStore(path) });
    const r = c.verify();
    assert.equal(r.valid, false);
    assert.equal(r.brokenAt, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- payload serialization -------------------------------------------------

test("a Date in the payload survives a round trip through storage", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-date-"));
  const path = join(dir, "audit.log");
  try {
    const a = new ChainLog({ store: new FileStore(path) });
    a.append({ actor: "alice", at: new Date("2026-01-01T12:00:00.000Z") });
    assert.equal(a.verify().valid, true);
    assert.equal(new ChainLog({ store: new FileStore(path) }).verify().valid, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("distinct Dates produce distinct hashes", () => {
  assert.notEqual(canonicalize(new Date(0)), canonicalize(new Date(999_999)));
});

test("nested Dates and arrays canonicalize like JSON.stringify", () => {
  const value = { list: [new Date(0), { at: new Date(1000) }] };
  assert.equal(canonicalize(value), JSON.stringify(JSON.parse(JSON.stringify(value))));
});

test("a value referenced twice side by side is not mistaken for a cycle", () => {
  const shared = { id: 7 };
  const log = new ChainLog({ now: fixedClock });
  log.append({ a: shared, b: shared });
  assert.equal(log.verify().valid, true);
});

test("a circular payload is rejected with a clear error", () => {
  const log = new ChainLog({ now: fixedClock });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => log.append(cyclic), UnserializableDataError);
  assert.equal(log.entries().length, 0, "a rejected append must not be stored");
});

test("a BigInt payload is rejected with a clear error", () => {
  const log = new ChainLog({ now: fixedClock });
  assert.throws(() => log.append({ n: 1n }), UnserializableDataError);
});

// --- damaged storage -------------------------------------------------------

test("a truncated final line is reported, not thrown", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-trunc-"));
  const path = join(dir, "audit.log");
  try {
    const log = new ChainLog({ store: new FileStore(path) });
    log.append({ n: 1 });
    appendFileSync(path, '{"index":1,"timesta');

    const r = new ChainLog({ store: new FileStore(path) }).verify();
    assert.equal(r.valid, false);
    assert.equal(r.brokenAt, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("entries() throws CorruptLogError where verify() reports it", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-corrupt-"));
  const path = join(dir, "audit.log");
  try {
    const log = new ChainLog({ store: new FileStore(path) });
    log.append({ n: 1 });
    appendFileSync(path, "{not json}\n");
    assert.throws(() => new ChainLog({ store: new FileStore(path) }).entries(), CorruptLogError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a structurally malformed record is reported as invalid", () => {
  const store = new RawStore();
  const log = new ChainLog({ store, now: fixedClock });
  log.append({ n: 1 });
  store.entries.push(null as unknown as Entry);
  const r = log.verify();
  assert.equal(r.valid, false);
  assert.equal(r.brokenAt, 1);
});

// --- truncation and anchoring ---------------------------------------------

test("deleting entries from the END is only caught by an anchored head", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-tail-"));
  const path = join(dir, "audit.log");
  try {
    const log = new ChainLog({ store: new FileStore(path) });
    log.append({ n: 1 });
    log.append({ n: 2 });
    log.append({ n: 3 });
    const anchor = log.head();

    const lines = readFileSync(path, "utf8").trim().split("\n");
    writeFileSync(path, lines[0] + "\n");

    const reopened = new ChainLog({ store: new FileStore(path) });
    // Documented limitation: what is left is a shorter but self-consistent chain.
    assert.equal(reopened.verify().valid, true);
    // The anchored head is what closes the gap.
    assert.equal(reopened.verify(anchor).valid, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- FileStore behaviour ---------------------------------------------------

test("separate FileStore instances on one file continue the same chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-multi-"));
  const path = join(dir, "audit.log");
  try {
    new ChainLog({ store: new FileStore(path) }).append({ w: "a" });
    new ChainLog({ store: new FileStore(path) }).append({ w: "b" });
    const c = new ChainLog({ store: new FileStore(path) });
    assert.equal(c.verify().valid, true);
    assert.deepEqual(c.entries().map((e) => e.index), [0, 1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an entry larger than the tail read window still chains correctly", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-big-"));
  const path = join(dir, "audit.log");
  try {
    const log = new ChainLog({ store: new FileStore(path) });
    log.append({ blob: "x".repeat(200_000) });
    log.append({ n: 2 });
    assert.equal(log.verify().valid, true);
    assert.deepEqual(log.entries().map((e) => e.index), [0, 1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multi-byte payloads across the tail window boundary verify", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-utf8-"));
  const path = join(dir, "audit.log");
  try {
    const log = new ChainLog({ store: new FileStore(path) });
    for (let i = 0; i < 1000; i++) log.append({ i, msg: "日本語テスト🔐 émoji", who: "ünïcødé" });
    assert.equal(log.verify().valid, true);
    assert.equal(new ChainLog({ store: new FileStore(path) }).verify().valid, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appending stays linear, not quadratic, in the number of entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "chainlog-perf-"));
  const path = join(dir, "audit.log");
  try {
    const log = new ChainLog({ store: new FileStore(path) });
    const time = (n: number) => {
      const t = process.hrtime.bigint();
      for (let i = 0; i < n; i++) log.append({ i, actor: "alice", action: "login" });
      return Number(process.hrtime.bigint() - t) / 1e6;
    };
    const first = time(2000);
    const later = time(2000); // the same work, but on a file 2000 entries deep
    assert.ok(
      later < first * 4 + 50,
      `appends degraded with log size: first 2000 took ${first}ms, next 2000 took ${later}ms`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
