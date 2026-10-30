import type { RefObject } from "react";
import type { Benchmark, BenchmarkDifficulty, BenchmarkScenario } from "../../../core/types.ts";
import { BackupActions } from "../../components/BackupActions.tsx";
import { ManualRecordForm, type ManualRecordFormHandle } from "../../components/ManualRecordForm.tsx";
import { StatsImportPanel } from "../../components/StatsImportPanel.tsx";

interface UnmatchedScenarioCount {
  count: number;
  scenario: string;
}

interface ImportDataViewProps {
  benchmarks: Benchmark[];
  csvRecordCount: number;
  currentDifficulty: BenchmarkDifficulty | undefined;
  manualRecordFormRef: RefObject<ManualRecordFormHandle | null>;
  matchedRecordCount: number;
  onCancelEdit: () => void;
  onClearCsvRecords: () => void;
  onClearManualRecords: () => void;
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
  onImportCsvFileList: (files: FileList) => void;
  onRefreshDetails: () => void;
  onSaveManualRecord: (record: { scenario: string; score: number; date: Date; note: string }) => void;
  onSelectBenchmark: (value: string) => void;
  onSelectDifficulty: (value: string) => void;
  onSelectScenario: (value: string) => void;
  onSelectStatsFolder: () => void;
  onSyncBenchmark: () => void;
  scenarios: BenchmarkScenario[];
  selectedBenchmark: string;
  selectedDifficulty: string;
  selectedScenario: string;
  statsStatus: string;
  syncStatus: string;
  totalRecordCount: number;
  unmatchedCounts: UnmatchedScenarioCount[];
  editingId: string | null;
}

export function ImportDataView({
  csvRecordCount,
  editingId,
  manualRecordFormRef,
  matchedRecordCount,
  onCancelEdit,
  onClearCsvRecords,
  onClearManualRecords,
  onExportBackup,
  onImportBackupFile,
  onImportCsvFileList,
  onSaveManualRecord,
  onSelectStatsFolder,
  scenarios,
  statsStatus,
  totalRecordCount,
  unmatchedCounts,
}: ImportDataViewProps) {
  return (
    <div className="view-stack">
      <div className="view-heading">
        <div>
          <h1>Import / Data</h1>
          <p>CSV import, manual records, and local backup actions live here so the daily review stays focused.</p>
        </div>
        <BackupActions onExportBackup={onExportBackup} onImportBackupFile={onImportBackupFile} />
      </div>
      <div className="data-view-grid">
        <StatsImportPanel
          csvRecordCount={csvRecordCount}
          matchedRecordCount={matchedRecordCount}
          onClearCsvRecords={onClearCsvRecords}
          onImportCsvFileList={onImportCsvFileList}
          onSelectStatsFolder={onSelectStatsFolder}
          statsStatus={statsStatus}
          totalRecordCount={totalRecordCount}
          unmatchedCounts={unmatchedCounts}
        />
        <ManualRecordForm
          ref={manualRecordFormRef}
          editingId={editingId}
          onCancelEdit={onCancelEdit}
          onClearManualRecords={onClearManualRecords}
          onSaveManualRecord={onSaveManualRecord}
          scenarios={scenarios}
        />
      </div>
    </div>
  );
}
