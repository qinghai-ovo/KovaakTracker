import { useEffect, useMemo, useState, type ReactNode } from "react";
import { suggestNextScenario, todayScreen, type TodayRunView, type TodayScenarioView, type TodayView } from "../../domain/screens/today.ts";
import type { StableWindow } from "../../domain/metrics.ts";
import { trainingMinutes } from "../../domain/screens/journal.ts";
import { rankIndexForScore } from "../../domain/rank.ts";
import { sameScenario } from "../../domain/scenario.ts";
import { useScreenInput, useSnapshot, useTrackerData, useRankStyles } from "../../app/data.tsx";
import { LegendDiamond, LegendDot, RankLadder } from "../../ui/RankBars.tsx";
import { fmtClock, fmtDayHeader, fmtPercent, fmtScore } from "../../ui/format.ts";
import { rankStyleAt, type RankStyle } from "../../ui/rankStyle.ts";
import "./today.css";

const USUAL_LABEL: Record<StableWindow, string> = { last10: "今天之前的近 10 局", last20: "今天之前的近 20 局", week: "今天之前的本周均分" };

function sessionMinutes(view: TodayView): number {
  return trainingMinutes(view.feed.map((run) => run.date));
}

/** Today's average against the usual level: within 1% reads as "about the same". */
function versusUsual(diff: number | null, usual: number | null): { text: string; color: string } | null {
  if (diff === null || usual === null) return null;
  if (Math.abs(diff) < Math.max(1, Math.abs(usual) * 0.01)) return { text: "和平时差不多", color: "var(--muted)" };
  const sign = diff > 0 ? "+" : "−";
  return { text: `比平时 ${sign}${fmtScore(Math.abs(diff))}`, color: diff > 0 ? "var(--positive)" : "var(--negative)" };
}

export function TodayScreen({ initialScenario }: { initialScenario: string | null }) {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const input = useScreenInput(snapshot);
  const styles = useRankStyles(snapshot);
  const view = useMemo(() => todayScreen(input), [input]);
  const [selectedName, setSelectedName] = useState<string | null>(initialScenario);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);

  const current = view.scenarios.find((scenario) => selectedName && sameScenario(scenario.name, selectedName)) ?? view.played[0] ?? suggestNextScenario(view);
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
        // Follow the game: show the scenario that was just played.
        if (scenario) setSelectedName(scenario.name);
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
            <ScenarioHero scenario={current} styles={styles} />
            <RunsCard scenario={current} styles={styles} onToggle={(run) => data.toggleRunCounted(findRecord(snapshot.records, run), run.counts)} />
          </div>
          <div className="today-grid__side">
            <RecordCard view={view} styles={styles} selected={current.name} onPick={setSelectedName} onSimulate={data.simulateRun ? () => data.simulateRun?.(current.name) : undefined} />
            {suggestion ? <SuggestionCard scenario={suggestion} styles={styles} onPick={() => setSelectedName(suggestion.name)} /> : null}
            <FeedCard feed={view.feed} styles={styles} />
          </div>
        </div>
      ) : (
        <section className="card">
          <span style={{ fontSize: 15, fontWeight: 500 }}>还没有 benchmark 场景</span>
          <span className="muted" style={{ fontSize: 13 }}>
            在设置里选择 benchmark 并同步段位线后，这里会显示今天打过的场景。
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

function bestLine(scenario: TodayScenarioView): { text: string; color: string } {
  if (scenario.todayBest === null) return { text: "今天还没练", color: "var(--muted)" };
  if (scenario.newPersonalBest) return { text: `新的个人最佳 · 比之前 +${fmtScore(scenario.personalBestGain)}`, color: "var(--accent)" };
  if (scenario.previousBest === null) return { text: "第一次打这个场景", color: "var(--muted)" };
  const gap = scenario.previousBest - scenario.todayBest;
  return gap === 0 ? { text: "追平个人最佳", color: "var(--accent)" } : { text: `离个人最佳还差 ${fmtScore(gap)}`, color: "var(--muted)" };
}

function ScenarioHero({ scenario, styles }: { scenario: TodayScenarioView; styles: RankStyle[] }) {
  const rankStyle = rankStyleAt(styles, scenario.rank.index);
  const played = scenario.todayBest !== null;
  const line = bestLine(scenario);
  const vsUsual = versusUsual(scenario.averageVsUsual, scenario.usual);
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
            {played ? "今日最佳" : "个人最佳（今天还没练）"}
          </span>
          <span className="today-hero__big">{fmtScore(played ? scenario.todayBest : scenario.personalBest)}</span>
          <span style={{ fontSize: 13, fontWeight: scenario.newPersonalBest ? 600 : 400, color: line.color }}>{line.text}</span>
        </div>
        <div className="today-compare">
          <CompareStat mark={<LegendDot color={rankStyle.ink} />} label="个人最佳" value={fmtScore(scenario.personalBest)} valueColor={rankStyle.ink} sub={<span style={{ color: rankStyle.ink }}>{scenario.rank.name}</span>} />
          <CompareStat
            mark={<LegendDiamond />}
            label="今日均分"
            value={fmtScore(scenario.todayAverage)}
            emphasis
            sub={
              played ? (
                <>
                  {vsUsual ? <span style={{ color: vsUsual.color, fontWeight: 600 }}>{vsUsual.text}</span> : null}
                  {scenario.averageOfBest !== null ? <span className="muted">个人最佳的 {fmtPercent(scenario.averageOfBest)}</span> : null}
                </>
              ) : (
                <span className="muted">今天还没练</span>
              )
            }
          />
          <CompareStat mark={<LegendDot color="var(--text)" hollow />} label="平时水平" value={fmtScore(scenario.usual)} valueColor="var(--text-2)" sub={<span className="muted">{USUAL_LABEL[scenario.usualWindow]}</span>} />
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
        <RankLadder
          thresholds={scenario.thresholds}
          styles={styles}
          score={scenario.personalBest}
          pbProgress={scenario.personalBest === null ? null : scenario.personalBestProgress}
          stableProgress={scenario.usualProgress}
          averageProgress={scenario.todayAverageProgress}
          markerColor={rankStyle.ink}
          currentIndex={scenario.rank.index}
        />
        <div className="legend">
          <span className="legend__item">
            <LegendDot color={rankStyle.ink} />
            个人最佳
          </span>
          <span className="legend__item">
            <LegendDiamond />
            今日均分
          </span>
          <span className="legend__item">
            <LegendDot color="var(--text)" hollow />
            平时水平
          </span>
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

interface CompareStatProps {
  mark: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  /** The stat the others are compared against: drawn larger. */
  emphasis?: boolean;
  sub: ReactNode;
}

function CompareStat({ mark, label, value, valueColor = "var(--text)", emphasis = false, sub }: CompareStatProps) {
  return (
    <div className={emphasis ? "today-compare__stat is-emphasis" : "today-compare__stat"}>
      <span className="today-compare__label">
        {mark}
        {label}
      </span>
      <span className="mono today-compare__value" style={{ color: valueColor }}>
        {value}
      </span>
      <span className="today-compare__sub">{sub}</span>
    </div>
  );
}

interface ChartLine {
  value: number;
  color: string;
  label: string;
  kind: "rank" | "best" | "average";
}

/** Spreads line labels apart so close lines stay readable; positions are in % of the chart height. */
function spreadLabels(positions: number[], gap: number): number[] {
  const order = positions.map((position, index) => ({ position, index })).sort((a, b) => a.position - b.position);
  const placed: number[] = [];
  order.forEach((item, rank) => {
    placed[rank] = rank === 0 ? item.position : Math.max(item.position, placed[rank - 1] + gap);
  });
  const result = new Array<number>(positions.length);
  order.forEach((item, rank) => (result[item.index] = placed[rank]));
  return result;
}

function RunsCard({ scenario, styles, onToggle }: { scenario: TodayScenarioView; styles: RankStyle[]; onToggle: (run: TodayRunView) => void }) {
  const { thresholds, runs, rank } = scenario;
  const scores = runs.map((run) => run.score);
  const counted = runs.filter((run) => run.counts).map((run) => run.score);
  const best = counted.length ? Math.max(...counted) : null;

  const lines: ChartLine[] = [];
  if (rank.next) lines.push({ value: thresholds[rank.next.index], color: rankStyleAt(styles, rank.next.index).ink, label: rank.next.name, kind: "rank" });
  if (scenario.personalBest !== null) lines.push({ value: scenario.personalBest, color: rankStyleAt(styles, rank.index).ink, label: `PB ${fmtScore(scenario.personalBest)}`, kind: "best" });
  if (scenario.todayAverage !== null) lines.push({ value: scenario.todayAverage, color: "var(--text)", label: `均 ${fmtScore(scenario.todayAverage)}`, kind: "average" });

  const lineValues = lines.map((line) => line.value);
  const top = Math.max(...lineValues, ...scores, 1) * 1.04;
  const floorCandidates = [...counted, ...lineValues].filter((score) => score > (thresholds[0] ?? 0) * 0.5);
  const bottom = Math.min(...(floorCandidates.length ? floorCandidates : [0])) * 0.9;
  const pos = (value: number) => Math.max(2, Math.min(100, ((value - bottom) / (top - bottom || 1)) * 100));
  const labelAt = spreadLabels(lines.map((line) => pos(line.value)), 10);

  return (
    <section className="card">
      <div className="card__head">
        <h3 className="card__title">今天的每一局</h3>
        <span className="small muted">点击一局可忽略或恢复 · 空心点不计入统计</span>
      </div>
      {runs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="runs-chart">
            {lines.map((line, index) => (
              <div key={line.kind} aria-hidden="true">
                <div className={`runs-chart__line runs-chart__line--${line.kind}`} style={{ bottom: `${pos(line.value)}%`, borderColor: line.color }} />
                <span className="runs-chart__line-label mono" style={{ bottom: `${labelAt[index]}%`, color: line.color, fontWeight: line.kind === "rank" ? 400 : 600 }}>
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
                  {!run.counts ? (run.suspicious ? "可疑" : "已忽略") : run.isPersonalBest ? "新纪录" : run.score === best ? "最佳" : " "}
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

interface RecordCardProps {
  view: TodayView;
  styles: RankStyle[];
  selected: string;
  onPick: (name: string) => void;
  onSimulate?: () => void;
}

/** Every scenario played today, most recent first. */
function RecordCard({ view, styles, selected, onPick, onSimulate }: RecordCardProps) {
  return (
    <section className="card record-card">
      <div className="card__head" style={{ padding: "0 6px 8px" }}>
        <h3 className="card__title">今日记录</h3>
        <span className="mono small muted">{view.totals.playedScenarios} 个场景</span>
      </div>
      {view.played.length ? (
        view.played.map((scenario) => {
          const bestStyle = rankStyleAt(styles, scenario.todayBest === null ? -1 : rankIndexForScore(scenario.todayBest, scenario.thresholds));
          const isSelected = scenario.name === selected;
          const line = bestLine(scenario);
          return (
            <button key={scenario.name} className={isSelected ? "record-item is-selected" : "record-item"} aria-pressed={isSelected} onClick={() => onPick(scenario.name)}>
              <span className="record-item__bar" style={{ background: bestStyle.ink }} aria-hidden="true" />
              <span className="record-item__text">
                <span className="record-item__name">{scenario.name}</span>
                <span className="small muted">
                  {scenario.countedRuns} 局 · <LegendDiamond /> 均 <span className="mono">{fmtScore(scenario.todayAverage)}</span>
                </span>
              </span>
              <span className="record-item__best">
                <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: bestStyle.ink }}>
                  {fmtScore(scenario.todayBest)}
                </span>
                {scenario.newPersonalBest ? (
                  <span className="record-item__pb">PB +{fmtScore(scenario.personalBestGain)}</span>
                ) : (
                  <span className="small muted" title={line.text}>
                    {scenario.previousBest !== null && scenario.todayBest !== null ? `PB ${fmtScore(scenario.previousBest)}` : " "}
                  </span>
                )}
              </span>
            </button>
          );
        })
      ) : (
        <span className="small muted" style={{ padding: "4px 6px 8px" }}>
          今天还没打 benchmark 场景。打开 KovaaK 打一局，成绩会自动出现在这里。
        </span>
      )}
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
        <span style={{ color: style.ink, fontWeight: 600 }}>{scenario.rank.name}</span>
        {scenario.rank.index >= 0 ? <span className="in-rank"> 段内 {fmtPercent(scenario.rank.inRank)}</span> : null}，
        {scenario.runs.length ? "是这个 benchmark 里段位最低的场景。" : "今天还没练，是还没练的场景里段位最低的。"}
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
