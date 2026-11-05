import type { ScenarioAliases } from "../domain/screens/data.ts";
import type { TodayPlanItem } from "../domain/screens/today.ts";
import type { ScreenSettings } from "../domain/screens/shared.ts";
import type { BenchmarkScenario, RecordExclusion, ScoreRecord, SetupProfile } from "../domain/types.ts";

export interface BenchmarkInfo {
  name: string;
  difficulty: string;
  difficulties: string[];
  scenarios: BenchmarkScenario[];
  /** Rank name → official fill color, in rank order. */
  rankColors: Record<string, string>;
  /** Local time the rank thresholds were last synced, if ever. */
  syncedAt: string | null;
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
 * memory; the Tauri implementation (phase 1) will call backend commands and listen for events.
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
  updateDay(dayKey: string, patch: Partial<DayEntry>): void;

  /** Demo only: pretend a run was just finished in KovaaK. */
  simulateRun?(scenarioName: string): void;
}
