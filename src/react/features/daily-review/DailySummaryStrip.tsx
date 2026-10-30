import type { DailyReviewSummaryModel } from "./dailyReviewTypes.ts";

interface DailySummaryStripProps {
  summary: DailyReviewSummaryModel;
}

export function DailySummaryStrip({ summary }: DailySummaryStripProps) {
  return (
    <section className="ui-panel daily-summary-strip">
      <div className="summary-primary">
        <h1>Today · {summary.dateKey || "-"}</h1>
        <p>
          {summary.trainedCount}/{summary.totalScenarios} scenarios have training data. Daily review stays focused on score context first, notes second.
        </p>
        <p className="weekly-focus-hint">{summary.focusHint}</p>
      </div>
      <div className="summary-card">
        <span>Training Time</span>
        <strong>{summary.trainingDurationLabel}</strong>
        <small>{summary.trainedCount} scenarios today</small>
      </div>
      <div className="summary-card">
        <span>Rank Progress</span>
        <strong>{summary.rankProgressLabel}</strong>
        <small>{summary.recentComparisonLabel}</small>
      </div>
      <div className="summary-card">
        <span>Best / Attention</span>
        <strong>{summary.bestScenario}</strong>
        <small>{summary.needsAttentionScenario}</small>
      </div>
    </section>
  );
}
