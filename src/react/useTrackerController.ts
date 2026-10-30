import { useCallback, useEffect, useMemo, useState } from "react";
import { benchmarkChanged, difficultyChanged, ensureSelectedScenario } from "../core/selections.ts";
import { loadState, saveState } from "../core/storage.ts";
import { buildRecordIndex, scopedRecords } from "../core/records.ts";
import { buildRecordExclusions, effectiveRecords, excludeRecordManually, restoreRecordExclusion } from "../core/exclusions.ts";
import { normalizeDailyReviewEntry, normalizeSetupOverride, normalizeSetupProfile } from "../core/reviewInputs.ts";
import type { AppState, BenchmarkScenario, DailyReviewEntry, ScoreRecord, SetupProfile } from "../core/types.ts";
import { benchmarkFallback } from "../data/benchmarkFallback.ts";
import { useBackupActions } from "./hooks/useBackupActions.ts";
import { useBenchmarkSync } from "./hooks/useBenchmarkSync.ts";
import { useManualRecords } from "./hooks/useManualRecords.ts";
import { useStatsImport } from "./hooks/useStatsImport.ts";
import { useTrackerSelections } from "./hooks/useTrackerSelections.ts";

const STORAGE_KEY = "kovaak-benchmark-tracker-v2";

export function useTrackerController() {
  const [state, setState] = useState<AppState>(loadInitialState);
  const [syncStatus, setSyncStatus] = useState("等待同步");
  const selections = useTrackerSelections(state);

  const currentBenchmark = useMemo(
    () => state.benchmarks.find((benchmark) => benchmark.benchmarkName === selections.selectedBenchmark),
    [selections.selectedBenchmark, state.benchmarks],
  );

  const currentDifficulty = useMemo(
    () => currentBenchmark?.difficulties?.find((difficulty) => difficulty.difficultyName === selections.selectedDifficulty),
    [currentBenchmark, selections.selectedDifficulty],
  );

  const scenarios = currentDifficulty?.scenarios || [];

  const rawRecordIndex = useMemo(
    () =>
      buildRecordIndex({
        csvRecords: state.csvRecords,
        manualRecords: state.manualRecords,
        scenarios,
      }),
    [scenarios, state.csvRecords, state.manualRecords],
  );
  const effectiveCsvRecords = useMemo(() => effectiveRecords(state.csvRecords, state.recordExclusions), [state.csvRecords, state.recordExclusions]);
  const effectiveManualRecords = useMemo(() => effectiveRecords(state.manualRecords, state.recordExclusions), [state.manualRecords, state.recordExclusions]);
  const recordIndex = useMemo(
    () =>
      buildRecordIndex({
        csvRecords: effectiveCsvRecords,
        manualRecords: effectiveManualRecords,
        scenarios,
      }),
    [effectiveCsvRecords, effectiveManualRecords, scenarios],
  );

  const visibleRecords = useMemo(() => scopedRecords(recordIndex, selections.selectedScenario), [recordIndex, selections.selectedScenario]);
  const displayRecords = useMemo(() => scopedRecords(rawRecordIndex, selections.selectedScenario), [rawRecordIndex, selections.selectedScenario]);

  const { ensureBenchmarkDetails, syncFromEvxl } = useBenchmarkSync({
    currentDifficulty,
    selectedBenchmark: selections.selectedBenchmark,
    selectedDifficulty: selections.selectedDifficulty,
    setState,
    setSyncStatus,
    stateBenchmarks: state.benchmarks,
  });

  const statsImport = useStatsImport({ scenarios, setState });
  const manualRecords = useManualRecords({
    setSelectedScenario: selections.setSelectedScenario,
    setState,
  });
  const backupActions = useBackupActions({
    dailyReviewDate: selections.dailyReviewDate,
    dailyReviewDateIsManual: selections.dailyReviewDateIsManual,
    dailyReviewMetric: selections.dailyReviewMetric,
    dailyReviewScope: selections.dailyReviewScope,
    selectedBenchmark: selections.selectedBenchmark,
    selectedDifficulty: selections.selectedDifficulty,
    selectedScenario: selections.selectedScenario,
    setDailyReviewDate: selections.setDailyReviewDate,
    setDailyReviewDateIsManual: selections.setDailyReviewDateIsManual,
    setDailyReviewMetric: selections.setDailyReviewMetric,
    setDailyReviewScope: selections.setDailyReviewScope,
    setSelectedBenchmark: selections.setSelectedBenchmark,
    setSelectedDifficulty: selections.setSelectedDifficulty,
    setSelectedScenario: selections.setSelectedScenario,
    setState,
    state,
  });

  const persist = useCallback(
    (nextState: AppState = state) => {
      saveState(STORAGE_KEY, { ...nextState }, {
        selectedBenchmark: selections.selectedBenchmark,
        selectedDifficulty: selections.selectedDifficulty,
        selectedScenario: selections.selectedScenario,
        dailyReviewDate: selections.dailyReviewDate,
        dailyReviewDateIsManual: selections.dailyReviewDateIsManual,
        dailyReviewMetric: selections.dailyReviewMetric,
        dailyReviewScope: selections.dailyReviewScope,
      });
    },
    [
      selections.dailyReviewDate,
      selections.dailyReviewDateIsManual,
      selections.dailyReviewMetric,
      selections.dailyReviewScope,
      selections.selectedBenchmark,
      selections.selectedDifficulty,
      selections.selectedScenario,
      state,
    ],
  );

  useEffect(() => {
    persist();
  }, [persist]);

  useEffect(() => {
    setState((current) => {
      const nextExclusions = buildRecordExclusions([...current.csvRecords, ...current.manualRecords], current.recordExclusions);
      return JSON.stringify(nextExclusions) === JSON.stringify(current.recordExclusions) ? current : { ...current, recordExclusions: nextExclusions };
    });
  }, [state.csvRecords, state.manualRecords]);

  const syncBenchmarkNow = useCallback(async () => {
    const syncedBenchmarks = await syncFromEvxl();
    await ensureBenchmarkDetails(true, syncedBenchmarks || state.benchmarks);
    setState((current) => ({ ...current, lastBenchmarkSyncDate: todayKey() }));
  }, [ensureBenchmarkDetails, state.benchmarks, syncFromEvxl]);

  useEffect(() => {
    void statsImport.restoreSavedStatsFolder();
    if (state.lastBenchmarkSyncDate !== todayKey()) {
      void syncFromEvxl({ silent: true }).then((syncedBenchmarks) => ensureBenchmarkDetails(true, syncedBenchmarks || state.benchmarks)).finally(() => {
        setState((current) => ({ ...current, lastBenchmarkSyncDate: todayKey() }));
      });
    }
    // This bootstrap should only run once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void ensureBenchmarkDetails();
  }, [ensureBenchmarkDetails]);

  useEffect(() => {
    const benchmarks = state.benchmarks.length ? state.benchmarks : benchmarkFallback;
    const benchmark = benchmarks.find((item) => item.benchmarkName === selections.selectedBenchmark) || benchmarks[0];
    if (!benchmark) return;
    if (!state.benchmarks.length) {
      setState((current) => ({ ...current, benchmarks }));
    }
    if (benchmark.benchmarkName !== selections.selectedBenchmark) {
      selections.setSelectedBenchmark(benchmark.benchmarkName);
    }
    const difficulty = benchmark.difficulties?.find((item) => item.difficultyName === selections.selectedDifficulty) || benchmark.difficulties?.[0];
    if (difficulty && difficulty.difficultyName !== selections.selectedDifficulty) {
      selections.setSelectedDifficulty(difficulty.difficultyName);
    }
    const scenarioNames = difficulty?.scenarios?.map((scenario) => scenario.name) || [];
    const ensuredScenario = ensureSelectedScenario(selections.selectedScenario, scenarioNames, recordIndex.all);
    if (ensuredScenario !== selections.selectedScenario) {
      selections.setSelectedScenario(ensuredScenario);
    }
  }, [recordIndex.all, selections, state.benchmarks]);

  const selectBenchmark = useCallback(
    (benchmarkName: string) => {
      const benchmark = state.benchmarks.find((item) => item.benchmarkName === benchmarkName);
      const next = benchmarkChanged(benchmark);
      selections.setSelectedBenchmark(benchmarkName);
      selections.setSelectedDifficulty(next.selectedDifficulty);
      selections.setSelectedScenario(next.selectedScenario);
      selections.setDailyReviewDate("");
      selections.setDailyReviewDateIsManual(false);
      setState((current) => clearDifficultyScenarios(current, benchmarkName, next.selectedDifficulty));
    },
    [selections, state.benchmarks],
  );

  const selectDifficulty = useCallback((difficultyName: string) => {
    const next = difficultyChanged();
    selections.setSelectedDifficulty(difficultyName);
    selections.setSelectedScenario(next.selectedScenario);
    selections.setDailyReviewDate("");
    selections.setDailyReviewDateIsManual(false);
    setState((current) => clearDifficultyScenarios(current, selections.selectedBenchmark, difficultyName));
  }, [selections]);

  const selectScenario = useCallback(
    (scenarioName: string) => {
      const scenarioNames = scenarios.map((scenario: BenchmarkScenario) => scenario.name);
      selections.setSelectedScenario(ensureSelectedScenario(scenarioName, scenarioNames, recordIndex.all));
    },
    [recordIndex.all, scenarios, selections],
  );

  const updateDailyReviewTableSettings = useCallback((settings: Partial<AppState["dailyReviewTableSettings"]>) => {
    setState((current) => ({
      ...current,
      dailyReviewTableSettings: {
        ...current.dailyReviewTableSettings,
        ...settings,
      },
    }));
  }, []);

  const updateRecordExclusions = useCallback((records: ScoreRecord[], updater: (current: AppState["recordExclusions"]) => AppState["recordExclusions"]) => {
    setState((current) => ({
      ...current,
      recordExclusions: buildRecordExclusions(records, updater(current.recordExclusions)),
    }));
  }, []);

  const excludeRecord = useCallback((record: ScoreRecord, note = "") => {
    updateRecordExclusions([...state.csvRecords, ...state.manualRecords], (current) => excludeRecordManually(record, current, note));
  }, [state.csvRecords, state.manualRecords, updateRecordExclusions]);

  const restoreRecord = useCallback((record: ScoreRecord) => {
    updateRecordExclusions([...state.csvRecords, ...state.manualRecords], (current) => restoreRecordExclusion(record, current));
  }, [state.csvRecords, state.manualRecords, updateRecordExclusions]);

  const updateDailyReviewEntry = useCallback((dateKey: string, entry: Partial<DailyReviewEntry>) => {
    setState((current) => ({
      ...current,
      dailyReviews: {
        ...current.dailyReviews,
        [dateKey]: normalizeDailyReviewEntry({ ...current.dailyReviews[dateKey], ...entry }, dateKey),
      },
    }));
  }, []);

  const restoreDailyReviewAutoTime = useCallback((dateKey: string) => {
    setState((current) => {
      const currentEntry = current.dailyReviews[dateKey] || { dateKey, note: "" };
      const { trainingTimeOverride: _removed, ...rest } = currentEntry;
      return {
        ...current,
        dailyReviews: {
          ...current.dailyReviews,
          [dateKey]: normalizeDailyReviewEntry(rest, dateKey),
        },
      };
    });
  }, []);

  const updateDefaultSetupProfile = useCallback((profile: Partial<SetupProfile>) => {
    setState((current) => ({
      ...current,
      defaultSetupProfile: normalizeSetupProfile({ ...current.defaultSetupProfile, ...profile }),
    }));
  }, []);

  const updateDailySetupOverride = useCallback((dateKey: string, setupOverride: Partial<SetupProfile>) => {
    updateDailyReviewEntry(dateKey, { setupOverride: normalizeSetupOverride(setupOverride) });
  }, [updateDailyReviewEntry]);

  return {
    state,
    setState,
    selectedBenchmark: selections.selectedBenchmark,
    selectedDifficulty: selections.selectedDifficulty,
    selectedScenario: selections.selectedScenario,
    dailyReviewDate: selections.dailyReviewDate,
    dailyReviewDateIsManual: selections.dailyReviewDateIsManual,
    dailyReviewMetric: selections.dailyReviewMetric,
    dailyReviewScope: selections.dailyReviewScope,
    chartRange: selections.chartRange,
    editingId: manualRecords.editingId,
    syncStatus,
    statsStatus: statsImport.statsStatus,
    currentBenchmark,
    currentDifficulty,
    scenarios,
    recordIndex,
    rawRecordIndex,
    visibleRecords,
    displayRecords,
    persist,
    syncBenchmarkNow,
    syncFromEvxl,
    ensureBenchmarkDetails,
    restoreSavedStatsFolder: statsImport.restoreSavedStatsFolder,
    selectStatsFolder: statsImport.selectStatsFolder,
    importCsvFileList: statsImport.importCsvFileList,
    clearCsvRecords: statsImport.clearCsvRecords,
    saveManualRecord: manualRecords.saveManualRecord,
    startEditManualRecord: manualRecords.startEditManualRecord,
    cancelEditManualRecord: manualRecords.cancelEditManualRecord,
    removeManualRecord: manualRecords.removeManualRecord,
    removeAllManualRecords: manualRecords.removeAllManualRecords,
    excludeRecord,
    restoreRecord,
    updateDailyReviewEntry,
    restoreDailyReviewAutoTime,
    updateDefaultSetupProfile,
    updateDailySetupOverride,
    exportBackup: backupActions.exportBackup,
    importBackupFile: backupActions.importBackupFile,
    selectBenchmark,
    selectDifficulty,
    selectScenario,
    selectDailyReviewDate: selections.selectDailyReviewDate,
    setDailyReviewMetric: selections.setDailyReviewMetric,
    setDailyReviewScope: selections.setDailyReviewScope,
    setDailyReviewDateIsManual: selections.setDailyReviewDateIsManual,
    updateDailyReviewTableSettings,
    setChartRange: selections.setChartRange,
  };
}

function loadInitialState(): AppState {
  const loaded = loadState(STORAGE_KEY, benchmarkFallback);
  return loaded.benchmarks.length ? loaded : { ...loaded, benchmarks: benchmarkFallback };
}

function clearDifficultyScenarios(state: AppState, benchmarkName: string, difficultyName: string): AppState {
  return {
    ...state,
    benchmarks: state.benchmarks.map((benchmark) =>
      benchmark.benchmarkName !== benchmarkName
        ? benchmark
        : {
            ...benchmark,
            difficulties: (benchmark.difficulties || []).map((difficulty) =>
              difficulty.difficultyName === difficultyName ? { ...difficulty, scenarios: [], apiUpdatedAt: "" } : difficulty,
            ),
          },
    ),
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
