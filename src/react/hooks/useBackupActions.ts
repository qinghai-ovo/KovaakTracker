import { useCallback, type Dispatch, type SetStateAction } from "react";
import { fromImportedState } from "../../core/selections.ts";
import { normalizeState } from "../../core/storage.ts";
import type { AppState } from "../../core/types.ts";
import { benchmarkFallback } from "../../data/benchmarkFallback.ts";
import { exportJson, readJsonFile } from "../../services/backup.ts";

export function useBackupActions({
  dailyReviewDate,
  dailyReviewDateIsManual,
  dailyReviewMetric,
  dailyReviewScope,
  selectedBenchmark,
  selectedDifficulty,
  selectedScenario,
  setDailyReviewDate,
  setDailyReviewDateIsManual,
  setDailyReviewMetric,
  setDailyReviewScope,
  setSelectedBenchmark,
  setSelectedDifficulty,
  setSelectedScenario,
  setState,
  state,
}: {
  dailyReviewDate: string;
  dailyReviewDateIsManual: boolean;
  dailyReviewMetric: string;
  dailyReviewScope: string;
  selectedBenchmark: string;
  selectedDifficulty: string;
  selectedScenario: string;
  setDailyReviewDate: Dispatch<SetStateAction<string>>;
  setDailyReviewDateIsManual: Dispatch<SetStateAction<boolean>>;
  setDailyReviewMetric: Dispatch<SetStateAction<string>>;
  setDailyReviewScope: Dispatch<SetStateAction<string>>;
  setSelectedBenchmark: Dispatch<SetStateAction<string>>;
  setSelectedDifficulty: Dispatch<SetStateAction<string>>;
  setSelectedScenario: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<AppState>>;
  state: AppState;
}) {
  const exportBackup = useCallback(() => {
    exportJson(withCurrentSelections(state, {
      selectedBenchmark,
      selectedDifficulty,
      selectedScenario,
      dailyReviewDate,
      dailyReviewDateIsManual,
      dailyReviewMetric,
      dailyReviewScope,
    }));
  }, [dailyReviewDate, dailyReviewDateIsManual, dailyReviewMetric, dailyReviewScope, selectedBenchmark, selectedDifficulty, selectedScenario, state]);

  const importBackupFile = useCallback(
    async (file: File) => {
      const imported = await readJsonFile(file);
      const nextState = normalizeState(imported as Partial<AppState>, benchmarkFallback);
      setState(nextState);
      const selections = fromImportedState(nextState, { selectedBenchmark, selectedDifficulty });
      setSelectedBenchmark(selections.selectedBenchmark);
      setSelectedDifficulty(selections.selectedDifficulty);
      setSelectedScenario(selections.selectedScenario);
      setDailyReviewDate(selections.dailyReviewDate);
      setDailyReviewMetric(selections.dailyReviewMetric);
      setDailyReviewScope(selections.dailyReviewScope);
      setDailyReviewDateIsManual(selections.dailyReviewDateIsManual);
    },
    [
      selectedBenchmark,
      selectedDifficulty,
      setDailyReviewDate,
      setDailyReviewDateIsManual,
      setDailyReviewMetric,
      setDailyReviewScope,
      setSelectedBenchmark,
      setSelectedDifficulty,
      setSelectedScenario,
      setState,
    ],
  );

  return {
    exportBackup,
    importBackupFile,
  };
}

function withCurrentSelections(
  state: AppState,
  selections: {
    selectedBenchmark: string;
    selectedDifficulty: string;
    selectedScenario: string;
    dailyReviewDate: string;
    dailyReviewDateIsManual: boolean;
    dailyReviewMetric: string;
    dailyReviewScope: string;
  },
): AppState {
  return {
    ...state,
    selectedBenchmark: selections.selectedBenchmark,
    selectedDifficulty: selections.selectedDifficulty,
    selectedScenario: selections.selectedScenario,
    dailyReviewDate: selections.dailyReviewDateIsManual ? selections.dailyReviewDate : "",
    dailyReviewMetric: selections.dailyReviewMetric,
    dailyReviewScope: selections.dailyReviewScope,
  };
}
