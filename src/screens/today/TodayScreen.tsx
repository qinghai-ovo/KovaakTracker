import { useEffect, useMemo, useState, type ReactNode } from "react";
import { suggestNextScenario, todayScreen, type TodayRunView, type TodayScenarioView, type TodayView } from "../../domain/screens/today.ts";
import type { StableWindow } from "../../domain/metrics.ts";
import { trainingMinutes } from "../../domain/screens/journal.ts";
import { rankIndexForScore } from "../../domain/rank.ts";
import { sameScenario } from "../../domain/scenario.ts";
import { useScreenInput, useSnapshot, useTrackerData, useRankStyles } from "../../app/data.tsx";
import { LegendDot, ProgressRing, RankLadder } from "../../ui/RankBars.tsx";
import { fmtClock, fmtDayHeader, fmtPercent, fmtScore } from "../../ui/format.ts";
import { rankStyleAt, type RankStyle } from "../../ui/rankStyle.ts";
import "./today.css";

const STABLE_LABEL: Record<StableWindow, string> = { last10: "近 10 局", last20: "近 20 局", week: "本周均分" };

function sessionMinutes(view: TodayView): number {
  return trainingMinutes(view.feed.map((run) => run.date));
}

export function TodayScreen({ initialScenario }: { initialScenario: string | null }) {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const input = useScreenInput(snapshot);
  const styles = useRankStyles(snapshot);
  const view = useMemo(() => todayScreen({ ...input, plan: snapshot.plan }), [input, snapshot.plan]);
  const [selectedName, setSelectedName] = useState<string | null>(initialScenario);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);

  const current = view.scenarios.find((scenario) => scenario.name === selectedName) ?? view.scenarios[0];
  const suggestion = current ? suggestNextScenario(view, current.name) : null;

  useEffect(() => {
    if (initialScenario) setSelectedName(initialScenario);
  }, [initialScenario]);

  useEffect(
    () =>
      data.onEvent((event) => {
        const record = event.records[0];
        if (!record) return;
        const latest = data.getSnapshot();
        const scenario = latest.benchmark.scenarios.find((item) => sameScenario(item.name, record.scenario));
        const previousBest = Math.max(
          0,
          ...latest.records.filter((item) => item !== record && sameScenario(item.scenario, record.scenario)).map((item) => item.score),
        );
        const style = rankStyleAt(styles, rankIndexForScore(record.score, scenario?.rankMaxes ?? []));
        setToast({ text: `已自动导入 · ${record.scenario} · ${record.score}${record.score > previousBest ? " · 新纪录" : ""}`, color: style.ink });
      }),
    [data, styles],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="page-header__date">{fmtDayHeader(view.dayKey)}</span>
          <h1 className="page-title">今天</h1>
        </div>
        <div className="today-headstats">
          <HeadStat value={view.totals.countedRuns} label="局" />
          <HeadStat value={sessionMinutes(view)} label="分钟" />
          <HeadStat value={view.totals.newPersonalBests} label="个新纪录" />
        </div>
      </header>

      {current ? (
        <div className="today-grid">
          <div className="today-grid__main">
            <ScenarioHero scenario={current} styles={styles} stableWindow={snapshot.settings.stableWindow} />
            <RunsCard scenario={current} styles={styles} onToggle={(run) => data.toggleRunCounted(findRecord(snapshot.records, run), run.counts)} />
          </div>
          <div className="today-grid__side">
            <PlanCard view={view} styles={styles} selected={current.name} onPick={setSelectedName} onSimulate={data.simulateRun ? () => data.simulateRun?.(current.name) : undefined} />
            {suggestion ? <SuggestionCard scenario={suggestion} styles={styles} onPick={() => setSelectedName(suggestion.name)} /> : null}
            <FeedCard feed={view.feed} styles={styles} />
          </div>
        </div>
      ) : (
        <section className="card">
          <span style={{ fontSize: 15, fontWeight: 500 }}>今天还没有训练计划</span>
          <span className="muted" style={{ fontSize: 13 }}>
            在能力地图里选一个场景，点"加入今日计划"。
          </span>
        </section>
      )}

      {toast ? (
        <div className="toast" role="status">
          <span className="legend-dot" style={{ background: toast.color }} />
          <span>{toast.text}</span>
        </div>
      ) : null}
    </>
  );
}

function findRecord(records: ReturnType<typeof useSnapshot>["records"], run: TodayRunView) {
  return records.find((record) => record.date === run.date && record.scenario === run.scenarioName && record.score === run.score) ?? {
    scenario: run.scenarioName,
    score: run.score,
    date: run.date,
  };
}

function HeadStat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span className="display" style={{ fontSize: 20 }}>
        {value}
      </span>
      <span className="muted" style={{ fontSize: 13 }}>
        {label}
      </span>
    </div>
  );
}

function nextRankText(scenario: TodayScenarioView): ReactNode {
  const { rank } = scenario;
  if (!rank.next) return "已达最高段位";
  if (rank.index < 0) return `再 ${fmtScore(rank.next.points)} 分达到 ${rank.next.name}`;
  return (
    <>
      <span className="in-rank">段内 {fmtPercent(rank.inRank)} · </span>再 {fmtScore(rank.next.points)} 分升 {rank.next.name}
    </>
  );
}

function ScenarioHero({ scenario, styles, stableWindow }: { scenario: TodayScenarioView; styles: RankStyle[]; stableWindow: StableWindow }) {
  const rankStyle = rankStyleAt(styles, scenario.rank.index);
  const big = scenario.todayBest ?? scenario.personalBest;
  return (
    <section className="card today-hero">
      <div className="card__glow" aria-hidden="true" style={{ background: `radial-gradient(closest-side, ${rankStyle.ink}26, rgba(255, 255, 255, 0))` }} />
      <div className="today-hero__top">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eyebrow">
            {scenario.category} / {scenario.subcategory}
          </span>
          <h2 className="display" style={{ fontSize: 24, letterSpacing: "-0.01em" }}>
            {scenario.name}
          </h2>
        </div>
        <div className="today-hero__rank">
          <span className="small muted">当前段位 · 按个人最佳</span>
          <span className="display" style={{ fontSize: 22, color: rankStyle.ink }}>
            {scenario.rank.name}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>{nextRankText(scenario)}</span>
        </div>
      </div>

      <div className="today-hero__numbers">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {scenario.todayBest !== null ? "今日最佳" : "历史最佳（今天还没练）"}
          </span>
          <span className="today-hero__big">{fmtScore(big)}</span>
          <span style={{ fontSize: 13, color: scenario.newPersonalBest ? "var(--accent)" : "var(--muted)" }}>
            {scenario.newPersonalBest ? `新的个人最佳 · 比之前 +${fmtScore(scenario.personalBestGain)}` : `个人最佳 ${fmtScore(scenario.personalBest)}`}
          </span>
        </div>
        <div className="today-hero__mini">
          <MiniStat label="最新一局" value={fmtScore(scenario.latest)} />
          <MiniStat label="今日均分" value={fmtScore(scenario.todayAverage)} />
          <MiniStat label={STABLE_LABEL[stableWindow]} value={fmtScore(scenario.stable)} />
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
        <RankLadder
          thresholds={scenario.thresholds}
          styles={styles}
          score={scenario.personalBest}
          pbProgress={scenario.personalBest === null ? null : scenario.personalBestProgress}
          stableProgress={scenario.stableProgress}
          markerColor={rankStyle.ink}
        />
        <div className="legend">
          <span className="legend__item">
            <LegendDot color={rankStyle.ink} />
            个人最佳 <span className="mono">{fmtScore(scenario.personalBest)}</span>
          </span>
          <span className="legend__item">
            <LegendDot color="var(--text)" hollow />
            稳定水平 <span className="mono">{fmtScore(scenario.stable)}</span>
            <span className="muted">{STABLE_LABEL[stableWindow]}</span>
          </span>
          {scenario.stableGap !== null ? <span className="muted">相差 {fmtScore(scenario.stableGap)} 分：偶尔能打到 vs 稳定能打到</span> : null}
        </div>
        <div className="today-hero__names">
          {scenario.thresholds.map((threshold, index) => {
            const style = rankStyleAt(styles, index);
            const isCurrent = index === scenario.rank.index;
            return (
              <div key={`${index}-${threshold}`} className="today-hero__name">
                <span style={{ fontSize: 11, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? style.ink : index < scenario.rank.index ? "var(--text-2)" : "var(--faint)" }}>{style.name}</span>
                <span className="mono faint" style={{ fontSize: 10 }}>
                  {threshold}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="today-mini">
      <span className="small muted">{label}</span>
      <span className="mono" style={{ fontSize: 22, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function RunsCard({ scenario, styles, onToggle }: { scenario: TodayScenarioView; styles: RankStyle[]; onToggle: (run: TodayRunView) => void }) {
  const { thresholds, runs, rank } = scenario;
  const nextIndex = Math.min(rank.index + 1, thresholds.length - 1);
  const scores = runs.map((run) => run.score);
  const currentLine = rank.index >= 0 ? thresholds[rank.index] : null;
  const top = Math.max(thresholds[nextIndex] ?? 0, ...scores) * 1.06;
  const bottom = Math.min(currentLine ?? thresholds[0] ?? 0, ...scores.filter((score) => score > (thresholds[0] ?? 0) * 0.5)) * 0.88;
  const pos = (value: number) => Math.max(2, Math.min(100, ((value - bottom) / (top - bottom || 1)) * 100));
  const counted = runs.filter((run) => run.counts).map((run) => run.score);
  const best = counted.length ? Math.max(...counted) : null;

  const lines: Array<{ value: number; color: string; label: string }> = [];
  if (currentLine !== null) lines.push({ value: currentLine, color: rankStyleAt(styles, rank.index).ink, label: rank.name });
  if (rank.next) lines.push({ value: thresholds[rank.next.index], color: rankStyleAt(styles, rank.next.index).ink, label: rank.next.name });

  return (
    <section className="card">
      <div className="card__head">
        <h3 className="card__title">今天的每一局</h3>
        <span className="small muted">点击一局可忽略或恢复 · 空心点不计入统计</span>
      </div>
      {runs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="runs-chart">
            {lines.map((line) => (
              <div key={line.label} aria-hidden="true">
                <div className="runs-chart__line" style={{ bottom: `${pos(line.value)}%`, borderColor: line.color }} />
                <span className="runs-chart__line-label mono" style={{ bottom: `${pos(line.value)}%`, color: line.color }}>
                  {line.label}
                </span>
              </div>
            ))}
            {runs.map((run, index) => {
              const color = rankStyleAt(styles, run.rankIndex).ink;
              const isBest = run.counts && run.score === best;
              return (
                <button
                  key={run.key}
                  className="runs-chart__bar"
                  onClick={() => onToggle(run)}
                  aria-label={`第 ${index + 1} 局，${run.score} 分，${run.counts ? "点击忽略" : "已忽略，点击恢复"}`}
                >
                  <span className="runs-chart__stem" style={{ height: `${pos(run.score)}%`, background: run.counts ? color : "rgba(91, 101, 119, 0.35)" }} />
                  <span
                    className="runs-chart__dot"
                    style={{
                      bottom: `${pos(run.score)}%`,
                      background: run.counts ? color : "var(--surface-muted)",
                      borderColor: run.counts ? color : "var(--muted)",
                      boxShadow: isBest ? `0 0 0 4px rgba(14, 116, 144, 0.18), 0 0 18px ${color}` : "none",
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="runs-chart__labels">
            {runs.map((run) => (
              <div key={run.key} className="runs-chart__label">
                <span className="mono" style={{ fontSize: 12, color: run.counts ? "var(--text)" : "var(--faint)" }}>
                  {run.score}
                </span>
                <span className="muted" style={{ fontSize: 10 }}>
                  {!run.counts ? (run.suspicious ? "可疑" : "已忽略") : run.score === best ? "最佳" : " "}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-box">
          <span style={{ fontSize: 15, fontWeight: 500 }}>今天还没练这个场景</span>
          <span className="muted" style={{ fontSize: 13 }}>
            打开 KovaaK 打第一局，成绩会自动出现在这里。
          </span>
        </div>
      )}
    </section>
  );
}

interface PlanCardProps {
  view: TodayView;
  styles: RankStyle[];
  selected: string;
  onPick: (name: string) => void;
  onSimulate?: () => void;
}

function PlanCard({ view, styles, selected, onPick, onSimulate }: PlanCardProps) {
  return (
    <section className="card plan-card">
      <div className="card__head" style={{ padding: "0 6px 8px" }}>
        <h3 className="card__title">今日计划</h3>
        <span className="mono small muted">
          {view.totals.doneScenarios} / {view.totals.plannedScenarios}
        </span>
      </div>
      {view.scenarios.map((scenario) => {
        const style = rankStyleAt(styles, scenario.rank.index);
        const isSelected = scenario.name === selected;
        return (
          <button key={scenario.name} className={isSelected ? "plan-item is-selected" : "plan-item"} aria-pressed={isSelected} onClick={() => onPick(scenario.name)}>
            <ProgressRing fraction={scenario.countedRuns / scenario.targetRuns} color={style.ink} />
            <span className="plan-item__text">
              <span className="plan-item__name">{scenario.name}</span>
              <span className="small muted">
                {scenario.subcategory} · <span style={{ color: style.ink }}>{scenario.rank.name}</span>
              </span>
            </span>
            <span className="mono small" style={{ color: scenario.done ? "var(--accent)" : "var(--muted)" }}>
              {scenario.countedRuns}/{scenario.targetRuns}
            </span>
          </button>
        );
      })}
      {onSimulate ? (
        <button className="plan-simulate" onClick={onSimulate}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>模拟：在游戏里打完一局</span>
          <span className="muted" style={{ fontSize: 11 }}>
            真实应用里由文件监听自动完成
          </span>
        </button>
      ) : null}
    </section>
  );
}

function SuggestionCard({ scenario, styles, onPick }: { scenario: TodayScenarioView; styles: RankStyle[]; onPick: () => void }) {
  const style = rankStyleAt(styles, scenario.rank.index);
  return (
    <section className="card suggestion-card">
      <span className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--accent)" }}>
        下一步
      </span>
      <span className="display" style={{ fontSize: 18 }}>
        {scenario.name}
      </span>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#2B4A53" }}>
        今天 {scenario.countedRuns}/{scenario.targetRuns} 局，<span style={{ color: style.ink, fontWeight: 600 }}>{scenario.rank.name}</span>
        {scenario.rank.index >= 0 ? <span className="in-rank"> 段内 {fmtPercent(scenario.rank.inRank)}</span> : null}，是计划里段位最低的。
      </p>
      <button className="btn-primary" onClick={onPick}>
        切换到这个场景
      </button>
    </section>
  );
}

function FeedCard({ feed, styles }: { feed: TodayRunView[]; styles: RankStyle[] }) {
  return (
    <section className="card" style={{ gap: 4, padding: "20px 22px" }}>
      <h3 className="card__title" style={{ marginBottom: 8 }}>
        实时记录
      </h3>
      {feed.length ? (
        feed.slice(0, 7).map((run) => (
          <div key={run.key} className="feed-row">
            <span className="mono faint" style={{ fontSize: 11, width: 38, flex: "none" }}>
              {fmtClock(run.date)}
            </span>
            <span className="feed-row__dot" style={{ background: run.counts ? rankStyleAt(styles, run.rankIndex).ink : "var(--faint)" }} />
            <span className="feed-row__name">{run.scenarioName}</span>
            <span className="mono" style={{ fontSize: 13, color: run.counts ? "var(--text)" : "var(--faint)", textDecoration: run.counts ? "none" : "line-through" }}>
              {run.score}
            </span>
            <span
              className="feed-row__tag"
              style={{
                background: !run.counts ? "rgba(91, 101, 119, 0.16)" : run.isPersonalBest ? "var(--accent)" : "transparent",
                color: !run.counts ? "var(--text-2)" : "#fff",
              }}
            >
              {!run.counts ? "忽略" : run.isPersonalBest ? "PB" : ""}
            </span>
          </div>
        ))
      ) : (
        <span className="small muted">今天还没有导入成绩。</span>
      )}
    </section>
  );
}
