#!/usr/bin/env node

import assert from "node:assert/strict";
import { benchmarkFallback } from "../src/data/benchmarkFallback.ts";
import {
  buildDailyReviewPerformanceRankings,
  averageRecentRuns,
  averageRecentDailySessions,
  dailyReviewMetricLabel,
  dailyReviewValue,
  buildDailySessionsByScenario,
  latestDailyReviewDate,
  stableMetricValue,
} from "../src/core/dailyReview.ts";
import { buildRecordExclusions, effectiveRecords, excludeRecordManually, recordKey } from "../src/core/exclusions.ts";
import { inferTrainingTimeForDate } from "../src/core/reviewInputs.ts";
import { buildRecordIndex, recordsForScenario, scopedRecords, unmatchedCsvScenarioCounts } from "../src/core/records.ts";
import { rankForScore } from "../src/core/rank.ts";
import { ensureSelectedScenario } from "../src/core/selections.ts";
import { average, daysBetween } from "../src/core/stats.ts";
import { loadState, saveState } from "../src/core/storage.ts";

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

const scenario = { name: "VT Smoothbot", category: "Tracking", subcategory: "Smooth", rankMaxes: [100, 200, 300] };
const scenarios = [scenario, { name: "1wall 6targets small", category: "Clicking", subcategory: "Static", rankMaxes: [50, 75, 100] }];
const difficulty = {
  difficultyName: "Easier",
  rankColors: { Bronze: "#a", Silver: "#b", Gold: "#c" },
  scenarios,
};
const benchmark = { benchmarkName: "Viscose Benchmarks S2", difficulties: [difficulty] };
const benchmarks = [benchmark, ...benchmarkFallback.filter((item) => item.benchmarkName !== benchmark.benchmarkName)];
const now = new Date("2026-05-23T12:00:00.000Z");
const storage = new MemoryStorage({
  "kovaak-benchmark-tracker-v2": JSON.stringify({
    benchmarks,
    selectedBenchmark: "missing benchmark",
    selectedDifficulty: "missing difficulty",
    selectedScenario: scenario.name,
    dailyReviewDate: "2026-05-22",
    dailyReviewMetric: "session3",
    dailyReviewScope: "all",
    dailyReviewTableSettings: {
      density: "wide",
      progressStyle: "simple",
      skew: 24,
      outerRadius: 10,
      innerRadius: 5,
      textSize: 108,
      textContrast: 62,
      boldText: false,
      textShadow: true,
      showProgressPercent: false,
      shadeCategoryCells: false,
      shadeRankCells: true,
      highContrast: false,
      useRankColumnColors: true,
      simplifyScenarioNames: true,
    },
    csvRecords: [],
    manualRecords: [],
  }),
});

const loaded = loadState("kovaak-benchmark-tracker-v2", benchmarkFallback, storage);
assert.equal(loaded.dailyReviewDate, "2026-05-22");
assert.equal(loaded.dailyReviewMetric, "session3");
assert.equal(loaded.dailyReviewScope, "all");
assert.equal(loaded.dailyReviewTableSettings.density, "wide");
assert.equal(loaded.dailyReviewTableSettings.progressStyle, "simple");
assert.equal(loaded.dailyReviewTableSettings.showProgressPercent, false);
assert.equal(loaded.dailyReviewTableSettings.useRankColumnColors, true);
assert.deepEqual(loaded.dailyReviews, {});
assert.equal(loaded.defaultSetupProfile.dpi, "");

const selectedBenchmark = benchmarks.find((item) => item.benchmarkName === loaded.selectedBenchmark)?.benchmarkName || benchmark.benchmarkName;
const selectedDifficulty = benchmark.difficulties.find((item) => item.difficultyName === loaded.selectedDifficulty)?.difficultyName || difficulty.difficultyName;
assert.equal(selectedBenchmark, benchmark.benchmarkName);
assert.equal(selectedDifficulty, difficulty.difficultyName);

const csvRecords = [
  ...Array.from({ length: 30 }, (_, index) => ({
    scenario: scenario.name,
    rawScenario: scenario.name,
    score: 100 + index,
    date: `2026-04-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    source: "csv",
    note: `stable-${index}.csv`,
  })),
  {
    scenario: scenario.name,
    rawScenario: scenario.name,
    score: 0,
    date: "2026-05-23T11:00:00.000Z",
    source: "csv",
    note: "zero.csv",
  },
  {
    scenario: scenario.name,
    rawScenario: `${scenario.name} - Challenge`,
    score: scenario.rankMaxes[0] + 10,
    date: "2026-05-22T10:00:00.000Z",
    source: "csv",
    note: "matched.csv",
  },
  {
    scenario: "Not In Benchmark",
    rawScenario: "Not In Benchmark",
    score: 1,
    date: "2026-05-22T10:05:00.000Z",
    source: "csv",
    note: "unmatched.csv",
  },
];
const manualRecords = [
  {
    id: "manual-1",
    scenario: scenario.name,
    score: scenario.rankMaxes[0] + 20,
    date: "2026-05-23T10:00:00.000Z",
    source: "manual",
    note: "manual",
  },
];
const recordExclusions = buildRecordExclusions([...csvRecords, ...manualRecords], {});
const excludedRecord = csvRecords.find((record) => record.note === "matched.csv");
const manuallyExcluded = excludeRecordManually(excludedRecord, recordExclusions, "parity exclude", "2026-05-24T00:00:00.000Z");
const effectiveCsv = effectiveRecords(csvRecords, manuallyExcluded);

const recordIndex = buildRecordIndex({ csvRecords: effectiveCsv, manualRecords, scenarios });
assert.equal(recordIndex.all.length, 32, "effective index should exclude manual exclusions and zero scores");
assert.equal(recordIndex.matched.length, 31, "matched count should only include effective current benchmark scenarios");
assert.deepEqual(unmatchedCsvScenarioCounts(csvRecords, scenarios), [{ scenario: "Not In Benchmark", count: 1 }]);
assert.equal(effectiveCsv.some((record) => record.note === "matched.csv"), false, "manually excluded record should be filtered from effective records");
assert.equal(inferTrainingTimeForDate([...csvRecords, ...manualRecords], manuallyExcluded, "2026-05-23")?.start, "19:00");

const ensuredScenario = ensureSelectedScenario(scenario.name, scenarios.map((item) => item.name), recordIndex.all);
assert.equal(ensuredScenario, scenario.name);

const visibleRecords = scopedRecords(recordIndex, ensuredScenario);
const recent7 = visibleRecords.filter((record) => daysBetween(new Date(record.date), now) <= 7 && record.score > 0);
const avg7 = average(recent7.map((record) => record.score));
assert.equal(avg7, scenario.rankMaxes[0] + 20);

const rank = rankForScore(avg7, scenario.rankMaxes, difficulty.rankColors);
assert.ok(rank?.name, "rank should resolve for a selected benchmark scenario");

const sessions = buildDailySessionsByScenario(scenarios, (scenarioName) => recordsForScenario(recordIndex, scenarioName));
assert.equal(latestDailyReviewDate(sessions), "2026-05-23");
assert.equal(dailyReviewMetricLabel("best"), "最高");
assert.equal(dailyReviewValue(sessions.get(scenario.name), sessions.get(scenario.name)?.[0], "best", "2026-05-23"), scenario.rankMaxes[0] + 20);
assert.equal(averageRecentRuns(recordsForScenario(recordIndex, scenario.name), 10), 124.5);
assert.equal(averageRecentDailySessions(sessions.get(scenario.name), 3, "2026-05-23"), 125.66666666666667);
assert.equal(stableMetricValue({ records: recordsForScenario(recordIndex, scenario.name), sessions: sessions.get(scenario.name), metricKey: "session3", dateKey: "2026-05-23" }), 125.66666666666667);
const dailyPerformance = buildDailyReviewPerformanceRankings({
  dateKey: "2026-05-23",
  rankColors: difficulty.rankColors,
  scenarios,
  sessions,
});
assert.equal(dailyPerformance.items.length, 1);
assert.equal(dailyPerformance.items[0].score, scenario.rankMaxes[0] + 20);
assert.equal(loaded.dailyReviewMetric, "session3", "daily review metric should remain restorable as a stable metric");

saveState(
  "kovaak-benchmark-tracker-v2",
  {
    ...loaded,
    benchmarks,
    csvRecords,
    manualRecords,
    recordExclusions: manuallyExcluded,
    defaultSetupProfile: { mouse: "OP1", mousepad: "Saturn", sensitivity: "0.3", dpi: "1600", fov: "103", notes: "main" },
    dailyReviews: {
      "2026-05-22": {
        dateKey: "2026-05-22",
        note: "parity note",
        trainingTimeOverride: { start: "19:00", end: "20:00" },
        setupOverride: { dpi: "800" },
      },
    },
  },
  {
    selectedBenchmark,
    selectedDifficulty,
    selectedScenario: ensuredScenario,
    dailyReviewDate: "2026-05-22",
    dailyReviewDateIsManual: true,
    dailyReviewMetric: "run20",
    dailyReviewScope: "all",
  },
  storage,
);
const saved = JSON.parse(storage.getItem("kovaak-benchmark-tracker-v2"));
assert.equal(saved.selectedBenchmark, benchmark.benchmarkName);
assert.equal(saved.selectedDifficulty, difficulty.difficultyName);
assert.equal(saved.selectedScenario, scenario.name);
assert.equal(saved.dailyReviewDate, "2026-05-22");
assert.equal(saved.dailyReviewMetric, "run20");
assert.equal(saved.dailyReviewTableSettings.density, "wide");
assert.equal(saved.dailyReviewTableSettings.progressStyle, "simple");
assert.equal(saved.csvRecords.length, 33);
assert.equal(saved.manualRecords.length, 1);
assert.equal(saved.recordExclusions[recordKey(excludedRecord)].status, "excluded");
assert.equal(saved.dailyReviews["2026-05-22"].note, "parity note");
assert.equal(saved.dailyReviews["2026-05-22"].trainingTimeOverride.start, "19:00");
assert.equal(saved.defaultSetupProfile.dpi, "1600");

console.log("React parity checks passed");
