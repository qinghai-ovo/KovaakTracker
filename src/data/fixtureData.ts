import { excludeRecordManually, toggleRecordCounted } from "../domain/exclusions.ts";
import { emptySetupProfile } from "../domain/reviewInputs.ts";
import { defaultScreenSettings } from "../domain/screens/shared.ts";
import { average } from "../domain/stats.ts";
import { sameScenario } from "../domain/scenario.ts";
import type { BenchmarkScenario, ScoreRecord } from "../domain/types.ts";
import {
  IGNORED_RECORD,
  MANUAL_RECORD,
  NOW,
  backgroundSessions,
  demoDataset,
  difficultyScale,
  failedImports,
  rankColors,
  unmatchedRecords,
} from "./fixtures/designSample.ts";
import { defaultPreferences, trackedId, type TrackedBenchmark, type TrackerData, type TrackerEvent, type TrackerSnapshot } from "./trackerData.ts";

const DEMO_BENCHMARK = "Viscose S2";

function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function scaleScenarios(scenarios: BenchmarkScenario[], factor: number): BenchmarkScenario[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    rankMaxes: (scenario.rankMaxes || []).map((threshold) => Math.round((threshold * factor) / 10) * 10),
  }));
}

/** In-memory data source with the design canvas sample data; works in any browser. */
export function createFixtureData(): TrackerData {
  const dataset = demoDataset();
  const baseScenarios = dataset.scenarios;
  let clock = new Date(NOW);
  let trackedOrder = Object.keys(difficultyScale);
  const trackedList = (active: string): TrackedBenchmark[] =>
    trackedOrder.map((difficulty) => ({
      id: trackedId(DEMO_BENCHMARK, difficulty),
      benchmark: DEMO_BENCHMARK,
      difficulty,
      scenarios: scaleScenarios(baseScenarios, difficultyScale[difficulty]),
      rankColors,
      active: difficulty === active,
    }));
  const records = [...backgroundSessions(), ...unmatchedRecords(), ...dataset.records, MANUAL_RECORD, IGNORED_RECORD];
  let snapshot: TrackerSnapshot = {
    source: "fixture",
    benchmark: {
      name: DEMO_BENCHMARK,
      available: [DEMO_BENCHMARK],
      difficulty: "Easier",
      difficulties: Object.keys(difficultyScale),
      scenarios: baseScenarios,
      rankColors,
      syncedAt: "2026-11-03T09:12:00",
    },
    tracked: trackedList("Easier"),
    catalog: [{ benchmark: DEMO_BENCHMARK, difficulties: Object.keys(difficultyScale) }],
    records,
    exclusions: excludeRecordManually(IGNORED_RECORD, {}, "", "2026-11-02T21:00:00.000Z"),
    aliases: {},
    plan: dataset.plan,
    settings: { ...defaultScreenSettings },
    preferences: { ...defaultPreferences },
    setup: { ...emptySetupProfile, sensitivity: "0.32", dpi: "1600", fov: "103" },
    days: { "2026-11-03": { mood: { sleep: "一般", energy: "充沛", warmup: "简单" }, note: "" } },
    statsDir: "D:\\SteamLibrary\\steamapps\\common\\FPSAimTrainer\\FPSAimTrainer\\stats",
    failedImports,
    now: clock,
    lastImportAt: "19:49",
    watching: true,
    folderAccess: "unsupported",
    loading: false,
    storageWarning: null,
    importProgress: null,
  };
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: TrackerEvent) => void>();

  function update(next: Partial<TrackerSnapshot>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  }

  const stamp = () => clock.toISOString();

  function selectDifficulty(difficulty: string) {
    const factor = difficultyScale[difficulty];
    if (!factor) return;
    if (!trackedOrder.includes(difficulty)) trackedOrder = [...trackedOrder, difficulty];
    update({ benchmark: { ...snapshot.benchmark, difficulty, scenarios: scaleScenarios(baseScenarios, factor) }, tracked: trackedList(difficulty) });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    toggleRunCounted(record, currentlyCounts) {
      update({ exclusions: toggleRecordCounted(record, snapshot.exclusions, currentlyCounts, stamp()) });
    },
    addManualRun(input) {
      const record: ScoreRecord = { id: `manual-${Date.now()}`, scenario: input.scenario, score: input.score, date: input.date, note: input.note, source: "manual" };
      update({ records: [...snapshot.records, record] });
    },
    updateManualRun(id, input) {
      update({
        records: snapshot.records.map((record) =>
          record.id === id && record.source === "manual" ? { ...record, scenario: input.scenario, score: input.score, date: input.date, note: input.note } : record,
        ),
      });
    },
    deleteManualRun(id) {
      update({ records: snapshot.records.filter((record) => !(record.id === id && record.source === "manual")) });
    },
    confirmAlias(rawName, scenarioName) {
      update({ aliases: { ...snapshot.aliases, [rawName]: scenarioName } });
    },
    addToPlan(scenarioName, targetRuns = 3) {
      if (snapshot.plan.some((item) => sameScenario(item.scenarioName, scenarioName))) return;
      update({ plan: [...snapshot.plan, { scenarioName, targetRuns }] });
    },
    updateSettings(patch) {
      update({ settings: { ...snapshot.settings, ...patch } });
    },
    updatePreferences(patch) {
      update({ preferences: { ...snapshot.preferences, ...patch } });
    },
    updateSetup(patch) {
      update({ setup: { ...snapshot.setup, ...patch } });
    },
    setDifficulty: selectDifficulty,
    selectTracked(id) {
      const entry = snapshot.tracked.find((item) => item.id === id);
      if (entry) selectDifficulty(entry.difficulty);
    },
    reorderTracked(ids) {
      const byId = new Map(snapshot.tracked.map((item) => [item.id, item.difficulty]));
      const ordered = ids.map((id) => byId.get(id)).filter((difficulty): difficulty is string => Boolean(difficulty));
      trackedOrder = [...ordered, ...trackedOrder.filter((difficulty) => !ordered.includes(difficulty))];
      update({ tracked: trackedList(snapshot.benchmark.difficulty) });
    },
    setTracked(_benchmark, difficulty, tracked) {
      if (tracked) {
        if (!trackedOrder.includes(difficulty)) trackedOrder = [...trackedOrder, difficulty];
      } else {
        if (trackedOrder.length <= 1) return;
        trackedOrder = trackedOrder.filter((item) => item !== difficulty);
        if (snapshot.benchmark.difficulty === difficulty) return selectDifficulty(trackedOrder[0]);
      }
      update({ tracked: trackedList(snapshot.benchmark.difficulty) });
    },
    updateDay(dayKey, patch) {
      const current = snapshot.days[dayKey] ?? { mood: {}, note: "" };
      update({ days: { ...snapshot.days, [dayKey]: { ...current, ...patch, mood: { ...current.mood, ...patch.mood } } } });
    },
    simulateRun(scenarioName) {
      const recent = snapshot.records.filter((record) => sameScenario(record.scenario, scenarioName)).slice(-10);
      const base = average(recent.map((record) => record.score)) ?? 1000;
      clock = new Date(clock.getTime() + 2 * 60 * 1000);
      const date = localIso(clock);
      const record: ScoreRecord = {
        id: `demo|${scenarioName}|${date}`,
        scenario: scenarioName,
        score: Math.round(base * (0.94 + Math.random() * 0.18)),
        date,
        source: "csv",
      };
      update({ records: [...snapshot.records, record], now: clock, lastImportAt: date.slice(11, 16) });
      eventListeners.forEach((listener) => listener({ type: "runs:added", records: [record] }));
    },
  };
}
