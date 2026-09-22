// Verifies the PUBLISHED artifact, not the source: that the exports map
// resolves, that both module systems load, and that a chain built by one is
// verifiable by the other. Run against dist/ after a build.
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

const esm = await import("../dist/esm/index.js");
const cjs = require("../dist/cjs/index.js");

for (const [label, mod] of [
  ["esm", esm],
  ["cjs", cjs],
]) {
  for (const name of ["ChainLog", "MemoryStore", "FileStore", "canonicalize", "GENESIS_HASH"]) {
    assert.ok(mod[name], `${label} build is missing the ${name} export`);
  }
}

const esmLog = new esm.ChainLog();
esmLog.append({ actor: "alice", action: "login", at: new Date(0) });
esmLog.append({ actor: "bob", action: "exported_report" });
assert.equal(esmLog.verify().valid, true);

// The two builds must agree byte for byte on hashes, or a chain written by an
// ESM process could not be verified by a CommonJS one.
const cjsLog = new cjs.ChainLog({ now: () => esmLog.entries()[0].timestamp });
cjsLog.append({ actor: "alice", action: "login", at: new Date(0) });
assert.equal(
  cjsLog.entries()[0].hash,
  esmLog.entries()[0].hash,
  "the ESM and CommonJS builds produce different hashes for the same entry",
);

console.log("smoke: esm + cjs load, export, and hash identically");
