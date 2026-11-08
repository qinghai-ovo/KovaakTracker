// Checks that the Rust importer reads a stats folder exactly like the TypeScript parser, so runs
// keep the same identity (and saved exclusions still apply) after moving to the desktop app.
//
//   npm run check:csv-parity -- "D:\...\FPSAimTrainer\stats"
//
// Needs Rust (cargo) on PATH. Exits with 1 if any file is read differently.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseKovaakCsvWithStatus } from "../src/services/csv.ts";

const dir = process.argv[2];
if (!dir) {
  console.error('usage: npm run check:csv-parity -- "<stats folder>"');
  process.exit(2);
}

const started = Date.now();
const rustOutput = execFileSync("cargo", ["run", "--quiet", "--release", "--example", "parse_stats", "--", "parse", resolve(dir)], {
  cwd: new URL("../src-tauri/", import.meta.url),
  encoding: "utf8",
  maxBuffer: 1 << 30,
  stdio: ["ignore", "pipe", "inherit"],
});
const rust = new Map(
  rustOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((item) => [item.file, item]),
);
console.log(`Rust read ${rust.size} files in ${((Date.now() - started) / 1000).toFixed(1)}s (including the build)`);

const decoder = new TextDecoder();
const pad = (n) => String(n).padStart(2, "0");
const localText = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const files = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".csv")).sort();
const mismatches = [];
let missingMetadataAsZero = 0;
let compared = 0;
for (const name of files) {
  const path = join(dir, name);
  const { record, status } = parseKovaakCsvWithStatus(decoder.decode(readFileSync(path)), name, statSync(path).mtimeMs);
  const other = rust.get(name);
  compared += 1;
  const differ = (field, ts, rs) => mismatches.push({ name, field, ts, rs });
  if (!other) {
    differ("present", true, false);
    continue;
  }
  if (!record) {
    if (other.failure !== status.failureReason) differ("failure", status.failureReason, other.failure ?? other.identity);
    continue;
  }
  if (other.failure) {
    differ("failure", "", other.failure);
    continue;
  }
  if (record.id !== other.identity) differ("identity", record.id, other.identity);
  if (record.rawScenario !== other.scenario) differ("scenario", record.rawScenario, other.scenario);
  if (record.score !== other.score) differ("score", record.score, other.score);
  const date = new Date(record.date);
  if (date.getTime() !== other.playedAt) differ("playedAt", date.getTime(), other.playedAt);
  if (status.dateSource !== "fallback" && localText(date) !== other.playedLocal) differ("playedLocal", localText(date), other.playedLocal);
  for (const field of ["sensitivity", "fov", "dpi"]) {
    const ts = record.metadata?.[field];
    const rs = other[field];
    // Known difference: TypeScript reads a missing value as 0, Rust leaves it empty.
    if (ts === 0 && rs === null) missingMetadataAsZero += 1;
    else if ((ts ?? null) !== rs) differ(field, ts, rs);
  }
}

console.log(`Compared ${compared} files: ${mismatches.length} differences.`);
console.log(`Missing sensitivity/FOV/DPI: TypeScript 0, Rust empty (expected) — ${missingMetadataAsZero} values.`);
if (mismatches.length) {
  const byField = Object.groupBy(mismatches, (item) => item.field);
  for (const [field, items] of Object.entries(byField)) {
    console.log(`\n${field}: ${items.length}`);
    for (const item of items.slice(0, 5)) console.log(`  ${item.name}\n    TS:   ${JSON.stringify(item.ts)}\n    Rust: ${JSON.stringify(item.rs)}`);
  }
  process.exit(1);
}
