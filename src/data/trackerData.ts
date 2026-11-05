import type { TodayPlanItem } from "../domain/screens/today.ts";
import type { ScreenSettings } from "../domain/screens/shared.ts";
import type { BenchmarkScenario, RecordExclusion, ScoreRecord } from "../domain/types.ts";

export interface BenchmarkInfo {
  name: string;
  difficulty: string;
  scenarios: BenchmarkScenario[];
  /** Rank name → official fill color, in rank order. */
  rankColors: Record<string, string>;
}

/** Everything the screens need, as one immutable snapshot. */
export interface TrackerSnapshot {
  source: "fixture" | "tauri";
  benchmark: BenchmarkInfo;
  records: ScoreRecord[];
  exclusions: Record<string, RecordExclusion>;
  plan: TodayPlanItem[];
  settings: ScreenSettings;
  /** The clock screens compute against (fixed in demo data). */
  now: Date;
  /** Local time of the newest imported run, if any. */
  lastImportAt: string | null;
  watching: boolean;
}

export type TrackerEvent = { type: "runs:added"; records: ScoreRecord[] };

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
  addToPlan(scenarioName: string, targetRuns?: number): void;
  /** Demo only: pretend a run was just finished in KovaaK. */
  simulateRun?(scenarioName: string): void;
}
