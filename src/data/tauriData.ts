// The desktop app's data source: everything lives in the SQLite database behind Tauri commands
// (src-tauri/src/commands.rs); the Rust importer reads the stats folder and reports new runs
// through events. Screens get the same snapshot as from the browser source.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { toggleRecordCounted } from "../domain/exclusions.ts";
import { sameScenario } from "../domain/scenario.ts";
import type { AppState, RecordExclusion, ScoreRecord } from "../domain/types.ts";
import type { StorageLike } from "../services/storage.ts";
import { backupOf } from "./browserData.ts";
import { failureText } from "./importLogic.ts";
import {
  activeRef,
  APP_STORAGE_KEY,
  followedInOrder,
  followedWith,
  followedWithout,
  LEGACY_STORAGE_KEY,
  snapshotFromLegacy,
  trackedRefs,
  withDayNote,
  type AppStore,
  type TrackedRef,
} from "./legacyState.ts";
import { syncThresholds } from "./thresholdSync.ts";
import {
  benchmarksFromRows,
  overrideFromExclusion,
  restoreFromBackup,
  rowsFromBenchmarks,
  runFromRecord,
  recordFromRun,
  SETTING,
  settingRows,
  stateFromData,
  trackedRows,
  type AppData,
  type StoredRun,
} from "./tauriRows.ts";
import { trackedId, type FailedImport, type ManualRunInput, type TrackerData, type TrackerEvent, type TrackerSnapshot } from "./trackerData.ts";

/** Where the interim desktop app (before the database) remembered the stats folder. */
export const DESKTOP_STATS_DIR_KEY = "kovaak-tracker-desktop-stats-dir";
/** Set once the webview's own storage has been checked for data to move into the database. */
const WEBVIEW_MIGRATED = "migration.webviewStorage";

/** The Tauri APIs this source uses; replaced by a fake in tests. */
export interface TauriBackend {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  pickDirectory(defaultPath?: string): Promise<string | null>;
  fetch: typeof fetch;
}

const tauriBackend: TauriBackend = {
  invoke: (command, args) => invoke(command, args),
  listen: (event, handler) => listen(event, (message) => handler(message.payload as never)),
  async pickDirectory(defaultPath) {
    const picked = await open({ directory: true, multiple: false, title: "选择 KovaaK 的 stats 文件夹", defaultPath });
    return typeof picked === "string" ? picked : null;
  },
  fetch: tauriFetch as typeof fetch,
};

/** What the importer reports after a pass (`ImportSummary` in Rust). */
interface ImportSummary {
  files: number;
  read: number;
  added: number;
  failed: Array<{ fileName: string; reason: string }>;
}

interface WatcherStatus {
  dir: string | null;
  watching: boolean;
  error: string | null;
}

interface ImportStatus extends WatcherStatus {
  runs: number;
  failed: Array<{ fileName: string; reason: string }>;
}

/** Rust gives a parser code, or `read-error: <details>`. */
const failedImport = ({ fileName, reason }: { fileName: string; reason: string }): FailedImport => ({
  fileName,
  reason: reason.startsWith("read-error") ? `${failureText("read-error")}${reason.slice("read-error".length)}` : failureText(reason),
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function importSummaryMessage(summary: ImportSummary, dir: string): string {
  if (!summary.read) return `${dir} · 没有新的成绩文件`;
  const failed = summary.failed.length;
  return `${dir} · 读取 ${summary.read} 个文件 · 新增 ${summary.added} 局${failed ? ` · ${failed} 个失败` : ""}`;
}

interface TauriDataOptions {
  backend?: TauriBackend;
  clock?: () => Date;
  /** The webview's own storage, checked once for data saved before the database existed. */
  webviewStorage?: StorageLike | null;
  /** Re-render when the day changes; off in tests. */
  tick?: boolean;
}

export function createTauriData({
  backend = tauriBackend,
  clock = () => new Date(),
  webviewStorage = typeof localStorage === "undefined" ? null : localStorage,
  tick = true,
}: TauriDataOptions = {}): TrackerData {
  const initial = stateFromData(emptyData());
  let legacy: AppState = initial.legacy;
  let store: AppStore = initial.store;
  let csvRecords: ScoreRecord[] = [];
  let manualRecords: ScoreRecord[] = [];
  let lastRunId = 0;
  let loading = true;
  let watching = false;
  let folderError: string | null = null;
  let storageWarning: string | null = null;
  let importProgress: TrackerSnapshot["importProgress"] = null;
  let failedImports: FailedImport[] = [];

  const build = (): TrackerSnapshot => ({
    ...snapshotFromLegacy(
      { ...legacy, csvRecords, manualRecords },
      store,
      clock(),
      { watching, folderAccess: legacy.statsFolderName ? "ready" : "none", loading, storageWarning, importProgress, folderError },
      "tauri",
    ),
    failedImports,
  });
  let snapshot = build();
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: TrackerEvent) => void>();

  function rebuild() {
    snapshot = build();
    listeners.forEach((listener) => listener());
  }

  /** Writes in the background; a failure keeps the change on screen and says it wasn't saved. */
  function save(command: string, args?: Record<string, unknown>) {
    backend.invoke(command, args).catch((error: unknown) => {
      storageWarning = `刚才的修改没有写入数据库：${errorText(error)}`;
      rebuild();
    });
  }

  const now = () => clock().getTime();

  function apply(data: AppData) {
    const loaded = stateFromData(data);
    legacy = loaded.legacy;
    store = loaded.store;
    csvRecords = loaded.csvRecords;
    manualRecords = loaded.manualRecords;
    lastRunId = loaded.lastRunId;
  }

  function applyWatcher(status: WatcherStatus) {
    watching = status.watching;
    folderError = status.error;
    if (status.dir) legacy = { ...legacy, statsFolderName: status.dir };
  }

  async function refreshImportStatus() {
    const status = await backend.invoke<ImportStatus>("import_status");
    applyWatcher(status);
    failedImports = status.failed.map(failedImport);
    rebuild();
  }

  /** Data the interim desktop app kept in webview storage moves into an empty database, once. */
  async function migrateWebviewStorage(data: AppData): Promise<boolean> {
    if (data.settings[WEBVIEW_MIGRATED] !== undefined || !webviewStorage) return false;
    const empty = !data.overrides.length && !data.runs.some((run) => run.source === "manual") && !data.tracked.length && !data.aliases.length && !data.plan.length && !data.days.length;
    let restored = false;
    if (empty && (webviewStorage.getItem(LEGACY_STORAGE_KEY) || webviewStorage.getItem(APP_STORAGE_KEY))) {
      // Imported runs come back from the stats folder; everything else moves over.
      const backup = { ...(backupOf(webviewStorage) as Partial<AppState> & { newUi?: unknown }), csvRecords: [] };
      const current = data.benchmarks.length ? benchmarksFromRows(data.benchmarks) : legacy.benchmarks;
      await backend.invoke("data_restore", { backup: restoreFromBackup(backup, now(), current) });
      restored = true;
    }
    const dir = webviewStorage.getItem(DESKTOP_STATS_DIR_KEY);
    if (dir && typeof data.settings[SETTING.statsDir] !== "string") {
      // Imports in the background; its events update the screens.
      backend.invoke("stats_dir_set", { path: dir }).catch(() => undefined);
    }
    await backend.invoke("setting_set", { key: WEBVIEW_MIGRATED, value: true });
    return restored;
  }

  const ready: Promise<void> = (async () => {
    try {
      // Listen first, so nothing imported while loading is missed.
      await Promise.all([
        backend.listen<unknown>("runs:added", () => void fetchNewRuns()),
        backend.listen<{ done: number; total: number }>("import:progress", (progress) => {
          importProgress = progress.done < progress.total ? progress : null;
          rebuild();
        }),
        backend.listen<ImportSummary>("import:finished", () => {
          importProgress = null;
          void refreshImportStatus().catch(() => undefined);
        }),
        backend.listen<WatcherStatus>("watcher:status", (status) => {
          applyWatcher(status);
          rebuild();
        }),
      ]);
      let data = await backend.invoke<AppData>("data_load");
      if (await migrateWebviewStorage(data)) data = await backend.invoke<AppData>("data_load");
      apply(data);
      await refreshImportStatus();
    } catch (error) {
      storageWarning = `无法读取桌面版数据库：${errorText(error)}`;
    } finally {
      loading = false;
      rebuild();
    }
  })();

  /** Adds runs stored since the last one seen; one fetch at a time so none is added twice. */
  let fetching: Promise<void> = Promise.resolve();
  function fetchNewRuns(): Promise<void> {
    fetching = fetching.then(async () => {
      await ready;
      let runs: StoredRun[];
      try {
        runs = await backend.invoke<StoredRun[]>("runs_after", { after: lastRunId });
      } catch {
        return;
      }
      const known = new Set([...csvRecords, ...manualRecords].map((record) => record.id));
      const added: ScoreRecord[] = [];
      runs.forEach((run) => {
        lastRunId = Math.max(lastRunId, run.id);
        if (known.has(run.identity)) return;
        const record = recordFromRun(run);
        if (run.source === "manual") manualRecords = [...manualRecords, record];
        else added.push(record);
      });
      if (added.length) csvRecords = [...csvRecords, ...added];
      legacy = { ...legacy, statsFolderUpdatedAt: clock().toISOString() };
      rebuild();
      if (added.length) eventListeners.forEach((listener) => listener({ type: "runs:added", records: added }));
    });
    return fetching;
  }

  if (tick && typeof window !== "undefined") {
    // Keep "today" correct when the window stays open past midnight / the day start hour.
    window.setInterval(() => {
      if (clock().getMinutes() !== snapshot.now.getMinutes()) rebuild();
    }, 30_000);
  }

  // ---- Changes -----------------------------------------------------------------------

  function setExclusions(next: Record<string, RecordExclusion>) {
    const previous = legacy.recordExclusions;
    Object.entries(next).forEach(([key, item]) => {
      if (previous[key] !== item) save("override_set", { item: overrideFromExclusion(item, now()) });
    });
    Object.keys(previous).forEach((key) => {
      if (!(key in next)) save("override_clear", { identity: key });
    });
    legacy = { ...legacy, recordExclusions: next };
    rebuild();
  }

  const manualRecord = (id: string, input: ManualRunInput): ScoreRecord => ({
    id,
    scenario: input.scenario,
    score: input.score,
    date: new Date(input.date).toISOString(),
    note: input.note,
    source: "manual",
  });

  function saveManual(record: ScoreRecord) {
    const run = runFromRecord(record, "manual");
    if (run) save("manual_run_save", { run });
  }

  function saveTracked() {
    save("tracked_save", { items: trackedRows(legacy, store) });
  }

  function select(ref: TrackedRef, tracked: TrackedRef[] = followedWith(legacy, store, ref)) {
    store = { ...store, tracked };
    legacy = { ...legacy, selectedBenchmark: ref.benchmark, selectedDifficulty: ref.difficulty };
    saveTracked();
    rebuild();
  }

  function saveSettingRows(before: Record<string, unknown>) {
    Object.entries(settingRows(store.settings, store.preferences)).forEach(([key, value]) => {
      if (before[key] !== value) save("setting_set", { key, value });
    });
  }

  function saveDay(dayKey: string) {
    save("day_save", { day: { dayKey, mood: store.moods[dayKey] ?? {}, note: legacy.dailyReviews[dayKey]?.note ?? "" } });
  }

  async function runImport(command: "stats_dir_set" | "import_rescan", args: Record<string, unknown>, dir: string): Promise<string> {
    const summary = await backend.invoke<ImportSummary>(command, args);
    await fetchNewRuns();
    return importSummaryMessage(summary, dir);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    toggleRunCounted(record, currentlyCounts) {
      setExclusions(toggleRecordCounted(record, legacy.recordExclusions, currentlyCounts, clock().toISOString()));
    },
    addManualRun(input) {
      const record = manualRecord(`manual-${now()}`, input);
      manualRecords = [...manualRecords, record];
      saveManual(record);
      rebuild();
    },
    updateManualRun(id, input) {
      const record = manualRecord(id, input);
      manualRecords = manualRecords.map((item) => (item.id === id ? record : item));
      saveManual(record);
      rebuild();
    },
    deleteManualRun(id) {
      manualRecords = manualRecords.filter((item) => item.id !== id);
      save("manual_run_delete", { identity: id });
      rebuild();
    },
    confirmAlias(rawName, scenarioName) {
      store = { ...store, aliases: { ...store.aliases, [rawName]: scenarioName } };
      save("alias_set", { alias: { rawName, scenarioName } });
      rebuild();
    },
    addToPlan(scenarioName, targetRuns = 3) {
      if (store.plan.some((item) => sameScenario(item.scenarioName, scenarioName))) return;
      store = { ...store, plan: [...store.plan, { scenarioName, targetRuns }] };
      save("plan_save", { items: store.plan });
      rebuild();
    },
    updateSettings(patch) {
      const before = settingRows(store.settings, store.preferences);
      store = { ...store, settings: { ...store.settings, ...patch } };
      saveSettingRows(before);
      rebuild();
    },
    updatePreferences(patch) {
      const before = settingRows(store.settings, store.preferences);
      store = { ...store, preferences: { ...store.preferences, ...patch } };
      saveSettingRows(before);
      if (patch.autoImport !== undefined) save("import_set_auto", { enabled: patch.autoImport });
      rebuild();
    },
    updateSetup(patch) {
      legacy = { ...legacy, defaultSetupProfile: { ...legacy.defaultSetupProfile, ...patch } };
      save("setup_save", { setup: legacy.defaultSetupProfile });
      rebuild();
    },
    setDifficulty(difficulty) {
      const active = activeRef(legacy);
      if (active) select({ benchmark: active.benchmark, difficulty });
    },
    selectTracked(id) {
      const ref = trackedRefs(legacy, store).find((item) => trackedId(item.benchmark, item.difficulty) === id);
      if (ref) select(ref);
    },
    reorderTracked(ids) {
      store = { ...store, tracked: followedInOrder(legacy, store, ids) };
      saveTracked();
      rebuild();
    },
    setTracked(benchmark, difficulty, tracked) {
      if (tracked) {
        store = { ...store, tracked: followedWith(legacy, store, { benchmark, difficulty }) };
        saveTracked();
        rebuild();
        return;
      }
      const change = followedWithout(legacy, store, trackedId(benchmark, difficulty));
      if (!change) return;
      if (change.nextActive) {
        select(change.nextActive, change.tracked);
        return;
      }
      store = { ...store, tracked: change.tracked };
      saveTracked();
      rebuild();
    },
    updateDay(dayKey, patch) {
      if (patch.note !== undefined) legacy = { ...legacy, dailyReviews: withDayNote(legacy.dailyReviews, dayKey, patch.note) };
      if (patch.mood) store = { ...store, moods: { ...store.moods, [dayKey]: { ...store.moods[dayKey], ...patch.mood } } };
      saveDay(dayKey);
      rebuild();
    },
    async chooseStatsFolder() {
      await ready;
      const path = await backend.pickDirectory(legacy.statsFolderName || undefined);
      if (!path) return "没有选择文件夹";
      legacy = { ...legacy, statsFolderName: path };
      rebuild();
      return runImport("stats_dir_set", { path }, path);
    },
    async rescanStatsFolder({ full = false } = {}) {
      await ready;
      const dir = legacy.statsFolderName;
      if (!dir) return "还没有选择 stats 文件夹";
      return runImport("import_rescan", { full }, dir);
    },
    async syncBenchmark() {
      await ready;
      const { benchmarks, messages } = await syncThresholds({
        benchmarks: legacy.benchmarks,
        followed: (list) => trackedRefs({ ...legacy, benchmarks: list }, store),
        fetchImpl: backend.fetch,
        now: clock,
      });
      const syncedAt = clock().toISOString();
      legacy = { ...legacy, benchmarks, lastBenchmarkSyncDate: syncedAt };
      const active = activeRef(legacy);
      if (active) legacy = { ...legacy, selectedBenchmark: active.benchmark, selectedDifficulty: active.difficulty };
      save("benchmarks_save", { items: rowsFromBenchmarks(benchmarks) });
      save("setting_set", { key: SETTING.syncedAt, value: syncedAt });
      saveTracked();
      rebuild();
      return messages.join(" · ");
    },
    selectBenchmark(name) {
      const benchmark = legacy.benchmarks.find((item) => item.benchmarkName === name);
      const difficulty = benchmark?.difficulties?.[0]?.difficultyName;
      if (benchmark && difficulty) select({ benchmark: name, difficulty });
    },
    async importBackup(file) {
      const parsed = JSON.parse(await file.text()) as Partial<AppState> & { newUi?: unknown };
      if (!parsed || typeof parsed !== "object" || (!Array.isArray(parsed.csvRecords) && !Array.isArray(parsed.manualRecords))) {
        throw new Error("不是可识别的备份文件");
      }
      await ready;
      const restore = restoreFromBackup(parsed, now(), legacy.benchmarks);
      await backend.invoke<number>("data_restore", { backup: restore });
      apply(await backend.invoke<AppData>("data_load"));
      rebuild();
      return `已恢复 ${restore.runs.length} 局成绩`;
    },
    backup: () => ({ ...legacy, csvRecords, manualRecords, newUi: store }),
  };
}

function emptyData(): AppData {
  return { runs: [], overrides: [], aliases: [], benchmarks: [], tracked: [], days: [], plan: [], setup: null, settings: {}, lastImportAt: null };
}
