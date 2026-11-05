import { useEffect, useMemo, useRef } from "react";
import { journalScreen, type HeatCell, type JournalBlock } from "../../domain/screens/journal.ts";
import type { MoodKey, TrackerSnapshot } from "../../data/trackerData.ts";
import { useRankStyles, useScreenInput, useSnapshot, useTrackerData } from "../../app/data.tsx";
import { navigate } from "../../app/router.ts";
import { fmtClock, fmtDayHeader, fmtScore } from "../../ui/format.ts";
import { rankStyleAt, type RankStyle } from "../../ui/rankStyle.ts";
import "./journal.css";

const MOODS: Array<[MoodKey, string, string[]]> = [
  ["sleep", "睡眠", ["好", "一般", "差"]],
  ["energy", "精力", ["充沛", "一般", "疲劳"]],
  ["warmup", "热身", ["充分", "简单", "没有"]],
];

const HEAT = ["#E8ECF2", "#C6E7EE", "#86CEDD", "#34A3BC", "#0E7490"];

function heatColor(minutes: number): string {
  if (!minutes) return HEAT[0];
  if (minutes < 30) return HEAT[1];
  if (minutes < 50) return HEAT[2];
  if (minutes < 70) return HEAT[3];
  return HEAT[4];
}

export function JournalScreen({ dayParam }: { dayParam: string | null }) {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const input = useScreenInput(snapshot);
  const styles = useRankStyles(snapshot);
  const view = useMemo(() => journalScreen({ ...input, dayKey: dayParam }), [input, dayParam]);
  const entry = snapshot.days[view.selectedDay] ?? { mood: {}, note: "" };
  const previousDay = [...view.trainingDays].reverse().find((day) => day < view.selectedDay) ?? null;
  const nextDay = view.trainingDays.find((day) => day > view.selectedDay) ?? (view.selectedDay < view.today ? view.today : null);
  const isToday = view.selectedDay === view.today;

  return (
    <>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="page-header__date">
            连续训练 {view.streak} 天 · 最近 30 天练了 {view.trainedLast30} 天
          </span>
          <h1 className="page-title page-title--cjk">训练日志</h1>
        </div>
        <div className="journal-daynav">
          <button type="button" className="journal-daynav__btn" aria-label="上一个训练日" disabled={!previousDay} onClick={() => previousDay && navigate("journal", previousDay)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, minWidth: 120, textAlign: "center" }}>{fmtDayHeader(view.selectedDay)}</span>
          <button type="button" className="journal-daynav__btn" aria-label="下一个训练日" disabled={!nextDay} onClick={() => nextDay && navigate("journal", nextDay)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <Heatmap weeks={view.weeks} selected={view.selectedDay} />

      <div className="journal-layout">
        <section className="card journal-timeline">
          <h2 className="card__title">当天经过</h2>
          {view.blocks.length ? (
            <ol className="timeline">
              <TimelineMarker time={view.firstRunAt} title="开始训练" meta="检测到第一个成绩文件" />
              {view.blocks.map((block) => (
                <TimelineBlock key={block.start} block={block} styles={styles} />
              ))}
              <TimelineMarker time={view.lastRunAt} title="结束" meta={`共 ${view.totals.minutes} 分钟`} />
            </ol>
          ) : (
            <div className="empty-box">
              <span style={{ fontSize: 15, fontWeight: 500 }}>这一天没有训练记录</span>
              <span className="muted" style={{ fontSize: 13 }}>
                在上方日历里点一个有颜色的日子查看。
              </span>
            </div>
          )}
        </section>

        <aside className="journal-aside">
          <div className="journal-totals">
            <JournalTotal
              label="训练时长"
              value={`${view.totals.minutes} 分`}
              sub={view.totals.minutesDelta === null ? "这是第一个训练日" : `比上个训练日 ${view.totals.minutesDelta >= 0 ? "+" : "−"}${Math.abs(view.totals.minutesDelta)} 分钟`}
            />
            <JournalTotal label="有效局数" value={String(view.totals.countedRuns)} sub={view.totals.ignoredRuns ? `另有 ${view.totals.ignoredRuns} 局被忽略` : "没有被忽略的局"} />
            <JournalTotal label="练过的场景" value={String(view.totals.scenarios)} sub={isToday ? `今日计划 ${snapshot.plan.length} 个` : " "} />
            <JournalTotal label="新纪录" value={String(view.totals.newPersonalBests.length)} sub={view.totals.newPersonalBests.join(" · ") || "没有"} accent={view.totals.newPersonalBests.length > 0} />
          </div>

          <section className="card" style={{ gap: 14, padding: "20px 22px" }}>
            <h2 className="card__title">状态</h2>
            {MOODS.map(([key, label, options]) => (
              <div key={key} className="journal-mood" role="group" aria-label={label}>
                <span className="small muted" style={{ width: 36 }}>
                  {label}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {options.map((option) => {
                    const on = entry.mood[key] === option;
                    return (
                      <button key={option} type="button" className="chip" aria-pressed={on} onClick={() => data.updateDay(view.selectedDay, { mood: { [key]: on ? undefined : option } })}>
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <label className="field" style={{ marginTop: 4 }}>
              <span className="field__label">笔记</span>
              <textarea className="textarea" rows={4} placeholder="今天感觉如何？哪里卡住了？" value={entry.note} onChange={(event) => data.updateDay(view.selectedDay, { note: event.target.value })} />
            </label>
          </section>

          <SetupCard snapshot={snapshot} dayKey={view.selectedDay} />
        </aside>
      </div>
    </>
  );
}

function Heatmap({ weeks, selected }: { weeks: HeatCell[][]; selected: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens the calendar scrolls; start at the most recent weeks.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  let previousMonth = "";
  return (
    <section className="card journal-heatmap" aria-label={`最近 ${weeks.length} 周训练日历`}>
      <div className="heatmap" ref={scroller}>
        <div className="heatmap__days" aria-hidden="true">
          {["一", "", "三", "", "五", "", "日"].map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        {weeks.map((week) => {
          const month = String(Number(week[0].dayKey.slice(5, 7)));
          const showMonth = month !== previousMonth;
          previousMonth = month;
          return (
            <div key={week[0].dayKey} className="heatmap__week">
              <span className="heatmap__month">{showMonth ? `${month}月` : " "}</span>
              {week.map((cell) => (
                <button
                  key={cell.dayKey}
                  type="button"
                  className={cell.dayKey === selected ? "heatmap__cell is-selected" : "heatmap__cell"}
                  disabled={cell.minutes === null}
                  style={{ background: cell.minutes === null ? "transparent" : heatColor(cell.minutes) }}
                  aria-label={`${fmtDayHeader(cell.dayKey)}，${cell.minutes === null ? "未到" : cell.minutes ? `训练 ${cell.minutes} 分钟` : "没有训练"}`}
                  onClick={() => navigate("journal", cell.dayKey)}
                />
              ))}
            </div>
          );
        })}
      </div>
      <div className="heatmap__legend small muted">
        <span>少</span>
        {HEAT.map((color) => (
          <span key={color} className="heatmap__swatch" style={{ background: color }} />
        ))}
        <span>多 · 训练分钟</span>
      </div>
    </section>
  );
}

function TimelineMarker({ time, title, meta }: { time: string | null; title: string; meta: string }) {
  return (
    <li className="timeline__item">
      <span className="timeline__time mono">{time ? fmtClock(time) : ""}</span>
      <span className="timeline__dot timeline__dot--marker" />
      <div className="timeline__body">
        <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
        <span className="small muted">{meta}</span>
      </div>
    </li>
  );
}

function TimelineBlock({ block, styles }: { block: JournalBlock; styles: RankStyle[] }) {
  const color = rankStyleAt(styles, block.rankIndex).ink;
  return (
    <li className="timeline__item">
      <span className="timeline__time mono">{fmtClock(block.start)}</span>
      <span className="timeline__dot" style={{ background: color, borderColor: color }} />
      <div className="timeline__body">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{block.scenarioName}</span>
          <span className="small muted">
            {block.category} · {block.countedRuns} 局 · 均分 {fmtScore(block.average)}
          </span>
          {block.personalBestGain !== null ? <span className="tag tag--pb">PB +{fmtScore(block.personalBestGain)}</span> : null}
          {block.suspiciousIgnored ? <span className="tag">{block.suspiciousIgnored} 局可疑 · 已忽略</span> : null}
        </div>
        <div className="timeline__scores mono">
          {block.runs.map((run, index) => (
            <span
              key={`${run.date}-${index}`}
              style={{
                color: !run.counts ? "var(--faint)" : run.isBlockBest ? color : "var(--text-2)",
                fontWeight: run.isBlockBest ? 600 : 400,
                textDecoration: run.counts ? "none" : "line-through",
              }}
            >
              {run.score}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

function JournalTotal({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="journal-total">
      <span className="small muted">{label}</span>
      <span className="display" style={{ fontSize: 22 }}>
        {value}
      </span>
      <span className="small" style={{ color: accent ? "var(--accent)" : "var(--muted)" }}>
        {sub}
      </span>
    </div>
  );
}

function SetupCard({ snapshot, dayKey }: { snapshot: TrackerSnapshot; dayKey: string }) {
  // Settings recorded in that day's CSV files, when the parser found them.
  const fromCsv = snapshot.records.find((record) => record.date.startsWith(dayKey) && record.metadata)?.metadata;
  const setup = snapshot.setup;
  const values: Array<[string, string]> = [
    ["sens", fromCsv?.sensitivity !== undefined ? String(fromCsv.sensitivity) : setup.sensitivity],
    ["DPI", fromCsv?.dpi !== undefined ? String(fromCsv.dpi) : setup.dpi],
    ["FOV", fromCsv?.fov !== undefined ? String(fromCsv.fov) : setup.fov],
  ];
  const differs =
    fromCsv !== undefined &&
    ((fromCsv.sensitivity !== undefined && String(fromCsv.sensitivity) !== setup.sensitivity) ||
      (fromCsv.dpi !== undefined && String(fromCsv.dpi) !== setup.dpi) ||
      (fromCsv.fov !== undefined && String(fromCsv.fov) !== setup.fov));
  return (
    <section className="card" style={{ gap: 10, padding: "20px 22px" }}>
      <h2 className="card__title">
        设备设置 <span className="small muted" style={{ fontWeight: 400 }}>{fromCsv ? "读自 CSV" : "默认配置"}</span>
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
        {values.map(([label, value]) => (
          <span key={label} className="mono" style={{ fontSize: 14 }}>
            <span className="muted" style={{ fontSize: 11, marginRight: 6 }}>
              {label}
            </span>
            {value || "—"}
          </span>
        ))}
      </div>
      <span className="small" style={{ color: differs ? "var(--negative)" : "var(--muted)" }}>
        {differs ? "和默认设置不同" : fromCsv ? "与默认设置一致" : "这一天的成绩文件里没有设备信息，显示的是默认配置"}
      </span>
    </section>
  );
}
