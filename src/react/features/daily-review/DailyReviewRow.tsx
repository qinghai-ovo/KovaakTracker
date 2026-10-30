import type { DailyReviewTableSettings } from "../../../core/types.ts";
import { formatNumber } from "../../format.ts";
import { FloatingTooltip } from "../../ui/FloatingTooltip.tsx";
import { RankProgressBar } from "./RankProgressBar.tsx";
import { RankThresholdTooltip } from "./RankThresholdTooltip.tsx";
import { simplifyScenarioName } from "./dailyReviewViewModel.ts";
import type { DailyReviewRowModel } from "./dailyReviewTypes.ts";

interface DailyReviewRowProps {
  onSelect: (scenarioName: string) => void;
  row: DailyReviewRowModel;
  selected: boolean;
  settings: DailyReviewTableSettings;
}

export function DailyReviewRow({ onSelect, row, selected, settings }: DailyReviewRowProps) {
  const scenarioName = settings.simplifyScenarioNames ? simplifyScenarioName(row.scenarioName) : row.scenarioName;
  const trendStyle = settings.useRankColumnColors ? { color: row.rankColor } : undefined;
  return (
    <FloatingTooltip content={<RankThresholdTooltip row={row} />} placement="right" wrapperClassName="rank-sheet-row-tooltip">
      <button
        className={["rank-sheet-row", selected ? "is-selected" : "", row.trainedToday ? "" : "is-muted"].filter(Boolean).join(" ")}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(row.scenarioName);
        }}
        type="button"
      >
        <div className="rank-sheet-cell category-cell">{row.category}</div>
        <div className="rank-sheet-cell category-cell">{row.subcategory}</div>
        <div className="rank-sheet-cell scenario-cell">
          <span className="scenario-name">{scenarioName}</span>
          <span className="scenario-meta">{row.trainedToday ? `${row.runCount} runs today` : "No session today"}</span>
        </div>
        <div className="rank-sheet-cell score-cell">{row.score === null ? "-" : formatNumber(row.score)}</div>
        <div className="rank-sheet-cell current-rank-cell">
          <strong style={{ color: row.rankColor }}>{row.rankName}</strong>
          <span>{row.nextRankLabel}</span>
        </div>
        <div className="rank-sheet-cell rank-columns-cell">
          <RankProgressBar row={row} showPercent={settings.showProgressPercent} />
        </div>
        <div className={`rank-sheet-cell trend-cell trend-${row.trendTone}`} style={trendStyle}>
          {row.trainedToday ? row.trendLabel : "Muted"}
        </div>
      </button>
    </FloatingTooltip>
  );
}
