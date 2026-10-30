import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { recordKey } from "../../../core/exclusions.ts";
import { dailyReviewTrendPoints, dailyReviewTrendValue } from "../../../core/dailyReview.ts";
import { localDateKey } from "../../../core/stats.ts";
import { formatNumber } from "../../format.ts";
import { Button } from "../../ui/Button.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import type { ScenarioInspectorModel } from "./dailyReviewTypes.ts";

interface ScenarioDetailModalProps {
  dailyReviewDate: string;
  model: ScenarioInspectorModel;
  onClose: () => void;
}

export function ScenarioDetailModal({ dailyReviewDate, model, onClose }: ScenarioDetailModalProps) {
  const { row } = model;
  const points = dailyReviewTrendPoints(model.sessions, dailyReviewDate, 5);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="detail-modal-backdrop" onClick={onClose} role="presentation">
      <section aria-modal="true" className="detail-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <header className="detail-modal-header">
          <div>
            <span>Scenario Detail</span>
            <h2>{row.scenarioName}</h2>
            <p>
              {row.category} · {row.subcategory} · {dailyReviewDate}
            </p>
          </div>
          <IconButton label="Close detail" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>

        <div className="detail-modal-grid">
          <section className="detail-modal-section detail-modal-hero">
            <div>
              <span>Score</span>
              <strong>{row.score === null ? "-" : formatNumber(row.score)}</strong>
            </div>
            <div>
              <span>Current Rank</span>
              <strong style={{ color: row.rankColor }}>{row.rankName}</strong>
            </div>
            <div>
              <span>Progress</span>
              <strong>{Math.round(row.progressPercent)}%</strong>
            </div>
            <div>
              <span>Next</span>
              <strong>{row.nextThreshold && row.nextThresholdDelta !== null ? `${formatNumber(row.nextThresholdDelta)} to ${row.nextThreshold.name}` : "Maxed"}</strong>
            </div>
          </section>

          <section className="detail-modal-section">
            <h3>Rank Thresholds</h3>
            <div className="detail-threshold-grid">
              {row.thresholds.map((threshold) => (
                <div className="detail-threshold" key={`${threshold.name}-${threshold.value}`}>
                  <span style={{ color: threshold.color }}>{threshold.name}</span>
                  <strong>{formatNumber(threshold.value)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-modal-section">
            <h3>Recent Sessions</h3>
            <div className="detail-session-grid">
              {points.map((point) => (
                <div className="detail-session" key={point.dateKey}>
                  <span>{point.dateKey}</span>
                  <strong>{formatNullable(dailyReviewTrendValue(point, "avg"))}</strong>
                  <small>
                    best {formatNullable(dailyReviewTrendValue(point, "best"))} · worst {formatNullable(dailyReviewTrendValue(point, "worst"))}
                  </small>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-modal-section">
            <h3>Today Runs</h3>
            <div className="detail-run-list">
              {model.dayRuns.length ? (
                model.dayRuns.map((record) => {
                  const exclusion = model.exclusions[recordKey(record)];
                  return (
                    <div className="detail-run" key={recordKey(record)}>
                      <div>
                        <strong>{formatNumber(record.score)}</strong>
                        <span>{runTimeLabel(record.date)}</span>
                      </div>
                      <small>{exclusion?.status || "valid"}</small>
                    </div>
                  );
                })
              ) : (
                <small>No runs on this date.</small>
              )}
            </div>
          </section>
        </div>

        <footer className="detail-modal-footer">
          <Button onClick={onClose} variant="secondary">
            Done
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function formatNullable(value: number | null): string {
  return value === null ? "-" : formatNumber(value);
}

function runTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localDateKey(value);
  return `${localDateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
