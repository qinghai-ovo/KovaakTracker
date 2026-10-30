import { progressPercentForScore, rankForScore } from "./rank.ts";
import { average, localDateKey } from "./stats.ts";
import type { BenchmarkScenario, ScoreRecord } from "./types.ts";

export interface WeekRange {
  start: string;
  end: string;
}

export interface WeeklyScenarioSummary {
  scenarioName: string;
  avgScore: number | null;
  progress: number;
  rankName: string;
}

export interface WeeklyCategorySummary {
  key: string;
  label: string;
  category: string;
  subcategory: string;
  scenarioCount: number;
  trainedScenarioCount: number;
  currentProgressAvg: number;
  previousProgressAvg: number | null;
  delta: number | null;
  weakScenarios: WeeklyScenarioSummary[];
}

export interface WeeklyReview {
  currentRange: WeekRange;
  previousRange: WeekRange;
  weakCategories: WeeklyCategorySummary[];
}

export function naturalWeekRange(referenceDate: Date = new Date()): WeekRange {
  const date = new Date(referenceDate);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = shiftDate(date, mondayOffset);
  const end = shiftDate(start, 6);
  return { start: localDateKey(start), end: localDateKey(end) };
}

export function previousWeekRange(range: WeekRange): WeekRange {
  return { start: shiftDateKey(range.start, -7), end: shiftDateKey(range.end, -7) };
}

export function buildWeeklyReview({
  currentRange,
  previousRange = previousWeekRange(currentRange),
  rankColors = {},
  recordsForScenario,
  scenarios,
}: {
  currentRange: WeekRange;
  previousRange?: WeekRange;
  rankColors?: Record<string, string>;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  scenarios: BenchmarkScenario[];
}): WeeklyReview {
  const groups = new Map<string, { category: string; subcategory: string; scenarios: BenchmarkScenario[] }>();
  scenarios.forEach((scenario) => {
    const category = scenario.category || "-";
    const subcategory = scenario.subcategory || scenario.category || "-";
    const key = `${category}\u0000${subcategory}`;
    if (!groups.has(key)) groups.set(key, { category, subcategory, scenarios: [] });
    groups.get(key)?.scenarios.push(scenario);
  });

  const weakCategories = [...groups.entries()]
    .map(([key, group]) => {
      const currentScenarios = group.scenarios.map((scenario) => weeklyScenarioSummary(scenario, recordsForScenario(scenario.name), currentRange, rankColors));
      const trainedCurrentScenarios = currentScenarios.filter((item) => item.avgScore !== null);
      if (!trainedCurrentScenarios.length) return null;
      const previousScenarios = group.scenarios
        .map((scenario) => weeklyScenarioSummary(scenario, recordsForScenario(scenario.name), previousRange, rankColors))
        .filter((item) => item.avgScore !== null);
      const currentProgressAvg = average(trainedCurrentScenarios.map((item) => item.progress)) ?? 0;
      const previousProgressAvg = previousScenarios.length ? average(previousScenarios.map((item) => item.progress)) : null;

      return {
        key,
        label: `${group.category} / ${group.subcategory}`,
        category: group.category,
        subcategory: group.subcategory,
        scenarioCount: group.scenarios.length,
        trainedScenarioCount: trainedCurrentScenarios.length,
        currentProgressAvg,
        previousProgressAvg,
        delta: previousProgressAvg === null ? null : currentProgressAvg - previousProgressAvg,
        weakScenarios: [...trainedCurrentScenarios].sort((a, b) => a.progress - b.progress || a.scenarioName.localeCompare(b.scenarioName)).slice(0, 3),
      };
    })
    .filter((item): item is WeeklyCategorySummary => Boolean(item))
    .sort((a, b) => a.currentProgressAvg - b.currentProgressAvg || a.trainedScenarioCount / a.scenarioCount - b.trainedScenarioCount / b.scenarioCount || a.label.localeCompare(b.label));

  return { currentRange, previousRange, weakCategories };
}

export function weeklyReviewMarkdown(review: WeeklyReview, limit = 5): string {
  const lines = [`## Weekly Review: ${review.currentRange.start} - ${review.currentRange.end}`, "", "### 最弱分类"];
  const categories = review.weakCategories.slice(0, limit);
  if (!categories.length) {
    lines.push("", "本周还没有匹配当前 benchmark 的有效记录。");
    return lines.join("\n");
  }
  categories.forEach((category, index) => {
    const previous = category.previousProgressAvg === null ? "无上周数据" : `上周 ${formatPercent(category.previousProgressAvg)}`;
    const delta = category.delta === null ? "Δ -" : `Δ ${formatSignedPercent(category.delta)}`;
    lines.push(`${index + 1}. ${category.label} — 当前 ${formatPercent(category.currentProgressAvg)}, ${previous}, ${delta}`);
    category.weakScenarios.forEach((scenario) => {
      lines.push(`   - ${scenario.scenarioName}: ${formatScore(scenario.avgScore)}, ${scenario.rankName}/${formatPercent(scenario.progress)}`);
    });
  });
  return lines.join("\n");
}

function weeklyScenarioSummary(
  scenario: BenchmarkScenario,
  records: ScoreRecord[],
  range: WeekRange,
  rankColors: Record<string, string>,
): WeeklyScenarioSummary {
  const scores = records
    .filter((record) => isDateInRange(localDateKey(record.date), range))
    .map((record) => record.score)
    .filter((score) => Number.isFinite(score) && score > 0);
  const avgScore = average(scores);
  const progress = progressPercentForScore(avgScore, scenario.rankMaxes || []);
  const rank = rankForScore(avgScore, scenario.rankMaxes || [], rankColors);
  return { scenarioName: scenario.name, avgScore, progress, rankName: rank?.name || "-" };
}

function isDateInRange(dateKey: string, range: WeekRange): boolean {
  return Boolean(dateKey) && dateKey >= range.start && dateKey <= range.end;
}

function shiftDateKey(dateKey: string, days: number): string {
  return localDateKey(shiftDate(new Date(`${dateKey}T00:00:00`), days));
}

function shiftDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(2)).toLocaleString("zh-CN")}%`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatPercent(Math.abs(value))}`;
}

function formatScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return Number(value.toFixed(2)).toLocaleString("zh-CN");
}
