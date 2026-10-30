import { normalizeScenarioName } from "./scenario.ts";
import type { Benchmark, BenchmarkScenario } from "./types.ts";

export interface BenchmarkApiScenario {
  category?: string;
  leaderboard_id?: string | number;
  leaderboardId?: string | number;
  rank_maxes?: number[];
  subcategory?: string;
}

export interface BenchmarkApiCategory {
  scenarios?: Record<string, BenchmarkApiScenario>;
  subcategories?: Record<string, BenchmarkApiCategory>;
}

export interface BenchmarkApiData {
  categories?: Record<string, BenchmarkApiCategory>;
}

export function flattenBenchmarkApiData(data: BenchmarkApiData | null | undefined): BenchmarkScenario[] {
  const scenarios: BenchmarkScenario[] = [];
  Object.entries(data?.categories || {}).forEach(([categoryName, category]) => {
    pushApiScenarios(scenarios, categoryForKovaakCategoryKey(categoryName), subcategoryForKovaakCategoryKey(categoryName), category?.scenarios);
    Object.entries(category?.subcategories || {}).forEach(([subcategoryName, subcategory]) => {
      pushApiScenarios(scenarios, normalizeCategoryName(categoryName), normalizeCategoryName(subcategoryName), subcategory?.scenarios);
    });
  });
  return scenarios;
}

export function normalizeBenchmarkCategories(benchmarks: Benchmark[]): Benchmark[] {
  return benchmarks.map((benchmark) => ({
    ...benchmark,
    difficulties: benchmark.difficulties?.map((difficulty) => ({
      ...difficulty,
      scenarios: difficulty.scenarios?.map(normalizeCachedScenarioCategory),
    })),
  }));
}

function pushApiScenarios(
  scenarios: BenchmarkScenario[],
  categoryName: string,
  subcategoryName: string,
  apiScenarios: Record<string, BenchmarkApiScenario> | undefined,
) {
  Object.entries(apiScenarios || {}).forEach(([name, item]) => {
    scenarios.push({
      name: normalizeScenarioName(name),
      category: normalizeCategoryName(item.category || categoryName),
      subcategory: normalizeCategoryName(item.subcategory || subcategoryName),
      leaderboardId: item.leaderboard_id || item.leaderboardId,
      rankMaxes: item.rank_maxes || [],
    });
  });
}

function normalizeCategoryName(value: string): string {
  return normalizeScenarioName(value);
}

function subcategoryForKovaakCategoryKey(categoryName: string): string {
  return normalizeCategoryName(categoryName);
}

function categoryForKovaakCategoryKey(categoryName: string): string {
  const normalized = normalizeCategoryName(categoryName);
  const hasTrailingSpace = /\s$/.test(categoryName);
  if (["Arm", "Wrist", "Fingertip", "Blending"].includes(normalized)) return "Control Tracking";
  if (normalized === "Control") return "Reactive Tracking";
  if (normalized === "Speed") return hasTrailingSpace ? "Flick Tech" : "Reactive Tracking";
  if (normalized === "Reading") return hasTrailingSpace ? "Click Timing" : "Reactive Tracking";
  if (normalized === "Stability") return hasTrailingSpace ? "Click Timing" : "Flick Tech";
  if (["Micro", "Post-Flick"].includes(normalized)) return "Flick Tech";
  if (normalized === "Precision") return "Click Timing";
  return normalized;
}

function normalizeCachedScenarioCategory(scenario: BenchmarkScenario): BenchmarkScenario {
  const category = scenario.category ? normalizeCategoryName(scenario.category) : "";
  const subcategory = scenario.subcategory ? normalizeCategoryName(scenario.subcategory) : category;
  if (!subcategory) return { ...scenario, category, subcategory };
  if (category && category !== subcategory) return { ...scenario, category, subcategory };
  return {
    ...scenario,
    category: categoryForCachedFlatScenario(subcategory, scenario.name),
    subcategory,
  };
}

function categoryForCachedFlatScenario(subcategory: string, scenarioName: string): string {
  const normalized = normalizeCategoryName(subcategory);
  if (["Arm", "Wrist", "Fingertip", "Blending"].includes(normalized)) return "Control Tracking";
  if (normalized === "Control") return "Reactive Tracking";
  if (normalized === "Reading") return /click|pasu|bounce/i.test(scenarioName) ? "Click Timing" : "Reactive Tracking";
  if (normalized === "Precision") return "Click Timing";
  if (["Stability", "Micro", "Post-Flick"].includes(normalized)) return "Flick Tech";
  if (normalized === "Speed") {
    return /(switch|static|reload|click|flick|1w|ww4t|vox|b180|domi|kin)/i.test(scenarioName) ? "Flick Tech" : "Reactive Tracking";
  }
  return normalized;
}

export function mergeBenchmarks(existing: Benchmark[], incoming: Benchmark[]): Benchmark[] {
  const map = new Map(existing.map((benchmark) => [benchmark.benchmarkName, benchmark]));
  incoming.forEach((benchmark) => {
    const old = map.get(benchmark.benchmarkName);
    if (old) {
      benchmark.difficulties?.forEach((difficulty) => {
        const oldDifficulty = old.difficulties?.find((item) => item.difficultyName === difficulty.difficultyName);
        if (oldDifficulty?.scenarios?.length) difficulty.scenarios = oldDifficulty.scenarios;
      });
    }
    map.set(benchmark.benchmarkName, benchmark);
  });
  return [...map.values()];
}
