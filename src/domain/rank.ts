import type { RankResult } from "./types";

export function rankForScore(score: number | null, thresholds: number[], rankColors: Record<string, string> = {}): RankResult | null {
  if (score === null || Number.isNaN(score)) return null;
  const rankNames = Object.keys(rankColors);
  if (!thresholds.length || !rankNames.length) return null;
  let index = -1;
  thresholds.forEach((threshold, thresholdIndex) => {
    if (score >= threshold) index = thresholdIndex;
  });
  const name = index >= 0 ? rankNames[index] || rankNames.at(-1) || "" : "未定级";
  const nextIndex = Math.min(index + 1, thresholds.length - 1);
  const lastThreshold = thresholds.at(-1) ?? 0;
  const next = score < lastThreshold ? { name: rankNames[nextIndex], need: thresholds[nextIndex] - score } : null;
  const color = rankColors[name] || rankColors[rankNames[Math.max(0, nextIndex - 1)]] || "#71717a";
  return { name, next, color };
}

export function progressPercentForScore(score: number | null, thresholds: number[]): number {
  if (score === null || Number.isNaN(score) || !thresholds.length) return 0;
  if (score < thresholds[0]) return (Math.max(0, Math.min(1, score / thresholds[0])) / thresholds.length) * 100;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (score <= thresholds[index]) {
      const start = thresholds[index - 1];
      const end = thresholds[index];
      const segmentProgress = end === start ? 1 : (score - start) / (end - start);
      return ((index + Math.max(0, Math.min(1, segmentProgress))) / thresholds.length) * 100;
    }
  }
  return 100;
}

export function rankSegmentFill(score: number | null, thresholds: number[], index: number): number {
  if (score === null || Number.isNaN(score) || !thresholds.length) return 0;
  const start = index === 0 ? 0 : thresholds[index - 1];
  const end = thresholds[index];
  if (score >= end) return 100;
  if (score <= start) return 0;
  return Math.max(0, Math.min(100, ((score - start) / (end - start)) * 100));
}

/** Index of the highest rank threshold reached, or -1 when below the first threshold. */
export function rankIndexForScore(score: number, thresholds: number[]): number {
  let index = -1;
  thresholds.forEach((threshold, thresholdIndex) => {
    if (score >= threshold) index = thresholdIndex;
  });
  return index;
}

/** Progress inside the current rank, 0..1. Below the first rank it is progress toward that rank. */
export function inRankProgress(score: number, thresholds: number[]): number {
  if (!thresholds.length || Number.isNaN(score)) return 0;
  const index = rankIndexForScore(score, thresholds);
  if (index < 0) return thresholds[0] > 0 ? Math.max(0, Math.min(1, score / thresholds[0])) : 0;
  if (index >= thresholds.length - 1) return 1;
  const start = thresholds[index];
  const end = thresholds[index + 1];
  return end === start ? 1 : Math.max(0, Math.min(1, (score - start) / (end - start)));
}

/** Points needed to reach the next rank, or null when the top rank is reached. */
export function pointsToNextRank(score: number, thresholds: number[]): number | null {
  const index = rankIndexForScore(score, thresholds);
  if (index >= thresholds.length - 1) return null;
  return thresholds[index + 1] - score;
}

export interface RankPosition {
  /** Highest rank index reached, -1 when unranked. */
  index: number;
  /** Progress inside that rank, 0..1. */
  inRank: number;
  /** Position on the whole ladder, 0..100 (same scale as progressPercentForScore). */
  progress: number;
}

export function rankPositionForScore(score: number, thresholds: number[]): RankPosition {
  return {
    index: rankIndexForScore(score, thresholds),
    inRank: inRankProgress(score, thresholds),
    progress: progressPercentForScore(score, thresholds),
  };
}

/** Converts a ladder progress (0..100) back into a rank position; used for category and overall ranks. */
export function rankPositionFromProgress(progress: number, rankCount: number): RankPosition {
  if (rankCount <= 0) return { index: -1, inRank: 0, progress: 0 };
  const clamped = Math.max(0, Math.min(100, progress));
  // The epsilon keeps exact rank lines (e.g. 33.33…%) from rounding down into the rank below.
  const position = (clamped * rankCount) / 100 + 1e-9;
  const index = Math.min(rankCount - 1, Math.floor(position) - 1);
  const inRank = index < 0 ? position : index >= rankCount - 1 ? 1 : position - Math.floor(position);
  return { index, inRank, progress: clamped };
}
