import { ChevronLeft, ChevronRight, Download, FolderOpen, PanelLeftClose, PanelRightClose, RefreshCw, Upload } from "lucide-react";
import type { TrainingDateNavigation } from "../../core/dailyReview.ts";
import type { Benchmark, BenchmarkDifficulty, BenchmarkScenario } from "../../core/types.ts";
import { FloatingTooltip } from "../ui/FloatingTooltip.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";

interface TopToolbarProps {
  benchmarks: Benchmark[];
  currentDifficulty: BenchmarkDifficulty | undefined;
  dateNavigation: TrainingDateNavigation;
  dailyReviewDate: string;
  dailyReviewScope: string;
  inspectorCollapsed: boolean;
  onExportBackup: () => void;
  onImportCsvFileList: (files: FileList) => void;
  onSelectBenchmark: (value: string) => void;
  onSelectDate: (value: string) => void;
  onSelectDifficulty: (value: string) => void;
  onSelectScope: (value: string) => void;
  onSyncBenchmark: () => void;
  onToggleInspector: () => void;
  onToggleSidebar: () => void;
  scenarios: BenchmarkScenario[];
  selectedBenchmark: string;
  selectedDifficulty: string;
  sidebarCollapsed: boolean;
  syncStatus: string;
}

export function TopToolbar({
  benchmarks,
  currentDifficulty,
  dailyReviewDate,
  dailyReviewScope,
  dateNavigation,
  inspectorCollapsed,
  onExportBackup,
  onImportCsvFileList,
  onSelectBenchmark,
  onSelectDate,
  onSelectDifficulty,
  onSelectScope,
  onSyncBenchmark,
  onToggleInspector,
  onToggleSidebar,
  scenarios,
  selectedBenchmark,
  selectedDifficulty,
  sidebarCollapsed,
  syncStatus,
}: TopToolbarProps) {
  const currentBenchmark = benchmarks.find((benchmark) => benchmark.benchmarkName === selectedBenchmark);

  return (
    <header className="app-toolbar">
      <div className="toolbar-left">
        <IconButton label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggleSidebar}>
          <PanelLeftClose size={17} />
        </IconButton>
        <label className="toolbar-select">
          <span>Benchmark</span>
          <select value={selectedBenchmark} onChange={(event) => onSelectBenchmark(event.target.value)}>
            {benchmarks.map((benchmark) => (
              <option key={benchmark.benchmarkName} value={benchmark.benchmarkName}>
                {benchmark.benchmarkName}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select toolbar-select-short">
          <span>Difficulty</span>
          <select value={selectedDifficulty} onChange={(event) => onSelectDifficulty(event.target.value)}>
            {(currentBenchmark?.difficulties || []).map((difficulty) => (
              <option key={difficulty.difficultyName} value={difficulty.difficultyName}>
                {difficulty.difficultyName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar-center">
        <IconButton disabled={!dateNavigation.hasPreviousTrainingDate} label="Previous training day" onClick={() => onSelectDate(dateNavigation.previousTrainingDate)}>
          <ChevronLeft size={17} />
        </IconButton>
        <input aria-label="Daily review date" className="toolbar-date" type="date" value={dailyReviewDate} onChange={(event) => onSelectDate(event.target.value)} />
        <IconButton disabled={!dateNavigation.hasNextTrainingDate} label="Next training day" onClick={() => onSelectDate(dateNavigation.nextTrainingDate)}>
          <ChevronRight size={17} />
        </IconButton>
        <SegmentedControl
          ariaLabel="Daily review scope"
          onChange={onSelectScope}
          options={[
            { label: "Today", value: "trained" },
            { label: "Full Benchmark", value: "all" },
          ]}
          value={dailyReviewScope}
        />
      </div>

      <div className="toolbar-right">
        <span className="toolbar-status" data-tooltip={syncStatus}>
          {currentDifficulty?.scenarios?.length || scenarios.length} scenarios
        </span>
        <IconButton label="Sync benchmark" onClick={onSyncBenchmark}>
          <RefreshCw size={17} />
        </IconButton>
        <FloatingTooltip content="Import CSV">
          <label className="toolbar-file-action" aria-label="Import CSV">
            <Upload size={17} />
            <input multiple type="file" accept=".csv" onChange={(event) => event.target.files && onImportCsvFileList(event.target.files)} />
          </label>
        </FloatingTooltip>
        <IconButton label="Export backup" onClick={onExportBackup}>
          <Download size={17} />
        </IconButton>
        <IconButton label={inspectorCollapsed ? "Show inspector" : "Hide inspector"} onClick={onToggleInspector}>
          {inspectorCollapsed ? <FolderOpen size={17} /> : <PanelRightClose size={17} />}
        </IconButton>
      </div>
    </header>
  );
}
