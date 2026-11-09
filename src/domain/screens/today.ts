import { trainingDayKey } from "../day.ts";
import { recordKey } from "../exclusions.ts";
import { stableLevel, type StableWindow } from "../metrics.ts";
import { average } from "../stats.ts";
import { progressPercentForScore, rankIndexForScore } from "../rank.ts";
import { sameScenario } from "../scenario.ts";
import { resolveSettings, scenarioSnapshot, type RankView, type ScreenInput } from "./shared.ts";

export interface TodayRunView {
  key: string;
  scenarioName: string;
  score: number;
  date: string;
  excluded: boolean;
  suspicious: boolean;
  /** Counts toward metrics under the current suspicious policy. */
  counts: boolean;
  /** Beat every earlier counted run of this scenario. */
  isPersonalBest: boolean;
  /** Rank index this single score reaches (-1 when unranked). */
  rankIndex: number;
}

export interface TodayScenarioView {
  name: string;
  category: string;
  subcategory: string;
  thresholds: number[];
  /** Today's runs, oldest first, including excluded ones. */
  runs: TodayRunView[];
  countedRuns: number;
  /** Time of today's last run (counted or not), null when not played today. */
  lastPlayed: string | null;
  latest: number | null;
  todayAverage: number | null;
  todayBest: number | null;
  /** Best counted score before today. */
  previousBest: number | null;
  personalBest: number | null;
  newPersonalBest: boolean;
  personalBestGain: number | null;
  /** Rank by personal best. */
  rank: RankView;
  /** Ladder position (0..100) of the personal best. */
  personalBestProgress: number;
  /** Ladder position (0..100) of today's average, null when nothing counted today. */
  todayAverageProgress: number | null;
  stable: number | null;
  stableProgress: number | null;
  /** Personal best minus stable level: "occasionally hits" vs "reliably hits". */
  stableGap: number | null;
  /** Stable level from the runs before today: what a normal day looks like. */
  usual: number | null;
  /** Window the usual level was measured over: the stable window, or the last 10 runs when that window is empty. */
  usualWindow: StableWindow;
  /** Ladder position (0..100) of the usual level, for the hollow marker. */
  usualProgress: number | null;
  /** Today's average as a fraction of the personal best. */
  averageOfBest: number | null;
  /** Today's average minus the usual level. */
  averageVsUsual: number | null;
}

export interface TodayView {
  dayKey: string;
  /** Every benchmark scenario, in benchmark order. */
  scenarios: TodayScenarioView[];
  /** Scenarios played today, most recently played first. */
  played: TodayScenarioView[];
  /** Every benchmark run played today, newest first. */
  feed: TodayRunView[];
  totals: {
    countedRuns: number;
    newPersonalBests: number;
    playedScenarios: number;
  };
}

export function todayScreen(input: ScreenInput): TodayView {
  const settings = resolveSettings(input.settings);
  const dayKey = trainingDayKey(input.now, settings.dayStartHour);
  const isToday = (date: string) => trainingDayKey(date, settings.dayStartHour) === dayKey;

  const scenarios: TodayScenarioView[] = input.scenarios.map((scenario) => {
    const snapshot = scenarioSnapshot(scenario, input, settings);
    let bestSoFar: number | null = null;
    const runs: TodayRunView[] = [];
    snapshot.runs.forEach((run) => {
      const { record } = run;
      const isPersonalBest = run.counts && (bestSoFar === null || record.score > bestSoFar);
      if (isToday(record.date)) {
        runs.push({
          key: recordKey(record),
          scenarioName: scenario.name,
          score: record.score,
          date: record.date,
          excluded: run.excluded || (run.suspicious && !run.counts),
          suspicious: run.suspicious,
          counts: run.counts,
          // The very first run ever is not announced as a new PB.
          isPersonalBest: isPersonalBest && bestSoFar !== null,
          rankIndex: rankIndexForScore(record.score, snapshot.thresholds),
        });
      }
      if (run.counts) bestSoFar = bestSoFar === null ? record.score : Math.max(bestSoFar, record.score);
    });

    const counted = runs.filter((run) => run.counts).map((run) => run.score);
    const before = snapshot.counted.filter((record) => !isToday(record.date));
    const todayBest = counted.length ? Math.max(...counted) : null;
    const todayAverage = average(counted);
    const previousBest = before.length ? Math.max(...before.map((record) => record.score)) : null;
    const newPersonalBest = todayBest !== null && previousBest !== null && todayBest > previousBest;
    const context = { now: input.now, dayStartHour: settings.dayStartHour };
    // On the first training day of a week "this week before today" is empty; the last 10 runs still say what is normal.
    const windowed = stableLevel(before, settings.stableWindow, context);
    const usualWindow: StableWindow = windowed === null && settings.stableWindow === "week" ? "last10" : settings.stableWindow;
    const usual = usualWindow === settings.stableWindow ? windowed : stableLevel(before, usualWindow, context);
    const { personalBest, thresholds } = snapshot;
    return {
      name: scenario.name,
      category: scenario.category || "",
      subcategory: scenario.subcategory || "",
      thresholds,
      runs,
      countedRuns: counted.length,
      lastPlayed: runs.at(-1)?.date ?? null,
      latest: counted.length ? counted[counted.length - 1] : null,
      todayAverage,
      todayBest,
      previousBest,
      personalBest,
      newPersonalBest,
      personalBestGain: newPersonalBest && previousBest !== null && todayBest !== null ? todayBest - previousBest : null,
      rank: snapshot.rank,
      personalBestProgress: snapshot.rank.progress,
      todayAverageProgress: todayAverage === null || !thresholds.length ? null : progressPercentForScore(todayAverage, thresholds),
      stable: snapshot.stable,
      stableProgress: snapshot.stableProgress,
      stableGap: personalBest !== null && snapshot.stable !== null ? personalBest - snapshot.stable : null,
      usual,
      usualWindow,
      usualProgress: usual === null || !thresholds.length ? null : progressPercentForScore(usual, thresholds),
      averageOfBest: todayAverage !== null && personalBest ? todayAverage / personalBest : null,
      averageVsUsual: todayAverage !== null && usual !== null ? todayAverage - usual : null,
    };
  });

  const played = scenarios
    .filter((scenario) => scenario.runs.length)
    .sort((a, b) => new Date(b.lastPlayed!).getTime() - new Date(a.lastPlayed!).getTime());

  const feed = scenarios
    .flatMap((scenario) => scenario.runs)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const scenariosWithNewBest = new Set(feed.filter((run) => run.isPersonalBest).map((run) => run.scenarioName));

  return {
    dayKey,
    scenarios,
    played,
    feed,
    totals: {
      countedRuns: feed.filter((run) => run.counts).length,
      newPersonalBests: scenariosWithNewBest.size,
      playedScenarios: played.length,
    },
  };
}

/**
 * "Next up" suggestion: the lowest-ranked scenario (by PB ladder progress) not played today.
 * Falls back to the lowest-ranked other scenario once everything has been played.
 */
export function suggestNextScenario(view: TodayView, currentName?: string): TodayScenarioView | null {
  const others = view.scenarios.filter((scenario) => !currentName || !sameScenario(scenario.name, currentName));
  const unplayed = others.filter((scenario) => !scenario.runs.length);
  const pool = unplayed.length ? unplayed : others;
  return pool.slice().sort((a, b) => a.personalBestProgress - b.personalBestProgress)[0] ?? null;
}
