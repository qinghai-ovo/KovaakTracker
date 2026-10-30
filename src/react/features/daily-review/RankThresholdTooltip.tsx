import { formatNumber } from "../../format.ts";
import type { DailyReviewRowModel } from "./dailyReviewTypes.ts";

interface RankThresholdTooltipProps {
  row: DailyReviewRowModel;
}

export function RankThresholdTooltip({ row }: RankThresholdTooltipProps) {
  return (
    <div className="rank-tooltip" role="tooltip">
      <div className="rank-tooltip-summary">
        <strong style={{ color: row.rankColor }}>{row.rankName}</strong>
        <span>{row.trendLabel}</span>
      </div>
      <div className="rank-tooltip-next">
        {row.nextThreshold && row.nextThresholdDelta !== null ? `${formatNumber(row.nextThresholdDelta)} to ${row.nextThreshold.name}` : "Top threshold reached"}
      </div>
      <div className="rank-tooltip-grid">
        {row.thresholds.map((threshold) => (
          <span className="rank-tooltip-item" key={`${threshold.name}-${threshold.value}`}>
            <span style={{ color: threshold.color }}>{threshold.name}</span>
            <strong>{formatNumber(threshold.value)}</strong>
          </span>
        ))}
      </div>
      <small>
        {row.runCount} runs today · {row.score === null ? "No score" : `Score ${formatNumber(row.score)}`}
      </small>
    </div>
  );
}
