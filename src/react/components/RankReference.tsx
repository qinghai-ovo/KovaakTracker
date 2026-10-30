import type { CSSProperties } from "react";
import { progressPercentForScore } from "../../core/rank.ts";
import type { BenchmarkDifficulty, RankResult } from "../../core/types.ts";
import { formatNumber } from "../format.ts";

interface RankData {
  thresholds: number[];
  rankColors: Record<string, string>;
  rankNames: string[];
}

interface RankHeaderProps {
  data: RankData | null;
  selectedScenario: string;
}

interface RankReferenceProps extends RankHeaderProps {
  label: string;
  score: number | null;
  rank: RankResult | null;
}

export function rankReferenceData(
  selectedScenario: string,
  currentDifficulty: BenchmarkDifficulty | undefined,
  thresholds: number[],
): RankData | null {
  const rankColors = currentDifficulty?.rankColors || {};
  const rankNames = Object.keys(rankColors);
  if (selectedScenario === "all" || !thresholds.length || !rankNames.length) return null;
  return { thresholds, rankColors, rankNames };
}

export function RankHeader({ data, selectedScenario }: RankHeaderProps) {
  if (!data) {
    return <div className="rank-bar-empty">{selectedScenario === "all" ? "选择单场景后显示段位" : "暂无段位线"}</div>;
  }

  return (
    <div className="rank-header-row">
      {data.thresholds.map((_, index) => {
        const rankName = data.rankNames[index] || `Rank ${index + 1}`;
        return (
          <div
            className="rank-header-cell"
            key={rankName}
            style={{ width: `${100 / data.thresholds.length}%`, "--rank-color": data.rankColors[rankName] || "#71717a" } as CSSProperties}
          >
            {rankName}
          </div>
        );
      })}
    </div>
  );
}

export function RankReference({ data, label, rank, score, selectedScenario }: RankReferenceProps) {
  if (!data) {
    return <div className="rank-bar-empty">{selectedScenario === "all" ? "选择单场景后显示段位参考" : "暂无段位线"}</div>;
  }

  const markerPercent = Number.isFinite(score) ? progressPercentForScore(score, data.thresholds) : null;
  const fillColor = rank?.color || "#71717a";

  return (
    <div className="rank-track-row">
      {data.thresholds.map((threshold, index) => {
        const rankName = data.rankNames[index] || `Rank ${index + 1}`;
        const segmentStart = (index / data.thresholds.length) * 100;
        const segmentEnd = ((index + 1) / data.thresholds.length) * 100;
        const fill = markerPercent === null ? 0 : Math.max(0, Math.min(100, ((markerPercent - segmentStart) / (segmentEnd - segmentStart)) * 100));
        return (
          <div
            className="rank-segment"
            key={`${rankName}:${threshold}`}
            style={
              {
                width: `${100 / data.thresholds.length}%`,
                "--rank-color": data.rankColors[rankName] || "#71717a",
                "--fill-color": fillColor,
                "--fill": `${fill}%`,
              } as CSSProperties
            }
          >
            <strong>{formatNumber(threshold)}</strong>
          </div>
        );
      })}
      {markerPercent !== null ? (
        <div className="rank-marker" style={{ left: `${markerPercent}%` }} title={`${label}: ${formatNumber(score)}`}>
          <span>{label}</span>
        </div>
      ) : null}
    </div>
  );
}
