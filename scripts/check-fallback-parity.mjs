#!/usr/bin/env node

import assert from "node:assert/strict";

import { benchmarkFallback } from "../src/data/benchmarkFallback.ts";

const benchmark = benchmarkFallback.find((item) => item.benchmarkName === "Viscose Benchmarks S2");

assert.ok(benchmark, "Viscose Benchmarks S2 fallback should exist");
assert.equal(benchmark.difficulties?.length, 4, "Fallback should include the four Viscose S2 difficulties");

const expected = [
  ["Easier", 2335, "KovaaKsScreamingPulledEgg", 9],
  ["Medium", 2336, "KovaaKsPeakingNarrowImpact", 9],
  ["Hard", 2337, "KovaaKsPlunderingOlivegreenClutch", 8],
  ["Expert", 2338, "KovaaKsRaidingPeriwinkleWindow", 6],
];

for (const [difficultyName, kovaaksBenchmarkId, sharecode, rankColorCount] of expected) {
  const difficulty = benchmark.difficulties?.find((item) => item.difficultyName === difficultyName);
  assert.ok(difficulty, `${difficultyName} fallback difficulty should exist`);
  assert.equal(difficulty.kovaaksBenchmarkId, kovaaksBenchmarkId, `${difficultyName} benchmark id should stay stable`);
  assert.equal(difficulty.sharecode, sharecode, `${difficultyName} sharecode should stay stable`);
  assert.equal(Object.keys(difficulty.rankColors || {}).length, rankColorCount, `${difficultyName} rank colors should stay stable`);
}

console.log("Fallback checks passed");
