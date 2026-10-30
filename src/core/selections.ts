import type { AppState, Benchmark, ScoreRecord } from "./types.ts";

export function benchmarkChanged(benchmark: Benchmark | undefined): { selectedDifficulty: string; selectedScenario: string } {
  return {
    selectedDifficulty: benchmark?.difficulties?.[0]?.difficultyName || "",
    selectedScenario: "all",
  };
}

export function difficultyChanged(): { selectedScenario: string } {
  return {
    selectedScenario: "all",
  };
}

export function fromImportedState(
  state: AppState,
  fallback: Partial<Pick<AppState, "selectedBenchmark" | "selectedDifficulty">> = {},
): Pick<AppState, "selectedBenchmark" | "selectedDifficulty" | "selectedScenario" | "dailyReviewDate" | "dailyReviewMetric" | "dailyReviewScope"> & {
  dailyReviewDateIsManual: boolean;
} {
  return {
    selectedBenchmark: state.selectedBenchmark || fallback.selectedBenchmark || "",
    selectedDifficulty: state.selectedDifficulty || fallback.selectedDifficulty || "",
    selectedScenario: state.selectedScenario || "all",
    dailyReviewDate: state.dailyReviewDate || "",
    dailyReviewMetric: state.dailyReviewMetric || "avg",
    dailyReviewScope: state.dailyReviewScope || "trained",
    dailyReviewDateIsManual: Boolean(state.dailyReviewDate),
  };
}

export function ensureSelectedScenario(selectedScenario: string, scenarioNames: string[], allRecords: ScoreRecord[]): string {
  if (selectedScenario !== "all" && !scenarioNames.includes(selectedScenario) && !allRecords.some((record) => record.scenario === selectedScenario)) {
    return "all";
  }
  return selectedScenario;
}
