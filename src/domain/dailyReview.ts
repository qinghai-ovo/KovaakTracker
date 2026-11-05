import { average, localDateKey, median } from "./stats.ts";
import type { BenchmarkScenario, DailySession, ScoreRecord } from "./types.ts";
import { progressPercentForScore, rankForScore } from "./rank.ts";

export type DailyReviewTrendMetric = "avg" | "best" | "worst" | "median" | "historyBest";
export type StableRunWindow = 10 | 20 | 30;
export type StableSessionWindow = 1 | 3 | 5;
export type StableMetricKey = "run10" | "run20" | "run30" | "session1" | "session3" | "session5";

export interface TrainingDateNavigation {
  dates: string[];
  latestTrainingDate: string;
  previousTrainingDate: string;
  nextTrainingDate: string;
  hasPreviousTrainingDate: boolean;
  hasNextTrainingDate: boolean;
}

export interface DailyReviewPerformanceItem {
  scenarioName: string;
  session: DailySession;
  score: number | null;
  rankName: string;
  rankColor: string;
  nextRankName: string;
  nextRankNeed: number | null;
  todayProgress: number;
  baselineProgress: number;
  progressDelta: number;
}

export interface DailyReviewPerformanceRankings {
  items: DailyReviewPerformanceItem[];
  good: DailyReviewPerformanceItem[];
  weak: DailyReviewPerformanceItem[];
}

export function buildDailySessionsByScenario(
  scenarios: BenchmarkScenario[],
  recordsForScenario: (scenarioName: string) => ScoreRecord[],
): Map<string, DailySession[]> {
  const map = new Map<string, DailySession[]>();
  scenarios.forEach((scenario) => {
    const byDate = new Map<string, ScoreRecord[]>();
    recordsForScenario(scenario.name).forEach((record) => {
      const dateKey = localDateKey(new Date(record.date));
      if (!dateKey) return;
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)?.push(record);
    });
    const sessions = [...byDate.entries()]
      .map(([dateKey, records]) => {
        const scores = records.map((record) => record.score).filter((score) => Number.isFinite(score) && score > 0);
        return {
          dateKey,
          count: scores.length,
          avg: average(scores),
          best: scores.length ? Math.max(...scores) : null,
          worst: scores.length ? Math.min(...scores) : null,
          median: median(scores),
        };
      })
      .filter((session) => session.count)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    map.set(scenario.name, sessions);
  });
  return map;
}

export function dailyReviewValue(
  sessions: DailySession[] | undefined,
  currentSession: DailySession | undefined,
  metric: string,
  dateKey: string,
  records: ScoreRecord[] = [],
): number | null {
  const availableSessions = sessions || [];
  if (isStableMetricKey(metric)) {
    return stableMetricValue({ dateKey, metricKey: metric, records, sessions: availableSessions });
  }
  if (metric === "recent3") {
    const recentSessions = availableSessions.filter((session) => session.dateKey <= dateKey).slice(0, 3);
    return average(recentSessions.map((session) => session.avg));
  }
  if (metric === "historyBest") {
    const bestScores = availableSessions.filter((session) => session.dateKey <= dateKey).map((session) => session.best).filter((score): score is number => Number.isFinite(score));
    return bestScores.length ? Math.max(...bestScores) : null;
  }
  const session = currentSession || availableSessions.find((item) => item.dateKey <= dateKey);
  if (!session) return null;
  const normalizedMetric = normalizeDailyReviewTrendMetric(metric);
  if (normalizedMetric === "historyBest") return session.best;
  return session[normalizedMetric] ?? null;
}

export function dailyReviewTrendValue(session: DailySession, metric: string): number | null {
  const normalizedMetric = normalizeDailyReviewTrendMetric(metric);
  if (normalizedMetric === "historyBest") return session.best;
  return session[normalizedMetric] ?? null;
}

export function normalizeDailyReviewTrendMetric(metric: string): DailyReviewTrendMetric {
  if (metric === "best" || metric === "worst" || metric === "median" || metric === "historyBest") return metric;
  return "avg";
}

export function isStableMetricKey(metric: string): metric is StableMetricKey {
  return metric === "run10" || metric === "run20" || metric === "run30" || metric === "session1" || metric === "session3" || metric === "session5";
}

export function validScoreRecords(records: ScoreRecord[]): ScoreRecord[] {
  return records.filter((record) => Number.isFinite(record.score) && record.score > 0);
}

export function averageRecentRuns(records: ScoreRecord[], window: StableRunWindow): number | null {
  return average(
    validScoreRecords(records)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, window)
      .map((record) => record.score),
  );
}

export function averageRecentDailySessions(sessions: DailySession[] | undefined, window: StableSessionWindow, dateKey = "9999-12-31"): number | null {
  return average((sessions || []).filter((session) => session.dateKey <= dateKey).slice(0, window).map((session) => session.avg));
}

export function stableMetricValue({
  dateKey = "9999-12-31",
  metricKey,
  records,
  sessions,
}: {
  dateKey?: string;
  metricKey: StableMetricKey;
  records?: ScoreRecord[];
  sessions?: DailySession[];
}): number | null {
  if (metricKey.startsWith("run")) {
    const window = Number(metricKey.replace("run", "")) as StableRunWindow;
    const scopedRecords = (records || []).filter((record) => localDateKey(record.date) <= dateKey);
    return averageRecentRuns(scopedRecords, window);
  }
  const window = Number(metricKey.replace("session", "")) as StableSessionWindow;
  return averageRecentDailySessions(sessions, window, dateKey);
}

export function stableMetricLabel(metricKey: StableMetricKey): string {
  return (
    {
      run10: "最近 10 runs 均分",
      run20: "最近 20 runs 均分",
      run30: "最近 30 runs 均分",
      session1: "最近 1 session 均分",
      session3: "最近 3 sessions 均分",
      session5: "最近 5 sessions 均分",
    }[metricKey]
  );
}

export function dailyReviewTrendPoints(sessions: DailySession[] | undefined, dateKey: string, limit = 5): DailySession[] {
  return (sessions || [])
    .filter((session) => session.dateKey <= dateKey)
    .slice(0, limit)
    .reverse();
}

export function buildDailyReviewPerformanceRankings({
  baselineWindow = 5,
  dateKey,
  limit = 3,
  rankColors = {},
  scenarios,
  sessions,
}: {
  baselineWindow?: number;
  dateKey: string;
  limit?: number;
  rankColors?: Record<string, string>;
  scenarios: BenchmarkScenario[];
  sessions: Map<string, DailySession[]>;
}): DailyReviewPerformanceRankings {
  const items = scenarios
    .map((scenario) =>
      performanceItemForScenario({
        baselineWindow,
        dateKey,
        rankColors,
        scenario,
        sessions: sessions.get(scenario.name) || [],
      }),
    )
    .filter((item): item is DailyReviewPerformanceItem => Boolean(item));

  return {
    items,
    good: [...items].sort((a, b) => b.progressDelta - a.progressDelta || a.scenarioName.localeCompare(b.scenarioName)).slice(0, limit),
    weak: [...items].sort((a, b) => a.progressDelta - b.progressDelta || a.scenarioName.localeCompare(b.scenarioName)).slice(0, limit),
  };
}

function performanceItemForScenario({
  baselineWindow,
  dateKey,
  rankColors,
  scenario,
  sessions,
}: {
  baselineWindow: number;
  dateKey: string;
  rankColors: Record<string, string>;
  scenario: BenchmarkScenario;
  sessions: DailySession[];
}): DailyReviewPerformanceItem | null {
  const currentSession = sessions.find((session) => session.dateKey === dateKey);
  if (!currentSession) return null;
  const score = currentSession.avg;
  const thresholds = scenario.rankMaxes || [];
  const todayProgress = progressPercentForScore(score, thresholds);
  const baselineProgress =
    average(
      sessions
        .filter((session) => session.dateKey <= dateKey)
        .slice(0, baselineWindow)
        .map((session) => progressPercentForScore(session.avg, thresholds)),
    ) ?? todayProgress;
  const rank = rankForScore(score, thresholds, rankColors);

  return {
    scenarioName: scenario.name,
    session: currentSession,
    score,
    rankName: rank?.name || "-",
    rankColor: rank?.color || "#71717a",
    nextRankName: rank?.next?.name || "",
    nextRankNeed: rank?.next?.need ?? null,
    todayProgress,
    baselineProgress,
    progressDelta: todayProgress - baselineProgress,
  };
}

export function latestDailyReviewDate(sessions: Map<string, DailySession[]>): string {
  return trainingDateNavigation(sessions).latestTrainingDate;
}

export function trainingDateNavigation(sessions: Map<string, DailySession[]>, dateKey = ""): TrainingDateNavigation {
  const dates = [...new Set([...sessions.values()].flatMap((items) => items.map((session) => session.dateKey)).filter(Boolean))].sort();
  const latestTrainingDate = dates[dates.length - 1] || "";
  const previousTrainingDate = [...dates].reverse().find((date) => date < dateKey) || "";
  const nextTrainingDate = dates.find((date) => date > dateKey) || "";
  return {
    dates,
    latestTrainingDate,
    previousTrainingDate,
    nextTrainingDate,
    hasPreviousTrainingDate: Boolean(previousTrainingDate),
    hasNextTrainingDate: Boolean(nextTrainingDate),
  };
}

export function dailyReviewMetricLabel(metric: string): string {
  if (isStableMetricKey(metric)) return stableMetricLabel(metric);
  return (
    {
      avg: "均分",
      best: "最高",
      worst: "最低",
      median: "中位数",
      recent3: "最近 3 次 session 均分",
      historyBest: "历史最高",
    }[metric] || "均分"
  );
}
