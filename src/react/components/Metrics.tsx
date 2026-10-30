import { averageRecentDailySessions, averageRecentRuns, stableMetricLabel, type StableMetricKey } from "../../core/dailyReview.ts";
import { average } from "../../core/stats.ts";
import { rankForScore } from "../../core/rank.ts";
import type { BenchmarkDifficulty, BenchmarkScenario, DailySession, RankResult, ScoreRecord } from "../../core/types.ts";
import { formatNumber } from "../format.ts";
import { RankHeader, RankReference, rankReferenceData } from "./RankReference.tsx";

interface MetricsPanelProps {
  currentDifficulty: BenchmarkDifficulty | undefined;
  selectedScenario: string;
  selectedScenarioDetails: BenchmarkScenario | undefined;
  sessions: DailySession[];
  visibleRecords: ScoreRecord[];
}

interface MetricCardValue {
  key: StableMetricKey;
  label: string;
  sampleCount: number;
  value: number | null;
}

interface MetricValues {
  best: number | null;
  cards: MetricCardValue[];
  scoped: ScoreRecord[];
}

export function MetricsPanel({ currentDifficulty, selectedScenario, selectedScenarioDetails, sessions, visibleRecords }: MetricsPanelProps) {
  const metrics = calculateMetrics(visibleRecords, sessions);
  const thresholds = selectedScenarioDetails?.rankMaxes || [];
  const rankColors = currentDifficulty?.rankColors || {};
  const data = rankReferenceData(selectedScenario, currentDifficulty, thresholds);
  const primary = metrics.cards[0];
  const primaryRank = rankForScore(primary?.value ?? null, thresholds, rankColors);
  const rankBest = rankForScore(metrics.best, thresholds, rankColors);

  return (
    <section className="panel focus-panel">
      <div className="panel-heading">
        <div>
          <h2>当前状态</h2>
          <p className="subtitle">{buildTrendSummary(metrics.scoped)}</p>
        </div>
        <span>{metrics.scoped.length} 条匹配记录</span>
      </div>
      <div className="metric-grid">
        {metrics.cards.map((card) => (
          <MetricCard
            key={card.key}
            label={card.label}
            rank={rankForScore(card.value, thresholds, rankColors)}
            sampleCount={card.sampleCount}
            selectedScenario={selectedScenario}
            value={card.value}
          />
        ))}
        <MetricCard label="最高成绩" value={metrics.best} rank={rankBest} sampleCount={metrics.scoped.length} selectedScenario={selectedScenario} emptyText={`${metrics.scoped.length} 次记录`} />
      </div>
      <div className="rank-reference">
        <div className="rank-reference-row rank-reference-header">
          <div className="rank-reference-label">
            <strong>段位线</strong>
          </div>
          <div className="rank-bar-header">
            <RankHeader data={data} selectedScenario={selectedScenario} />
          </div>
        </div>
        <div className="rank-reference-row">
          <div className="rank-reference-label">
            <strong>{primary?.label || "稳定分"}</strong>
            <span>{formatNumber(primary?.value ?? null)}</span>
          </div>
          <div className="rank-bar">
            <RankReference data={data} label={primary?.label || "稳定分"} rank={primaryRank} score={primary?.value ?? null} selectedScenario={selectedScenario} />
          </div>
        </div>
        <div className="rank-reference-row">
          <div className="rank-reference-label">
            <strong>最高成绩</strong>
            <span>{formatNumber(metrics.best)}</span>
          </div>
          <div className="rank-bar">
            <RankReference data={data} label="最高成绩" rank={rankBest} score={metrics.best} selectedScenario={selectedScenario} />
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  emptyText = "选择单场景查看",
  label,
  rank,
  sampleCount,
  selectedScenario,
  value,
}: {
  emptyText?: string;
  label: string;
  rank: RankResult | null;
  sampleCount: number;
  selectedScenario: string;
  value: number | null;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small>{rank?.name || "-"}</small>
      <small>{rankMetricText({ emptyText, rank, sampleCount, selectedScenario })}</small>
    </article>
  );
}

function calculateMetrics(scoped: ScoreRecord[], sessions: DailySession[]): MetricValues {
  const scores = scoped.map((record) => record.score);
  const validRunCount = scoped.filter((record) => Number.isFinite(record.score) && record.score > 0).length;
  const runCards: MetricCardValue[] = ([10, 20, 30] as const).map((window) => ({
    key: `run${window}`,
    label: stableMetricLabel(`run${window}`),
    sampleCount: Math.min(window, validRunCount),
    value: averageRecentRuns(scoped, window),
  }));
  const sessionCards: MetricCardValue[] = ([1, 3, 5] as const).map((window) => ({
    key: `session${window}`,
    label: stableMetricLabel(`session${window}`),
    sampleCount: Math.min(window, sessions.length),
    value: averageRecentDailySessions(sessions, window),
  }));

  return {
    best: scores.length ? Math.max(...scores) : null,
    cards: [...runCards, ...sessionCards],
    scoped,
  };
}

function rankMetricText({
  emptyText,
  rank,
  sampleCount,
  selectedScenario,
}: {
  emptyText: string;
  rank: RankResult | null;
  sampleCount: number;
  selectedScenario: string;
}): string {
  if (rank?.next) return `距 ${rank.next.name} 还差 ${formatNumber(rank.next.need)}`;
  if (rank?.name) return "已达到当前最高段位线";
  if (selectedScenario === "all") return emptyText;
  return sampleCount ? "缺少段位线" : "暂无成绩";
}

function buildTrendSummary(records: ScoreRecord[]): string {
  if (!records.length) return "读取成绩后显示趋势。";
  const recent = average(records.slice(0, 10).map((record) => record.score));
  const previous = average(records.slice(10, 20).map((record) => record.score));
  if (recent === null || previous === null) return "记录数量不足，继续训练后显示趋势。";
  const diff = recent - previous;
  if (Math.abs(diff) < 0.01) return "最近 10 次与上一组基本持平。";
  return diff > 0 ? `最近 10 次比上一组高 ${formatNumber(diff)}。` : `最近 10 次比上一组低 ${formatNumber(Math.abs(diff))}。`;
}
