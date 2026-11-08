// The desktop database's rows (src-tauri/src/db/app_data.rs) and how they map to the shapes the
// rules and screens already use (the classic app's AppState plus the new UI's AppStore).
import { recordKey } from "../domain/exclusions.ts";
import { emptySetupProfile } from "../domain/reviewInputs.ts";
import type { AppState, Benchmark, RecordExclusion, ScoreRecord, SetupProfile } from "../domain/types.ts";
import { normalizeState } from "../services/storage.ts";
import { benchmarkFallback } from "./benchmarkFallback.ts";
import { activeRef, parseAppStore, trackedRefs, type AppStore } from "./legacyState.ts";
import type { AppPreferences, RestoreReport } from "./trackerData.ts";
import type { ScreenSettings } from "../domain/screens/shared.ts";

export type RunSource = "file" | "manual" | "legacy";

export interface StoredRun {
  id: number;
  identity: string;
  source: RunSource;
  scenario: string;
  score: number;
  /** UTC milliseconds. */
  playedAt: number;
  /** Local time, e.g. 2026-11-03T19:31:02. */
  playedLocal: string;
  sourceFile: string | null;
  sensitivity: number | null;
  fov: number | null;
  dpi: number | null;
  note: string | null;
}

export type NewRun = Omit<StoredRun, "id">;

export interface StoredOverride {
  identity: string;
  status: RecordExclusion["status"];
  reason: RecordExclusion["reason"];
  note: string | null;
  updatedAt: number;
}

export interface StoredDifficulty {
  benchmark: string;
  difficulty: string;
  kovaaksId: string | null;
  sharecode: string | null;
  syncedAt: number | null;
  ranks: Array<{ name: string; color: string | null }>;
  scenarios: Array<{ name: string; category: string | null; subcategory: string | null; leaderboardId: string | null; thresholds: number[] }>;
}

export interface StoredTracked {
  benchmark: string;
  difficulty: string;
  active: boolean;
}

export interface StoredDay {
  dayKey: string;
  mood: unknown;
  note: string;
}

export interface StoredPlanItem {
  scenarioName: string;
  targetRuns: number;
}

export interface StoredAlias {
  rawName: string;
  scenarioName: string;
}

/** What `data_load` returns. */
export interface AppData {
  runs: StoredRun[];
  overrides: StoredOverride[];
  aliases: StoredAlias[];
  benchmarks: StoredDifficulty[];
  tracked: StoredTracked[];
  days: StoredDay[];
  plan: StoredPlanItem[];
  setup: SetupProfile | null;
  settings: Record<string, unknown>;
  lastImportAt: number | null;
}

/** What `data_restore` takes. */
export interface Restore {
  runs: NewRun[];
  overrides: StoredOverride[];
  aliases: StoredAlias[];
  benchmarks: StoredDifficulty[] | null;
  tracked: StoredTracked[];
  days: StoredDay[];
  plan: StoredPlanItem[];
  setup: SetupProfile | null;
  settings: Record<string, unknown>;
}

/** Settings keys, one value each (see ARCHITECTURE 5.2). */
export const SETTING = {
  statsDir: "source.statsDir",
  autoImport: "source.autoImport",
  syncedAt: "benchmark.syncedAt",
  dayStartHour: "rules.dayStartHour",
  stableWindow: "rules.stableWindow",
  suspicious: "rules.suspicious",
  overallRankRule: "rules.overallRankRule",
  notifyAfterRun: "notify.afterRun",
  shortNames: "appearance.shortNames",
  showInRank: "appearance.showInRank",
  theme: "appearance.theme",
} as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** 2026-11-03T19:31:02 in local time. */
export function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const isoOrEmpty = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : "");

/** A stored run as the rules see it: file runs look exactly like runs imported in the browser. */
export function recordFromRun(run: StoredRun): ScoreRecord {
  const date = new Date(run.playedAt).toISOString();
  if (run.source === "manual") {
    return { id: run.identity, scenario: run.scenario, score: run.score, date, ...(run.note ? { note: run.note } : {}), source: "manual" };
  }
  return {
    id: run.identity,
    scenario: run.scenario,
    score: run.score,
    date,
    source: "csv",
    metadata: {
      sourceFile: run.sourceFile ?? "",
      sourceType: "csv",
      ...(run.sensitivity !== null ? { sensitivity: run.sensitivity } : {}),
      ...(run.fov !== null ? { fov: run.fov } : {}),
      ...(run.dpi !== null ? { dpi: run.dpi } : {}),
    },
  };
}

/** A run to store; `source` says whether it's a manual run or one brought in from a backup. */
export function runFromRecord(record: ScoreRecord, source: "manual" | "legacy"): NewRun | null {
  const playedAt = new Date(record.date).getTime();
  if (!Number.isFinite(playedAt) || !Number.isFinite(record.score) || !record.scenario) return null;
  const metadata = record.metadata;
  const finite = (value: number | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    identity: recordKey(record),
    source,
    scenario: record.rawScenario || record.scenario,
    score: record.score,
    playedAt,
    playedLocal: localIso(new Date(playedAt)),
    sourceFile: source === "manual" ? null : metadata?.sourceFile || record.note || null,
    sensitivity: finite(metadata?.sensitivity),
    fov: finite(metadata?.fov),
    dpi: finite(metadata?.dpi),
    note: source === "manual" ? record.note || null : null,
  };
}

export function overrideFromExclusion(exclusion: RecordExclusion, fallbackMs: number): StoredOverride {
  const updatedAt = new Date(exclusion.updatedAt).getTime();
  return {
    identity: exclusion.recordKey,
    status: exclusion.status,
    reason: exclusion.reason,
    note: exclusion.note || null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : fallbackMs,
  };
}

export function exclusionFromOverride(item: StoredOverride): RecordExclusion {
  return {
    recordKey: item.identity,
    status: item.status,
    reason: item.reason,
    ...(item.note ? { note: item.note } : {}),
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}

export function benchmarksFromRows(rows: StoredDifficulty[]): Benchmark[] {
  const benchmarks: Benchmark[] = [];
  rows.forEach((row) => {
    let benchmark = benchmarks.find((item) => item.benchmarkName === row.benchmark);
    if (!benchmark) {
      benchmark = { benchmarkName: row.benchmark, difficulties: [] };
      benchmarks.push(benchmark);
    }
    benchmark.difficulties!.push({
      difficultyName: row.difficulty,
      ...(row.sharecode ? { sharecode: row.sharecode } : {}),
      ...(row.kovaaksId ? { kovaaksBenchmarkId: row.kovaaksId } : {}),
      rankColors: Object.fromEntries(row.ranks.map((rank) => [rank.name, rank.color ?? ""])),
      scenarios: row.scenarios.map((scenario) => ({
        name: scenario.name,
        ...(scenario.category ? { category: scenario.category } : {}),
        ...(scenario.subcategory ? { subcategory: scenario.subcategory } : {}),
        ...(scenario.leaderboardId ? { leaderboardId: scenario.leaderboardId } : {}),
        rankMaxes: scenario.thresholds,
      })),
      ...(row.syncedAt !== null ? { apiUpdatedAt: new Date(row.syncedAt).toISOString() } : {}),
    });
  });
  return benchmarks;
}

export function rowsFromBenchmarks(benchmarks: Benchmark[]): StoredDifficulty[] {
  return benchmarks.flatMap((benchmark) =>
    (benchmark.difficulties ?? []).map((difficulty) => {
      const syncedAt = difficulty.apiUpdatedAt ? new Date(difficulty.apiUpdatedAt).getTime() : NaN;
      return {
        benchmark: benchmark.benchmarkName,
        difficulty: difficulty.difficultyName,
        kovaaksId: difficulty.kovaaksBenchmarkId !== undefined && difficulty.kovaaksBenchmarkId !== "" ? String(difficulty.kovaaksBenchmarkId) : null,
        sharecode: difficulty.sharecode || null,
        syncedAt: Number.isFinite(syncedAt) ? syncedAt : null,
        ranks: Object.entries(difficulty.rankColors ?? {}).map(([name, color]) => ({ name, color: color || null })),
        scenarios: (difficulty.scenarios ?? []).map((scenario) => ({
          name: scenario.name,
          category: scenario.category || null,
          subcategory: scenario.subcategory || null,
          leaderboardId: scenario.leaderboardId !== undefined && scenario.leaderboardId !== "" ? String(scenario.leaderboardId) : null,
          thresholds: (scenario.rankMaxes ?? []).filter((score) => Number.isFinite(score)),
        })),
      };
    }),
  );
}

/** The followed benchmarks to store: the sidebar list with the active one marked. */
export function trackedRows(state: AppState, store: AppStore): StoredTracked[] {
  const active = activeRef(state);
  return trackedRefs(state, store).map((ref) => ({
    ...ref,
    active: active !== null && active.benchmark === ref.benchmark && active.difficulty === ref.difficulty,
  }));
}

/** Rule settings and preferences as settings rows. Automatic import is the importer's own key. */
export function settingRows(settings: ScreenSettings, preferences: AppPreferences): Record<string, unknown> {
  return {
    [SETTING.dayStartHour]: settings.dayStartHour,
    [SETTING.stableWindow]: settings.stableWindow,
    [SETTING.suspicious]: settings.suspiciousPolicy,
    [SETTING.overallRankRule]: settings.overallRankRule,
    [SETTING.notifyAfterRun]: preferences.notifyAfterRun,
    [SETTING.shortNames]: preferences.shortNames,
    [SETTING.showInRank]: preferences.showInRank,
    [SETTING.theme]: preferences.theme,
  };
}

export interface LoadedState {
  /** Everything but runs, which are kept apart (`csvRecords` / `manualRecords` are empty). */
  legacy: AppState;
  store: AppStore;
  csvRecords: ScoreRecord[];
  manualRecords: ScoreRecord[];
  /** Highest run id seen, to ask for newer runs. */
  lastRunId: number;
}

/** Turns what `data_load` returned into the shapes the screens are built from. */
export function stateFromData(data: AppData): LoadedState {
  const csvRecords: ScoreRecord[] = [];
  const manualRecords: ScoreRecord[] = [];
  let lastRunId = 0;
  data.runs.forEach((run) => {
    (run.source === "manual" ? manualRecords : csvRecords).push(recordFromRun(run));
    lastRunId = Math.max(lastRunId, run.id);
  });
  const settings = data.settings;
  const text = (key: string) => (typeof settings[key] === "string" ? (settings[key] as string) : "");
  const active = data.tracked.find((item) => item.active);
  const dailyReviews: AppState["dailyReviews"] = {};
  const moods: AppStore["moods"] = {};
  data.days.forEach((day) => {
    if (day.note) dailyReviews[day.dayKey] = { dateKey: day.dayKey, note: day.note };
    if (day.mood && typeof day.mood === "object" && Object.keys(day.mood).length) moods[day.dayKey] = { ...(day.mood as Record<string, string>) };
  });
  // Without runs, so the low-score rule's flags are not stored as if the player had chosen them.
  const legacy = normalizeState(
    {
      benchmarks: data.benchmarks.length ? benchmarksFromRows(data.benchmarks) : benchmarkFallback,
      ...(active ? { selectedBenchmark: active.benchmark, selectedDifficulty: active.difficulty } : {}),
      recordExclusions: Object.fromEntries(data.overrides.map((item) => [item.identity, exclusionFromOverride(item)])),
      dailyReviews,
      defaultSetupProfile: data.setup ?? emptySetupProfile,
      lastBenchmarkSyncDate: text(SETTING.syncedAt),
      statsFolderName: text(SETTING.statsDir),
      statsFolderUpdatedAt: isoOrEmpty(data.lastImportAt),
    },
    benchmarkFallback,
  );
  // parseAppStore checks every value and falls back to defaults.
  const store = parseAppStore(
    JSON.stringify({
      plan: data.plan.map((item) => ({ scenarioName: item.scenarioName, targetRuns: item.targetRuns })),
      aliases: Object.fromEntries(data.aliases.map((alias) => [alias.rawName, alias.scenarioName])),
      settings: {
        dayStartHour: settings[SETTING.dayStartHour],
        stableWindow: settings[SETTING.stableWindow],
        suspiciousPolicy: settings[SETTING.suspicious],
        overallRankRule: settings[SETTING.overallRankRule],
      },
      preferences: {
        autoImport: settings[SETTING.autoImport],
        notifyAfterRun: settings[SETTING.notifyAfterRun],
        shortNames: settings[SETTING.shortNames],
        showInRank: settings[SETTING.showInRank],
        theme: settings[SETTING.theme],
      },
      moods,
      tracked: data.tracked.map(({ benchmark, difficulty }) => ({ benchmark, difficulty })),
    }),
  );
  return { legacy, store, csvRecords, manualRecords, lastRunId };
}

/** What `data_restore` returns. */
export interface Restored {
  added: number;
  copy: string | null;
}

/**
 * Compares a restore with what the database holds after it. A restore replaces everything but
 * runs, so those counts should match exactly; for runs, every one in the backup should be stored.
 */
export function restoreReport(restore: Restore, data: AppData, fileName: string, copy: string | null): RestoreReport {
  const stored = new Set(data.runs.map((run) => run.identity));
  const backupRuns = new Set(restore.runs.map((run) => run.identity));
  const backupManual = new Set(restore.runs.filter((run) => run.source === "manual").map((run) => run.identity));
  const present = [...backupRuns].filter((identity) => stored.has(identity)).length;
  // Days with neither a mood nor a note aren't stored.
  const backupDays = restore.days.filter((day) => day.note || (day.mood && typeof day.mood === "object" && Object.keys(day.mood).length)).length;
  return {
    fileName,
    rows: [
      { label: "成绩", backup: backupRuns.size, now: present },
      { label: "其中手动录入", backup: backupManual.size, now: data.runs.filter((run) => run.source === "manual").length },
      { label: "忽略 / 确认的成绩", backup: new Set(restore.overrides.map((item) => item.identity)).size, now: data.overrides.length },
      { label: "追踪的 benchmark", backup: new Set(restore.tracked.map((item) => `${item.benchmark}\u0000${item.difficulty}`)).size, now: data.tracked.length },
      { label: "场景匹配", backup: new Set(restore.aliases.map((alias) => alias.rawName)).size, now: data.aliases.length },
      { label: "计划", backup: new Set(restore.plan.map((item) => item.scenarioName)).size, now: data.plan.length },
      { label: "训练日志（天）", backup: backupDays, now: data.days.length },
    ],
    otherRuns: data.runs.length - present,
    copy,
  };
}

/**
 * A backup (the classic app's format, optionally with `newUi`) as a database restore.
 * `currentBenchmarks` stand in when the backup has none.
 */
export function restoreFromBackup(parsed: Partial<AppState> & { newUi?: unknown }, now: number, currentBenchmarks: Benchmark[]): Restore {
  const hasBenchmarks = Array.isArray(parsed.benchmarks) && parsed.benchmarks.length > 0;
  const state = normalizeState({ ...parsed, ...(hasBenchmarks ? {} : { benchmarks: currentBenchmarks }), csvRecords: [], manualRecords: [] }, []);
  const store = parseAppStore(parsed.newUi ? JSON.stringify(parsed.newUi) : null);
  const list = (value: unknown) => (Array.isArray(value) ? (value as ScoreRecord[]) : []);
  // Two manual runs added in the same millisecond could share an id; the second gets a suffix so
  // both are kept (the database stores one run per identity).
  const manualIds = new Set<string>();
  const manual = list(parsed.manualRecords).map((record) => {
    const base = recordKey({ ...record, source: "manual" });
    let id = base;
    for (let n = 2; manualIds.has(id); n += 1) id = `${base}-${n}`;
    manualIds.add(id);
    return { ...record, id, source: "manual" as const };
  });
  const runs = [
    ...list(parsed.csvRecords).map((record) => runFromRecord({ ...record, source: "csv" }, "legacy")),
    ...manual.map((record) => runFromRecord(record, "manual")),
  ].filter((run): run is NewRun => run !== null);
  const days = new Map<string, StoredDay>();
  Object.entries(state.dailyReviews).forEach(([dayKey, entry]) => {
    if (entry.note) days.set(dayKey, { dayKey, mood: {}, note: entry.note });
  });
  Object.entries(store.moods).forEach(([dayKey, mood]) => {
    days.set(dayKey, { dayKey, mood, note: days.get(dayKey)?.note ?? "" });
  });
  const syncedAt = state.lastBenchmarkSyncDate;
  return {
    runs,
    overrides: Object.values(state.recordExclusions).map((item) => overrideFromExclusion(item, now)),
    aliases: Object.entries(store.aliases).map(([rawName, scenarioName]) => ({ rawName, scenarioName })),
    benchmarks: hasBenchmarks ? rowsFromBenchmarks(state.benchmarks) : null,
    tracked: trackedRows(state, store),
    days: [...days.values()],
    plan: store.plan.map((item) => ({ scenarioName: item.scenarioName, targetRuns: item.targetRuns })),
    setup: state.defaultSetupProfile,
    settings: {
      ...settingRows(store.settings, store.preferences),
      ...(syncedAt ? { [SETTING.syncedAt]: syncedAt } : {}),
    },
  };
}
