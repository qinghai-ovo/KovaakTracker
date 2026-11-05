import { average } from "./stats.ts";
import { rankPositionFromProgress, type RankPosition } from "./rank.ts";

/**
 * How the overall rank in the sidebar is derived from category ranks.
 * "weakest": the lowest category (default, matches "short-board" training focus).
 * "average": the mean ladder progress of all categories.
 */
export type OverallRankRule = "weakest" | "average";

/** A category's rank is the average ladder progress of its scenarios (unplayed scenarios count as 0). */
export function categoryRankPosition(scenarioProgresses: number[], rankCount: number): RankPosition {
  return rankPositionFromProgress(average(scenarioProgresses) ?? 0, rankCount);
}

export function overallRankPosition(categoryProgresses: number[], rankCount: number, rule: OverallRankRule = "weakest"): RankPosition {
  if (!categoryProgresses.length) return rankPositionFromProgress(0, rankCount);
  const progress = rule === "weakest" ? Math.min(...categoryProgresses) : average(categoryProgresses) ?? 0;
  return rankPositionFromProgress(progress, rankCount);
}
