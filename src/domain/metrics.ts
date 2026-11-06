import { average } from "./stats.ts";
import { DEFAULT_DAY_START_HOUR, isDayInRange, previousTrainingWeek, trainingDayKey, trainingWeekRange } from "./day.ts";
import type { ScoreRecord } from "./types.ts";

/** How the "stable level" (hollow marker) is measured. */
export type StableWindow = "last10" | "last20" | "week";

export interface MetricsContext {
  now: Date;
  dayStartHour?: number;
}

type Run = Pick<ScoreRecord, "score" | "date">;

function time(run: Run): number {
  return new Date(run.date).getTime();
}

/** Oldest first; runs without a valid date are dropped. */
export function chronological<T extends Run>(runs: T[]): T[] {
  return runs.filter((run) => Number.isFinite(time(run))).sort((a, b) => time(a) - time(b));
}

export function personalBest(runs: Run[]): number | null {
  const scores = runs.map((run) => run.score).filter((score) => Number.isFinite(score));
  return scores.length ? Math.max(...scores) : null;
}

export interface WeekComparison {
  current: number | null;
  previous: number | null;
  currentRuns: number;
  previousRuns: number;
  /** Change of the weekly average score in percent, null unless both weeks have runs. */
  deltaPercent: number | null;
}

export function weekComparison(runs: Run[], { now, dayStartHour = DEFAULT_DAY_START_HOUR }: MetricsContext): WeekComparison {
  const currentRange = trainingWeekRange(now, dayStartHour);
  const previousRange = previousTrainingWeek(currentRange);
  const currentScores: number[] = [];
  const previousScores: number[] = [];
  runs.forEach((run) => {
    if (time(run) > now.getTime()) return;
    const dayKey = trainingDayKey(run.date, dayStartHour);
    if (isDayInRange(dayKey, currentRange)) currentScores.push(run.score);
    else if (isDayInRange(dayKey, previousRange)) previousScores.push(run.score);
  });
  const current = average(currentScores);
  const previous = average(previousScores);
  return {
    current,
    previous,
    currentRuns: currentScores.length,
    previousRuns: previousScores.length,
    deltaPercent: current !== null && previous ? ((current - previous) / previous) * 100 : null,
  };
}

/**
 * The score a player reliably hits, shown as the hollow marker next to the personal best.
 * "week" falls back to last week's average when nothing was played this week.
 */
export function stableLevel(runs: Run[], window: StableWindow, context: MetricsContext): number | null {
  const past = chronological(runs).filter((run) => time(run) <= context.now.getTime());
  if (window === "week") {
    const week = weekComparison(past, context);
    return week.current ?? week.previous;
  }
  const size = window === "last20" ? 20 : 10;
  return average(past.slice(-size).map((run) => run.score));
}

/** Average score of each of the last `weeks` training weeks, oldest first (null for weeks without runs). */
export function weeklyAverages(runs: Run[], weeks: number, { now, dayStartHour = DEFAULT_DAY_START_HOUR }: MetricsContext): Array<number | null> {
  const ranges = [trainingWeekRange(now, dayStartHour)];
  while (ranges.length < weeks) ranges.unshift(previousTrainingWeek(ranges[0]));
  const buckets = ranges.map(() => [] as number[]);
  runs.forEach((run) => {
    if (time(run) > now.getTime()) return;
    const dayKey = trainingDayKey(run.date, dayStartHour);
    const index = ranges.findIndex((range) => isDayInRange(dayKey, range));
    if (index >= 0) buckets[index].push(run.score);
  });
  return buckets.map((scores) => average(scores));
}
