import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OpenCC = require("opencc-js");
const toHk = OpenCC.Converter({ from: "cn", to: "hk" });

const spans = [...readFileSync("src/edits.ts", "utf8").matchAll(/"span": "([^"]+)"/g)].map(
  (match) => match[1],
);
const rawDir = "/tmp/noerr-previews";
const outDir = "public/previews";
mkdirSync(rawDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
writeFileSync("/tmp/noerr-spans.json", JSON.stringify(spans));

const run = spawnSync(
  "python3",
  ["scripts/preview_cut.py", "--all", "/tmp/noerr-spans.json", rawDir],
  { stdio: "inherit" },
);
if (run.status !== 0) process.exit(run.status ?? 1);

function walk(value) {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = walk(value[key]);
    return value;
  }
  return typeof value === "string" && !value.startsWith("data:") ? toHk(value) : value;
}

for (const name of readdirSync(rawDir)) {
  if (!name.endsWith(".json")) continue;
  const body = walk(JSON.parse(readFileSync(`${rawDir}/${name}`, "utf8")));
  writeFileSync(`${outDir}/${name}`, JSON.stringify(body));
}
console.log(`wrote ${spans.length} previews`);
