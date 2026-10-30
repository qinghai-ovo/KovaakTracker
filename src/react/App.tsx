import { useEffect, useMemo, useRef, useState } from "react";
import { buildDailySessionsByScenario, latestDailyReviewDate, trainingDateNavigation } from "../core/dailyReview.ts";
import { recordsForScenario, unmatchedCsvScenarioCounts } from "../core/records.ts";
import { localDateKey } from "../core/stats.ts";
import type { ScoreRecord } from "../core/types.ts";
import { AppShell } from "./app/AppShell.tsx";
import { TopToolbar } from "./app/TopToolbar.tsx";
import { ViewRouter } from "./app/ViewRouter.tsx";
import type { AppView } from "./app/appNavigation.ts";
import { readAppUrlState, writeAppUrlState } from "./app/urlState.ts";
import { ChartCanvas } from "./components/ChartCanvas.tsx";
import { MetricsPanel } from "./components/Metrics.tsx";
import { RecordsTable } from "./components/RecordsTable.tsx";
import { ScenarioCards } from "./components/ScenarioCards.tsx";
import { ManualRecordFormHandle } from "./components/ManualRecordForm.tsx";
import { DailyCommandCenter } from "./features/daily-review/DailyCommandCenter.tsx";
import { ScenarioInspector } from "./features/daily-review/ScenarioInspector.tsx";
import { TodayInspector } from "./features/daily-review/TodayInspector.tsx";
import { buildDailyReviewRows, buildDailyReviewSummary, buildScenarioInspectorModel } from "./features/daily-review/dailyReviewViewModel.ts";
import { ImportDataView } from "./features/import-data/ImportDataView.tsx";
import { SettingsView } from "./features/settings/SettingsView.tsx";
import { WeeklyFocusPanel } from "./features/weekly-focus/WeeklyFocusPanel.tsx";
import { useTrackerController } from "./useTrackerController.ts";

const UI_PREFS_KEY = "kovaak-tracker-ui-prefs-v1";

interface UiPreferences {
  activeView: AppView;
  inspectorCollapsed: boolean;
  selectedDailyScenario: string | null;
  sidebarCollapsed: boolean;
  theme: "dark" | "light" | "system";
}

const defaultUiPreferences: UiPreferences = {
  activeView: "today",
  inspectorCollapsed: false,
  selectedDailyScenario: null,
  sidebarCollapsed: false,
  theme: "dark",
};

export function App() {
  const tracker = useTrackerController();
  const [uiPreferences, setUiPreferences] = useState(loadUiPreferences);
  const manualRecordFormRef = useRef<ManualRecordFormHandle>(null);
  const selectedDailyScenario = uiPreferences.selectedDailyScenario || "";
  const selectedScenarioDetails = tracker.scenarios.find((scenario) => scenario.name === tracker.selectedScenario);
  const dailySessions = useMemo(
    () => buildDailySessionsByScenario(tracker.scenarios, (scenarioName) => recordsForScenario(tracker.recordIndex, scenarioName)),
    [tracker.recordIndex, tracker.scenarios],
  );
  const autoDailyReviewDate = latestDailyReviewDate(dailySessions) || localDateKey(new Date());
  const effectiveDailyReviewDate = tracker.dailyReviewDateIsManual && tracker.dailyReviewDate ? tracker.dailyReviewDate : autoDailyReviewDate;
  const dailyReviewDateNavigation = trainingDateNavigation(dailySessions, effectiveDailyReviewDate);
  const rankNames = Object.keys(tracker.currentDifficulty?.rankColors || {});
  const chartThresholds = selectedScenarioDetails?.rankMaxes || [];
  const unmatchedCounts = useMemo(
    () => unmatchedCsvScenarioCounts(tracker.state.csvRecords, tracker.scenarios),
    [tracker.scenarios, tracker.state.csvRecords],
  );
  const allRecords = useMemo(() => [...tracker.state.csvRecords, ...tracker.state.manualRecords], [tracker.state.csvRecords, tracker.state.manualRecords]);
  const dailyRows = useMemo(
    () =>
      buildDailyReviewRows({
        dailyReviewDate: effectiveDailyReviewDate,
        dailyReviewMetric: tracker.dailyReviewMetric,
        dailyReviewScope: tracker.dailyReviewScope,
        displayRecordsForScenario: (scenarioName) => recordsForScenario(tracker.rawRecordIndex, scenarioName),
        rankColors: tracker.currentDifficulty?.rankColors || {},
        recordsForScenario: (scenarioName) => recordsForScenario(tracker.recordIndex, scenarioName),
        scenarios: tracker.scenarios,
        sessions: dailySessions,
      }),
    [dailySessions, effectiveDailyReviewDate, tracker.currentDifficulty, tracker.dailyReviewMetric, tracker.dailyReviewScope, tracker.rawRecordIndex, tracker.recordIndex, tracker.scenarios],
  );
  const dailySummary = useMemo(
    () =>
      buildDailyReviewSummary({
        dailyReviewDate: effectiveDailyReviewDate,
        rankColors: tracker.currentDifficulty?.rankColors || {},
        rows: dailyRows,
        scenarios: tracker.scenarios,
        sessions: dailySessions,
      }),
    [dailyRows, dailySessions, effectiveDailyReviewDate, tracker.currentDifficulty, tracker.scenarios],
  );
  const selectedDailyRow = dailyRows.find((row) => row.scenarioName === selectedDailyScenario);
  const scenarioInspectorModel = buildScenarioInspectorModel({
    dailyReviewDate: effectiveDailyReviewDate,
    recordExclusions: tracker.state.recordExclusions,
    row: selectedDailyRow,
    sessions: dailySessions,
  });

  useEffect(() => {
    if (selectedDailyScenario && !selectedDailyRow) {
      updateUiPreferences({ selectedDailyScenario: null });
    }
  }, [selectedDailyRow, selectedDailyScenario]);

  useEffect(() => {
    function onPopState() {
      const urlState = readAppUrlState();
      updateUiPreferences(
        {
          activeView: urlState.view || defaultUiPreferences.activeView,
          selectedDailyScenario: urlState.selectedDailyScenario,
        },
        { urlMode: "replace" },
      );
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function updateUiPreferences(next: Partial<UiPreferences>, options: { urlMode?: "push" | "replace" } = {}) {
    setUiPreferences((current) => {
      const updated = { ...current, ...next };
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify(updated));
      if ("activeView" in next || "selectedDailyScenario" in next) {
        writeAppUrlState(
          {
            selectedDailyScenario: updated.selectedDailyScenario,
            view: updated.activeView,
          },
          options.urlMode || "replace",
        );
      }
      return updated;
    });
  }

  function startEdit(record: ScoreRecord) {
    updateUiPreferences({ activeView: "import-data" }, { urlMode: "push" });
    tracker.startEditManualRecord(record);
    requestAnimationFrame(() => manualRecordFormRef.current?.startEdit(record));
  }

  function selectDailyScenario(scenarioName: string) {
    updateUiPreferences({ activeView: "today", selectedDailyScenario: scenarioName }, { urlMode: "push" });
  }

  function clearDailyScenario() {
    updateUiPreferences({ selectedDailyScenario: null }, { urlMode: "push" });
  }

  const toolbar = (
    <TopToolbar
      benchmarks={tracker.state.benchmarks}
      currentDifficulty={tracker.currentDifficulty}
      dailyReviewDate={effectiveDailyReviewDate}
      dailyReviewScope={tracker.dailyReviewScope}
      dateNavigation={dailyReviewDateNavigation}
      inspectorCollapsed={uiPreferences.inspectorCollapsed}
      onExportBackup={tracker.exportBackup}
      onImportCsvFileList={(files) => void tracker.importCsvFileList(files)}
      onSelectBenchmark={tracker.selectBenchmark}
      onSelectDate={tracker.selectDailyReviewDate}
      onSelectDifficulty={tracker.selectDifficulty}
      onSelectScope={tracker.setDailyReviewScope}
      onSyncBenchmark={() => void tracker.syncBenchmarkNow()}
      onToggleInspector={() => updateUiPreferences({ inspectorCollapsed: !uiPreferences.inspectorCollapsed })}
      onToggleSidebar={() => updateUiPreferences({ sidebarCollapsed: !uiPreferences.sidebarCollapsed })}
      scenarios={tracker.scenarios}
      selectedBenchmark={tracker.selectedBenchmark}
      selectedDifficulty={tracker.selectedDifficulty}
      sidebarCollapsed={uiPreferences.sidebarCollapsed}
      syncStatus={tracker.syncStatus}
    />
  );

  const inspector =
    selectedDailyScenario && scenarioInspectorModel ? (
      <ScenarioInspector
        dailyReviewDate={effectiveDailyReviewDate}
        model={scenarioInspectorModel}
        onBack={clearDailyScenario}
        onExcludeRecord={tracker.excludeRecord}
        onRestoreRecord={tracker.restoreRecord}
      />
    ) : (
      <TodayInspector
        dailyReview={tracker.state.dailyReviews[effectiveDailyReviewDate]}
        dateKey={effectiveDailyReviewDate}
        defaultSetupProfile={tracker.state.defaultSetupProfile}
        focusHint={dailySummary.focusHint}
        onRestoreAutoTime={tracker.restoreDailyReviewAutoTime}
        onUpdateDailyReview={tracker.updateDailyReviewEntry}
        onUpdateDailySetupOverride={tracker.updateDailySetupOverride}
        recordExclusions={tracker.state.recordExclusions}
        records={allRecords}
      />
    );

  return (
    <AppShell
      activeView={uiPreferences.activeView}
      inspector={inspector}
      inspectorCollapsed={uiPreferences.inspectorCollapsed}
      onChangeView={(view) => updateUiPreferences({ activeView: view }, { urlMode: "push" })}
      onToggleSidebar={() => updateUiPreferences({ sidebarCollapsed: !uiPreferences.sidebarCollapsed })}
      sidebarCollapsed={uiPreferences.sidebarCollapsed}
      theme={uiPreferences.theme}
      toolbar={toolbar}
    >
      <ViewRouter
        activeView={uiPreferences.activeView}
        dailyReview={
          <div className="view-stack">
            <DailyCommandCenter
              allRecords={allRecords}
              currentDifficulty={tracker.currentDifficulty}
              dailyReviewDate={effectiveDailyReviewDate}
              dailyReviewMetric={tracker.dailyReviewMetric}
              dailyReviewScope={tracker.dailyReviewScope}
              displayRecordsForScenario={(scenarioName) => recordsForScenario(tracker.rawRecordIndex, scenarioName)}
              onClearSelectedScenario={clearDailyScenario}
              onSelectMetric={tracker.setDailyReviewMetric}
              onSelectScenario={selectDailyScenario}
              recordExclusions={tracker.state.recordExclusions}
              recordsForScenario={(scenarioName) => recordsForScenario(tracker.recordIndex, scenarioName)}
              scenarios={tracker.scenarios}
              selectedScenarioName={selectedDailyScenario}
              sessions={dailySessions}
              tableSettings={tracker.state.dailyReviewTableSettings}
            />
            <WeeklyFocusPanel
              currentDifficulty={tracker.currentDifficulty}
              recordsForScenario={(scenarioName) => recordsForScenario(tracker.recordIndex, scenarioName)}
              scenarios={tracker.scenarios}
            />
          </div>
        }
        importData={
          <ImportDataView
            benchmarks={tracker.state.benchmarks}
            csvRecordCount={tracker.state.csvRecords.length}
            currentDifficulty={tracker.currentDifficulty}
            editingId={tracker.editingId}
            manualRecordFormRef={manualRecordFormRef}
            matchedRecordCount={tracker.recordIndex.matched.length}
            onCancelEdit={tracker.cancelEditManualRecord}
            onClearCsvRecords={tracker.clearCsvRecords}
            onClearManualRecords={tracker.removeAllManualRecords}
            onExportBackup={tracker.exportBackup}
            onImportBackupFile={(file) => void tracker.importBackupFile(file)}
            onImportCsvFileList={(files) => void tracker.importCsvFileList(files)}
            onRefreshDetails={() => void tracker.ensureBenchmarkDetails(true)}
            onSaveManualRecord={tracker.saveManualRecord}
            onSelectBenchmark={tracker.selectBenchmark}
            onSelectDifficulty={tracker.selectDifficulty}
            onSelectScenario={tracker.selectScenario}
            onSelectStatsFolder={() => void tracker.selectStatsFolder()}
            onSyncBenchmark={() => void tracker.syncBenchmarkNow()}
            scenarios={tracker.scenarios}
            selectedBenchmark={tracker.selectedBenchmark}
            selectedDifficulty={tracker.selectedDifficulty}
            selectedScenario={tracker.selectedScenario}
            statsStatus={tracker.statsStatus}
            syncStatus={tracker.syncStatus}
            totalRecordCount={tracker.recordIndex.all.length}
            unmatchedCounts={unmatchedCounts}
          />
        }
        records={
          <div className="records-view-grid">
            <div className="view-heading">
              <div>
                <h1>Records</h1>
                <p>Recent runs and manual record edits.</p>
              </div>
            </div>
            <RecordsTable
              records={tracker.displayRecords.slice(0, 100)}
              onEditManualRecord={startEdit}
              onExcludeRecord={tracker.excludeRecord}
              onRemoveManualRecord={tracker.removeManualRecord}
              onRestoreRecord={tracker.restoreRecord}
              recordExclusions={tracker.state.recordExclusions}
            />
          </div>
        }
        scenarios={
          <div className="view-stack">
            <div className="view-heading">
              <div>
                <h1>Scenarios</h1>
                <p>Scenario cards, rank trend, and benchmark-specific performance details.</p>
              </div>
            </div>
            <div className="scenario-view-grid">
              <MetricsPanel
                currentDifficulty={tracker.currentDifficulty}
                selectedScenario={tracker.selectedScenario}
                selectedScenarioDetails={selectedScenarioDetails}
                sessions={selectedScenarioDetails ? dailySessions.get(selectedScenarioDetails.name) || [] : []}
                visibleRecords={tracker.visibleRecords}
              />
              <ChartCanvas
                onSelectRange={tracker.setChartRange}
                range={tracker.chartRange}
                rankNames={rankNames}
                records={tracker.visibleRecords}
                thresholds={chartThresholds}
              />
              <ScenarioCards
                currentDifficulty={tracker.currentDifficulty}
                onSelectScenario={tracker.selectScenario}
                recordIndex={tracker.recordIndex}
                scenarios={tracker.scenarios}
              />
            </div>
          </div>
        }
        settings={
          <SettingsView
            defaultSetupProfile={tracker.state.defaultSetupProfile}
            onUpdateDefaultSetupProfile={tracker.updateDefaultSetupProfile}
            onUpdateTableSettings={tracker.updateDailyReviewTableSettings}
            onUpdateTheme={(theme) => updateUiPreferences({ theme })}
            tableSettings={tracker.state.dailyReviewTableSettings}
            theme={uiPreferences.theme}
          />
        }
        weeklyReview={<WeeklyFocusPanel currentDifficulty={tracker.currentDifficulty} recordsForScenario={(scenarioName) => recordsForScenario(tracker.recordIndex, scenarioName)} scenarios={tracker.scenarios} />}
      />
    </AppShell>
  );
}

function loadUiPreferences(): UiPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "{}") as Partial<UiPreferences>;
    const urlState = readAppUrlState();
    const preferences = {
      ...defaultUiPreferences,
      ...parsed,
      ...(urlState.view ? { activeView: urlState.view } : {}),
      ...(urlState.selectedDailyScenario ? { activeView: "today" as AppView, selectedDailyScenario: urlState.selectedDailyScenario } : {}),
    };
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(preferences));
    return preferences;
  } catch {
    return defaultUiPreferences;
  }
}
