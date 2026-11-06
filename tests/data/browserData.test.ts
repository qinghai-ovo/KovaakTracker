import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserData, hasBrowserData } from "../../src/data/browserData.ts";
import { APP_STORAGE_KEY, LEGACY_STORAGE_KEY, parseAppStore } from "../../src/data/legacyState.ts";
import { sampleThresholds, rankColors } from "../../src/data/fixtures/designSample.ts";
import { todayScreen } from "../../src/domain/screens/today.ts";
import { recordKey } from "../../src/domain/exclusions.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    raw: items,
  };
}

/** What the classic app saves after a stats import and a benchmark sync. */
function classicState() {
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0).toISOString(); // UTC "…Z" like the CSV importer
  const csvRecords = [
    ...[2580, 2620, 2550, 2700].map((score, i) => ({ id: `csv:a${i}`, scenario: "Smoothbot Arm", rawScenario: "Smoothbot Arm", score, date: at(i + 1, 20), source: "csv" as const })),
    { id: "csv:today", scenario: "Smoothbot Arm", rawScenario: "Smoothbot Arm", score: 2740, date: at(5, 20), source: "csv" as const, metadata: { sourceFile: "x.csv", sourceType: "csv" as const, sensitivity: 0.32, dpi: 1600, fov: 103 } },
    { id: "csv:late", scenario: "Smoothbot Arm", rawScenario: "Smoothbot Arm", score: 2600, date: at(6, 2), source: "csv" as const },
    { id: "csv:vt", scenario: "VT Smoothbot Arm Easy", rawScenario: "VT Smoothbot Arm Easy", score: 2400, date: at(4, 20), source: "csv" as const },
  ];
  return {
    benchmarks: [
      {
        benchmarkName: "Viscose Benchmarks S2",
        difficulties: [
          { difficultyName: "Easier", rankColors, scenarios: [{ name: "Smoothbot Arm", category: "Control Tracking", subcategory: "Arm", rankMaxes: sampleThresholds(2000) }, { name: "Not Synced", rankMaxes: [] }] },
          { difficultyName: "Medium", rankColors, scenarios: [{ name: "Smoothbot Arm", category: "Control Tracking", subcategory: "Arm", rankMaxes: sampleThresholds(2400) }] },
        ],
      },
    ],
    csvRecords,
    manualRecords: [{ id: "manual-1", scenario: "Smoothbot Arm", score: 2500, date: at(3, 21), source: "manual" }],
    selectedBenchmark: "Viscose Benchmarks S2",
    selectedDifficulty: "Easier",
    recordExclusions: {},
    dailyReviews: { "2026-11-05": { dateKey: "2026-11-05", note: "手腕有点紧", state: { caffeine: "一杯", fatigue: "", sleep: "", warmup: "" } } },
    defaultSetupProfile: { mouse: "M", mousepad: "P", sensitivity: "0.32", dpi: "1600", fov: "103", notes: "" },
    lastBenchmarkSyncDate: "2026-11-05T01:12:00.000Z",
    statsFolderName: "stats",
    someFutureField: "kept as is",
  };
}

const now = () => new Date(2026, 10, 6, 3, 0); // 03:00, still the 11-05 training day

test("reads the classic app's saved state into a snapshot", () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(classicState()) });
  assert.equal(hasBrowserData(storage), true);
  assert.equal(hasBrowserData(memoryStorage()), false);
  const data = createBrowserData({ storage, clock: now, watch: false });
  const snapshot = data.getSnapshot();
  assert.equal(snapshot.source, "browser");
  assert.equal(snapshot.benchmark.difficulty, "Easier");
  assert.deepEqual(snapshot.benchmark.difficulties, ["Easier", "Medium"]);
  assert.deepEqual(snapshot.benchmark.scenarios.map((s) => s.name), ["Smoothbot Arm"], "scenarios without thresholds are left out");
  assert.equal(snapshot.records.length, 8);
  assert.equal(snapshot.days["2026-11-05"].note, "手腕有点紧");
  assert.equal(snapshot.setup.mouse, "M");
  assert.equal(snapshot.watching, false);
  assert.equal(snapshot.plan.length, 0);
});

test("real UTC timestamps land on the right training day", () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(classicState()) });
  const snapshot = createBrowserData({ storage, clock: now, watch: false }).getSnapshot();
  const view = todayScreen({
    scenarios: snapshot.benchmark.scenarios,
    rankColors: snapshot.benchmark.rankColors,
    recordsForScenario: (name) => snapshot.records.filter((record) => record.scenario === name),
    exclusions: snapshot.exclusions,
    now: snapshot.now,
    plan: [{ scenarioName: "Smoothbot Arm", targetRuns: 3 }],
  });
  assert.equal(view.dayKey, "2026-11-05");
  const arm = view.scenarios[0];
  assert.deepEqual(arm.runs.map((run) => run.score), [2740, 2600], "the 02:00 run on 11-06 still belongs to 11-05");
  assert.equal(arm.personalBest, 2740);
  assert.equal(arm.rank.name, "Puffin");
});

test("edits are written back without touching other saved fields", () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(classicState()) });
  const data = createBrowserData({ storage, clock: now, watch: false });
  const target = data.getSnapshot().records.find((record) => record.id === "csv:today")!;

  data.toggleRunCounted(target, true);
  data.addManualRun({ scenario: "Smoothbot Arm", score: 2650, date: "2026-11-05T22:00:00" });
  data.updateDay("2026-11-05", { note: "改过的笔记", mood: { sleep: "好" } });
  data.updateSetup({ dpi: "800" });
  data.setDifficulty("Medium");
  data.confirmAlias("VT Smoothbot Arm Easy", "Smoothbot Arm");
  data.addToPlan("Smoothbot Arm");
  data.updateSettings({ stableWindow: "week" });

  const saved = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY)!);
  assert.equal(saved.someFutureField, "kept as is");
  assert.equal(saved.recordExclusions[recordKey(target)].status, "excluded");
  assert.equal(saved.manualRecords.length, 2);
  assert.ok(saved.manualRecords[1].date.endsWith("Z"), "manual runs are stored like the classic app does");
  assert.equal(saved.dailyReviews["2026-11-05"].note, "改过的笔记");
  assert.equal(saved.dailyReviews["2026-11-05"].state.caffeine, "一杯", "classic review fields are preserved");
  assert.equal(saved.defaultSetupProfile.dpi, "800");
  assert.equal(saved.selectedDifficulty, "Medium");

  const store = parseAppStore(storage.getItem(APP_STORAGE_KEY));
  assert.deepEqual(store.aliases, { "VT Smoothbot Arm Easy": "Smoothbot Arm" });
  assert.deepEqual(store.plan, [{ scenarioName: "Smoothbot Arm", targetRuns: 3 }]);
  assert.equal(store.settings.stableWindow, "week");
  assert.deepEqual(store.moods["2026-11-05"], { sleep: "好" });

  const snapshot = data.getSnapshot();
  assert.equal(snapshot.benchmark.difficulty, "Medium");
  assert.equal(snapshot.days["2026-11-05"].mood.sleep, "好");
  assert.equal(snapshot.days["2026-11-05"].note, "改过的笔记");

  const editedId = saved.manualRecords[1].id;
  data.deleteManualRun(editedId);
  assert.equal(JSON.parse(storage.getItem(LEGACY_STORAGE_KEY)!).manualRecords.length, 1);
});

test("broken or missing app store falls back to defaults", () => {
  assert.deepEqual(parseAppStore("not json").plan, []);
  const store = parseAppStore(JSON.stringify({ settings: { dayStartHour: 99, stableWindow: "bogus" }, plan: [{ scenarioName: "A", targetRuns: 0 }, { scenarioName: "B", targetRuns: 5 }] }));
  assert.equal(store.settings.dayStartHour, 4);
  assert.equal(store.settings.stableWindow, "last10");
  assert.deepEqual(store.plan, [{ scenarioName: "A", targetRuns: 3 }, { scenarioName: "B", targetRuns: 5 }], "invalid targets fall back to 3");
});

test("followed benchmarks: switch, reorder and unfollow keep a stable list", () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(classicState()) });
  const data = createBrowserData({ storage, clock: now, watch: false });
  const ids = () => data.getSnapshot().tracked.map((entry) => `${entry.difficulty}${entry.active ? "*" : ""}`);

  assert.deepEqual(ids(), ["Easier*"], "the active benchmark is always listed");
  assert.deepEqual(data.getSnapshot().catalog, [{ benchmark: "Viscose Benchmarks S2", difficulties: ["Easier", "Medium"] }]);

  data.setDifficulty("Medium");
  assert.deepEqual(ids(), ["Easier", "Medium*"], "switching keeps the previous one");
  assert.equal(data.getSnapshot().tracked[1].scenarios.length, 1);

  const [easier, medium] = data.getSnapshot().tracked.map((entry) => entry.id);
  data.reorderTracked([medium, easier]);
  assert.deepEqual(ids(), ["Medium*", "Easier"]);

  data.selectTracked(easier);
  assert.deepEqual(ids(), ["Medium", "Easier*"]);
  assert.equal(data.getSnapshot().benchmark.difficulty, "Easier");

  data.setTracked("Viscose Benchmarks S2", "Easier", false);
  assert.deepEqual(ids(), ["Medium*"], "unfollowing the active one switches to the next");
  data.setTracked("Viscose Benchmarks S2", "Medium", false);
  assert.deepEqual(ids(), ["Medium*"], "the last one cannot be unfollowed");

  const reopened = createBrowserData({ storage, clock: now, watch: false });
  assert.deepEqual(reopened.getSnapshot().tracked.map((entry) => entry.difficulty), ["Medium"], "the list survives a reload");
});
