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
  if (score < thresholds[0]) return Math.max(0, Math.min(100, (score / thresholds[0]) * 100));
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
