import { useMemo, useState } from "react";
import { buildWeeklyReview, naturalWeekRange, previousWeekRange, weeklyReviewMarkdown, type WeekRange, type WeeklyCategorySummary } from "../../core/weeklyReview.ts";
import type { BenchmarkDifficulty, BenchmarkScenario, ScoreRecord } from "../../core/types.ts";
import { formatNumber, formatSigned } from "../format.ts";

interface WeeklyReviewPanelProps {
  currentDifficulty: BenchmarkDifficulty | undefined;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  scenarios: BenchmarkScenario[];
}

const markdownLimit = 5;

export function WeeklyReviewPanel({ currentDifficulty, recordsForScenario, scenarios }: WeeklyReviewPanelProps) {
  const defaultRange = useMemo(() => naturalWeekRange(), []);
  const [currentRange, setCurrentRange] = useState<WeekRange>(defaultRange);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");
  const previousRange = useMemo(() => previousWeekRange(currentRange), [currentRange]);
  const review = useMemo(
    () =>
      buildWeeklyReview({
        currentRange,
        previousRange,
        rankColors: currentDifficulty?.rankColors || {},
        recordsForScenario,
        scenarios,
      }),
    [currentDifficulty?.rankColors, currentRange, previousRange, recordsForScenario, scenarios],
  );
  const markdown = useMemo(() => weeklyReviewMarkdown(review, markdownLimit), [review]);
  const visibleCategories = review.weakCategories.slice(0, markdownLimit);

  async function copyMarkdown() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await promiseWithTimeout(navigator.clipboard.writeText(markdown), 900);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("fallback");
    }
  }

  return (
    <section className="panel weekly-review-panel">
      <div className="panel-heading weekly-review-heading">
        <div>
          <h2>Weekly Review</h2>
          <p className="muted">
            {currentRange.start} - {currentRange.end} · 对比 {previousRange.start} - {previousRange.end} · 自然周
          </p>
        </div>
        <div className="weekly-review-controls">
          <label className="compact-label">
            开始
            <input value={currentRange.start} type="date" onChange={(event) => setCurrentRange((range) => ({ ...range, start: event.target.value }))} />
          </label>
          <label className="compact-label">
            结束
            <input value={currentRange.end} type="date" onChange={(event) => setCurrentRange((range) => ({ ...range, end: event.target.value }))} />
          </label>
          <button className="ghost-button weekly-reset-btn" type="button" onClick={() => setCurrentRange(naturalWeekRange())}>
            回到本周
          </button>
          <button className="primary-button weekly-copy-btn" type="button" onClick={() => void copyMarkdown()}>
            {copyState === "copied" ? "已复制" : "复制 Notion Markdown"}
          </button>
        </div>
      </div>

      <div className="weekly-review-summary">
        <div>
          <strong>最弱分类</strong>
          <span>按 category / subcategory 的本周平均段位进度排序</span>
        </div>
        <b>{visibleCategories.length ? `${visibleCategories.length}/${review.weakCategories.length}` : "0"}</b>
      </div>

      {visibleCategories.length ? (
        <div className="weekly-category-list">
          {visibleCategories.map((category, index) => (
            <WeeklyCategoryRow category={category} index={index} key={category.key} />
          ))}
        </div>
      ) : (
        <div className="empty-state weekly-review-empty">
          <strong>本周还没有匹配当前 benchmark 的有效记录</strong>
          <span>导入或手动添加本周成绩后，这里会按分类显示最弱项。</span>
        </div>
      )}

      {copyState === "fallback" ? (
        <div className="weekly-markdown-fallback">
          <label>
            Clipboard 不可用，可以手动复制下面的 Markdown
            <textarea readOnly rows={8} value={markdown} onFocus={(event) => event.currentTarget.select()} />
          </label>
        </div>
      ) : null}
    </section>
  );
}

function WeeklyCategoryRow({ category, index }: { category: WeeklyCategorySummary; index: number }) {
  return (
    <div className="weekly-category-row">
      <div className="weekly-category-rank">{index + 1}</div>
      <div className="weekly-category-main">
        <div className="weekly-category-title">
          <strong>{category.label}</strong>
          <span>
            {category.trainedScenarioCount}/{category.scenarioCount} 场景有本周记录
          </span>
        </div>
        <div className="weekly-scenario-chips">
          {category.weakScenarios.map((scenario) => (
            <span className="weekly-scenario-chip" key={scenario.scenarioName} title={`${scenario.scenarioName}: ${formatNumber(scenario.avgScore)}`}>
              {scenario.scenarioName} · {formatNumber(scenario.avgScore)} · {scenario.rankName}/{formatNumber(scenario.progress)}%
            </span>
          ))}
        </div>
      </div>
      <div className="weekly-category-metrics">
        <MetricPill label="当前" value={`${formatNumber(category.currentProgressAvg)}%`} />
        <MetricPill label="上周" value={category.previousProgressAvg === null ? "-" : `${formatNumber(category.previousProgressAvg)}%`} />
        <MetricPill tone={category.delta === null ? "neutral" : category.delta >= 0 ? "positive" : "negative"} label="Δ" value={category.delta === null ? "-" : `${formatSigned(category.delta)}%`} />
      </div>
    </div>
  );
}

function MetricPill({ label, tone = "neutral", value }: { label: string; tone?: "neutral" | "positive" | "negative"; value: string }) {
  return (
    <span className={`weekly-metric-pill ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Clipboard write timed out")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
