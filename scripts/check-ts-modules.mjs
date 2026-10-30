#!/usr/bin/env node

import assert from "node:assert/strict";

const stats = await import("../src/core/stats.ts");
const scenario = await import("../src/core/scenario.ts");
const csv = await import("../src/core/csv.ts");
const rank = await import("../src/core/rank.ts");
const dailyReview = await import("../src/core/dailyReview.ts");
const weeklyReview = await import("../src/core/weeklyReview.ts");
const exclusions = await import("../src/core/exclusions.ts");
const reviewInputs = await import("../src/core/reviewInputs.ts");
const records = await import("../src/core/records.ts");
const storage = await import("../src/core/storage.ts");
const manualRecords = await import("../src/core/manualRecords.ts");
const selections = await import("../src/core/selections.ts");
const benchmark = await import("../src/core/benchmark.ts");
const fileImport = await import("../src/services/fileImport.ts");
const backup = await import("../src/services/backup.ts");
const fallback = await import("../src/data/benchmarkFallback.ts");
const browserFetch = await import("../src/services/browserFetch.ts");

const scenarios = [
  { name: "VT Smoothbot", rankMaxes: [100, 200, 300] },
  { name: "1wall 6targets small", rankMaxes: [50, 75, 100] },
];

assert.equal(stats.average([1, 2, 3]), 2);
assert.equal(scenario.findBenchmarkScenarioName("VT Smoothbot - Challenge", scenarios), "VT Smoothbot");

const parsed = csv.parseKovaakCsvWithStatus(
  "Scenario,Score,OverShots,Challenge Start,Sensitivity,FOV,DPI\nVT Smoothbot,1234,999,2026-05-21T02:47:26,0.3,103,1600",
  "VT Smoothbot - Challenge - 2026.05.21-02.47.26 Stats.csv",
  Date.UTC(2026, 4, 21),
  { matchScenarioName: (name) => scenario.findBenchmarkScenarioName(name, scenarios) },
);
assert.equal(parsed.status.success, true);
assert.equal(parsed.record?.scenario, "VT Smoothbot");
assert.equal(parsed.record?.metadata?.sourceFile, "VT Smoothbot - Challenge - 2026.05.21-02.47.26 Stats.csv");
assert.equal(parsed.record?.metadata?.sourceType, "csv");
assert.equal(parsed.record?.metadata?.sensitivity, 0.3);
assert.equal(parsed.record?.metadata?.fov, 103);
assert.equal(parsed.record?.metadata?.dpi, 1600);
assert.equal(parsed.record?.metadata?.rawMetadata?.scenario, "VT Smoothbot");
assert.equal(parsed.record?.metadata?.rawMetadata?.overshots, undefined);

assert.deepEqual(rank.rankForScore(220, [100, 200, 300], { Bronze: "#a", Silver: "#b", Gold: "#c" }), {
  name: "Silver",
  next: { name: "Gold", need: 80 },
  color: "#b",
});

const sampleRecords = [
  { scenario: "VT Smoothbot", score: 100, date: "2026-05-21T01:00:00.000Z" },
  { scenario: "VT Smoothbot", score: 200, date: "2026-05-21T02:00:00.000Z" },
  { scenario: "VT Smoothbot", score: 300, date: "2026-05-20T02:00:00.000Z" },
];
const sessions = dailyReview.buildDailySessionsByScenario(scenarios, (name) => sampleRecords.filter((record) => scenario.sameScenario(record.scenario, name)));
assert.equal(dailyReview.latestDailyReviewDate(sessions), "2026-05-21");
assert.equal(sessions.get("VT Smoothbot")[0].avg, 150);
assert.equal(sessions.get("VT Smoothbot")[0].best, 200);
assert.equal(sessions.get("VT Smoothbot")[0].worst, 100);
assert.equal(sessions.get("VT Smoothbot")[0].median, 150);

const reviewScenarios = [
  { name: "Good", rankMaxes: [100, 200, 300] },
  { name: "Weak", rankMaxes: [100, 200, 300] },
  { name: "Rested", rankMaxes: [100, 200, 300] },
];
const reviewSessions = new Map([
  [
    "Good",
    [
      { dateKey: "2026-05-21", count: 3, avg: 240, best: 260, worst: 220, median: 240 },
      { dateKey: "2026-05-20", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
      { dateKey: "2026-05-19", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
      { dateKey: "2026-05-18", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
      { dateKey: "2026-05-17", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
    ],
  ],
  [
    "Weak",
    [
      { dateKey: "2026-05-21", count: 3, avg: 120, best: 145, worst: 100, median: 115 },
      { dateKey: "2026-05-20", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
      { dateKey: "2026-05-19", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
      { dateKey: "2026-05-18", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
      { dateKey: "2026-05-17", count: 3, avg: 180, best: 190, worst: 170, median: 180 },
    ],
  ],
  [
    "Rested",
    [{ dateKey: "2026-05-20", count: 3, avg: 280, best: 290, worst: 270, median: 280 }],
  ],
]);
const performance = dailyReview.buildDailyReviewPerformanceRankings({
  dateKey: "2026-05-21",
  limit: 1,
  rankColors: { Bronze: "#a", Silver: "#b", Gold: "#c" },
  scenarios: reviewScenarios,
  sessions: reviewSessions,
});
assert.equal(performance.items.length, 2, "performance rankings should only include scenarios trained on the selected day");
assert.equal(performance.good[0].scenarioName, "Good");
assert.equal(performance.weak[0].scenarioName, "Weak");
assert.ok(performance.good[0].progressDelta > 0, "good scenario should beat its recent progress baseline");
assert.ok(performance.weak[0].progressDelta < 0, "weak scenario should trail its recent progress baseline");
assert.deepEqual(
  dailyReview.dailyReviewTrendPoints(reviewSessions.get("Good"), "2026-05-21", 3).map((session) => session.dateKey),
  ["2026-05-19", "2026-05-20", "2026-05-21"],
);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "avg", "2026-05-20"), 180);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "avg", "2026-05-21"), 240);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "best", "2026-05-21"), 260);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "worst", "2026-05-21"), 220);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "median", "2026-05-21"), 240);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "historyBest", "2026-05-21"), 260);
assert.equal(dailyReview.dailyReviewMetricLabel("historyBest"), "历史最高");

const trainingDates = dailyReview.trainingDateNavigation(reviewSessions, "2026-05-20");
assert.equal(trainingDates.latestTrainingDate, "2026-05-21");
assert.equal(trainingDates.previousTrainingDate, "2026-05-19");
assert.equal(trainingDates.nextTrainingDate, "2026-05-21");
assert.equal(trainingDates.hasPreviousTrainingDate, true);
assert.equal(trainingDates.hasNextTrainingDate, true);
assert.equal(dailyReview.trainingDateNavigation(reviewSessions, "2026-05-17").hasPreviousTrainingDate, false);
assert.equal(dailyReview.trainingDateNavigation(reviewSessions, "2026-05-21").hasNextTrainingDate, false);
const stableRecords = [
  { scenario: "Good", score: 0, date: "2026-05-22T10:00:00.000Z" },
  { scenario: "Good", score: Number.NaN, date: "2026-05-22T09:00:00.000Z" },
  ...Array.from({ length: 34 }, (_, index) => ({
    scenario: "Good",
    score: index + 1,
    date: index < 30 ? `2026-04-${String(index + 1).padStart(2, "0")}T08:00:00.000Z` : `2026-05-${String(index - 29).padStart(2, "0")}T08:00:00.000Z`,
  })),
];
assert.equal(dailyReview.validScoreRecords(stableRecords).length, 34);
assert.equal(dailyReview.averageRecentRuns(stableRecords, 10), 29.5);
assert.equal(dailyReview.averageRecentRuns(stableRecords, 20), 24.5);
assert.equal(dailyReview.averageRecentRuns(stableRecords, 30), 19.5);
assert.equal(dailyReview.averageRecentDailySessions(reviewSessions.get("Good"), 1, "2026-05-21"), 240);
assert.equal(dailyReview.averageRecentDailySessions(reviewSessions.get("Good"), 3, "2026-05-21"), 200);
assert.equal(dailyReview.averageRecentDailySessions(reviewSessions.get("Good"), 5, "2026-05-21"), 192);
assert.equal(dailyReview.stableMetricValue({ records: stableRecords, sessions: reviewSessions.get("Good"), metricKey: "run10", dateKey: "2026-05-21" }), 29.5);
assert.equal(dailyReview.stableMetricValue({ records: stableRecords, sessions: reviewSessions.get("Good"), metricKey: "session3", dateKey: "2026-05-21" }), 200);
assert.equal(dailyReview.dailyReviewValue(reviewSessions.get("Good"), undefined, "session5", "2026-05-21"), 192);
assert.equal(dailyReview.stableMetricLabel("run20"), "最近 20 runs 均分");

const week = weeklyReview.naturalWeekRange(new Date("2026-05-27T12:00:00+09:00"));
assert.deepEqual(week, { start: "2026-05-25", end: "2026-05-31" });
assert.deepEqual(weeklyReview.previousWeekRange(week), { start: "2026-05-18", end: "2026-05-24" });

const weeklyScenarios = [
  { name: "Smooth Easy", category: "Tracking", subcategory: "Smooth", rankMaxes: [100, 200, 300] },
  { name: "Smooth Hard", category: "Tracking", subcategory: "Smooth", rankMaxes: [100, 200, 300] },
  { name: "Speed Click", category: "Clicking", subcategory: "Speed", rankMaxes: [50, 100, 150] },
  { name: "No Lines", category: "Utility", subcategory: "Missing", rankMaxes: [] },
];
const weeklyRecords = [
  { scenario: "Smooth Easy", score: 90, date: "2026-05-26T10:00:00.000Z" },
  { scenario: "Smooth Easy", score: 110, date: "2026-05-27T10:00:00.000Z" },
  { scenario: "Smooth Easy", score: 0, date: "2026-05-27T11:00:00.000Z" },
  { scenario: "Smooth Hard", score: 150, date: "2026-05-27T10:00:00.000Z" },
  { scenario: "Speed Click", score: 130, date: "2026-05-26T10:00:00.000Z" },
  { scenario: "No Lines", score: 999, date: "2026-05-26T10:00:00.000Z" },
  { scenario: "Smooth Easy", score: 250, date: "2026-05-20T10:00:00.000Z" },
  { scenario: "Smooth Hard", score: 200, date: "2026-05-20T10:00:00.000Z" },
  { scenario: "Speed Click", score: 100, date: "2026-05-20T10:00:00.000Z" },
];
const weekly = weeklyReview.buildWeeklyReview({
  currentRange: week,
  previousRange: weeklyReview.previousWeekRange(week),
  rankColors: { Bronze: "#a", Silver: "#b", Gold: "#c" },
  recordsForScenario: (name) => weeklyRecords.filter((record) => record.scenario === name),
  scenarios: weeklyScenarios,
});
assert.equal(weekly.currentRange.start, "2026-05-25");
assert.equal(weekly.previousRange.start, "2026-05-18");
assert.equal(weekly.weakCategories[0].label, "Utility / Missing");
assert.equal(weekly.weakCategories[0].currentProgressAvg, 0);
assert.equal(weekly.weakCategories[1].label, "Tracking / Smooth");
assert.equal(weekly.weakCategories[1].trainedScenarioCount, 2);
assert.equal(weekly.weakCategories[1].scenarioCount, 2);
assert.equal(weekly.weakCategories[1].weakScenarios[0].scenarioName, "Smooth Easy");
assert.equal(weekly.weakCategories[1].weakScenarios[0].avgScore, 100);
assert.ok(weekly.weakCategories[1].delta < 0, "Tracking / Smooth should regress compared with previous week");
assert.equal(weekly.weakCategories.at(-1).label, "Clicking / Speed");
assert.match(weeklyReview.weeklyReviewMarkdown(weekly, 2), /^## Weekly Review: 2026-05-25 - 2026-05-31/);
assert.match(weeklyReview.weeklyReviewMarkdown(weekly, 2), /### 最弱分类/);
assert.match(weeklyReview.weeklyReviewMarkdown(weekly, 2), /1\. Utility \/ Missing/);

const index = records.buildRecordIndex({
  csvRecords: [{ scenario: "VT Smoothbot", rawScenario: "VT Smoothbot Challenge", score: 10, date: "2026-05-21T00:00:00.000Z", source: "csv" }],
  manualRecords: [{ scenario: "1wall 6targets small", score: 90, date: "2026-05-22T00:00:00.000Z", source: "manual" }],
  scenarios,
});
assert.equal(index.matched.length, 2);

const normalized = storage.normalizeState({ selectedScenario: "VT Smoothbot" }, [{ benchmarkName: "Fallback" }]);
assert.equal(normalized.selectedScenario, "VT Smoothbot");
assert.equal(normalized.benchmarks[0].benchmarkName, "Fallback");
assert.equal(normalized.dailyReviewTableSettings.density, "compact");
assert.equal(normalized.dailyReviewTableSettings.progressStyle, "normal");
assert.equal(normalized.dailyReviewTableSettings.skew, 45);
assert.equal(normalized.dailyReviewTableSettings.boldText, true);
assert.equal(normalized.dailyReviewTableSettings.showProgressPercent, true);
const normalizedCustomTable = storage.normalizeState({
  dailyReviewTableSettings: {
    density: "wide",
    skew: 18,
    textSize: 115,
    showProgressPercent: false,
    useRankColumnColors: true,
  },
});
assert.equal(normalizedCustomTable.dailyReviewTableSettings.density, "wide");
assert.equal(normalizedCustomTable.dailyReviewTableSettings.skew, 18);
assert.equal(normalizedCustomTable.dailyReviewTableSettings.textSize, 115);
assert.equal(normalizedCustomTable.dailyReviewTableSettings.showProgressPercent, false);
assert.equal(normalizedCustomTable.dailyReviewTableSettings.useRankColumnColors, true);
assert.equal(normalizedCustomTable.dailyReviewTableSettings.outerRadius, 8);
const migratedCachedBenchmark = storage.normalizeState({
  benchmarks: [
    {
      benchmarkName: "Cached",
      difficulties: [
        {
          difficultyName: "Easier",
          scenarios: [
            { name: "ww4t Voltaic", category: "Speed", subcategory: "Speed", rankMaxes: [90, 102] },
            { name: "VT Aether Novice S5 Hard Bot 1 90%", category: "Speed", subcategory: "Speed", rankMaxes: [1550, 2150] },
          ],
        },
      ],
    },
  ],
});
assert.equal(migratedCachedBenchmark.benchmarks[0].difficulties[0].scenarios[0].category, "Flick Tech");
assert.equal(migratedCachedBenchmark.benchmarks[0].difficulties[0].scenarios[0].subcategory, "Speed");
assert.equal(migratedCachedBenchmark.benchmarks[0].difficulties[0].scenarios[1].category, "Reactive Tracking");
assert.equal(migratedCachedBenchmark.benchmarks[0].difficulties[0].scenarios[1].subcategory, "Speed");

const emptyStorageState = storage.loadState(
  "missing",
  fallback.benchmarkFallback,
  {
    getItem: () => null,
    setItem: () => {},
  },
);
assert.equal(emptyStorageState.benchmarks[0].benchmarkName, "Viscose Benchmarks S2");
assert.equal(emptyStorageState.benchmarks[0].difficulties.length, 4);
assert.deepEqual(emptyStorageState.dailyReviews, {});
assert.equal(emptyStorageState.defaultSetupProfile.mouse, "");
assert.equal(typeof emptyStorageState.recordExclusions, "object");
assert.doesNotThrow(() => storage.saveState("key", emptyStorageState, {
  selectedBenchmark: emptyStorageState.selectedBenchmark,
  selectedDifficulty: emptyStorageState.selectedDifficulty,
  selectedScenario: emptyStorageState.selectedScenario,
  dailyReviewDate: emptyStorageState.dailyReviewDate,
  dailyReviewDateIsManual: false,
  dailyReviewMetric: emptyStorageState.dailyReviewMetric,
  dailyReviewScope: emptyStorageState.dailyReviewScope,
}, {
  getItem: () => null,
  setItem: () => {
    throw new Error("quota");
  },
}));

const exclusionRecords = [
  { id: "old-1", scenario: "Good", score: 100, date: "2026-05-01T08:00:00.000Z", source: "csv" },
  ...Array.from({ length: 30 }, (_, index) => ({ id: `base-${index}`, scenario: "Good", score: 100, date: `2026-05-${String(index + 2).padStart(2, "0")}T08:00:00.000Z`, source: "csv" })),
  { id: "low", scenario: "Good", score: 40, date: "2026-06-10T08:00:00.000Z", source: "csv" },
  { id: "zero", scenario: "Good", score: 0, date: "2026-06-11T08:00:00.000Z", source: "csv" },
];
const generatedExclusions = exclusions.buildRecordExclusions(exclusionRecords, {});
assert.equal(generatedExclusions.zero.status, "excluded");
assert.equal(generatedExclusions.zero.reason, "zero-score");
assert.equal(generatedExclusions.low.status, "suspicious");
assert.equal(generatedExclusions.low.reason, "low-vs-median");
assert.equal(exclusions.effectiveRecords(exclusionRecords, generatedExclusions).some((record) => record.id === "zero"), false);
assert.equal(exclusions.effectiveRecords(exclusionRecords, generatedExclusions).some((record) => record.id === "low"), true);
const manualExcluded = exclusions.excludeRecordManually(exclusionRecords[0], generatedExclusions, "bad run", "2026-06-12T00:00:00.000Z");
assert.equal(manualExcluded["old-1"].status, "excluded");
assert.equal(exclusions.restoreRecordExclusion(exclusionRecords[0], manualExcluded)["old-1"], undefined);
const excludedBaselineRecords = [
  ...Array.from({ length: 30 }, (_, index) => ({ id: `excluded-base-${index}`, scenario: "Excluded Base", score: 100, date: `2026-05-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`, source: "csv" })),
  { id: "excluded-base-low", scenario: "Excluded Base", score: 40, date: "2026-06-01T08:00:00.000Z", source: "csv" },
];
const excludedBaselineMap = Object.fromEntries(
  excludedBaselineRecords.slice(0, 30).map((record) => [record.id, { recordKey: record.id, status: "excluded", reason: "manual", updatedAt: "2026-06-01T00:00:00.000Z" }]),
);
assert.equal(exclusions.buildRecordExclusions(excludedBaselineRecords, excludedBaselineMap)["excluded-base-low"], undefined);
assert.equal(exclusions.recordKey({ scenario: "A", score: 1, date: "2026-05-01", source: "manual" }), "manual:A:2026-05-01:1");
const inferred = reviewInputs.inferTrainingTimeForDate(exclusionRecords, generatedExclusions, "2026-05-02");
assert.equal(inferred?.start, "17:00");
assert.equal(inferred?.end, "17:00");
const normalizedReview = reviewInputs.normalizeDailyReviewEntry({ dateKey: "2026-05-02", note: "ok", setupOverride: { dpi: "1600" } }, "2026-05-02");
assert.equal(normalizedReview.note, "ok");
assert.equal(normalizedReview.setupOverride.dpi, "1600");

assert.equal(manualRecords.upsertManualRecord([], { scenario: "A", score: 1, date: new Date("2026-05-21"), note: "" }, null, () => "id").length, 1);
assert.equal(selections.ensureSelectedScenario("missing", ["A"], []), "all");
assert.equal(benchmark.mergeBenchmarks([{ benchmarkName: "A" }], [{ benchmarkName: "B" }]).length, 2);
assert.deepEqual(
  benchmark.flattenBenchmarkApiData({
    categories: {
      "Speed ": {
        scenarios: {
          "ww4t Voltaic": { rank_maxes: [90, 100] },
        },
      },
    },
  })[0],
  {
    name: "ww4t Voltaic",
    category: "Flick Tech",
    subcategory: "Speed",
    leaderboardId: undefined,
    rankMaxes: [90, 100],
  },
);
assert.deepEqual(
  benchmark.flattenBenchmarkApiData({
    categories: {
      Speed: {
        scenarios: {
          "VT Aether Novice S5 Hard Bot 1 90%": { rank_maxes: [1550, 2150] },
        },
      },
    },
  })[0],
  {
    name: "VT Aether Novice S5 Hard Bot 1 90%",
    category: "Reactive Tracking",
    subcategory: "Speed",
    leaderboardId: undefined,
    rankMaxes: [1550, 2150],
  },
);
assert.equal(fileImport.mergeImportedCsvRecords([], [{ source: "csv", note: "a.csv", scenario: "A", score: 1, date: "2026-05-21" }]).length, 1);
assert.equal(typeof backup.readJsonFile, "function");
globalThis.window = { location: { hostname: "127.0.0.1", port: "5173" } };
assert.equal(browserFetch.localDevProxyUrl("https://evxl.app/benchmarks/Viscose%20Benchmarks%20S2"), "/evxl-proxy/benchmarks/Viscose%20Benchmarks%20S2");
assert.equal(
  browserFetch.localDevProxyUrl("https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark"),
  "/kovaaks-proxy/webapp-backend/benchmarks/player-progress-rank-benchmark",
);
globalThis.window = { location: { hostname: "localhost", port: "4173" } };
assert.equal(browserFetch.needsLocalDevProxy("https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark"), true);
delete globalThis.window;

console.log("TypeScript module checks passed");
