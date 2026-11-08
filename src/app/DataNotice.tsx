import type { TrackerSnapshot } from "../data/trackerData.ts";
import { BackupImportButton } from "./BackupImport.tsx";
import { useTrackerData } from "./data.tsx";
import { routeHref } from "./router.ts";
import { useAction } from "./useAction.ts";

/** Shown on every page while the sample data is on screen, so made-up thresholds aren't read as real. */
export function SampleDataNotice({ snapshot }: { snapshot: TrackerSnapshot }) {
  if (snapshot.source !== "fixture") return null;
  return (
    <section className="data-notice data-notice--sample" role="note" aria-label="示例数据">
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 320px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>示例数据：场景、分数和段位线都是虚构的</span>
        <span className="small muted">这里不是你的成绩，也不是 benchmark 的真实段位线。</span>
      </div>
      <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center" }} href={`${window.location.pathname}${window.location.hash}`}>
        看我的数据
      </a>
    </section>
  );
}

/** Shown when something could not be saved (e.g. browser storage is full). */
export function StorageWarning({ snapshot }: { snapshot: TrackerSnapshot }) {
  if (!snapshot.storageWarning) return null;
  return (
    <section className="data-notice data-notice--warn" role="alert">
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 320px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>有数据没有保存</span>
        <span className="small muted">{snapshot.storageWarning}</span>
      </div>
      <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center" }} href={routeHref("data")}>
        去导出备份
      </a>
    </section>
  );
}

/** First-run guidance for the browser source: pick the stats folder, then sync thresholds. */
export function DataNotice({ snapshot }: { snapshot: TrackerSnapshot }) {
  const data = useTrackerData();
  const [run, busy, message] = useAction();
  if (snapshot.source === "fixture" || snapshot.loading || snapshot.restoreReport) return null;
  const noRuns = snapshot.records.length === 0;
  const noThresholds = snapshot.benchmark.scenarios.length === 0;
  if (!noRuns && !noThresholds) return null;

  const canPick = snapshot.folderAccess !== "unsupported" && data.chooseStatsFolder;
  const desktop = snapshot.source === "tauri";
  // Moving over from the browser version only makes sense before the desktop app has any runs.
  const offerBackup = desktop && noRuns && Boolean(data.importBackup);
  return (
    <section className="data-notice" role="status">
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 320px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{noThresholds ? "第一步：同步段位线" : "第二步：导入成绩"}</span>
        <span className="small muted">
          {noThresholds
            ? desktop
              ? "从 EVXL 和 KovaaK 读取 benchmark 的场景和段位线。"
              : "从 EVXL 和 KovaaK 读取 benchmark 的场景和段位线。需要用 start-dev.bat 打开的地址。"
            : canPick
              ? `选择 KovaaK 的 stats 文件夹（…\\FPSAimTrainer\\FPSAimTrainer\\stats）。${desktop ? "应用开着时，打完一局会立即导入。" : "页面开着时会自动导入新成绩。"}`
              : "这个浏览器不能直接读文件夹，请用 Chrome 或 Edge；也可以在数据页一次选中所有 CSV 文件。"}
        </span>
        {offerBackup ? (
          <span className="small muted">用过浏览器版？在浏览器版的数据页"导出备份"，再在这里导入，成绩、忽略记录、手动录入、日志和追踪列表都会搬过来。</span>
        ) : null}
        {message ? (
          <span className="small" style={{ color: message.startsWith("出错") ? "var(--negative)" : "var(--accent)" }}>
            {message}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {noThresholds && data.syncBenchmark ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => data.syncBenchmark!())}>
            {busy ? "同步中…" : "同步段位线"}
          </button>
        ) : canPick ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(() => data.chooseStatsFolder!())}>
            {busy ? "导入中…" : "选择 stats 文件夹"}
          </button>
        ) : (
          <a className="btn-primary" style={{ display: "inline-flex", alignItems: "center" }} href={routeHref("data")}>
            前往数据页
          </a>
        )}
        {offerBackup ? (
          <BackupImportButton snapshot={snapshot} label="导入浏览器版备份" busy={busy} onImport={(file) => void run(() => data.importBackup!(file))} />
        ) : null}
        <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center" }} href="?demo">
          先看示例数据
        </a>
      </div>
    </section>
  );
}
