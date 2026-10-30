import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { recordKey } from "../../../core/exclusions.ts";
import { dailyReviewTrendPoints, dailyReviewTrendValue } from "../../../core/dailyReview.ts";
import { localDateKey } from "../../../core/stats.ts";
import type { ScoreRecord } from "../../../core/types.ts";
import { formatNumber, shortDate } from "../../format.ts";
import { Button } from "../../ui/Button.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Panel } from "../../ui/Panel.tsx";
import { SegmentedControl } from "../../ui/SegmentedControl.tsx";
import { ScenarioDetailModal } from "./ScenarioDetailModal.tsx";
import type { ScenarioInspectorModel } from "./dailyReviewTypes.ts";

interface ScenarioInspectorProps {
  dailyReviewDate: string;
  model: ScenarioInspectorModel | null;
  onBack: () => void;
  onExcludeRecord: (record: ScoreRecord) => void;
  onRestoreRecord: (record: ScoreRecord) => void;
}

type InspectorMetric = "avg" | "best" | "worst" | "median";

const metricOptions: Array<{ label: string; value: InspectorMetric }> = [
  { label: "Avg", value: "avg" },
  { label: "Best", value: "best" },
  { label: "Worst", value: "worst" },
  { label: "Median", value: "median" },
];

export function ScenarioInspector({ dailyReviewDate, model, onBack, onExcludeRecord, onRestoreRecord }: ScenarioInspectorProps) {
  const [metric, setMetric] = useState<InspectorMetric>("avg");
  const [detailOpen, setDetailOpen] = useState(false);
  if (!model) {
    return (
      <Panel className="inspector-panel" elevated>
        <div className="inspector-header">
          <div>
            <h2>Scenario</h2>
            <p>Select a row to inspect scenario details.</p>
          </div>
        </div>
      </Panel>
    );
  }

  const { row } = model;
  const nextThreshold = row.nextThreshold;
  const trendSummary = useMemo(() => scenarioTrendSummary(model.sessions, dailyReviewDate, metric), [dailyReviewDate, metric, model.sessions]);
  const bestRun = model.dayRuns.reduce<ScoreRecord | null>((best, record) => (!best || record.score > best.score ? record : best), null);

  return (
    <Panel className="inspector-panel" elevated>
      <div className="inspector-header">
        <div>
          <h2>{row.scenarioName}</h2>
          <p>{row.category} · {row.subcategory}</p>
        </div>
        <IconButton label="Back to today" onClick={onBack}>
          <ArrowLeft size={16} />
        </IconButton>
      </div>

      <section className="inspector-section">
        <h3>Rank</h3>
        <div className="inspector-stat-grid">
          <div className="inspector-stat">
            <span>Score</span>
            <strong>{row.score === null ? "-" : formatNumber(row.score)}</strong>
          </div>
          <div className="inspector-stat">
            <span>Current Rank</span>
            <strong style={{ color: row.rankColor }}>{row.rankName}</strong>
          </div>
          <div className="inspector-stat">
            <span>Progress</span>
            <strong>{Math.round(row.progressPercent)}%</strong>
          </div>
          <div className="inspector-stat">
            <span>Next</span>
            <strong>{nextThreshold && row.nextThresholdDelta !== null ? `${formatNumber(row.nextThresholdDelta)} to ${nextThreshold.name}` : "Maxed"}</strong>
          </div>
        </div>
      </section>

      <section className="inspector-section">
        <h3>Thresholds</h3>
        <div className="rank-tooltip-grid">
          {row.thresholds.map((threshold) => (
            <span className="rank-tooltip-item" key={`${threshold.name}-${threshold.value}`}>
              <span style={{ color: threshold.color }}>{threshold.name}</span>
              <strong>{formatNumber(threshold.value)}</strong>
            </span>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <div className="inspector-section-heading">
          <h3>Recent Sessions</h3>
          <SegmentedControl ariaLabel="Trend metric" onChange={setMetric} options={metricOptions} value={metric} />
        </div>
        <MiniTrend dateKey={dailyReviewDate} metric={metric} sessions={model.sessions} />
        <p className={`trend-summary trend-${trendSummary.tone}`}>
          {trendSummary.label}
          {bestRun ? ` · Best today ${formatNumber(bestRun.score)}` : ""}
        </p>
      </section>

      <section className="inspector-section">
        <h3>Today Runs</h3>
        <div className="run-list">
          {model.dayRuns.length ? (
            model.dayRuns.map((record) => {
              const exclusion = model.exclusions[recordKey(record)];
              return (
                <div className="run-item" key={recordKey(record)}>
                  <div>
                    <strong>{formatNumber(record.score)}</strong>
                    <br />
                    <small>{runTimeLabel(record.date)}</small>
                  </div>
                  <small>{exclusion?.status || "valid"}</small>
                  {exclusion?.status === "excluded" ? (
                    <Button onClick={() => onRestoreRecord(record)} size="sm" variant="ghost">
                      Restore
                    </Button>
                  ) : (
                    <Button onClick={() => onExcludeRecord(record)} size="sm" variant="danger">
                      Exclude
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <small>No runs on this date.</small>
          )}
        </div>
      </section>
      <section className="inspector-section">
        <Button aria-label="Open scenario detail" onClick={() => setDetailOpen(true)} variant="secondary">
          Open Detail
        </Button>
      </section>
      {detailOpen ? <ScenarioDetailModal dailyReviewDate={dailyReviewDate} model={model} onClose={() => setDetailOpen(false)} /> : null}
    </Panel>
  );
}

function MiniTrend({ dateKey, metric, sessions }: { dateKey: string; metric: InspectorMetric; sessions: ScenarioInspectorModel["sessions"] }) {
  const points = dailyReviewTrendPoints(sessions, dateKey, 5);
  const values = points.map((point) => dailyReviewTrendValue(point, metric));
  const finiteValues = values.filter((value): value is number => Number.isFinite(value));
  if (!finiteValues.length) return <small>No recent trend yet.</small>;

  const width = 280;
  const height = 112;
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const spread = max - min || Math.max(max * 0.08, 1);
  const yMin = Math.max(0, min - spread * 0.2);
  const yMax = max + spread * 0.2;
  const coords = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * (width - 32) + 16;
    const y = value === null ? height - 20 : 14 + (1 - (value - yMin) / (yMax - yMin)) * (height - 34);
    return { x, y, value };
  });
  const path = coords.filter((coord) => coord.value !== null).map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`).join(" ");

  return (
    <svg className="mini-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent session trend">
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
      {coords.map((coord, index) => (coord.value === null ? null : <circle cx={coord.x} cy={coord.y} fill="var(--color-bg-surface)" key={index} r="4" stroke="var(--color-accent)" strokeWidth="2" />))}
    </svg>
  );
}

function scenarioTrendSummary(sessions: ScenarioInspectorModel["sessions"], dateKey: string, metric: InspectorMetric): { label: string; tone: "positive" | "negative" | "neutral" } {
  const points = dailyReviewTrendPoints(sessions, dateKey, 5);
  const values = points.map((point) => dailyReviewTrendValue(point, metric)).filter((value): value is number => Number.isFinite(value));
  if (values.length < 2) return { label: "Not enough recent sessions for trend.", tone: "neutral" };
  const delta = values.at(-1)! - values[0];
  const spread = Math.max(...values) - Math.min(...values);
  const tone = Math.abs(delta) < 1 ? "neutral" : delta > 0 ? "positive" : "negative";
  const direction = tone === "neutral" ? "Stable" : delta > 0 ? "Improving" : "Cooling off";
  return { label: `${direction}: ${delta >= 0 ? "+" : ""}${formatNumber(delta)} over recent 5 · volatility ${formatNumber(spread)}`, tone };
}

function runTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return shortDate(localDateKey(value));
  return `${shortDate(localDateKey(date))} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
