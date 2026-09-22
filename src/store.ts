import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { CorruptLogError } from "./errors.js";
import type { Entry, Store } from "./types.js";

/** Keeps the chain in memory. Great for tests and short-lived processes. */
export class MemoryStore implements Store {
  private entries: Entry[] = [];

  append(entry: Entry): void {
    this.entries.push(entry);
  }

  all(): Entry[] {
    return [...this.entries];
  }

  last(): Entry | undefined {
    return this.entries[this.entries.length - 1];
  }
}

/** How many bytes to read back from the end of the file when looking for the
 *  final record. Grows on the rare occasion that one entry is larger. */
const TAIL_WINDOW = 64 * 1024;

/**
 * Appends one JSON object per line (JSONL) to a file. Append-only on the happy
 * path, human-inspectable, and works with your existing storage/backup flow.
 *
 * The store holds no cached state: every read goes to the file. That keeps a
 * second process appending to the same file from silently forking the chain,
 * and it is why `last()` reads only the tail rather than the whole file.
 */
export class FileStore implements Store {
  constructor(private readonly path: string) {}

  append(entry: Entry): void {
    appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
  }

  all(): Entry[] {
    if (!existsSync(this.path)) return [];
    const text = readFileSync(this.path, "utf8").trim();
    if (!text) return [];
    return text.split("\n").map((line, i) => parseEntry(line, i));
  }

  /**
   * The final entry, read from the end of the file rather than by parsing the
   * whole of it — so appending stays O(1) instead of O(n) per call.
   */
  last(): Entry | undefined {
    let fd: number;
    try {
      fd = openSync(this.path, "r");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }

    try {
      const size = fstatSync(fd).size;
      if (size === 0) return undefined;

      for (let window = TAIL_WINDOW; ; window *= 4) {
        const start = Math.max(0, size - window);
        const buf = Buffer.alloc(size - start);
        readSync(fd, buf, 0, buf.length, start);

        // Any partial UTF-8 character can only sit at the front of the window,
        // and we always take text from after a newline, so it never reaches us.
        const text = buf.toString("utf8").replace(/\n+$/, "");
        if (!text) return undefined;

        const nl = text.lastIndexOf("\n");
        if (nl !== -1) return parseEntry(text.slice(nl + 1), undefined);
        if (start === 0) return parseEntry(text, 0);
        // The last line is longer than the window; widen it and try again.
      }
    } finally {
      closeSync(fd);
    }
  }
}

function parseEntry(line: string, lineNumber: number | undefined): Entry {
  try {
    return JSON.parse(line) as Entry;
  } catch {
    const where = lineNumber === undefined ? "the final line" : `line ${lineNumber + 1}`;
    throw new CorruptLogError(
      `${where} of the log is not valid JSON (truncated or corrupted write)`,
      lineNumber,
    );
  }
}
