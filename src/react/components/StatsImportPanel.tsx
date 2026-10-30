import { useRef } from "react";

interface UnmatchedScenarioCount {
  scenario: string;
  count: number;
}

interface StatsImportPanelProps {
  csvRecordCount: number;
  matchedRecordCount: number;
  onClearCsvRecords: () => void;
  onImportCsvFileList: (files: FileList) => void;
  onSelectStatsFolder: () => void;
  statsStatus: string;
  totalRecordCount: number;
  unmatchedCounts: UnmatchedScenarioCount[];
}

export function StatsImportPanel({
  csvRecordCount,
  matchedRecordCount,
  onClearCsvRecords,
  onImportCsvFileList,
  onSelectStatsFolder,
  statsStatus,
  totalRecordCount,
  unmatchedCounts,
}: StatsImportPanelProps) {
  const csvInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="panel setup-panel">
      <div className="panel-heading">
        <h2>本地成绩</h2>
        <span>{csvRecordCount} 条 CSV</span>
      </div>
      <p className="status-line">{statsStatus}</p>
      <div className="action-row">
        <button className="primary-button" type="button" onClick={onSelectStatsFolder}>
          选择 Stats 文件夹
        </button>
        <button className="ghost-button" type="button" onClick={() => csvInputRef.current?.click()}>
          选择 CSV
        </button>
        <button className="ghost-button" type="button" onClick={onClearCsvRecords}>
          清空 CSV
        </button>
        <input
          ref={csvInputRef}
          className="hidden"
          type="file"
          accept=".csv"
          multiple
          onChange={(event) => {
            if (event.currentTarget.files) onImportCsvFileList(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      <div className="info-grid">
        <div>
          <span>已读取</span>
          <strong>{totalRecordCount}</strong>
        </div>
        <div>
          <span>匹配 Benchmark</span>
          <strong>{matchedRecordCount}</strong>
        </div>
      </div>
      {totalRecordCount && !matchedRecordCount ? (
        <div className="import-failures">
          <strong>已读取成绩，但当前难度没有匹配场景</strong>
          <p>切换 benchmark / difficulty，或检查 CSV 场景名是否对应当前清单。</p>
        </div>
      ) : null}
      {unmatchedCounts.length ? (
        <div className="unmatched-scenarios">
          <strong>未匹配 CSV 场景</strong>
          <div className="unmatched-list">
            {unmatchedCounts.slice(0, 8).map((item) => (
              <div className="unmatched-item" key={item.scenario}>
                <span>{item.scenario}</span>
                <b>{item.count}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
