import { formatNumber } from "../../format.ts";
import type { DailyReviewRowModel } from "./dailyReviewTypes.ts";

interface RankProgressBarProps {
  row: DailyReviewRowModel;
  showPercent?: boolean;
}

export function RankProgressBar({ row, showPercent = true }: RankProgressBarProps) {
  return (
    <div className="rank-progress">
      <div className="rank-progress-track" style={{ gridTemplateColumns: `repeat(${Math.max(1, row.rankColumnSegments.length)}, minmax(0, 1fr))` }}>
        <div className="rank-simple-fill" style={{ width: `${Math.round(row.progressPercent)}%`, background: row.rankColor }} />
        {row.rankColumnSegments.map((threshold) => (
          <div className="rank-segment" key={`${threshold.name}-${threshold.value}`} title={`${threshold.name}: ${formatNumber(threshold.value)}`}>
            <div className="rank-segment-fill" style={{ background: threshold.color, width: `${threshold.fillPercent}%` }} />
            <div className="rank-segment-label">
              <strong>{formatNumber(threshold.value)}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="rank-progress-caption">
        <span style={{ color: row.rankColor }}>{row.rankName}</span>
        {showPercent ? <span>{Math.round(row.progressPercent)}%</span> : null}
      </div>
    </div>
  );
}
