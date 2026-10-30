import type { BenchmarkDifficulty, BenchmarkScenario, DailyReviewEntry, DailyReviewTableSettings, DailySession, RecordExclusion, ScoreRecord, SetupProfile } from "../../../core/types.ts";
import { DailyReviewSheet } from "./DailyReviewSheet.tsx";
import { DailySummaryStrip } from "./DailySummaryStrip.tsx";
import { buildDailyReviewRows, buildDailyReviewSummary } from "./dailyReviewViewModel.ts";

interface DailyCommandCenterProps {
  allRecords: ScoreRecord[];
  currentDifficulty: BenchmarkDifficulty | undefined;
  dailyReviewDate: string;
  dailyReviewMetric: string;
  dailyReviewScope: string;
  displayRecordsForScenario: (scenarioName: string) => ScoreRecord[];
  onClearSelectedScenario: () => void;
  onSelectMetric: (value: string) => void;
  onSelectScenario: (scenarioName: string) => void;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  recordExclusions: Record<string, RecordExclusion>;
  scenarios: BenchmarkScenario[];
  selectedScenarioName: string;
  sessions: Map<string, DailySession[]>;
  tableSettings: DailyReviewTableSettings;
}

export function DailyCommandCenter({
  allRecords,
  currentDifficulty,
  dailyReviewDate,
  dailyReviewMetric,
  dailyReviewScope,
  displayRecordsForScenario,
  onClearSelectedScenario,
  onSelectMetric,
  onSelectScenario,
  recordsForScenario,
  recordExclusions,
  scenarios,
  selectedScenarioName,
  sessions,
  tableSettings,
}: DailyCommandCenterProps) {
  const rankColors = currentDifficulty?.rankColors || {};
  const rows = buildDailyReviewRows({
    dailyReviewDate,
    dailyReviewMetric,
    dailyReviewScope,
    displayRecordsForScenario,
    rankColors,
    recordsForScenario,
    scenarios,
    sessions,
  });
  const summary = buildDailyReviewSummary({ allRecords, dailyReviewDate, recordExclusions, rankColors, rows, scenarios, sessions });

  return (
    <div
      className="daily-command-center"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("button, input, select, textarea, a, .rank-sheet-row, .ui-segmented")) {
          onClearSelectedScenario();
        }
      }}
    >
      <DailySummaryStrip summary={summary} />
      <DailyReviewSheet
        dailyReviewDate={dailyReviewDate}
        dailyReviewMetric={dailyReviewMetric}
        onSelectMetric={onSelectMetric}
        onSelectScenario={onSelectScenario}
        rows={rows}
        selectedScenarioName={selectedScenarioName}
        tableSettings={tableSettings}
      />
    </div>
  );
}

export type DailyInspectorCommonProps = {
  allRecords: ScoreRecord[];
  dailyReview: DailyReviewEntry | undefined;
  defaultSetupProfile: SetupProfile;
  recordExclusions: Record<string, RecordExclusion>;
};
