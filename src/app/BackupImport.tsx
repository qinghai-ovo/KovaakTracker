import type { TrackerSnapshot } from "../data/trackerData.ts";
import { useTrackerData } from "./data.tsx";
import { useAction } from "./useAction.ts";

/** What importing a backup replaces, said before it happens. */
function confirmText(snapshot: TrackerSnapshot, fileName: string): string {
  return snapshot.source === "tauri"
    ? `用 ${fileName} 替换现在的忽略记录、手动录入、计划、日志和设置？从 stats 文件夹导入的成绩会保留；导入前会自动另存一份现在的数据。`
    : `用 ${fileName} 替换当前的全部成绩和设置？建议先导出一份备份。`;
}

/** "导入备份": opens a file picker, asks before replacing data the player already has. */
export function BackupImportButton({
  snapshot,
  label = "导入备份",
  primary = false,
  busy,
  onImport,
}: {
  snapshot: TrackerSnapshot;
  label?: string;
  primary?: boolean;
  busy: boolean;
  onImport: (file: File) => void;
}) {
  const data = useTrackerData();
  const enabled = Boolean(data.importBackup) && !busy;
  const hasData = snapshot.records.length > 0 || Object.keys(snapshot.exclusions).length > 0;
  return (
    <label
      className={`${primary ? "btn-primary" : "btn-secondary"} file-button${enabled ? "" : " is-disabled"}`}
      title={data.importBackup ? "从导出的备份文件恢复" : "示例数据里不可用"}
    >
      {label}
      <input
        type="file"
        accept=".json,application/json"
        disabled={!enabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !data.importBackup) return;
          if (hasData && !window.confirm(confirmText(snapshot, file.name))) return;
          onImport(file);
        }}
      />
    </label>
  );
}

/** After a backup import: what the backup held next to what the app holds now. */
export function RestoreReportNotice({ snapshot }: { snapshot: TrackerSnapshot }) {
  const data = useTrackerData();
  const [run, busy, message] = useAction();
  const report = snapshot.restoreReport;
  if (!report) return null;
  const different = report.rows.filter((row) => row.backup !== row.now).length;
  const pickFolder = !snapshot.statsDir && data.chooseStatsFolder;
  return (
    <section className={different ? "data-notice data-notice--warn" : "data-notice"} role="status" aria-label="备份核对">
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 320px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          已导入 {report.fileName}：{different ? `${different} 项数量和备份不一样` : "数量和备份一致"}
        </span>
        <table className="restore-report__table">
          <thead>
            <tr>
              <th scope="col">项目</th>
              <th scope="col" className="num">
                备份里
              </th>
              <th scope="col" className="num">
                现在
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="num">{row.backup.toLocaleString()}</td>
                <td className={row.backup === row.now ? "num" : "num is-off"}>{row.now.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.otherRuns > 0 ? (
          <span className="small muted">另有 {report.otherRuns.toLocaleString()} 局不在备份里（之前从 stats 文件夹导入的），也都保留着。</span>
        ) : null}
        {report.copy ? (
          <span className="small muted">
            导入前的数据已另存为 <span className="mono" style={{ wordBreak: "break-all" }}>{report.copy}</span>
          </span>
        ) : null}
        {pickFolder ? <span className="small muted">还没选择 stats 文件夹：选择后，以后打完的成绩会自动导入。</span> : null}
        {message ? (
          <span className="small" style={{ color: message.startsWith("出错") ? "var(--negative)" : "var(--accent)" }}>
            {message}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pickFolder ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => data.chooseStatsFolder!())}>
            {busy ? "导入中…" : "选择 stats 文件夹"}
          </button>
        ) : null}
        <button type="button" className="btn-secondary" onClick={() => data.dismissRestoreReport?.()}>
          知道了
        </button>
      </div>
    </section>
  );
}
