import { CorruptLogError } from "./errors.js";
import { computeEntryHash, GENESIS_HASH } from "./hash.js";
import { MemoryStore } from "./store.js";
import type { Entry, Store, VerifyResult } from "./types.js";

export interface ChainLogOptions {
  /** Where to persist entries. Defaults to an in-memory store. */
  store?: Store;
  /** Injectable clock, mainly for deterministic tests. */
  now?: () => string;
}

/**
 * A tamper-evident, hash-chained audit log.
 *
 * Each appended entry is cryptographically linked to the one before it, so any
 * later alteration, insertion, deletion, or reordering of entries is detected
 * by `verify()`.
 */
export class ChainLog {
  private readonly store: Store;
  private readonly now: () => string;

  constructor(options: ChainLogOptions = {}) {
    this.store = options.store ?? new MemoryStore();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Append a new entry to the log and return it.
   *
   * @throws {UnserializableDataError} if `data` cannot be hashed
   *   deterministically (a circular reference or a BigInt, for example).
   */
  append(data: unknown): Entry {
    const last = this.store.last();
    const index = last ? last.index + 1 : 0;
    const prevHash = last ? last.hash : GENESIS_HASH;
    const timestamp = this.now();
    const hash = computeEntryHash({ index, timestamp, data, prevHash });
    const entry: Entry = { index, timestamp, data, prevHash, hash };
    this.store.append(entry);
    return entry;
  }

  /**
   * All entries, in order.
   *
   * @throws {CorruptLogError} if the underlying storage cannot be read back.
   *   Use `verify()` instead if you want damage reported rather than thrown.
   */
  entries(): Entry[] {
    return this.store.all();
  }

  /**
   * The current head hash. Publish or store this somewhere external (an email,
   * a git commit, a public timestamp) so that even a full rewrite of the log
   * can be detected by comparing against the anchored value.
   */
  head(): string {
    return this.store.last()?.hash ?? GENESIS_HASH;
  }

  /**
   * Verify the integrity of the whole chain.
   *
   * This never throws: damaged, truncated, or hand-edited storage is reported
   * as an invalid result, because that is precisely what it exists to detect.
   *
   * Pass `expectedHead` whenever you have one. Without it, an attacker who can
   * rewrite the entire file — or who simply deletes entries from the end — can
   * leave behind a shorter chain that is internally consistent. See "Anchoring"
   * in the README.
   *
   * @param expectedHead Optional externally-anchored head hash to check against.
   */
  verify(expectedHead?: string): VerifyResult {
    let entries: Entry[];
    try {
      entries = this.store.all();
    } catch (err) {
      if (err instanceof CorruptLogError) {
        return {
          valid: false,
          count: err.line ?? 0,
          brokenAt: err.line,
          reason: err.message,
        };
      }
      throw err;
    }

    let prevHash = GENESIS_HASH;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];

      if (!isEntryShaped(e)) {
        return brokenAt(entries.length, i, "is not a well-formed log entry");
      }
      if (e.index !== i) {
        return brokenAt(entries.length, i, `wrong index ${e.index} (deletion or reorder)`);
      }
      if (e.prevHash !== prevHash) {
        return brokenAt(
          entries.length,
          i,
          "prevHash does not match the previous entry (insertion, deletion, or reorder)",
        );
      }

      let recomputed: string;
      try {
        recomputed = computeEntryHash({
          index: e.index,
          timestamp: e.timestamp,
          data: e.data,
          prevHash: e.prevHash,
        });
      } catch {
        return brokenAt(entries.length, i, "contents cannot be hashed (not valid log data)");
      }
      if (recomputed !== e.hash) {
        return brokenAt(entries.length, i, "contents were altered (hash mismatch)");
      }

      prevHash = e.hash;
    }

    if (expectedHead !== undefined && prevHash !== expectedHead) {
      return {
        valid: false,
        count: entries.length,
        reason:
          "head hash does not match the anchored value (the log may have been rewritten or truncated)",
      };
    }

    return { valid: true, count: entries.length };
  }
}

/** Does this value carry the fields a chain entry must have? */
function isEntryShaped(value: unknown): value is Entry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    Number.isInteger(e.index) &&
    typeof e.timestamp === "string" &&
    typeof e.prevHash === "string" &&
    typeof e.hash === "string"
  );
}

function brokenAt(count: number, index: number, reason: string): VerifyResult {
  return { valid: false, count, brokenAt: index, reason: `entry ${index}: ${reason}` };
}
