import { average } from "./stats.ts";
import { rankPositionFromProgress, type RankPosition } from "./rank.ts";

/** A category's rank is the average ladder progress of its scenarios (unplayed scenarios count as 0). */
export function categoryRankPosition(scenarioProgresses: number[], rankCount: number): RankPosition {
  return rankPositionFromProgress(average(scenarioProgresses) ?? 0, rankCount);
}

/**
 * The overall rank, as KovaaK's own benchmark page computes it: every scenario is worth the same
 * points (its ladder progress, unplayed counts as 0) and the overall rank comes from the total, so
 * it is the average progress over all scenarios, not over categories.
 */
export function overallRankPosition(scenarioProgresses: number[], rankCount: number): RankPosition {
  return rankPositionFromProgress(average(scenarioProgresses) ?? 0, rankCount);
}
