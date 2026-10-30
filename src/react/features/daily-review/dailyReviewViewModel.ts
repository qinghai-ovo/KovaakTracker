import { recordKey } from "../../../core/exclusions.ts";
import { buildDailyReviewPerformanceRankings, dailyReviewTrendPoints, dailyReviewTrendValue, dailyReviewValue } from "../../../core/dailyReview.ts";
import { progressPercentForScore, rankForScore, rankSegmentFill } from "../../../core/rank.ts";
import { localDateKey } from "../../../core/stats.ts";
import type { BenchmarkScenario, DailySession, RecordExclusion, ScoreRecord } from "../../../core/types.ts";
import { formatNumber } from "../../format.ts";
import type { DailyReviewRowModel, DailyReviewSummaryModel, RankColumnSegmentModel, RankThresholdModel, ScenarioInspectorModel, TrendTone } from "./dailyReviewTypes.ts";

export function buildDailyReviewRows({
  dailyReviewDate,
  dailyReviewMetric,
  dailyReviewScope,
  displayRecordsForScenario,
  rankColors,
  recordsForScenario,
  scenarios,
  sessions,
}: {
  dailyReviewDate: string;
  dailyReviewMetric: string;
  dailyReviewScope: string;
  displayRecordsForScenario: (scenarioName: string) => ScoreRecord[];
  rankColors: Record<string, string>;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  scenarios: BenchmarkScenario[];
  sessions: Map<string, DailySession[]>;
}): DailyReviewRowModel[] {
  const visibleScenarios =
    dailyReviewScope === "trained"
      ? scenarios.filter((scenario) => sessions.get(scenario.name)?.some((session) => session.dateKey === dailyReviewDate))
      : scenarios;

  return visibleScenarios.map((scenario) => {
    const scenarioSessions = sessions.get(scenario.name) || [];
    const currentSession = scenarioSessions.find((session) => session.dateKey === dailyReviewDate);
    const records = recordsForScenario(scenario.name);
    const score = dailyReviewValue(scenarioSessions, currentSession, dailyReviewMetric, dailyReviewDate, records);
    const rank = rankForScore(score, scenario.rankMaxes || [], rankColors);
    const thresholds = buildRankThresholds(scenario.rankMaxes || [], rankColors);
    const nextThreshold = score === null ? null : thresholds.find((threshold) => threshold.value > score) || null;
    const trend = buildTrendSummary(scenarioSessions, dailyReviewDate);
    return {
      category: displayCategoryForScenario(scenario),
      currentSession,
      displayRecords: displayRecordsForScenario(scenario.name),
      nextThreshold,
      nextThresholdDelta: nextThreshold && score !== null ? nextThreshold.value - score : null,
      progressPercent: progressPercentForScore(score, scenario.rankMaxes || []),
      rankColor: rank?.color || "#71717a",
      rankColumnSegments: buildRankColumnSegments(score, scenario.rankMaxes || [], thresholds),
      rankName: rank?.name || "-",
      nextRankLabel: nextThreshold && score !== null ? `${formatNumber(nextThreshold.value - score)} to ${nextThreshold.name}` : score === null ? "-" : "Maxed",
      trendLabel: trend.label,
      trendTone: trend.tone,
      records,
      runCount: currentSession?.count || 0,
      score,
      scenario,
      scenarioName: scenario.name,
      subcategory: displaySubcategoryForScenario(scenario),
      thresholds,
      trainedToday: Boolean(currentSession),
    };
  });
}

export function buildDailyReviewSummary({
  allRecords = [],
  dailyReviewDate,
  recordExclusions = {},
  rankColors,
  rows,
  scenarios,
  sessions,
}: {
  allRecords?: ScoreRecord[];
  dailyReviewDate: string;
  recordExclusions?: Record<string, RecordExclusion>;
  rankColors: Record<string, string>;
  rows: DailyReviewRowModel[];
  scenarios: BenchmarkScenario[];
  sessions: Map<string, DailySession[]>;
}): DailyReviewSummaryModel {
  const performance = buildDailyReviewPerformanceRankings({ dateKey: dailyReviewDate, rankColors, scenarios, sessions });
  const best = performance.good[0];
  const weak = performance.weak[0];
  const scoredRows = rows.filter((row) => row.score !== null);
  const averageProgress =
    scoredRows.length > 0 ? scoredRows.reduce((total, row) => total + row.progressPercent, 0) / scoredRows.length : null;
  const baselineAverage = average(performance.items.map((item) => item.baselineProgress));
  const recentComparison = averageProgress === null || baselineAverage === null ? null : averageProgress - baselineAverage;

  return {
    bestScenario: best?.scenarioName || "-",
    dateKey: dailyReviewDate,
    focusHint: weak ? `Next focus: ${weak.scenarioName}` : "Next focus: collect more sessions",
    needsAttentionScenario: weak?.scenarioName || "-",
    rankProgressLabel: averageProgress === null ? "-" : `${formatNumber(averageProgress)}%`,
    recentComparisonLabel: recentComparison === null ? "-" : `${recentComparison >= 0 ? "+" : ""}${formatNumber(recentComparison)}% vs recent 5`,
    stableLabel: averageProgress === null ? "-" : `${formatNumber(averageProgress)}% avg progress`,
    trainingDurationLabel: trainingDurationLabel(allRecords, recordExclusions, dailyReviewDate),
    totalScenarios: scenarios.length,
    trainedCount: rows.filter((row) => row.trainedToday).length,
  };
}

export function buildScenarioInspectorModel({
  dailyReviewDate,
  recordExclusions,
  row,
  sessions,
}: {
  dailyReviewDate: string;
  recordExclusions: Record<string, RecordExclusion>;
  row: DailyReviewRowModel | undefined;
  sessions: Map<string, DailySession[]>;
}): ScenarioInspectorModel | null {
  if (!row) return null;
  const dayRuns = row.displayRecords
    .filter((record) => localDateKey(record.date) === dailyReviewDate)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    dayRuns,
    exclusions: Object.fromEntries(dayRuns.map((record) => [recordKey(record), recordExclusions[recordKey(record)]]).filter(([, exclusion]) => exclusion)),
    row,
    sessions: sessions.get(row.scenarioName) || [],
  };
}

export function displayCategoryForScenario(scenario: BenchmarkScenario): string {
  return scenario.category || "Uncategorized";
}

export function displaySubcategoryForScenario(scenario: BenchmarkScenario): string {
  return scenario.subcategory || "General";
}

export function simplifyScenarioName(name: string): string {
  return name.replace(/\s+(intermediate|advanced|beginner|novice|easy|easier|hard|harder)\b/gi, "").trim() || name;
}

function buildRankThresholds(thresholds: number[], rankColors: Record<string, string>): RankThresholdModel[] {
  const rankNames = Object.keys(rankColors);
  return thresholds.map((value, index) => ({
    color: rankColors[rankNames[index]] || "#71717a",
    name: rankNames[index] || `Rank ${index + 1}`,
    value,
  }));
}

function buildRankColumnSegments(score: number | null, rankMaxes: number[], thresholds: RankThresholdModel[]): RankColumnSegmentModel[] {
  return thresholds.map((threshold, index) => ({
    ...threshold,
    fillPercent: rankSegmentFill(score, rankMaxes, index),
  }));
}

function buildTrendSummary(sessions: DailySession[], dateKey: string): { label: string; tone: TrendTone } {
  const points = dailyReviewTrendPoints(sessions, dateKey, 5);
  const values = points.map((point) => dailyReviewTrendValue(point, "avg")).filter((value): value is number => Number.isFinite(value));
  if (values.length < 2) return { label: "Trend building", tone: "neutral" };
  const delta = values.at(-1)! - values[0];
  if (Math.abs(delta) < 1) return { label: "Stable", tone: "neutral" };
  return { label: delta > 0 ? `+${formatNumber(delta)} recent` : `${formatNumber(delta)} recent`, tone: delta > 0 ? "positive" : "negative" };
}

function trainingDurationLabel(records: ScoreRecord[], recordExclusions: Record<string, RecordExclusion>, dateKey: string): string {
  const dayRecords = records
    .filter((record) => localDateKey(record.date) === dateKey && recordExclusions[recordKey(record)]?.status !== "excluded")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (dayRecords.length < 2) return dayRecords.length ? "1 run logged" : "-";
  const start = new Date(dayRecords[0].date).getTime();
  const end = new Date(dayRecords[dayRecords.length - 1].date).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (!minutes) return `${dayRecords.length} runs logged`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function average(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((total, value) => total + value, 0) / finite.length;
}
