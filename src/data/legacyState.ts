// Converts the classic app's saved state (react.html, localStorage "kovaak-benchmark-tracker-v2")
// into the new UI's snapshot, and the new UI's changes back into that state.
import type { OverallRankRule } from "../domain/category.ts";
import type { SuspiciousPolicy } from "../domain/exclusions.ts";
import type { StableWindow } from "../domain/metrics.ts";
import type { ScenarioAliases } from "../domain/screens/data.ts";
import { defaultScreenSettings, type ScreenSettings } from "../domain/screens/shared.ts";
import type { TodayPlanItem } from "../domain/screens/today.ts";
import type { AppState, Benchmark, DailyReviewEntry } from "../domain/types.ts";
import { defaultPreferences, trackedId, type AppPreferences, type CatalogEntry, type DayEntry, type FailedImport, type FolderAccess, type MoodKey, type RestoreReport, type TrackedBenchmark, type TrackerSnapshot } from "./trackerData.ts";

/** localStorage key the classic app reads and writes. */
export const LEGACY_STORAGE_KEY = "kovaak-benchmark-tracker-v2";
/** localStorage key for what only the new UI knows about. */
export const APP_STORAGE_KEY = "kovaak-tracker-app-v1";

/** New-UI-only state, stored next to the classic app's state. */
export interface AppStore {
  plan: TodayPlanItem[];
  aliases: ScenarioAliases;
  settings: ScreenSettings;
  preferences: AppPreferences;
  /** Mood chips per training day; notes live in the classic app's daily reviews. */
  moods: Record<string, Partial<Record<MoodKey, string>>>;
  /** Stats files that could not be imported, with the reason. */
  failedImports: FailedImport[];
  /** Followed benchmark difficulties, in sidebar order. */
  tracked: TrackedRef[];
}

export interface TrackedRef {
  benchmark: string;
  difficulty: string;
}

export const emptyAppStore: AppStore = {
  plan: [],
  aliases: {},
  settings: { ...defaultScreenSettings },
  preferences: { ...defaultPreferences },
  moods: {},
  failedImports: [],
  tracked: [],
};

const STABLE_WINDOWS: StableWindow[] = ["last10", "last20", "week"];
const POLICIES: SuspiciousPolicy[] = ["ignore", "warn"];
const OVERALL_RULES: OverallRankRule[] = ["weakest", "average"];

/** Reads the app store defensively; unknown or broken values fall back to defaults. */
export function parseAppStore(raw: string | null): AppStore {
  let source: Partial<AppStore> = {};
  try {
    source = raw ? (JSON.parse(raw) as Partial<AppStore>) : {};
  } catch {
    source = {};
  }
  const settings: Partial<ScreenSettings> = source.settings ?? {};
  const preferences: Partial<AppPreferences> = source.preferences ?? {};
  return {
    plan: Array.isArray(source.plan)
      ? source.plan.filter((item) => item && typeof item.scenarioName === "string").map((item) => ({ scenarioName: item.scenarioName, targetRuns: Math.max(1, Number(item.targetRuns) || 3) }))
      : [],
    aliases: source.aliases && typeof source.aliases === "object" ? { ...source.aliases } : {},
    settings: {
      dayStartHour: Number.isInteger(settings.dayStartHour) && settings.dayStartHour! >= 0 && settings.dayStartHour! < 12 ? settings.dayStartHour! : defaultScreenSettings.dayStartHour,
      stableWindow: STABLE_WINDOWS.includes(settings.stableWindow as StableWindow) ? (settings.stableWindow as StableWindow) : defaultScreenSettings.stableWindow,
      suspiciousPolicy: POLICIES.includes(settings.suspiciousPolicy as SuspiciousPolicy) ? (settings.suspiciousPolicy as SuspiciousPolicy) : defaultScreenSettings.suspiciousPolicy,
      overallRankRule: OVERALL_RULES.includes(settings.overallRankRule as OverallRankRule) ? (settings.overallRankRule as OverallRankRule) : defaultScreenSettings.overallRankRule,
    },
    preferences: {
      autoImport: typeof preferences.autoImport === "boolean" ? preferences.autoImport : defaultPreferences.autoImport,
      notifyAfterRun: typeof preferences.notifyAfterRun === "boolean" ? preferences.notifyAfterRun : defaultPreferences.notifyAfterRun,
      shortNames: typeof preferences.shortNames === "boolean" ? preferences.shortNames : defaultPreferences.shortNames,
      showInRank: typeof preferences.showInRank === "boolean" ? preferences.showInRank : defaultPreferences.showInRank,
      theme: "light",
    },
    moods: source.moods && typeof source.moods === "object" ? { ...source.moods } : {},
    tracked: Array.isArray(source.tracked)
      ? source.tracked.filter((item) => item && typeof item.benchmark === "string" && typeof item.difficulty === "string").map((item) => ({ benchmark: item.benchmark, difficulty: item.difficulty }))
      : [],
    failedImports: Array.isArray(source.failedImports)
      ? source.failedImports.filter((item) => item && typeof item.fileName === "string").map((item) => ({ fileName: item.fileName, reason: String(item.reason ?? "") }))
      : [],
  };
}

function selectedDifficulty(state: AppState): { benchmark: Benchmark | undefined; difficulty: NonNullable<Benchmark["difficulties"]>[number] | undefined } {
  const benchmark = state.benchmarks.find((item) => item.benchmarkName === state.selectedBenchmark) ?? state.benchmarks[0];
  const difficulties = benchmark?.difficulties ?? [];
  const difficulty = difficulties.find((item) => item.difficultyName === state.selectedDifficulty) ?? difficulties[0];
  return { benchmark, difficulty };
}

export function catalogOf(state: AppState): CatalogEntry[] {
  return state.benchmarks.map((benchmark) => ({
    benchmark: benchmark.benchmarkName,
    difficulties: (benchmark.difficulties ?? []).map((item) => item.difficultyName),
  }));
}

/** The active benchmark as a reference, or null when nothing is selectable. */
export function activeRef(state: AppState): TrackedRef | null {
  const { benchmark, difficulty } = selectedDifficulty(state);
  return benchmark && difficulty ? { benchmark: benchmark.benchmarkName, difficulty: difficulty.difficultyName } : null;
}

/** Saved order, limited to benchmarks that still exist, with the active one appended if missing. */
export function trackedRefs(state: AppState, store: AppStore): TrackedRef[] {
  const exists = (ref: TrackedRef) =>
    state.benchmarks.some((benchmark) => benchmark.benchmarkName === ref.benchmark && (benchmark.difficulties ?? []).some((item) => item.difficultyName === ref.difficulty));
  const seen = new Set<string>();
  const refs = store.tracked.filter((ref) => {
    const id = trackedId(ref.benchmark, ref.difficulty);
    if (seen.has(id) || !exists(ref)) return false;
    seen.add(id);
    return true;
  });
  const active = activeRef(state);
  if (active && !seen.has(trackedId(active.benchmark, active.difficulty))) refs.push(active);
  return refs;
}

const refId = (ref: TrackedRef) => trackedId(ref.benchmark, ref.difficulty);

/** The followed list with `extra` added at the end, each benchmark once. */
export function followedWith(state: AppState, store: AppStore, ...extra: TrackedRef[]): TrackedRef[] {
  const seen = new Set<string>();
  return [...trackedRefs(state, store), ...extra].filter((ref) => {
    const id = refId(ref);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** The followed list in the order of `ids`; any not named keep their order after them. */
export function followedInOrder(state: AppState, store: AppStore, ids: string[]): TrackedRef[] {
  const refs = trackedRefs(state, store);
  const byId = new Map(refs.map((ref) => [refId(ref), ref]));
  const ordered = ids.map((id) => byId.get(id)).filter((ref): ref is TrackedRef => Boolean(ref));
  return [...ordered, ...refs.filter((ref) => !ids.includes(refId(ref)))];
}

/**
 * The followed list without `id`, and the benchmark to switch to when `id` is the active one.
 * Null when `id` is the last one followed (at least one always stays).
 */
export function followedWithout(state: AppState, store: AppStore, id: string): { tracked: TrackedRef[]; nextActive: TrackedRef | null } | null {
  const tracked = trackedRefs(state, store).filter((ref) => refId(ref) !== id);
  if (!tracked.length) return null;
  const active = activeRef(state);
  return { tracked, nextActive: active && refId(active) === id ? tracked[0] : null };
}

function trackedOf(state: AppState, store: AppStore): TrackedBenchmark[] {
  const active = activeRef(state);
  return trackedRefs(state, store).map((ref) => {
    const difficulty = state.benchmarks.find((item) => item.benchmarkName === ref.benchmark)?.difficulties?.find((item) => item.difficultyName === ref.difficulty);
    const id = trackedId(ref.benchmark, ref.difficulty);
    return {
      id,
      benchmark: ref.benchmark,
      difficulty: ref.difficulty,
      scenarios: (difficulty?.scenarios ?? []).filter((scenario) => (scenario.rankMaxes?.length ?? 0) > 0),
      rankColors: difficulty?.rankColors ?? {},
      active: active !== null && id === trackedId(active.benchmark, active.difficulty),
    };
  });
}

function newestDate(dates: string[]): string | null {
  let newest: string | null = null;
  let newestTime = -Infinity;
  dates.forEach((date) => {
    const time = new Date(date).getTime();
    if (time > newestTime) {
      newestTime = time;
      newest = date;
    }
  });
  return newest;
}

function clock(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export interface LiveState {
  watching: boolean;
  folderAccess: FolderAccess;
  loading: boolean;
  storageWarning: string | null;
  importProgress: { done: number; total: number } | null;
  folderError?: string | null;
  restoreReport?: RestoreReport | null;
}

const idle: LiveState = { watching: false, folderAccess: "none", loading: false, storageWarning: null, importProgress: null };

export function snapshotFromLegacy(state: AppState, store: AppStore, now: Date, live: LiveState = idle, source: TrackerSnapshot["source"] = "browser"): TrackerSnapshot {
  const { benchmark, difficulty } = selectedDifficulty(state);
  const records = [...state.csvRecords, ...state.manualRecords];
  const days: Record<string, DayEntry> = {};
  Object.entries(state.dailyReviews).forEach(([dayKey, entry]) => {
    if (entry.note) days[dayKey] = { mood: {}, note: entry.note };
  });
  Object.entries(store.moods).forEach(([dayKey, mood]) => {
    days[dayKey] = { mood: { ...mood }, note: days[dayKey]?.note ?? "" };
  });
  return {
    source,
    benchmark: {
      name: benchmark?.benchmarkName ?? "（未选择 benchmark）",
      available: state.benchmarks.map((item) => item.benchmarkName),
      difficulty: difficulty?.difficultyName ?? "",
      difficulties: (benchmark?.difficulties ?? []).map((item) => item.difficultyName),
      // Only scenarios with rank thresholds can be ranked; the classic app fills these on sync.
      scenarios: (difficulty?.scenarios ?? []).filter((scenario) => (scenario.rankMaxes?.length ?? 0) > 0),
      rankColors: difficulty?.rankColors ?? {},
      syncedAt: state.lastBenchmarkSyncDate || difficulty?.apiUpdatedAt || null,
    },
    tracked: trackedOf(state, store),
    catalog: catalogOf(state),
    records,
    exclusions: state.recordExclusions,
    aliases: store.aliases,
    plan: store.plan,
    settings: store.settings,
    preferences: store.preferences,
    setup: state.defaultSetupProfile,
    days,
    statsDir: state.statsFolderName || null,
    failedImports: store.failedImports,
    now,
    lastImportAt: clock(state.statsFolderUpdatedAt || newestDate(state.csvRecords.map((record) => record.date))),
    watching: live.watching,
    folderAccess: live.folderAccess,
    loading: live.loading,
    storageWarning: live.storageWarning,
    importProgress: live.importProgress,
    folderError: live.folderError ?? null,
    restoreReport: live.restoreReport ?? null,
  };
}

/** An id for a new manual run, `manual-<ms>`, made unique when two are added in the same millisecond. */
export function newManualId(existing: Array<{ id?: string }>, ms: number): string {
  const taken = new Set(existing.map((record) => record.id));
  let id = `manual-${ms}`;
  for (let n = 2; taken.has(id); n += 1) id = `manual-${ms}-${n}`;
  return id;
}

/** Writes a day's note into the classic app's daily reviews (keeping its other fields). */
export function withDayNote(dailyReviews: Record<string, DailyReviewEntry>, dayKey: string, note: string): Record<string, DailyReviewEntry> {
  const current = dailyReviews[dayKey];
  if (!current && !note) return dailyReviews;
  return { ...dailyReviews, [dayKey]: { ...(current ?? { dateKey: dayKey }), dateKey: dayKey, note } };
}
