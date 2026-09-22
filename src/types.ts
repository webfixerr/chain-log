/** A single, hash-chained log entry. */
export interface Entry {
  /** Zero-based position in the chain. */
  index: number;
  /** ISO-8601 timestamp of when the entry was appended. */
  timestamp: string;
  /** The caller's arbitrary payload (who did what, etc.). */
  data: unknown;
  /** The hash of the previous entry (GENESIS_HASH for the first). */
  prevHash: string;
  /** This entry's own hash, over (index, timestamp, data, prevHash). */
  hash: string;
}

/**
 * Storage backend. Implement this to persist the chain wherever you like —
 * a file, SQLite, Postgres, etc. v1 ships with an in-memory and a file store.
 */
export interface Store {
  append(entry: Entry): void;
  all(): Entry[];
  last(): Entry | undefined;
}

/** Result of verifying a chain's integrity. */
export interface VerifyResult {
  valid: boolean;
  /** Number of entries inspected. */
  count: number;
  /** Index of the first entry where the chain broke, if any. */
  brokenAt?: number;
  /** Human-readable explanation of what broke. */
  reason?: string;
}
