import type { ScenarioAliases } from "../domain/screens/data.ts";
import type { TodayPlanItem } from "../domain/screens/today.ts";
import type { ScreenSettings } from "../domain/screens/shared.ts";
import type { BenchmarkScenario, RecordExclusion, ScoreRecord, SetupProfile } from "../domain/types.ts";

export interface BenchmarkInfo {
  name: string;
  /** Every benchmark the source knows, for the Settings picker. */
  available: string[];
  difficulty: string;
  difficulties: string[];
  scenarios: BenchmarkScenario[];
  /** Rank name → official fill color, in rank order. */
  rankColors: Record<string, string>;
  /** Local time the rank thresholds were last synced, if ever. */
  syncedAt: string | null;
}

/** One benchmark difficulty the player follows; shown in the sidebar in the player's order. */
export interface TrackedBenchmark {
  id: string;
  benchmark: string;
  difficulty: string;
  /** Scenarios with rank thresholds (empty until synced). */
  scenarios: BenchmarkScenario[];
  rankColors: Record<string, string>;
  /** The benchmark every screen currently shows. */
  active: boolean;
}

/** Every benchmark and difficulty the source knows, for the Settings picker. */
export interface CatalogEntry {
  benchmark: string;
  difficulties: string[];
}

export function trackedId(benchmark: string, difficulty: string): string {
  return `${benchmark}::${difficulty}`;
}

/** Preferences that change behavior or display but not training rules. */
export interface AppPreferences {
  autoImport: boolean;
  notifyAfterRun: boolean;
  /** Show "VT Smoothbot Arm Easy" style raw names in their short form. */
  shortNames: boolean;
  /** Show "in-rank x%" next to rank names. */
  showInRank: boolean;
  theme: "light" | "dark" | "system";
}

export const defaultPreferences: AppPreferences = {
  autoImport: true,
  notifyAfterRun: true,
  shortNames: false,
  showInRank: true,
  theme: "light",
};

export type MoodKey = "sleep" | "energy" | "warmup";

export interface DayEntry {
  mood: Partial<Record<MoodKey, string>>;
  note: string;
}

export interface FailedImport {
  fileName: string;
  reason: string;
}

/** Everything the screens need, as one immutable snapshot. */
export interface TrackerSnapshot {
  /** fixture: built-in sample data; browser: the classic app's saved data in this browser; tauri: desktop backend. */
  source: "fixture" | "browser" | "tauri";
  benchmark: BenchmarkInfo;
  /** Followed benchmarks in the player's order; always includes the active one. */
  tracked: TrackedBenchmark[];
  catalog: CatalogEntry[];
  records: ScoreRecord[];
  exclusions: Record<string, RecordExclusion>;
  aliases: ScenarioAliases;
  plan: TodayPlanItem[];
  settings: ScreenSettings;
  preferences: AppPreferences;
  setup: SetupProfile;
  days: Record<string, DayEntry>;
  statsDir: string | null;
  failedImports: FailedImport[];
  /** The clock screens compute against (fixed in demo data). */
  now: Date;
  /** Local time of the newest imported run, if any. */
  lastImportAt: string | null;
  watching: boolean;
  folderAccess: FolderAccess;
  /** Saved runs are still being read (the screens should not say "no data" yet). */
  loading: boolean;
  /** Set when something could not be saved, e.g. browser storage is full. */
  storageWarning: string | null;
  /** Progress of a large import, for the Data screen. */
  importProgress: { done: number; total: number } | null;
  /** Why the stats folder can't be watched or read right now (desktop app). */
  folderError: string | null;
  /** The check shown after a backup import (desktop app), until dismissed. */
  restoreReport: RestoreReport | null;
}

/** After a backup was imported: what it held next to what the app holds now. */
export interface RestoreReport {
  fileName: string;
  rows: Array<{ label: string; backup: number; now: number }>;
  /** Runs the app holds beyond the backup's own, e.g. already imported from the stats folder. */
  otherRuns: number;
  /** Where the data from before the import was copied, if there was any. */
  copy: string | null;
}

export type TrackerEvent = { type: "runs:added"; records: ScoreRecord[] };

export interface ManualRunInput {
  scenario: string;
  score: number;
  /** Local ISO time, e.g. 2026-11-03T20:00:00 */
  date: string;
  note?: string;
}

/**
 * The only way the UI reads or changes data. The fixture implementation keeps everything in
 * memory, the browser one in browser storage, and the Tauri one in the desktop app's database.
 */
export interface TrackerData {
  getSnapshot(): TrackerSnapshot;
  /** Called whenever the snapshot changes. */
  subscribe(listener: () => void): () => void;
  onEvent(listener: (event: TrackerEvent) => void): () => void;

  /** Ignore a counted run, or bring back an ignored / flagged one. */
  toggleRunCounted(record: ScoreRecord, currentlyCounts: boolean): void;
  addManualRun(input: ManualRunInput): void;
  updateManualRun(id: string, input: ManualRunInput): void;
  deleteManualRun(id: string): void;
  /** Count runs recorded under `rawName` toward a benchmark scenario. */
  confirmAlias(rawName: string, scenarioName: string): void;

  addToPlan(scenarioName: string, targetRuns?: number): void;
  updateSettings(patch: Partial<ScreenSettings>): void;
  updatePreferences(patch: Partial<AppPreferences>): void;
  updateSetup(patch: Partial<SetupProfile>): void;
  setDifficulty(difficulty: string): void;
  /** Make a followed benchmark the active one. */
  selectTracked(id: string): void;
  /** New order of the followed benchmarks (ids from snapshot.tracked). */
  reorderTracked(ids: string[]): void;
  /** Follow or stop following a benchmark difficulty. */
  setTracked(benchmark: string, difficulty: string, tracked: boolean): void;
  updateDay(dayKey: string, patch: Partial<DayEntry>): void;

  /** Demo only: pretend a run was just finished in KovaaK. */
  simulateRun?(scenarioName: string): void;

  // Capabilities a source may offer. Each returns a short status message for the UI.
  /** Pick the stats folder (browser folder picker) and import it. */
  chooseStatsFolder?(): Promise<string>;
  /** Read the remembered folder again; `full` re-reads every file instead of only new ones. */
  rescanStatsFolder?(options?: { full?: boolean }): Promise<string>;
  /** Import CSV files picked through a plain file input (browsers without a folder picker). */
  importCsvFiles?(files: File[], folderName?: string): Promise<string>;
  /** Fetch the benchmark list and the selected difficulty's rank thresholds. */
  syncBenchmark?(): Promise<string>;
  selectBenchmark?(name: string): void;
  /** Restore a backup exported by this app or the classic app. */
  importBackup?(file: File): Promise<string>;
  /** Hide the check shown after a backup import. */
  dismissRestoreReport?(): void;
  /** Everything worth backing up, as a JSON-serializable value. */
  backup?(): unknown;
}

/** Whether the source can read the stats folder right now (browser folder access). */
export type FolderAccess = "unsupported" | "none" | "needs-permission" | "ready";
