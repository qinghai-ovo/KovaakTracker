import { useMemo, useState, type FormEvent } from "react";
import { dataScreen, type DataRecordView, type RecordStatus, type UnmatchedScenarioView } from "../../domain/screens/data.ts";
import type { ScoreRecord } from "../../domain/types.ts";
import type { TrackerSnapshot } from "../../data/trackerData.ts";
import { BackupImportButton } from "../../app/BackupImport.tsx";
import { useRankStyles, useSnapshot, useTrackerData } from "../../app/data.tsx";
import { useAction } from "../../app/useAction.ts";
import { Segmented } from "../../ui/Controls.tsx";
import { fmtClock, fmtMonthDay, shortScenarioName, sourceLabel } from "../../ui/format.ts";
import { rankStyleAt } from "../../ui/rankStyle.ts";
import "./data.css";

type Filter = "all" | "ignored" | "manual" | "pb";
const PAGE = 50;
const DESKTOP_ONLY = "示例数据里不可用";

function folderStatus(snapshot: TrackerSnapshot): string {
  if (snapshot.source === "fixture") return snapshot.watching ? "正在监听 · 新成绩自动导入" : "未在监听";
  if (snapshot.source === "tauri") {
    if (!snapshot.statsDir) return "选择 KovaaK 的 stats 文件夹后，成绩会自动导入";
    if (snapshot.folderError) return snapshot.folderError;
    if (snapshot.watching) return "正在监听 · KovaaK 写出成绩后立即导入";
    return snapshot.preferences.autoImport ? "未在监听" : "自动导入已关闭，需手动扫描";
  }
  switch (snapshot.folderAccess) {
    case "ready":
      return snapshot.watching ? "已授权 · 每 15 秒检查一次新成绩" : snapshot.preferences.autoImport ? "已授权" : "已授权 · 自动导入已关闭，需手动扫描";
    case "needs-permission":
      return "浏览器需要重新授权读取这个文件夹";
    case "unsupported":
      return "这个浏览器不能直接读文件夹（请用 Chrome 或 Edge），可以改为选择 CSV 文件";
    default:
      return "选择 KovaaK 的 stats 文件夹后，成绩会自动导入";
  }
}

const STATUS_LOOK: Record<RecordStatus, { label: string; className: string }> = {
  ok: { label: "正常", className: "status" },
  pb: { label: "个人最佳", className: "status status--pb" },
  "suspicious-ignored": { label: "可疑 · 已忽略", className: "status status--warn" },
  "suspicious-counted": { label: "可疑 · 已计入", className: "status status--warn" },
  ignored: { label: "已忽略", className: "status status--off" },
  kept: { label: "已确认", className: "status" },
};

export function DataScreen() {
  const data = useTrackerData();
  const snapshot = useSnapshot();
  const styles = useRankStyles(snapshot);
  const view = useMemo(
    () =>
      dataScreen({
        scenarios: snapshot.benchmark.scenarios,
        rankColors: snapshot.benchmark.rankColors,
        records: snapshot.records,
        exclusions: snapshot.exclusions,
        aliases: snapshot.aliases,
        settings: snapshot.settings,
      }),
    [snapshot],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<ScoreRecord | null>(null);
  const [run, busy, message] = useAction();
  const displayName = (name: string) => (snapshot.preferences.shortNames ? shortScenarioName(name) : name);

  const filtered = view.records.filter((row) => {
    if (filter === "ignored" && row.counts) return false;
    if (filter === "manual" && row.source !== "manual") return false;
    if (filter === "pb" && row.status !== "pb") return false;
    const needle = query.trim().toLowerCase();
    return !needle || row.record.scenario.toLowerCase().includes(needle) || (row.scenarioName ?? "").toLowerCase().includes(needle);
  });

  return (
    <>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="page-header__date">
            {snapshot.loading ? "正在读取已保存的成绩…" : `共 ${view.totals.imported.toLocaleString()} 局 · 上次导入 ${snapshot.lastImportAt ?? "—"}`}
          </span>
          <h1 className="page-title page-title--cjk">数据</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <BackupImportButton snapshot={snapshot} busy={busy} onImport={(file) => void run(() => data.importBackup!(file))} />
          <button type="button" className="btn-primary" onClick={() => downloadJson(data.backup ? data.backup() : snapshotBackup(snapshot), snapshot.now)}>
            导出备份
          </button>
        </div>
      </header>

      <section className="data-source" aria-label="成绩来源">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <div className="data-source__text">
          <span className="mono" style={{ fontSize: 13, wordBreak: "break-all" }}>
            {snapshot.statsDir ?? "还没选择 stats 文件夹"}
          </span>
          <span className="small muted">
            {folderStatus(snapshot)}
            {sourceLabel(snapshot.source)}
          </span>
          {snapshot.importProgress ? (
            <span className="small" role="status" style={{ color: "var(--accent)" }}>
              正在读取成绩文件 {snapshot.importProgress.done.toLocaleString()} / {snapshot.importProgress.total.toLocaleString()}…
            </span>
          ) : message ? (
            <span className="small" role="status" style={{ color: message.startsWith("出错") ? "var(--negative)" : "var(--accent)" }}>
              {busy ? "处理中… " : ""}
              {message}
            </span>
          ) : busy ? (
            <span className="small" role="status" style={{ color: "var(--accent)" }}>
              正在读取成绩文件…
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {snapshot.folderAccess === "unsupported" && data.importCsvFiles ? (
            <label className="btn-secondary file-button" title="这个浏览器不能直接读文件夹，可以一次选中所有 CSV">
              选择 CSV 文件
              <input
                type="file"
                accept=".csv"
                multiple
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length) void run(() => data.importCsvFiles!(files));
                }}
              />
            </label>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={!data.rescanStatsFolder || !snapshot.statsDir || busy}
                title={data.rescanStatsFolder ? "只读取还没导入过的文件；按住 Shift 点击会全部重新读取" : DESKTOP_ONLY}
                onClick={(event) => void run(() => data.rescanStatsFolder!({ full: event.shiftKey }))}
              >
                {snapshot.folderAccess === "needs-permission" ? "授权并扫描" : "重新扫描"}
              </button>
              <button type="button" className="btn-primary" disabled={!data.chooseStatsFolder || busy} title={data.chooseStatsFolder ? undefined : DESKTOP_ONLY} onClick={() => void run(() => data.chooseStatsFolder!())}>
                {snapshot.statsDir ? "更换文件夹" : "选择 stats 文件夹"}
              </button>
            </>
          )}
        </div>
      </section>

      <div className="data-totals">
        <Total label="已导入" value={view.totals.imported} sub="局成绩" />
        <Total label="匹配当前 benchmark" value={view.totals.matched} sub="计入段位和统计" />
        <Total label="未匹配" value={view.totals.unmatched} sub={`${view.totals.unmatchedNames} 个场景名`} warn={view.totals.unmatched > 0} />
        <Total label="导入失败" value={snapshot.failedImports.length} sub="个文件" warn={snapshot.failedImports.length > 0} />
      </div>

      <div className="data-layout">
        <section className="card data-records">
          <div className="card__head">
            <h2 className="card__title">成绩记录</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <Segmented<Filter>
                label="筛选"
                value={filter}
                onChange={(value) => {
                  setFilter(value);
                  setLimit(PAGE);
                }}
                options={[
                  { value: "all", label: "全部" },
                  { value: "ignored", label: `已忽略 · ${view.counts.ignored}` },
                  { value: "manual", label: `手动录入 · ${view.counts.manual}` },
                  { value: "pb", label: `个人最佳 · ${view.counts.pb}` },
                ]}
              />
              <input className="input" type="search" aria-label="搜索场景" placeholder="搜索场景" value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: 180 }} />
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">场景</th>
                  <th scope="col" className="num">
                    分数
                  </th>
                  <th scope="col">段位</th>
                  <th scope="col">来源</th>
                  <th scope="col">状态</th>
                  <th scope="col">
                    <span className="visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((row) => (
                  <RecordRow
                    key={row.key}
                    row={row}
                    name={displayName(row.record.scenario)}
                    rankInk={rankStyleAt(styles, row.rankIndex).ink}
                    onToggle={() => data.toggleRunCounted(row.record, row.counts)}
                    onEdit={() => setEditing(row.record)}
                  />
                ))}
              </tbody>
            </table>
            {!filtered.length ? <p className="small muted" style={{ padding: "16px 4px" }}>没有符合条件的成绩。</p> : null}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span className="small muted">
              显示 {Math.min(limit, filtered.length)} / {filtered.length} 局
            </span>
            {filtered.length > limit ? (
              <button type="button" className="btn-link" onClick={() => setLimit(limit + PAGE)}>
                再显示 {Math.min(PAGE, filtered.length - limit)} 局
              </button>
            ) : null}
          </div>
        </section>

        <aside className="data-aside">
          <ManualRunForm key={editing?.id ?? "new"} snapshot={snapshot} editing={editing} onDone={() => setEditing(null)} />
          <UnmatchedCard items={view.unmatched} snapshot={snapshot} displayName={displayName} />
          <section className="card" style={{ gap: 10, padding: "20px 22px" }}>
            <h2 className="card__title">导入失败的文件</h2>
            {snapshot.failedImports.length ? (
              snapshot.failedImports.map((item) => (
                <div key={item.fileName} className="data-failed">
                  <span className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {item.fileName}
                  </span>
                  <span className="small" style={{ color: "var(--negative)" }}>
                    {item.reason}
                  </span>
                </div>
              ))
            ) : (
              <span className="small muted">没有失败的文件。</span>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Total({ label, value, sub, warn = false }: { label: string; value: number; sub: string; warn?: boolean }) {
  return (
    <div className="data-total">
      <span className="small muted">{label}</span>
      <span className="display" style={{ fontSize: 26, color: warn ? "var(--negative)" : "var(--text)" }}>
        {value.toLocaleString()}
      </span>
      <span className="small muted">{sub}</span>
    </div>
  );
}

function RecordRow({ row, name, rankInk, onToggle, onEdit }: { row: DataRecordView; name: string; rankInk: string; onToggle: () => void; onEdit: () => void }) {
  const look = STATUS_LOOK[row.status];
  const isZero = row.score === 0;
  return (
    <tr className={row.counts ? undefined : "is-off"}>
      <td className="mono nowrap">
        {fmtMonthDay(row.date)} {fmtClock(row.date)}
      </td>
      <td>
        <span className="data-table__name" title={row.record.note || undefined}>
          {name}
        </span>
        {row.scenarioName && row.scenarioName !== row.record.scenario ? <span className="small muted"> → {row.scenarioName}</span> : null}
      </td>
      <td className="mono num score">{row.score}</td>
      <td style={{ color: row.rankIndex >= 0 ? rankInk : "var(--faint)", fontWeight: 600, fontSize: 12 }}>{row.rankName}</td>
      <td className="small muted nowrap">{row.source === "manual" ? "手动录入" : "CSV"}</td>
      <td>
        <span className={look.className}>{isZero ? "0 分 · 已忽略" : look.label}</span>
      </td>
      <td className="nowrap" style={{ textAlign: "right" }}>
        {row.source === "manual" ? (
          <button type="button" className="btn-link" onClick={onEdit}>
            编辑
          </button>
        ) : null}
        <button type="button" className="btn-link" style={{ marginLeft: 12 }} onClick={onToggle} disabled={isZero}>
          {row.counts ? "忽略" : "恢复"}
        </button>
      </td>
    </tr>
  );
}

function ManualRunForm({ snapshot, editing, onDone }: { snapshot: TrackerSnapshot; editing: ScoreRecord | null; onDone: () => void }) {
  const data = useTrackerData();
  const scenarios = snapshot.benchmark.scenarios;
  const [scenario, setScenario] = useState(editing?.scenario ?? scenarios[0]?.name ?? "");
  const [score, setScore] = useState(editing ? String(editing.score) : "");
  const [date, setDate] = useState(toLocalInput(editing ? new Date(editing.date) : snapshot.now));
  const [note, setNote] = useState(editing?.note ?? "");
  const value = Number(score);
  const valid = Boolean(scenario) && score.trim() !== "" && Number.isFinite(value) && value >= 0 && Boolean(date);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const input = { scenario, score: value, date: `${date}:00`, note: note.trim() || undefined };
    if (editing?.id) data.updateManualRun(editing.id, input);
    else data.addManualRun(input);
    setScore("");
    setNote("");
    onDone();
  };

  return (
    <form className="card data-form" onSubmit={submit}>
      <h2 className="card__title">{editing ? "编辑手动成绩" : "手动添加成绩"}</h2>
      <label className="field">
        <span className="field__label">场景</span>
        <select className="select" value={scenario} onChange={(event) => setScenario(event.target.value)}>
          {scenarios.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      </label>
      <div className="data-form__row">
        <label className="field">
          <span className="field__label">分数</span>
          <input className="input" inputMode="numeric" placeholder="例如 2650" value={score} onChange={(event) => setScore(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">时间</span>
          <input className="input" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">备注</span>
        <input className="input" placeholder="可选" value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={!valid}>
          保存
        </button>
        {editing ? (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (editing.id) data.deleteManualRun(editing.id);
                onDone();
              }}
            >
              删除
            </button>
            <button type="button" className="btn-secondary" onClick={onDone}>
              取消
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}

function UnmatchedCard({ items, snapshot, displayName }: { items: UnmatchedScenarioView[]; snapshot: TrackerSnapshot; displayName: (name: string) => string }) {
  const data = useTrackerData();
  const [assigning, setAssigning] = useState<string | null>(null);
  const [target, setTarget] = useState(snapshot.benchmark.scenarios[0]?.name ?? "");
  return (
    <section className="card" style={{ gap: 12, padding: "20px 22px" }}>
      <div className="card__head">
        <h2 className="card__title">未匹配的场景</h2>
        <span className="small muted">这些成绩不计入段位</span>
      </div>
      {items.length ? (
        items.map((item) => (
          <div key={item.rawName} className="data-unmatched">
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 500, overflowWrap: "anywhere" }}>{displayName(item.rawName)}</span>
              <span className="small muted">
                {item.count} 局 · {item.suggestion ? `可能是 ${item.suggestion}` : "不在当前 benchmark 中"}
              </span>
            </div>
            {assigning === item.rawName ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <select className="select" aria-label="指定场景" value={target} onChange={(event) => setTarget(event.target.value)} style={{ width: 170 }}>
                  {snapshot.benchmark.scenarios.map((scenario) => (
                    <option key={scenario.name}>{scenario.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    data.confirmAlias(item.rawName, target);
                    setAssigning(null);
                  }}
                >
                  确认
                </button>
              </div>
            ) : item.suggestion ? (
              <button type="button" className="btn-primary" onClick={() => data.confirmAlias(item.rawName, item.suggestion!)}>
                确认匹配
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setAssigning(item.rawName)}>
                指定场景
              </button>
            )}
          </div>
        ))
      ) : (
        <span className="small muted">所有成绩都匹配到了当前 benchmark。</span>
      )}
    </section>
  );
}

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Backup of a source that has no backup() of its own (the sample data). */
function snapshotBackup(snapshot: TrackerSnapshot): unknown {
  return {
    app: "kovaak-tracker",
    version: 2,
    exportedAt: new Date().toISOString(),
    benchmark: { name: snapshot.benchmark.name, difficulty: snapshot.benchmark.difficulty },
    records: snapshot.records,
    exclusions: snapshot.exclusions,
    aliases: snapshot.aliases,
    plan: snapshot.plan,
    settings: snapshot.settings,
    preferences: snapshot.preferences,
    setup: snapshot.setup,
    days: snapshot.days,
  };
}

function downloadJson(value: unknown, now: Date) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `kovaak-tracker-backup-${now.toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
