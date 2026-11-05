// Converts the classic app's saved state (react.html, localStorage "kovaak-benchmark-tracker-v2")
// into the new UI's snapshot, and the new UI's changes back into that state.
import type { OverallRankRule } from "../domain/category.ts";
import type { SuspiciousPolicy } from "../domain/exclusions.ts";
import type { StableWindow } from "../domain/metrics.ts";
import type { ScenarioAliases } from "../domain/screens/data.ts";
import { defaultScreenSettings, type ScreenSettings } from "../domain/screens/shared.ts";
import type { TodayPlanItem } from "../domain/screens/today.ts";
import type { AppState, Benchmark, DailyReviewEntry } from "../domain/types.ts";
import { defaultPreferences, type AppPreferences, type DayEntry, type MoodKey, type TrackerSnapshot } from "./trackerData.ts";

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
}

export const emptyAppStore: AppStore = {
  plan: [],
  aliases: {},
  settings: { ...defaultScreenSettings },
  preferences: { ...defaultPreferences },
  moods: {},
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
  };
}

function selectedDifficulty(state: AppState): { benchmark: Benchmark | undefined; difficulty: NonNullable<Benchmark["difficulties"]>[number] | undefined } {
  const benchmark = state.benchmarks.find((item) => item.benchmarkName === state.selectedBenchmark) ?? state.benchmarks[0];
  const difficulties = benchmark?.difficulties ?? [];
  const difficulty = difficulties.find((item) => item.difficultyName === state.selectedDifficulty) ?? difficulties[0];
  return { benchmark, difficulty };
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

export function snapshotFromLegacy(state: AppState, store: AppStore, now: Date): TrackerSnapshot {
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
    source: "browser",
    benchmark: {
      name: benchmark?.benchmarkName ?? "（未选择 benchmark）",
      difficulty: difficulty?.difficultyName ?? "",
      difficulties: (benchmark?.difficulties ?? []).map((item) => item.difficultyName),
      // Only scenarios with rank thresholds can be ranked; the classic app fills these on sync.
      scenarios: (difficulty?.scenarios ?? []).filter((scenario) => (scenario.rankMaxes?.length ?? 0) > 0),
      rankColors: difficulty?.rankColors ?? {},
      syncedAt: state.lastBenchmarkSyncDate || difficulty?.apiUpdatedAt || null,
    },
    records,
    exclusions: state.recordExclusions,
    aliases: store.aliases,
    plan: store.plan,
    settings: store.settings,
    preferences: store.preferences,
    setup: state.defaultSetupProfile,
    days,
    statsDir: state.statsFolderName || null,
    failedImports: [],
    now,
    lastImportAt: clock(state.statsFolderUpdatedAt || newestDate(state.csvRecords.map((record) => record.date))),
    watching: false,
  };
}

/** Writes a day's note into the classic app's daily reviews (keeping its other fields). */
export function withDayNote(dailyReviews: Record<string, DailyReviewEntry>, dayKey: string, note: string): Record<string, DailyReviewEntry> {
  const current = dailyReviews[dayKey];
  if (!current && !note) return dailyReviews;
  return { ...dailyReviews, [dayKey]: { ...(current ?? { dateKey: dayKey }), dateKey: dayKey, note } };
}
