import type { BenchmarkDifficulty, BenchmarkScenario, ScoreRecord } from "../../../core/types.ts";
import { WeeklyReviewPanel } from "../../components/WeeklyReview.tsx";
import { buildWeeklyFocusModel } from "./weeklyFocusViewModel.ts";

interface WeeklyFocusPanelProps {
  currentDifficulty: BenchmarkDifficulty | undefined;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  scenarios: BenchmarkScenario[];
}

export function WeeklyFocusPanel({ currentDifficulty, recordsForScenario, scenarios }: WeeklyFocusPanelProps) {
  const focus = buildWeeklyFocusModel({ currentDifficulty, recordsForScenario, scenarios });

  return (
    <section className="weekly-focus-panel">
      <div className="view-heading">
        <div>
          <h2>Weekly Focus</h2>
          <p>{focus.rangeLabel} · Secondary decision layer for the next training cycle.</p>
        </div>
      </div>
      <div className="weekly-focus-grid">
        {focus.items.map((item) => (
          <div className={`weekly-focus-card tone-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
      <WeeklyReviewPanel currentDifficulty={currentDifficulty} recordsForScenario={recordsForScenario} scenarios={scenarios} />
    </section>
  );
}
