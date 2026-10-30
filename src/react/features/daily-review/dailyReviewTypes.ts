import type { BenchmarkScenario, DailySession, RecordExclusion, ScoreRecord } from "../../../core/types.ts";

export interface RankThresholdModel {
  color: string;
  name: string;
  value: number;
}

export interface RankColumnSegmentModel {
  color: string;
  fillPercent: number;
  name: string;
  value: number;
}

export type TrendTone = "positive" | "negative" | "neutral";

export interface DailyReviewRowModel {
  category: string;
  currentSession: DailySession | undefined;
  displayRecords: ScoreRecord[];
  nextThreshold: RankThresholdModel | null;
  nextThresholdDelta: number | null;
  progressPercent: number;
  rankColor: string;
  rankColumnSegments: RankColumnSegmentModel[];
  rankName: string;
  nextRankLabel: string;
  trendLabel: string;
  trendTone: TrendTone;
  records: ScoreRecord[];
  runCount: number;
  score: number | null;
  scenario: BenchmarkScenario;
  scenarioName: string;
  subcategory: string;
  thresholds: RankThresholdModel[];
  trainedToday: boolean;
}

export interface DailyReviewSummaryModel {
  bestScenario: string;
  dateKey: string;
  focusHint: string;
  needsAttentionScenario: string;
  rankProgressLabel: string;
  recentComparisonLabel: string;
  stableLabel: string;
  trainingDurationLabel: string;
  totalScenarios: number;
  trainedCount: number;
}

export interface ScenarioInspectorModel {
  dayRuns: ScoreRecord[];
  exclusions: Record<string, RecordExclusion>;
  row: DailyReviewRowModel;
  sessions: DailySession[];
}
