import { useCallback, useState } from "react";
import type { AppState } from "../../core/types.ts";

export type ChartRange = "month" | "week" | "recent10";

export function useTrackerSelections(initialState: AppState) {
  const [selectedBenchmark, setSelectedBenchmark] = useState(() => initialState.selectedBenchmark || "Viscose Benchmarks S2");
  const [selectedDifficulty, setSelectedDifficulty] = useState(() => initialState.selectedDifficulty || "Easier");
  const [selectedScenario, setSelectedScenario] = useState(() => initialState.selectedScenario || "all");
  const [dailyReviewDate, setDailyReviewDate] = useState(() => initialState.dailyReviewDate || "");
  const [dailyReviewMetric, setDailyReviewMetric] = useState(() => initialState.dailyReviewMetric || "avg");
  const [dailyReviewScope, setDailyReviewScope] = useState(() => initialState.dailyReviewScope || "trained");
  const [dailyReviewDateIsManual, setDailyReviewDateIsManual] = useState(() => Boolean(initialState.dailyReviewDate));
  const [chartRange, setChartRange] = useState<ChartRange>("month");

  const selectDailyReviewDate = useCallback((value: string) => {
    setDailyReviewDate(value);
    setDailyReviewDateIsManual(true);
  }, []);

  return {
    selectedBenchmark,
    setSelectedBenchmark,
    selectedDifficulty,
    setSelectedDifficulty,
    selectedScenario,
    setSelectedScenario,
    dailyReviewDate,
    setDailyReviewDate,
    dailyReviewMetric,
    setDailyReviewMetric,
    dailyReviewScope,
    setDailyReviewScope,
    dailyReviewDateIsManual,
    setDailyReviewDateIsManual,
    chartRange,
    setChartRange,
    selectDailyReviewDate,
  };
}
