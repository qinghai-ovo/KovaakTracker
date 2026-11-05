import { trainingDayKey } from "../day.ts";
import { recordKey } from "../exclusions.ts";
import { average } from "../stats.ts";
import { rankIndexForScore } from "../rank.ts";
import { sameScenario } from "../scenario.ts";
import { resolveSettings, scenarioSnapshot, type RankView, type ScreenInput } from "./shared.ts";

export interface TodayPlanItem {
  scenarioName: string;
  targetRuns: number;
}

export interface TodayInput extends ScreenInput {
  plan: TodayPlanItem[];
}

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
  targetRuns: number;
  /** Today's runs, oldest first, including excluded ones. */
  runs: TodayRunView[];
  countedRuns: number;
  done: boolean;
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
  stable: number | null;
  stableProgress: number | null;
  /** Personal best minus stable level: "occasionally hits" vs "reliably hits". */
  stableGap: number | null;
}

export interface TodayView {
  dayKey: string;
  /** Plan scenarios, in plan order. */
  scenarios: TodayScenarioView[];
  /** Every benchmark run played today, newest first. */
  feed: TodayRunView[];
  totals: {
    countedRuns: number;
    newPersonalBests: number;
    doneScenarios: number;
    plannedScenarios: number;
  };
}

export function todayScreen(input: TodayInput): TodayView {
  const settings = resolveSettings(input.settings);
  const dayKey = trainingDayKey(input.now, settings.dayStartHour);
  const isToday = (date: string) => trainingDayKey(date, settings.dayStartHour) === dayKey;

  const perScenario = input.scenarios.map((scenario) => {
    const snapshot = scenarioSnapshot(scenario, input, settings);
    let bestSoFar: number | null = null;
    const todayRuns: TodayRunView[] = [];
    snapshot.runs.forEach((run) => {
      const { record } = run;
      const isPersonalBest = run.counts && (bestSoFar === null || record.score > bestSoFar);
      if (isToday(record.date)) {
        todayRuns.push({
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
    return { snapshot, todayRuns };
  });

  const scenarios: TodayScenarioView[] = input.plan.flatMap((item) => {
    const entry = perScenario.find(({ snapshot }) => sameScenario(snapshot.scenario.name, item.scenarioName));
    if (!entry) return [];
    const { snapshot, todayRuns } = entry;
    const counted = todayRuns.filter((run) => run.counts).map((run) => run.score);
    const previous = snapshot.counted.filter((record) => !isToday(record.date)).map((record) => record.score);
    const todayBest = counted.length ? Math.max(...counted) : null;
    const previousBest = previous.length ? Math.max(...previous) : null;
    const newPersonalBest = todayBest !== null && previousBest !== null && todayBest > previousBest;
    return [
      {
        name: snapshot.scenario.name,
        category: snapshot.scenario.category || "",
        subcategory: snapshot.scenario.subcategory || "",
        thresholds: snapshot.thresholds,
        targetRuns: item.targetRuns,
        runs: todayRuns,
        countedRuns: counted.length,
        done: counted.length >= item.targetRuns,
        latest: counted.length ? counted[counted.length - 1] : null,
        todayAverage: average(counted),
        todayBest,
        previousBest,
        personalBest: snapshot.personalBest,
        newPersonalBest,
        personalBestGain: newPersonalBest && previousBest !== null && todayBest !== null ? todayBest - previousBest : null,
        rank: snapshot.rank,
        personalBestProgress: snapshot.rank.progress,
        stable: snapshot.stable,
        stableProgress: snapshot.stableProgress,
        stableGap: snapshot.personalBest !== null && snapshot.stable !== null ? snapshot.personalBest - snapshot.stable : null,
      },
    ];
  });

  const feed = perScenario
    .flatMap(({ todayRuns }) => todayRuns)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const scenariosWithNewBest = new Set(feed.filter((run) => run.isPersonalBest).map((run) => run.scenarioName));

  return {
    dayKey,
    scenarios,
    feed,
    totals: {
      countedRuns: feed.filter((run) => run.counts).length,
      newPersonalBests: scenariosWithNewBest.size,
      doneScenarios: scenarios.filter((scenario) => scenario.done).length,
      plannedScenarios: scenarios.length,
    },
  };
}

/**
 * "Next up" suggestion: the unfinished plan scenario with the lowest rank (by PB ladder progress).
 * Falls back to any other plan scenario once everything is done.
 */
export function suggestNextScenario(view: TodayView, currentName?: string): TodayScenarioView | null {
  const others = view.scenarios.filter((scenario) => !currentName || !sameScenario(scenario.name, currentName));
  const pending = others.filter((scenario) => !scenario.done);
  const pool = pending.length ? pending : others;
  return pool.slice().sort((a, b) => a.personalBestProgress - b.personalBestProgress)[0] ?? null;
}
