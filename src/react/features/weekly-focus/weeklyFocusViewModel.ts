import { buildWeeklyReview, naturalWeekRange, previousWeekRange } from "../../../core/weeklyReview.ts";
import { average, localDateKey } from "../../../core/stats.ts";
import type { BenchmarkDifficulty, BenchmarkScenario, ScoreRecord } from "../../../core/types.ts";
import { formatNumber, formatSigned } from "../../format.ts";

export interface WeeklyFocusItem {
  detail: string;
  label: string;
  tone: "positive" | "negative" | "neutral";
  value: string;
}

export interface WeeklyFocusModel {
  items: WeeklyFocusItem[];
  rangeLabel: string;
}

interface RankUpCandidate {
  category: string;
  delta: number;
  rankName: string;
  scenarioName: string;
}

export function buildWeeklyFocusModel({
  currentDifficulty,
  recordsForScenario,
  scenarios,
}: {
  currentDifficulty: BenchmarkDifficulty | undefined;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  scenarios: BenchmarkScenario[];
}): WeeklyFocusModel {
  const currentRange = naturalWeekRange();
  const previousRange = previousWeekRange(currentRange);
  const review = buildWeeklyReview({
    currentRange,
    previousRange,
    rankColors: currentDifficulty?.rankColors || {},
    recordsForScenario,
    scenarios,
  });
  const categories = review.weakCategories;
  const weakestCategory = categories[0];
  const weakestScenario = categories.flatMap((category) => category.weakScenarios.map((scenario) => ({ category, scenario }))).sort((a, b) => a.scenario.progress - b.scenario.progress)[0];
  const biggestRegression = categories
    .filter((category) => category.delta !== null)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const closestRankUp = closestRankUpCandidate({
    currentRange,
    rankColors: currentDifficulty?.rankColors || {},
    recordsForScenario,
    scenarios,
  });
  const volatility = categories
    .filter((category) => category.delta !== null)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0];

  return {
    rangeLabel: `${currentRange.start} - ${currentRange.end}`,
    items: [
      {
        detail: weakestCategory ? `${weakestCategory.trainedScenarioCount}/${weakestCategory.scenarioCount} scenarios trained` : "Collect more records this week",
        label: "Weakest Category",
        tone: "negative",
        value: weakestCategory ? weakestCategory.label : "-",
      },
      {
        detail: weakestScenario ? `${weakestScenario.category.label} · ${formatNumber(weakestScenario.scenario.avgScore)}` : "No scenario focus yet",
        label: "Weakest Scenario",
        tone: "negative",
        value: weakestScenario ? weakestScenario.scenario.scenarioName : "-",
      },
      {
        detail: biggestRegression?.delta === null || !biggestRegression ? "No previous-week comparison" : `${formatSigned(biggestRegression.delta)}% vs previous week`,
        label: "Biggest Regression",
        tone: biggestRegression?.delta !== null && (biggestRegression?.delta ?? 0) < 0 ? "negative" : "neutral",
        value: biggestRegression ? biggestRegression.label : "-",
      },
      {
        detail: closestRankUp ? `${formatNumber(closestRankUp.delta)} to ${closestRankUp.rankName} · ${closestRankUp.category}` : "No rank-up candidate yet",
        label: "Closest Rank-Up",
        tone: "positive",
        value: closestRankUp ? closestRankUp.scenarioName : "-",
      },
      {
        detail: volatility?.delta === null || !volatility ? "Need one more comparable week" : `${formatSigned(volatility.delta)}% weekly movement`,
        label: "Stability Signal",
        tone: volatility?.delta !== null && Math.abs(volatility?.delta ?? 0) > 10 ? "negative" : "neutral",
        value: volatility ? volatility.label : "-",
      },
    ],
  };
}

function closestRankUpCandidate({
  currentRange,
  rankColors,
  recordsForScenario,
  scenarios,
}: {
  currentRange: { start: string; end: string };
  rankColors: Record<string, string>;
  recordsForScenario: (scenarioName: string) => ScoreRecord[];
  scenarios: BenchmarkScenario[];
}): RankUpCandidate | null {
  const rankNames = Object.keys(rankColors);
  const candidates = scenarios
    .map((scenario) => {
      const avgScore = average(
        recordsForScenario(scenario.name)
          .filter((record) => {
            const dateKey = localDateKey(record.date);
            return dateKey >= currentRange.start && dateKey <= currentRange.end;
          })
          .map((record) => record.score)
          .filter((score) => Number.isFinite(score) && score > 0),
      );
      if (avgScore === null) return null;
      const nextIndex = (scenario.rankMaxes || []).findIndex((threshold) => threshold > avgScore);
      if (nextIndex < 0) return null;
      return {
        category: [scenario.category, scenario.subcategory].filter(Boolean).join(" / ") || "General",
        delta: (scenario.rankMaxes || [])[nextIndex] - avgScore,
        rankName: rankNames[nextIndex] || `Rank ${nextIndex + 1}`,
        scenarioName: scenario.name,
      };
    })
    .filter((candidate): candidate is RankUpCandidate => Boolean(candidate))
    .sort((a, b) => a.delta - b.delta || a.scenarioName.localeCompare(b.scenarioName));
  return candidates[0] || null;
}
