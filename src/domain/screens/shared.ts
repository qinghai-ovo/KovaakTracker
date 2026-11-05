import { buildRecordExclusions, countsTowardMetrics, recordKey, type SuspiciousPolicy } from "../exclusions.ts";
import { DEFAULT_DAY_START_HOUR } from "../day.ts";
import { chronological, personalBest, stableLevel, type StableWindow } from "../metrics.ts";
import { pointsToNextRank, progressPercentForScore, rankPositionForScore, rankPositionFromProgress, type RankPosition } from "../rank.ts";
import type { OverallRankRule } from "../category.ts";
import type { BenchmarkScenario, RecordExclusion, ScoreRecord } from "../types.ts";

export const UNRANKED_NAME = "未定级";

/** User-adjustable rules from the Settings screen. */
export interface ScreenSettings {
  dayStartHour: number;
  stableWindow: StableWindow;
  suspiciousPolicy: SuspiciousPolicy;
  overallRankRule: OverallRankRule;
}

export const defaultScreenSettings: ScreenSettings = {
  dayStartHour: DEFAULT_DAY_START_HOUR,
  stableWindow: "last10",
  suspiciousPolicy: "ignore",
  overallRankRule: "weakest",
};

export interface ScreenInput {
  /** Benchmark scenarios with rankMaxes thresholds, in display order. */
  scenarios: BenchmarkScenario[];
  /** Rank name → color, in rank order (the benchmark's rankColors). */
  rankColors: Record<string, string>;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  /** Stored exclusions; suspicious flags are recomputed for any run that has none yet. */
  exclusions: Record<string, RecordExclusion>;
  now: Date;
  settings?: Partial<ScreenSettings>;
}

export interface RankView extends RankPosition {
  name: string;
  /** Next rank; points is null when the rank is derived from progress (categories). */
  next: { index: number; name: string; points: number | null } | null;
}

export function resolveSettings(settings: Partial<ScreenSettings> | undefined): ScreenSettings {
  return { ...defaultScreenSettings, ...settings };
}

export function rankNames(rankColors: Record<string, string>): string[] {
  return Object.keys(rankColors);
}

function nameAt(names: string[], index: number): string {
  return index < 0 ? UNRANKED_NAME : names[index] ?? names.at(-1) ?? UNRANKED_NAME;
}

export function rankViewForScore(score: number | null, thresholds: number[], names: string[]): RankView {
  if (score === null || !thresholds.length) {
    return { index: -1, inRank: 0, progress: 0, name: UNRANKED_NAME, next: thresholds.length ? { index: 0, name: nameAt(names, 0), points: thresholds[0] } : null };
  }
  const position = rankPositionForScore(score, thresholds);
  const points = pointsToNextRank(score, thresholds);
  const nextIndex = position.index + 1;
  return {
    ...position,
    name: nameAt(names, position.index),
    next: points === null ? null : { index: nextIndex, name: nameAt(names, nextIndex), points },
  };
}

export function rankViewFromProgress(progress: number, names: string[]): RankView {
  const position = rankPositionFromProgress(progress, names.length);
  const nextIndex = position.index + 1;
  return {
    ...position,
    name: nameAt(names, position.index),
    next: nextIndex < names.length ? { index: nextIndex, name: nameAt(names, nextIndex), points: null } : null,
  };
}

export interface ClassifiedRun {
  record: ScoreRecord;
  /** Excluded by the user or by the zero-score rule. */
  excluded: boolean;
  suspicious: boolean;
  /** Whether the run counts toward PB, averages and ranks under the current settings. */
  counts: boolean;
}

/** Classifies a scenario's runs (oldest first), applying stored exclusions plus fresh suspicious detection. */
export function classifyRuns(records: ScoreRecord[], exclusions: Record<string, RecordExclusion>, policy: SuspiciousPolicy): ClassifiedRun[] {
  const ordered = chronological(records);
  const flags = buildRecordExclusions(ordered, exclusions);
  return ordered.map((record) => {
    const status = flags[recordKey(record)]?.status;
    return {
      record,
      excluded: status === "excluded",
      suspicious: status === "suspicious",
      counts: countsTowardMetrics(record, flags, policy),
    };
  });
}

export interface ScenarioSnapshot {
  scenario: BenchmarkScenario;
  thresholds: number[];
  /** All runs up to `now`, oldest first. */
  runs: ClassifiedRun[];
  /** Runs that count toward metrics, oldest first. */
  counted: ScoreRecord[];
  personalBest: number | null;
  /** Rank is always based on the personal best. */
  rank: RankView;
  stable: number | null;
  /** Ladder position (0..100) of the stable level, for the hollow marker. */
  stableProgress: number | null;
}

export function scenarioSnapshot(scenario: BenchmarkScenario, input: ScreenInput, settings: ScreenSettings): ScenarioSnapshot {
  const thresholds = scenario.rankMaxes || [];
  const names = rankNames(input.rankColors);
  const nowTime = input.now.getTime();
  const runs = classifyRuns(input.recordsForScenario(scenario.name), input.exclusions, settings.suspiciousPolicy).filter(
    (run) => new Date(run.record.date).getTime() <= nowTime,
  );
  const counted = runs.filter((run) => run.counts).map((run) => run.record);
  const best = personalBest(counted);
  const stable = stableLevel(counted, settings.stableWindow, { now: input.now, dayStartHour: settings.dayStartHour });
  return {
    scenario,
    thresholds,
    runs,
    counted,
    personalBest: best,
    rank: rankViewForScore(best, thresholds, names),
    stable,
    stableProgress: stable === null || !thresholds.length ? null : progressPercentForScore(stable, thresholds),
  };
}
