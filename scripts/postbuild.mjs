// tsc emits plain .js into both output folders. The package is "type": "module",
// so Node would read dist/cjs as ESM without these markers. One package.json in
// each folder pins the interpretation, which is what the "exports" map promises.
import { writeFileSync } from "node:fs";

for (const [dir, type] of [
  ["esm", "module"],
  ["cjs", "commonjs"],
]) {
  writeFileSync(
    new URL(`../dist/${dir}/package.json`, import.meta.url),
    JSON.stringify({ type }, null, 2) + "\n",
  );
}
