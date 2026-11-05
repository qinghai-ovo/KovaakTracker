import { categoryRankPosition, overallRankPosition } from "../category.ts";
import { weekComparison, weeklyAverages, type WeekComparison } from "../metrics.ts";
import { average } from "../stats.ts";
import { rankNames, rankViewFromProgress, resolveSettings, scenarioSnapshot, type RankView, type ScreenInput } from "./shared.ts";

export interface MapScenarioView {
  name: string;
  category: string;
  subcategory: string;
  thresholds: number[];
  personalBest: number | null;
  /** Rank by personal best. */
  rank: RankView;
  stable: number | null;
  stableProgress: number | null;
  week: WeekComparison;
  /** Average score of the last 6 training weeks, oldest first. */
  weeklyAverages: Array<number | null>;
  /** Counted runs of all time. */
  totalRuns: number;
  /** Trained this week. */
  trained: boolean;
}

export interface MapSubcategoryView {
  name: string;
  scenarios: MapScenarioView[];
}

export interface MapCategoryView {
  name: string;
  /** Category rank from the average PB ladder progress of its scenarios. */
  rank: RankView;
  /** Average weekly score change (%) of the scenarios trained this week; null when none were. */
  deltaPercent: number | null;
  scenarioCount: number;
  trainedCount: number;
  weekRuns: number;
  subcategories: MapSubcategoryView[];
}

export interface MapView {
  categories: MapCategoryView[];
  /** Sidebar overall rank, per the overallRankRule setting. */
  overall: RankView;
  insights: {
    weakestCategory: MapCategoryView | null;
    /** Scenario whose PB is proportionally closest to the next rank line. */
    closestRankUp: MapScenarioView | null;
    coverage: { trained: number; total: number };
  };
}

function groupInOrder<T>(items: T[], keyOf: (item: T) => string): Array<{ key: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups].map(([key, groupItems]) => ({ key, items: groupItems }));
}

export function mapScreen(input: ScreenInput): MapView {
  const settings = resolveSettings(input.settings);
  const names = rankNames(input.rankColors);

  const scenarios: MapScenarioView[] = input.scenarios.map((scenario) => {
    const snapshot = scenarioSnapshot(scenario, input, settings);
    const week = weekComparison(snapshot.counted, { now: input.now, dayStartHour: settings.dayStartHour });
    return {
      name: scenario.name,
      category: scenario.category || "",
      subcategory: scenario.subcategory || "",
      thresholds: snapshot.thresholds,
      personalBest: snapshot.personalBest,
      rank: snapshot.rank,
      stable: snapshot.stable,
      stableProgress: snapshot.stableProgress,
      week,
      weeklyAverages: weeklyAverages(snapshot.counted, 6, { now: input.now, dayStartHour: settings.dayStartHour }),
      totalRuns: snapshot.counted.length,
      trained: week.currentRuns > 0,
    };
  });

  const categories: MapCategoryView[] = groupInOrder(scenarios, (scenario) => scenario.category).map(({ key, items }) => {
    const trained = items.filter((item) => item.trained);
    const deltas = trained.map((item) => item.week.deltaPercent).filter((delta): delta is number => delta !== null);
    const position = categoryRankPosition(items.map((item) => item.rank.progress), names.length);
    return {
      name: key,
      rank: rankViewFromProgress(position.progress, names),
      deltaPercent: deltas.length ? average(deltas) : null,
      scenarioCount: items.length,
      trainedCount: trained.length,
      weekRuns: items.reduce((sum, item) => sum + item.week.currentRuns, 0),
      subcategories: groupInOrder(items, (item) => item.subcategory).map((group) => ({ name: group.key, scenarios: group.items })),
    };
  });

  const overallPosition = overallRankPosition(
    categories.map((category) => category.rank.progress),
    names.length,
    settings.overallRankRule,
  );

  const weakestCategory = categories.slice().sort((a, b) => a.rank.progress - b.rank.progress)[0] ?? null;
  const closestRankUp =
    scenarios
      .filter((scenario) => scenario.personalBest !== null && scenario.rank.next !== null)
      .sort((a, b) => b.rank.inRank - a.rank.inRank)[0] ?? null;

  return {
    categories,
    overall: rankViewFromProgress(overallPosition.progress, names),
    insights: {
      weakestCategory,
      closestRankUp,
      coverage: { trained: scenarios.filter((scenario) => scenario.trained).length, total: scenarios.length },
    },
  };
}
