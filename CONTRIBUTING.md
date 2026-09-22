# Contributing to chain-log

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

```bash
git clone https://github.com/webfixerr/chain-log.git
cd chain-log
npm install
npm run verify   # typecheck, tests, dual build, and a smoke test on dist/
```

Useful individual scripts:

| Script | What it does |
| --- | --- |
| `npm test` | Runs the test suite (`node:test` via `tsx`). |
| `npm run typecheck` | Type-checks `src`, `test`, and `demo.ts`. |
| `npm run build` | Emits the ESM and CommonJS builds into `dist/`. |
| `npm run smoke` | Loads the built package both ways and checks hashes agree. |
| `npm run demo` | Runs `demo.ts` end to end. |

## Ground rules

- **Zero runtime dependencies.** This is a deliberate constraint, not an
  oversight — the package is meant to be auditable and safe to drop into an
  app that cares about integrity. Dev dependencies are fine.
- **Never change the hash format without a major version.** A change to
  `canonicalize()` or `computeEntryHash()` invalidates every log anyone has
  already written. If a change is genuinely needed, it needs a migration path.
- **`verify()` must never throw.** Damaged or hostile storage is the input it
  exists to handle; it reports, it does not crash.
- **Every bug fix ships with a regression test** that fails before the fix.

## Writing a new store

The `Store` interface is three methods, and store adapters (SQLite, Postgres,
MySQL, MongoDB) are the most useful contribution right now:

```ts
export interface Store {
  append(entry: Entry): void;
  all(): Entry[];
  last(): Entry | undefined;
}
```

Please make sure a store:

- returns entries from `all()` in append order;
- makes `last()` cheap — it is called on every `append()`;
- throws `CorruptLogError`, rather than an arbitrary error, when stored data
  cannot be read back as entries;
- comes with tests covering persistence across instances and detection of an
  entry edited directly in the backing store.

## Pull requests

1. Branch from `main`.
2. Make sure `npm run verify` passes.
3. Describe what changed and why in the PR body.

CI runs on Node 18, 20, and 22. By contributing, you agree your work is
licensed under the MIT License.
