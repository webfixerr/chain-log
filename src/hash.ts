import { createHash } from "node:crypto";
import { UnserializableDataError } from "./errors.js";

/**
 * Deterministic, canonical JSON serialization: object keys are sorted
 * recursively so that the same logical data always produces the same string
 * (and therefore the same hash), regardless of key insertion order.
 *
 * The result must survive a round trip through storage unchanged, so this
 * follows the same rules `JSON.stringify` does — notably `toJSON()`, which is
 * how a `Date` becomes its ISO string instead of an empty object.
 *
 * @throws {UnserializableDataError} if the value cannot be represented as JSON.
 */
export function canonicalize(value: unknown): string {
  const json = JSON.stringify(sortValue(value, new WeakSet()));
  if (json === undefined) {
    throw new UnserializableDataError(
      `cannot hash a value of type ${typeof value}: it has no JSON representation`,
    );
  }
  return json;
}

function sortValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "bigint") {
    throw new UnserializableDataError(
      "cannot hash a BigInt: convert it to a string or number before logging it",
    );
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  // Match JSON.stringify: a toJSON() method decides the serialized form.
  // Without this, `new Date()` would canonicalize to `{}` here but to an ISO
  // string on disk, and the entry would fail to verify after a reload.
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") {
    return sortValue((toJSON as () => unknown).call(value), seen);
  }

  if (seen.has(value)) {
    throw new UnserializableDataError(
      "cannot hash a circular reference: log a plain, tree-shaped payload instead",
    );
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sortValue(item, seen));
    }
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(obj[key], seen);
        return acc;
      }, {});
  } finally {
    // Release on the way out so a value referenced twice side by side (a DAG,
    // not a cycle) is still allowed, exactly as JSON.stringify allows it.
    seen.delete(value);
  }
}

/** SHA-256 of a UTF-8 string, hex-encoded. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The prevHash of the very first entry in a chain. */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Compute the hash of an entry's immutable fields. The hash binds the entry's
 * position (index), time, data, and the previous entry's hash together, so any
 * change to any of them — or to the ordering — breaks the chain.
 */
export function computeEntryHash(fields: {
  index: number;
  timestamp: string;
  data: unknown;
  prevHash: string;
}): string {
  const payload = canonicalize({
    index: fields.index,
    timestamp: fields.timestamp,
    data: fields.data,
    prevHash: fields.prevHash,
  });
  return sha256(payload);
}
