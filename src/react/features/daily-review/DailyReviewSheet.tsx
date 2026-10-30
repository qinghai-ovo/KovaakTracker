import { useRef, useState, type CSSProperties } from "react";
import { Download } from "lucide-react";
import type { DailyReviewTableSettings } from "../../../core/types.ts";
import { Button } from "../../ui/Button.tsx";
import { SegmentedControl } from "../../ui/SegmentedControl.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { exportElementAsPng } from "../../utils/exportElementAsPng.ts";
import { DailyReviewRow } from "./DailyReviewRow.tsx";
import type { DailyReviewRowModel } from "./dailyReviewTypes.ts";

interface DailyReviewSheetProps {
  dailyReviewDate: string;
  dailyReviewMetric: string;
  onSelectMetric: (value: string) => void;
  onSelectScenario: (scenarioName: string) => void;
  rows: DailyReviewRowModel[];
  selectedScenarioName: string;
  tableSettings: DailyReviewTableSettings;
}

const metricOptions = [
  { value: "avg", label: "Avg" },
  { value: "best", label: "Best" },
  { value: "worst", label: "Worst" },
  { value: "median", label: "Median" },
  { value: "historyBest", label: "History Best" },
  { value: "run10", label: "10 runs" },
  { value: "run20", label: "20 runs" },
  { value: "run30", label: "30 runs" },
  { value: "session1", label: "1 session" },
  { value: "session3", label: "3 sessions" },
  { value: "session5", label: "5 sessions" },
];

export function DailyReviewSheet({ dailyReviewDate, dailyReviewMetric, onSelectMetric, onSelectScenario, rows, selectedScenarioName, tableSettings }: DailyReviewSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "error">("idle");
  const rankReferenceSegments = rows.find((row) => row.rankColumnSegments.length)?.rankColumnSegments || rows.find((row) => row.thresholds.length)?.thresholds || [];
  const sheetClassName = [
    "ui-panel",
    "daily-sheet",
    `density-${tableSettings.density}`,
    `progress-${tableSettings.progressStyle}`,
    tableSettings.boldText ? "is-bold" : "",
    tableSettings.textShadow ? "has-text-shadow" : "",
    tableSettings.shadeCategoryCells ? "shade-category" : "",
    tableSettings.shadeRankCells ? "shade-rank" : "",
    tableSettings.highContrast ? "high-contrast" : "",
    tableSettings.useRankColumnColors ? "rank-column-colors" : "",
  ].filter(Boolean).join(" ");
  const sheetStyle = {
    "--daily-row-font-scale": `${tableSettings.textSize / 100}`,
    "--daily-text-contrast": `${tableSettings.textContrast}%`,
    "--daily-rank-skew": `${-Math.max(0, Math.min(55, tableSettings.skew)) / 2}deg`,
    "--daily-rank-radius": `${tableSettings.outerRadius}px`,
    "--daily-rank-inner-radius": `${tableSettings.innerRadius}px`,
  } as CSSProperties;

  async function exportSheet() {
    if (!sheetRef.current) return;
    try {
      setExportStatus("exporting");
      await exportElementAsPng(sheetRef.current, `kovaak-daily-review-${dailyReviewDate}.png`);
      setExportStatus("idle");
    } catch {
      setExportStatus("error");
      window.setTimeout(() => setExportStatus("idle"), 2500);
    }
  }

  return (
    <section className={sheetClassName} ref={sheetRef} style={sheetStyle}>
      <div className="daily-sheet-header">
        <div className="daily-sheet-title">
          <h2>Daily Review Sheet</h2>
          <p>Medium-density rank sheet with progressive threshold details.</p>
        </div>
        <div className="daily-sheet-controls">
          <Button
            aria-label="Export rank sheet image"
            data-export-ignore="true"
            disabled={exportStatus === "exporting"}
            onClick={() => void exportSheet()}
            size="sm"
            variant="ghost"
          >
            <Download size={15} />
            {exportStatus === "exporting" ? "Exporting" : exportStatus === "error" ? "Export failed" : "Export Image"}
          </Button>
          <SegmentedControl ariaLabel="Metric" onChange={onSelectMetric} options={metricOptions} value={dailyReviewMetric} />
        </div>
      </div>
      <div className="rank-sheet">
        <div className="rank-sheet-head">
          <div>Category</div>
          <div>Subcategory</div>
          <div>Scenario</div>
          <div>Score</div>
          <div>Current Rank / Progress</div>
          <div className="rank-columns-head rank-columns-cell">
            <span>Rank Columns</span>
            {rankReferenceSegments.length ? (
              <div className="rank-reference-track" style={{ gridTemplateColumns: `repeat(${rankReferenceSegments.length}, minmax(0, 1fr))` }}>
                {rankReferenceSegments.map((threshold) => (
                  <span className="rank-reference-segment" key={`${threshold.name}-${threshold.value}`}>
                    <span style={{ color: threshold.color }}>{threshold.name}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div>Trend Hint</div>
        </div>
        {rows.length ? (
          rows.map((row) => (
            <DailyReviewRow
              key={row.scenarioName}
              onSelect={onSelectScenario}
              row={row}
              selected={row.scenarioName === selectedScenarioName}
              settings={tableSettings}
            />
          ))
        ) : (
          <EmptyState title="No matching training records">Switch to Full Benchmark or choose another training day.</EmptyState>
        )}
      </div>
    </section>
  );
}
