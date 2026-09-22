/** Base class for every error chainlog throws deliberately. */
export class ChainLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainLogError";
  }
}

/**
 * Thrown by `append()` when a payload cannot be serialized deterministically,
 * and so cannot be hashed: circular references, BigInts, and similar.
 */
export class UnserializableDataError extends ChainLogError {
  constructor(message: string) {
    super(message);
    this.name = "UnserializableDataError";
  }
}

/**
 * Thrown by a store when persisted data cannot be read back as entries — a
 * truncated write, a corrupted byte, or a hand-edited file.
 *
 * `verify()` catches this and reports it as an invalid chain rather than
 * letting it escape: a damaged log is exactly what verification exists to
 * find, so it must never crash the caller.
 */
export class CorruptLogError extends ChainLogError {
  /** Zero-based line number of the unreadable record, when known. */
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(message);
    this.name = "CorruptLogError";
    this.line = line;
  }
}
