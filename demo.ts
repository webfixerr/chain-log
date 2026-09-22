import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ChainLog, FileStore } from "./src/index.js";

const path = "./demo-audit.log";
if (existsSync(path)) rmSync(path);

console.log("=== chainlog demo ===\n");

// 1. Record some audit events, exactly as an app would.
const log = new ChainLog({ store: new FileStore(path) });
log.append({ actor: "alice", action: "login" });
log.append({ actor: "admin", action: "deleted_user", target: "user_42" });
log.append({ actor: "bob", action: "exported_report" });

console.log("Appended 3 entries.");
console.log("Anchored head hash:", log.head().slice(0, 24) + "...");
console.log("verify() ->", log.verify());

// 2. An attacker edits a past entry directly in storage to hide the deletion.
console.log("\n--- tampering with entry #1 to hide the deletion ---\n");
const lines = readFileSync(path, "utf8").trim().split("\n");
const tampered = JSON.parse(lines[1]);
tampered.data.action = "viewed_user"; // was "deleted_user"
lines[1] = JSON.stringify(tampered);
writeFileSync(path, lines.join("\n") + "\n");

// 3. Re-open the log and verify. The tampering is caught, at the exact entry.
const reloaded = new ChainLog({ store: new FileStore(path) });
console.log("verify() ->", reloaded.verify());

rmSync(path);
