import type { Benchmark, BenchmarkDifficulty, BenchmarkScenario } from "../../core/types.ts";

interface BenchmarkControlsProps {
  benchmarks: Benchmark[];
  currentBenchmark: Benchmark | undefined;
  currentDifficulty: BenchmarkDifficulty | undefined;
  scenarios: BenchmarkScenario[];
  selectedBenchmark: string;
  selectedDifficulty: string;
  selectedScenario: string;
  syncStatus: string;
  onSyncBenchmark: () => void;
  onRefreshDetails: () => void;
  onSelectBenchmark: (benchmarkName: string) => void;
  onSelectDifficulty: (difficultyName: string) => void;
  onSelectScenario: (scenarioName: string) => void;
}

export function BenchmarkControls({
  benchmarks,
  currentBenchmark,
  currentDifficulty,
  scenarios,
  selectedBenchmark,
  selectedDifficulty,
  selectedScenario,
  syncStatus,
  onSyncBenchmark,
  onRefreshDetails,
  onSelectBenchmark,
  onSelectDifficulty,
  onSelectScenario,
}: BenchmarkControlsProps) {
  return (
    <section className="panel setup-panel">
      <div className="panel-heading">
        <h2>Benchmark</h2>
        <span>{scenarios.length} 个场景</span>
      </div>
      <p className="status-line">{syncStatus}</p>
      <div className="action-row">
        <button className="primary-button" type="button" onClick={onSyncBenchmark}>
          同步 EVXL
        </button>
        <button className="ghost-button" type="button" onClick={onRefreshDetails}>
          刷新场景
        </button>
      </div>
      <div className="field-grid">
        <label>
          Benchmark
          <select value={selectedBenchmark} onChange={(event) => onSelectBenchmark(event.target.value)}>
            {benchmarks.map((benchmark) => (
              <option key={benchmark.benchmarkName} value={benchmark.benchmarkName}>
                {benchmark.benchmarkName}
              </option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select value={selectedDifficulty} onChange={(event) => onSelectDifficulty(event.target.value)}>
            {(currentBenchmark?.difficulties || []).map((difficulty) => (
              <option key={difficulty.difficultyName} value={difficulty.difficultyName}>
                {difficulty.difficultyName}
              </option>
            ))}
          </select>
        </label>
        <label>
          场景
          <select value={selectedScenario} onChange={(event) => onSelectScenario(event.target.value)}>
            <option value="all">全部 Benchmark 场景</option>
            {scenarios.map((scenario) => (
              <option key={scenario.name} value={scenario.name}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="info-grid">
        <div>
          <span>Sharecode</span>
          <strong>{currentDifficulty?.sharecode || "-"}</strong>
        </div>
        <div>
          <span>更新时间</span>
          <strong>{currentDifficulty?.apiUpdatedAt ? new Date(currentDifficulty.apiUpdatedAt).toLocaleString("zh-CN") : "-"}</strong>
        </div>
      </div>
    </section>
  );
}
