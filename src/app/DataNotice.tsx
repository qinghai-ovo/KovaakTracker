import type { TrackerSnapshot } from "../data/trackerData.ts";
import { useTrackerData } from "./data.tsx";
import { routeHref } from "./router.ts";
import { useAction } from "./useAction.ts";

/** First-run guidance for the browser source: pick the stats folder, then sync thresholds. */
export function DataNotice({ snapshot }: { snapshot: TrackerSnapshot }) {
  const data = useTrackerData();
  const [run, busy, message] = useAction();
  if (snapshot.source !== "browser") return null;
  const noRuns = snapshot.records.length === 0;
  const noThresholds = snapshot.benchmark.scenarios.length === 0;
  if (!noRuns && !noThresholds) return null;

  const canPick = snapshot.folderAccess !== "unsupported" && data.chooseStatsFolder;
  return (
    <section className="data-notice" role="status">
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 320px" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{noThresholds ? "第一步：同步段位线" : "第二步：导入成绩"}</span>
        <span className="small muted">
          {noThresholds
            ? "从 EVXL 和 KovaaK 读取 benchmark 的场景和段位线。需要用 start-dev.bat 打开的地址。"
            : canPick
              ? "选择 KovaaK 的 stats 文件夹（…\\FPSAimTrainer\\FPSAimTrainer\\stats）。页面开着时会自动导入新成绩。"
              : "这个浏览器不能直接读文件夹，请用 Chrome 或 Edge；也可以在数据页一次选中所有 CSV 文件。"}
        </span>
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
        <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center" }} href="?demo">
          先看示例数据
        </a>
      </div>
    </section>
  );
}
