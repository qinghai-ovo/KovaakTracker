import type { TrackerSnapshot } from "../data/trackerData.ts";

/** Explains where the data comes from when the browser source has nothing usable yet. */
export function DataNotice({ snapshot }: { snapshot: TrackerSnapshot }) {
  if (snapshot.source !== "browser") return null;
  const noRuns = snapshot.records.length === 0;
  const noThresholds = snapshot.benchmark.scenarios.length === 0;
  if (!noRuns && !noThresholds) return null;
  return (
    <section className="data-notice" role="status">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{noRuns ? "这个浏览器里还没有成绩" : "还没有段位线"}</span>
        <span className="small muted">
          {noRuns
            ? "新界面读取旧界面保存的数据。先在旧界面的 Import / Data 里选择 stats 文件夹导入，并同步 benchmark；两个页面要用同一个地址打开。"
            : "旧界面还没同步 benchmark，场景和段位线是空的。在旧界面里点同步 benchmark 后回到这里。"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a className="btn-primary" style={{ display: "inline-flex", alignItems: "center" }} href="react.html">
          打开旧界面
        </a>
        <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center" }} href="?demo">
          先看示例数据
        </a>
      </div>
    </section>
  );
}
