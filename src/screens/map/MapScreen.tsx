import type { StableWindow } from "../../domain/metrics.ts";
import { trainingWeekRange } from "../../domain/day.ts";
import { sameScenario } from "../../domain/scenario.ts";
import type { MapCategoryView, MapScenarioView } from "../../domain/screens/map.ts";
import { useMapView, useRankStyles, useScreenInput, useSnapshot, useTrackerData } from "../../app/data.tsx";
import { navigate } from "../../app/router.ts";
import { LegendDot, RankLadder, RankPalette } from "../../ui/RankBars.tsx";
import { deltaColor, fmtPercent, fmtScore, fmtShortDay, fmtSignedPercent } from "../../ui/format.ts";
import { rankStyleAt, type RankStyle } from "../../ui/rankStyle.ts";
import "./map.css";

const STABLE_LABEL: Record<StableWindow, string> = { last10: "近 10 局均分", last20: "近 20 局均分", week: "本周均分" };

export function MapScreen({ selectedName }: { selectedName: string | null }) {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const input = useScreenInput(snapshot);
  const styles = useRankStyles(snapshot);
  const view = useMapView(input);
  const rows = view.categories.flatMap((category) => category.subcategories.flatMap((sub) => sub.scenarios));
  const selected = rows.find((row) => selectedName && sameScenario(row.name, selectedName)) ?? view.insights.closestRankUp ?? rows[0];
  const week = trainingWeekRange(snapshot.now, snapshot.settings.dayStartHour);
  const stableLabel = STABLE_LABEL[snapshot.settings.stableWindow];
  const inPlan = (name: string) => snapshot.plan.some((item) => sameScenario(item.scenarioName, name));

  return (
    <>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="page-header__date">
            本周 · {fmtShortDay(week.start)} – {fmtShortDay(week.end)}
          </span>
          <h1 className="page-title page-title--cjk">能力地图</h1>
        </div>
        <div className="legend">
          <span className="legend__item">
            <LegendDot color="#1F74A6" />
            段位 = 个人最佳
          </span>
          <span className="legend__item">
            <LegendDot color="var(--text)" hollow />
            稳定水平 = {stableLabel}
          </span>
          <span>
            <span style={{ color: "var(--positive)" }}>+</span> / <span style={{ color: "var(--negative)" }}>−</span> 本周均分比上周
          </span>
        </div>
      </header>

      <Insights view={view} styles={styles} />

      <div className="map-layout">
        <div className="map-grid">
          {view.categories.map((category) => (
            <CategoryColumn key={category.name} category={category} styles={styles} selected={selected?.name ?? null} />
          ))}
        </div>
        {selected ? (
          <ScenarioDetail
            scenario={selected}
            styles={styles}
            stableLabel={stableLabel}
            inPlan={inPlan(selected.name)}
            onAddToPlan={() => data.addToPlan(selected.name)}
          />
        ) : null}
      </div>
    </>
  );
}

function Insights({ view, styles }: { view: ReturnType<typeof useMapView>; styles: RankStyle[] }) {
  const { weakestCategory, closestRankUp, coverage } = view.insights;
  const items: Array<{ label: string; value: string; sub: string; color: string }> = [];
  if (weakestCategory) {
    items.push({
      label: "最弱分类",
      value: weakestCategory.name,
      sub: `${weakestCategory.rank.name} 段内 ${fmtPercent(weakestCategory.rank.inRank)}`,
      color: "var(--text)",
    });
  }
  if (closestRankUp?.rank.next) {
    items.push({
      label: "离升段最近",
      value: closestRankUp.name,
      sub: `PB 再高 ${fmtScore(closestRankUp.rank.next.points)} 分升到 ${closestRankUp.rank.next.name}`,
      color: rankStyleAt(styles, closestRankUp.rank.next.index).ink,
    });
  }
  items.push({
    label: "本周覆盖",
    value: `${coverage.trained} / ${coverage.total} 个场景`,
    sub: `${coverage.total - coverage.trained} 个场景本周还没练`,
    color: "var(--text)",
  });
  return (
    <div className="map-insights">
      {items.map((item) => (
        <div key={item.label} className="map-insight">
          <span className="mono muted" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
            {item.label}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</span>
          <span className="muted" style={{ fontSize: 13 }}>
            {item.sub}
          </span>
        </div>
      ))}
    </div>
  );
}

function CategoryColumn({ category, styles, selected }: { category: MapCategoryView; styles: RankStyle[]; selected: string | null }) {
  const rankStyle = rankStyleAt(styles, category.rank.index);
  return (
    <section className="map-category">
      <div className="map-category__head">
        <div className="nav__row">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)" }}>{category.name}</h2>
          <span className="mono small" style={{ color: deltaColor(category.deltaPercent) }}>
            {category.deltaPercent === null ? "本周未练" : fmtSignedPercent(category.deltaPercent)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="display" style={{ fontSize: 22, color: rankStyle.ink }}>
            {category.rank.name}
          </span>
          <span className="mono small muted">段内 {fmtPercent(category.rank.inRank)}</span>
        </div>
        <div style={{ margin: "2px 0" }}>
          <RankPalette styles={styles} currentIndex={category.rank.index} ringGap="var(--bg)" />
        </div>
        <span className="small muted">
          {category.scenarioCount} 个场景 · 本周练了 {category.trainedCount} 个 · {category.weekRuns} 局
        </span>
      </div>
      {category.subcategories.map((sub) => (
        <div key={sub.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="mono faint" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {sub.name}
          </span>
          {sub.scenarios.map((scenario) => (
            <ScenarioRow key={scenario.name} scenario={scenario} styles={styles} selected={scenario.name === selected} />
          ))}
        </div>
      ))}
    </section>
  );
}

function ScenarioRow({ scenario, styles, selected }: { scenario: MapScenarioView; styles: RankStyle[]; selected: boolean }) {
  const rankStyle = rankStyleAt(styles, scenario.rank.index);
  const delta = scenario.trained ? scenario.week.deltaPercent : null;
  return (
    <button
      className={selected ? "map-row is-selected" : "map-row"}
      aria-pressed={selected}
      onClick={() => navigate("map", scenario.name)}
      aria-label={`${scenario.name}，${scenario.rank.name}，个人最佳 ${fmtScore(scenario.personalBest)}`}
    >
      <span className="map-row__top">
        <span className="map-row__name" style={{ color: scenario.trained ? "var(--text)" : "var(--muted)" }}>
          {scenario.name}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: rankStyle.ink, whiteSpace: "nowrap" }}>{scenario.rank.name}</span>
      </span>
      <RankLadder thresholds={scenario.thresholds} styles={styles} score={scenario.personalBest} stableProgress={scenario.stableProgress} size="sm" />
      <span className="map-row__bottom mono">
        <span>
          PB {fmtScore(scenario.personalBest)}
          {scenario.personalBest !== null ? ` · 段内 ${fmtPercent(scenario.rank.inRank)}` : ""}
        </span>
        <span style={{ display: "flex", gap: 10 }}>
          <span style={{ color: deltaColor(delta) }}>{!scenario.trained ? "本周未练" : delta === null ? "上周未练" : fmtSignedPercent(delta)}</span>
          <span>{scenario.trained ? `${scenario.week.currentRuns} 局` : ""}</span>
        </span>
      </span>
    </button>
  );
}

interface ScenarioDetailProps {
  scenario: MapScenarioView;
  styles: RankStyle[];
  stableLabel: string;
  inPlan: boolean;
  onAddToPlan: () => void;
}

function ScenarioDetail({ scenario, styles, stableLabel, inPlan, onAddToPlan }: ScenarioDetailProps) {
  const rankStyle = rankStyleAt(styles, scenario.rank.index);
  const stableIndex = scenario.stable === null ? -2 : scenario.thresholds.filter((threshold) => scenario.stable! >= threshold).length - 1;
  const stats: Array<[string, string, string]> = [
    ["个人最佳", fmtScore(scenario.personalBest), rankStyle.ink],
    [`稳定水平（${stableLabel}）`, fmtScore(scenario.stable), "var(--text)"],
    ["本周均分", fmtScore(scenario.week.current), "var(--text)"],
    ["上周均分", fmtScore(scenario.week.previous), "var(--text)"],
    ["本周局数", String(scenario.week.currentRuns), "var(--text)"],
    ["累计局数", String(scenario.totalRuns), "var(--text)"],
  ];

  return (
    <aside className="card map-detail">
      <div className="card__glow" aria-hidden="true" style={{ right: -120, top: -160, width: 380, height: 380, background: `radial-gradient(closest-side, ${rankStyle.ink}1F, rgba(255, 255, 255, 0))` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="eyebrow">
          {scenario.category} / {scenario.subcategory}
        </span>
        <h2 className="display" style={{ fontSize: 22 }}>
          {scenario.name}
        </h2>
        <span style={{ fontSize: 13, color: "var(--text-2)" }}>
          <span style={{ color: rankStyle.ink, fontWeight: 600 }}>{scenario.rank.name}</span>
          {scenario.rank.next
            ? scenario.rank.index >= 0
              ? ` · 段内 ${fmtPercent(scenario.rank.inRank)} · 再 ${fmtScore(scenario.rank.next.points)} 分升 ${scenario.rank.next.name}`
              : ` · 再 ${fmtScore(scenario.rank.next.points)} 分达到 ${scenario.rank.next.name}`
            : " · 已达最高段位"}
        </span>
      </div>

      <div className="map-detail__stats">
        {stats.map(([label, value, color]) => (
          <div key={label} className="map-detail__stat">
            <span className="muted" style={{ fontSize: 11 }}>
              {label}
            </span>
            <span className="mono" style={{ fontSize: 18, fontWeight: 500, color }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <Sparkline values={scenario.weeklyAverages} />

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="small muted" style={{ marginBottom: 6 }}>
          段位阶梯
        </span>
        {scenario.thresholds
          .map((threshold, index) => {
            const style = rankStyleAt(styles, index);
            let status = "";
            let statusColor = "var(--faint)";
            if (index === scenario.rank.index) {
              status = index === stableIndex ? "最佳 · 稳定" : "个人最佳";
              statusColor = style.ink;
            } else if (index === stableIndex) {
              status = "稳定水平";
              statusColor = "var(--text)";
            } else if (index === scenario.rank.index + 1 && scenario.personalBest !== null) {
              status = `差 ${fmtScore(threshold - scenario.personalBest)} 分`;
              statusColor = "var(--accent)";
            } else if (scenario.personalBest !== null && scenario.personalBest >= threshold) {
              status = "已达成";
            }
            return (
              <div key={`${index}-${threshold}`} className="map-ladder-row" style={{ background: index === scenario.rank.index ? `${style.fill}33` : "transparent" }}>
                <span className="legend-dot" style={{ width: 8, height: 8, background: style.fill }} />
                <span style={{ flex: 1, fontSize: 13, color: index <= scenario.rank.index + 1 ? "var(--text)" : "var(--muted)" }}>{style.name}</span>
                <span className="mono small muted">{threshold}</span>
                <span style={{ width: 72, textAlign: "right", fontSize: 11, fontWeight: 600, color: statusColor }}>{status}</span>
              </div>
            );
          })
          .reverse()}
      </div>

      <button className="btn-primary" onClick={onAddToPlan} disabled={inPlan}>
        {inPlan ? "已在今日计划里" : "加入今日计划"}
      </button>
    </aside>
  );
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const known = values.map((value, index) => ({ value, index })).filter((point): point is { value: number; index: number } => point.value !== null);
  const last = values[values.length - 1];
  if (known.length < 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="small muted">最近 6 周均分</span>
        <span className="small faint">数据不足，至少需要两周有成绩。</span>
      </div>
    );
  }
  const hi = Math.max(...known.map((point) => point.value));
  const lo = Math.min(...known.map((point) => point.value));
  const width = 260;
  const points = known.map((point) => ({ x: (point.index / (values.length - 1)) * width, y: 72 - ((point.value - lo) / (hi - lo || 1)) * 64 }));
  const end = points[points.length - 1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="small muted">最近 6 周均分</span>
      <div style={{ position: "relative", height: 80 }}>
        <svg viewBox={`0 0 ${width} 80`} width="100%" height="80" aria-hidden="true" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
          <polyline points={points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* The end dot is HTML so the stretched SVG does not squash it into an ellipse. */}
        <span aria-hidden="true" style={{ position: "absolute", left: `${(end.x / width) * 100}%`, top: end.y, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", transform: "translate(-50%, -50%)" }} />
      </div>
      <div className="mono faint" style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
        <span>5 周前</span>
        <span>本周 {fmtScore(last)}</span>
      </div>
    </div>
  );
}
