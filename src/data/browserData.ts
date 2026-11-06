import { toggleRecordCounted } from "../domain/exclusions.ts";
import { sameScenario } from "../domain/scenario.ts";
import { resolveScenarioName } from "../domain/screens/data.ts";
import type { AppState, Benchmark, CsvImportStatus, ScoreRecord } from "../domain/types.ts";
import { mergeBenchmarks } from "../services/benchmark.ts";
import { fetchEvxlBenchmarks, fetchKovaakBenchmarkDetails } from "../services/benchmarkSync.ts";
import { browserFetch, LocalDevProxyUnavailableError } from "../services/browserFetch.ts";
import { parseKovaakCsvWithStatus } from "../services/csv.ts";
import type { CsvReadableFile } from "../services/fileImport.ts";
import { loadState, normalizeState, type StorageLike } from "../services/storage.ts";
import { benchmarkFallback } from "./benchmarkFallback.ts";
import { importedFileNames, importMessage, mergeImport } from "./importLogic.ts";
import { activeRef, APP_STORAGE_KEY, type LiveState, LEGACY_STORAGE_KEY, parseAppStore, snapshotFromLegacy, trackedRefs, withDayNote, type AppStore, type TrackedRef } from "./legacyState.ts";
import { compactRecord, indexedDbRecordStore, memoryRecordStore, type RecordStore } from "./recordStore.ts";
import { folderPermission, folderPickerSupported, listStatsFiles, pickStatsFolder, rememberedStatsFolder } from "./statsFolder.ts";
import { trackedId, type FolderAccess, type ManualRunInput, type TrackerData, type TrackerEvent, type TrackerSnapshot } from "./trackerData.ts";

const EVXL_BENCHMARK_URL = "https://evxl.app/benchmarks/Viscose%20Benchmarks%20S2";
/** Any Steam id works for reading thresholds; this is the one the classic app uses. */
const THRESHOLD_STEAM_ID = "76561197960287930";
/** How often the remembered stats folder is checked for new files (also while the page is in the background). */
const POLL_MS = 15_000;

/** Where stats files come from; replaceable in tests. */
export interface StatsFolderApi {
  supported(): boolean;
  pick(): Promise<FileSystemDirectoryHandle | null>;
  remembered(): Promise<FileSystemDirectoryHandle | null>;
  permission(handle: FileSystemDirectoryHandle, request?: boolean): Promise<PermissionState>;
  files(handle: FileSystemDirectoryHandle): Promise<CsvReadableFile[]>;
}

const browserFolderApi: StatsFolderApi = {
  supported: folderPickerSupported,
  pick: pickStatsFolder,
  remembered: rememberedStatsFolder,
  permission: folderPermission,
  files: listStatsFiles,
};

const STORAGE_FULL = "浏览器存储空间不足，刚才的修改没有保存。请先导出备份。";

type RawState = Partial<AppState> & Record<string, unknown>;

interface BrowserDataOptions {
  storage?: StorageLike;
  clock?: () => Date;
  /** Listen for changes made in other tabs (e.g. an import in the classic app). Off in tests. */
  watch?: boolean;
  folderApi?: StatsFolderApi;
  fetchImpl?: typeof fetch;
  /** Where imported runs are kept; IndexedDB by default. */
  recordStore?: RecordStore;
}

/**
 * Real data in this browser. Imported runs live in IndexedDB (a long history does not fit in
 * localStorage); everything else (exclusions, manual runs, notes, benchmarks) stays in the
 * classic app's localStorage entry, so both UIs share it. Both pages must be opened from the
 * same address (127.0.0.1 and localhost keep separate storage).
 */
export function createBrowserData({
  storage = localStorage,
  clock = () => new Date(),
  watch = true,
  folderApi = browserFolderApi,
  fetchImpl = browserFetch,
  recordStore = typeof indexedDB === "undefined" ? memoryRecordStore() : indexedDbRecordStore(),
}: BrowserDataOptions = {}): TrackerData {
  let legacy: AppState = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
  let store: AppStore = parseAppStore(storage.getItem(APP_STORAGE_KEY));
  /** Imported runs; the source of truth is the record store, loaded below. */
  let csvRecords: ScoreRecord[] = legacy.csvRecords.map(compactRecord);
  let loading = true;
  let storageWarning: string | null = null;
  let importProgress: LiveState["importProgress"] = null;
  let folder: FileSystemDirectoryHandle | null = null;
  let folderAccess: FolderAccess = folderApi.supported() ? "none" : "unsupported";
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let importing: Promise<string> | null = null;
  const live = (): LiveState => ({ watching: pollTimer !== null, folderAccess, loading, storageWarning, importProgress });
  const view = () => ({ ...legacy, csvRecords });
  let snapshot: TrackerSnapshot = snapshotFromLegacy(view(), store, clock(), live());
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: TrackerEvent) => void>();

  function rebuild() {
    snapshot = snapshotFromLegacy(view(), store, clock(), live());
    listeners.forEach((listener) => listener());
  }

  function emitAdded(records: ScoreRecord[]) {
    if (records.length) eventListeners.forEach((listener) => listener({ type: "runs:added", records }));
  }

  function readRaw(): RawState {
    try {
      const parsed = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? (parsed as RawState) : {};
    } catch {
      return {};
    }
  }

  /** Changes only the given fields of the classic app's saved state, keeping everything else. */
  function writeLegacy(patch: (raw: RawState, current: AppState) => void) {
    const raw = readRaw();
    patch(raw, legacy);
    try {
      storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(raw));
    } catch {
      // Keep the edit for this session and say so, instead of silently reloading old data.
      storageWarning = STORAGE_FULL;
    }
    legacy = normalizeState(raw as Partial<AppState>, benchmarkFallback);
    rebuild();
  }

  function saveStore() {
    try {
      storage.setItem(APP_STORAGE_KEY, JSON.stringify(store));
    } catch {
      storageWarning = STORAGE_FULL;
    }
  }

  function writeStore(next: Partial<AppStore>) {
    store = { ...store, ...next };
    saveStore();
    rebuild();
  }

  /** Reads saved runs; moves runs the classic app kept in localStorage into the record store. */
  const ready: Promise<void> = (async () => {
    try {
      const stored = await recordStore.loadAll();
      const known = new Set(stored.map((record) => record.id));
      const fromLegacy = legacy.csvRecords.filter((record) => !known.has(record.id)).map(compactRecord);
      if (fromLegacy.length) await recordStore.put(fromLegacy);
      csvRecords = [...stored, ...fromLegacy];
      if (legacy.csvRecords.length) {
        // They are safe in the record store now; free localStorage for everything else.
        writeLegacy((raw) => {
          raw.csvRecords = [];
        });
      }
    } catch {
      storageWarning = "无法打开浏览器数据库，导入的成绩只保留到关闭页面为止。";
    } finally {
      loading = false;
      rebuild();
    }
  })();

  function reloadFromStorage() {
    legacy = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
    store = parseAppStore(storage.getItem(APP_STORAGE_KEY));
    // The classic app imports into localStorage; take over runs it added there.
    const known = new Set(csvRecords.map((record) => record.id));
    const added = legacy.csvRecords.filter((record) => !known.has(record.id)).map(compactRecord);
    if (added.length) {
      csvRecords = [...csvRecords, ...added];
      void recordStore.put(added).catch(() => {
        storageWarning = STORAGE_FULL;
      });
    }
    rebuild();
    emitAdded(added);
  }

  if (watch && typeof window !== "undefined") {
    // Another tab (usually the classic app after an import) changed the saved data.
    window.addEventListener("storage", (event) => {
      if (event.key === LEGACY_STORAGE_KEY || event.key === APP_STORAGE_KEY) reloadFromStorage();
    });
    // Keep "today" correct when the page stays open past midnight / the day start hour.
    window.setInterval(() => {
      if (clock().getMinutes() !== snapshot.now.getMinutes()) rebuild();
    }, 30_000);
  }

  const manualRecord = (id: string, input: ManualRunInput): ScoreRecord => ({
    id,
    scenario: input.scenario,
    score: input.score,
    date: new Date(input.date).toISOString(),
    note: input.note,
    source: "manual",
  });

  // ---- Stats import ---------------------------------------------------------------

  const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  /** Parses the given files and merges them into the saved runs. */
  async function importFiles(files: CsvReadableFile[], folderName: string, { full = false, silent = false } = {}): Promise<string> {
    await ready;
    const known = full ? new Set<string>() : importedFileNames(csvRecords);
    const toRead = files.filter((file) => !known.has(file.name));
    const scenarios = snapshot.benchmark.scenarios;
    const matchScenarioName = (name: string) => resolveScenarioName(name, scenarios, store.aliases);
    const imported: ScoreRecord[] = [];
    const statuses: CsvImportStatus[] = [];
    const showProgress = toRead.length > 100;
    for (let index = 0; index < toRead.length; index += 1) {
      const file = toRead[index];
      try {
        const result = parseKovaakCsvWithStatus(await file.text(), file.name, file.lastModified, { matchScenarioName });
        statuses.push(result.status);
        if (result.record) imported.push(compactRecord(result.record));
      } catch {
        statuses.push({ fileName: file.name, success: false, failureReason: "read-error", dateSource: "", matchedCurrentBenchmark: false });
      }
      if (showProgress && index % 200 === 0) {
        importProgress = { done: index, total: toRead.length };
        rebuild();
        await yieldToBrowser();
      }
    }
    importProgress = null;

    const outcome = mergeImport(csvRecords, imported, statuses, store.failedImports);
    const nextIds = new Set(outcome.csvRecords.map((record) => record.id));
    const removed = csvRecords.filter((record) => !nextIds.has(record.id)).map((record) => record.id ?? "");
    try {
      if (removed.length) await recordStore.remove(removed);
      if (imported.length) await recordStore.put(imported);
    } catch {
      storageWarning = "成绩没能写入浏览器数据库，刷新页面后可能会丢失。请先导出备份。";
    }
    csvRecords = outcome.csvRecords;
    if (outcome.scanned || !silent) {
      store = { ...store, failedImports: outcome.failedImports };
      saveStore();
      writeLegacy((raw) => {
        raw.statsFolderName = folderName;
        raw.statsFolderUpdatedAt = clock().toISOString();
      });
    } else {
      rebuild();
    }
    emitAdded(outcome.added);
    return importMessage(outcome, folderName);
  }

  /** Runs one import at a time; a second request waits for the first. */
  function exclusive(run: () => Promise<string>): Promise<string> {
    const next = (importing ?? Promise.resolve("")).catch(() => "").then(run);
    importing = next.finally(() => {
      if (importing === next) importing = null;
    });
    return next;
  }

  function setAccess(next: FolderAccess) {
    folderAccess = next;
    rebuild();
  }

  function stopPolling() {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
  }

  /**
   * Browsers cannot watch a folder, so check the remembered one for new files every few seconds.
   * This keeps running while the page is in the background, i.e. while the player is in KovaaK
   * (browsers slow background timers down to about once a minute).
   */
  function startPolling() {
    stopPolling();
    if (!watch || !folder || folderAccess !== "ready" || !store.preferences.autoImport) {
      rebuild();
      return;
    }
    pollTimer = setInterval(() => {
      const handle = folder;
      if (!handle || importing) return;
      void exclusive(async () => importFiles(await folderApi.files(handle), handle.name, { silent: true })).catch(() => {
        // Permission was revoked or the folder disappeared.
        stopPolling();
        setAccess("needs-permission");
      });
    }, POLL_MS);
    rebuild();
  }

  async function readFolder(handle: FileSystemDirectoryHandle, full: boolean): Promise<string> {
    const message = await exclusive(async () => importFiles(await folderApi.files(handle), handle.name, { full }));
    startPolling();
    return message;
  }

  if (watch && folderApi.supported()) {
    // Reconnect to the folder chosen last time; Chrome may still hold the permission.
    void folderApi.remembered().then(async (handle) => {
      if (!handle) return;
      folder = handle;
      const permission = await folderApi.permission(handle);
      setAccess(permission === "granted" ? "ready" : "needs-permission");
      if (permission === "granted") await readFolder(handle, false).catch(() => setAccess("needs-permission"));
    });
  }

  // ---- Benchmark sync ---------------------------------------------------------------

  async function syncBenchmark(): Promise<string> {
    const messages: string[] = [];
    let benchmarks: Benchmark[] = legacy.benchmarks.length ? legacy.benchmarks : benchmarkFallback;
    try {
      const fetched = (await fetchEvxlBenchmarks(EVXL_BENCHMARK_URL, fetchImpl)).filter((item) => /viscose/i.test(item.benchmarkName));
      if (fetched.length) {
        benchmarks = mergeBenchmarks(benchmarks, fetched);
        messages.push(`已更新 ${fetched.length} 个 benchmark`);
      }
    } catch (error) {
      if (error instanceof LocalDevProxyUnavailableError) return "在线同步需要用 start-dev.bat 打开 http://127.0.0.1:5173/app.html";
      messages.push("EVXL 列表更新失败，沿用已有清单");
    }
    // Thresholds for every followed difficulty, so switching in the sidebar works offline.
    const targets = trackedRefs({ ...legacy, benchmarks }, store);
    const synced: string[] = [];
    for (const ref of targets) {
      const difficulty = benchmarks.find((item) => item.benchmarkName === ref.benchmark)?.difficulties?.find((item) => item.difficultyName === ref.difficulty);
      if (!difficulty?.kovaaksBenchmarkId) continue;
      try {
        const scenarios = await fetchKovaakBenchmarkDetails({ benchmarkId: difficulty.kovaaksBenchmarkId, steamId: THRESHOLD_STEAM_ID, fetchImpl });
        benchmarks = benchmarks.map((item) =>
          item.benchmarkName !== ref.benchmark
            ? item
            : {
                ...item,
                difficulties: (item.difficulties || []).map((entry) =>
                  entry.difficultyName === ref.difficulty ? { ...entry, scenarios, apiUpdatedAt: clock().toISOString() } : entry,
                ),
              },
        );
        synced.push(`${ref.difficulty} · ${scenarios.length} 个场景`);
      } catch {
        messages.push(`读取 ${ref.difficulty} 段位线失败，可稍后重试`);
      }
    }
    if (synced.length) messages.push(`段位线：${synced.join("，")}`);
    const active = activeRef({ ...legacy, benchmarks });
    writeLegacy((raw) => {
      raw.benchmarks = benchmarks;
      if (active) {
        raw.selectedBenchmark = active.benchmark;
        raw.selectedDifficulty = active.difficulty;
      }
      raw.lastBenchmarkSyncDate = clock().toISOString();
    });
    return messages.join(" · ");
  }

  // ---- Followed benchmarks -------------------------------------------------------------

  /** Saves the followed list (plus extra refs) so switching never drops the previous benchmark. */
  function rememberTracked(...extra: TrackedRef[]) {
    const refs = [...trackedRefs(legacy, store), ...extra];
    const seen = new Set<string>();
    const tracked = refs.filter((ref) => {
      const id = trackedId(ref.benchmark, ref.difficulty);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    writeStore({ tracked });
  }

  function select(ref: TrackedRef) {
    rememberTracked(ref);
    writeLegacy((raw) => {
      raw.selectedBenchmark = ref.benchmark;
      raw.selectedDifficulty = ref.difficulty;
    });
  }

  // ---- Backup ------------------------------------------------------------------------

  async function importBackup(file: File): Promise<string> {
    const parsed = JSON.parse(await file.text()) as Partial<AppState> & { newUi?: unknown };
    if (!parsed || typeof parsed !== "object" || (!Array.isArray(parsed.csvRecords) && !Array.isArray(parsed.manualRecords))) {
      throw new Error("不是可识别的备份文件");
    }
    await ready;
    const state = normalizeState(parsed, benchmarkFallback);
    const { newUi, ...classic } = parsed;
    const runs = state.csvRecords.map(compactRecord);
    await recordStore.replaceAll(runs);
    csvRecords = runs;
    // Runs live in the record store; keep localStorage small.
    try {
      storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...classic, ...state, csvRecords: [] }));
      if (newUi) storage.setItem(APP_STORAGE_KEY, JSON.stringify(newUi));
    } catch {
      storageWarning = STORAGE_FULL;
    }
    legacy = normalizeState({ ...state, csvRecords: [] }, benchmarkFallback);
    store = newUi ? parseAppStore(JSON.stringify(newUi)) : store;
    rebuild();
    return `已恢复 ${runs.length + state.manualRecords.length} 局成绩`;
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
      writeLegacy((raw, current) => {
        raw.recordExclusions = toggleRecordCounted(record, current.recordExclusions, currentlyCounts);
      });
    },
    addManualRun(input) {
      writeLegacy((raw, current) => {
        raw.manualRecords = [...current.manualRecords, manualRecord(`manual-${Date.now()}`, input)];
      });
    },
    updateManualRun(id, input) {
      writeLegacy((raw, current) => {
        raw.manualRecords = current.manualRecords.map((record) => (record.id === id ? manualRecord(id, input) : record));
      });
    },
    deleteManualRun(id) {
      writeLegacy((raw, current) => {
        raw.manualRecords = current.manualRecords.filter((record) => record.id !== id);
      });
    },
    confirmAlias(rawName, scenarioName) {
      writeStore({ aliases: { ...store.aliases, [rawName]: scenarioName } });
    },
    addToPlan(scenarioName, targetRuns = 3) {
      if (store.plan.some((item) => sameScenario(item.scenarioName, scenarioName))) return;
      writeStore({ plan: [...store.plan, { scenarioName, targetRuns }] });
    },
    updateSettings(patch) {
      writeStore({ settings: { ...store.settings, ...patch } });
    },
    updatePreferences(patch) {
      writeStore({ preferences: { ...store.preferences, ...patch } });
      if (patch.autoImport !== undefined) startPolling();
    },
    updateSetup(patch) {
      writeLegacy((raw, current) => {
        raw.defaultSetupProfile = { ...current.defaultSetupProfile, ...patch };
      });
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
      const refs = trackedRefs(legacy, store);
      const byId = new Map(refs.map((ref) => [trackedId(ref.benchmark, ref.difficulty), ref]));
      const ordered = ids.map((id) => byId.get(id)).filter((ref): ref is TrackedRef => Boolean(ref));
      const rest = refs.filter((ref) => !ids.includes(trackedId(ref.benchmark, ref.difficulty)));
      writeStore({ tracked: [...ordered, ...rest] });
    },
    setTracked(benchmark, difficulty, tracked) {
      const id = trackedId(benchmark, difficulty);
      if (tracked) {
        rememberTracked({ benchmark, difficulty });
        return;
      }
      const remaining = trackedRefs(legacy, store).filter((ref) => trackedId(ref.benchmark, ref.difficulty) !== id);
      if (!remaining.length) return; // Always keep at least one.
      const active = activeRef(legacy);
      if (active && trackedId(active.benchmark, active.difficulty) === id) {
        // Switch first, otherwise the still-active benchmark would be re-added to the list.
        const next = remaining[0];
        writeLegacy((raw) => {
          raw.selectedBenchmark = next.benchmark;
          raw.selectedDifficulty = next.difficulty;
        });
      }
      writeStore({ tracked: remaining });
    },
    updateDay(dayKey, patch) {
      if (patch.note !== undefined) {
        const note = patch.note;
        writeLegacy((raw, current) => {
          raw.dailyReviews = withDayNote(current.dailyReviews, dayKey, note);
        });
      }
      if (patch.mood) {
        const mood = { ...store.moods[dayKey], ...patch.mood };
        writeStore({ moods: { ...store.moods, [dayKey]: mood } });
      }
    },
    async chooseStatsFolder() {
      if (!folderApi.supported()) return "这个浏览器不能选择文件夹，请用 Chrome 或 Edge，或改为选择 CSV 文件";
      const handle = await folderApi.pick();
      if (!handle) return "已取消";
      folder = handle;
      setAccess("ready");
      return readFolder(handle, false);
    },
    async rescanStatsFolder({ full = false } = {}) {
      const handle = folder ?? (await folderApi.remembered());
      if (!handle) return "还没有选择 stats 文件夹";
      folder = handle;
      const permission = await folderApi.permission(handle, true);
      if (permission !== "granted") {
        setAccess("needs-permission");
        return "浏览器没有授权读取这个文件夹";
      }
      setAccess("ready");
      return readFolder(handle, full);
    },
    importCsvFiles(files, folderName) {
      const name = folderName || legacy.statsFolderName || "CSV 文件";
      return exclusive(() => importFiles(files, name, { full: true }));
    },
    syncBenchmark,
    selectBenchmark(name) {
      const benchmark = legacy.benchmarks.find((item) => item.benchmarkName === name);
      const difficulty = benchmark?.difficulties?.[0]?.difficultyName;
      if (benchmark && difficulty) select({ benchmark: name, difficulty });
    },
    importBackup,
    backup: () => ({ ...(backupOf(storage) as Record<string, unknown>), csvRecords }),
  };
}

/** Backup in the classic app's format plus the new UI's own state, restorable by either UI. */
export function backupOf(storage: StorageLike = localStorage): unknown {
  let classic: Record<string, unknown> = {};
  try {
    classic = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || "{}") as Record<string, unknown>;
  } catch {
    classic = {};
  }
  return { ...classic, newUi: parseAppStore(storage.getItem(APP_STORAGE_KEY)) };
}

/** True when the classic app has saved any runs in this browser. */
export function hasBrowserData(storage: StorageLike = localStorage): boolean {
  const state = loadState(LEGACY_STORAGE_KEY, benchmarkFallback, storage);
  return state.csvRecords.length + state.manualRecords.length > 0;
}
