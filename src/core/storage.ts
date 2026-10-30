import { normalizeBenchmarkCategories } from "./benchmark.ts";
import { buildRecordExclusions } from "./exclusions.ts";
import { emptySetupProfile, normalizeDailyReviews, normalizeSetupProfile } from "./reviewInputs.ts";
import type { AppState, Benchmark, DailyReviewTableSettings, RecordExclusion } from "./types.ts";

export const defaultDailyReviewTableSettings: DailyReviewTableSettings = {
  density: "compact",
  progressStyle: "normal",
  skew: 45,
  outerRadius: 8,
  innerRadius: 4,
  textSize: 100,
  textContrast: 45,
  boldText: true,
  textShadow: false,
  showProgressPercent: true,
  shadeCategoryCells: true,
  shadeRankCells: true,
  highContrast: true,
  useRankColumnColors: false,
  simplifyScenarioNames: false,
};

export function normalizeState(value: Partial<AppState> | null | undefined, fallbackBenchmarks: Benchmark[] = []): AppState {
  const source = value || {};
  const benchmarks = Array.isArray(source.benchmarks) ? source.benchmarks : fallbackBenchmarks;
  const manualRecords = Array.isArray(source.manualRecords) ? source.manualRecords : [];
  const csvRecords = Array.isArray(source.csvRecords) ? source.csvRecords : [];
  const recordExclusions = buildRecordExclusions([...csvRecords, ...manualRecords], normalizeRecordExclusions(source.recordExclusions));
  return {
    benchmarks: normalizeBenchmarkCategories(benchmarks),
    manualRecords,
    csvRecords,
    selectedBenchmark: source.selectedBenchmark || "Viscose Benchmarks S2",
    selectedDifficulty: source.selectedDifficulty || "Easier",
    selectedScenario: source.selectedScenario || "all",
    dailyReviewDate: source.dailyReviewDate || "",
    dailyReviewMetric: source.dailyReviewMetric || "avg",
    dailyReviewScope: source.dailyReviewScope || "trained",
    dailyReviewTableSettings: normalizeDailyReviewTableSettings(source.dailyReviewTableSettings),
    recordExclusions,
    dailyReviews: normalizeDailyReviews(source.dailyReviews),
    defaultSetupProfile: normalizeSetupProfile(source.defaultSetupProfile || emptySetupProfile),
    lastBenchmarkSyncDate: source.lastBenchmarkSyncDate || "",
    statsFolderName: source.statsFolderName || "",
    statsFolderUpdatedAt: source.statsFolderUpdatedAt || "",
  };
}

function normalizeRecordExclusions(value: Record<string, Partial<RecordExclusion>> | null | undefined): Record<string, RecordExclusion> {
  const source = value || {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, item]) => item?.recordKey && (item.status === "excluded" || item.status === "suspicious"))
      .map(([key, item]) => [
        key,
        {
          recordKey: String(item.recordKey),
          status: item.status as RecordExclusion["status"],
          reason: item.reason === "zero-score" || item.reason === "low-vs-median" || item.reason === "manual" ? item.reason : "manual",
          note: item.note ? String(item.note) : undefined,
          updatedAt: item.updatedAt || new Date().toISOString(),
        },
      ]),
  );
}

export function normalizeDailyReviewTableSettings(value: Partial<DailyReviewTableSettings> | null | undefined): DailyReviewTableSettings {
  const source = value || {};
  return {
    ...defaultDailyReviewTableSettings,
    density: isDailyReviewDensity(source.density) ? source.density : defaultDailyReviewTableSettings.density,
    progressStyle: source.progressStyle === "simple" || source.progressStyle === "normal" ? source.progressStyle : defaultDailyReviewTableSettings.progressStyle,
    skew: clampNumber(source.skew, 0, 55, defaultDailyReviewTableSettings.skew),
    outerRadius: clampNumber(source.outerRadius, 0, 18, defaultDailyReviewTableSettings.outerRadius),
    innerRadius: clampNumber(source.innerRadius, 0, 12, defaultDailyReviewTableSettings.innerRadius),
    textSize: clampNumber(source.textSize, 80, 125, defaultDailyReviewTableSettings.textSize),
    textContrast: clampNumber(source.textContrast, 20, 100, defaultDailyReviewTableSettings.textContrast),
    boldText: typeof source.boldText === "boolean" ? source.boldText : defaultDailyReviewTableSettings.boldText,
    textShadow: typeof source.textShadow === "boolean" ? source.textShadow : defaultDailyReviewTableSettings.textShadow,
    showProgressPercent: typeof source.showProgressPercent === "boolean" ? source.showProgressPercent : defaultDailyReviewTableSettings.showProgressPercent,
    shadeCategoryCells: typeof source.shadeCategoryCells === "boolean" ? source.shadeCategoryCells : defaultDailyReviewTableSettings.shadeCategoryCells,
    shadeRankCells: typeof source.shadeRankCells === "boolean" ? source.shadeRankCells : defaultDailyReviewTableSettings.shadeRankCells,
    highContrast: typeof source.highContrast === "boolean" ? source.highContrast : defaultDailyReviewTableSettings.highContrast,
    useRankColumnColors: typeof source.useRankColumnColors === "boolean" ? source.useRankColumnColors : defaultDailyReviewTableSettings.useRankColumnColors,
    simplifyScenarioNames: typeof source.simplifyScenarioNames === "boolean" ? source.simplifyScenarioNames : defaultDailyReviewTableSettings.simplifyScenarioNames,
  };
}

function isDailyReviewDensity(value: unknown): value is DailyReviewTableSettings["density"] {
  return value === "ultra" || value === "compact" || value === "normal" || value === "wide";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadState(storageKey: string, fallbackBenchmarks: Benchmark[] = [], storage: StorageLike = localStorage): AppState {
  try {
    return normalizeState(JSON.parse(storage.getItem(storageKey) || "{}") as Partial<AppState>, fallbackBenchmarks);
  } catch {
    return normalizeState({}, fallbackBenchmarks);
  }
}

export interface StateSelections {
  selectedBenchmark: string;
  selectedDifficulty: string;
  selectedScenario: string;
  dailyReviewDate: string;
  dailyReviewDateIsManual: boolean;
  dailyReviewMetric: string;
  dailyReviewScope: string;
}

export function applySelectionsToState<T extends AppState>(state: T, selections: StateSelections): T {
  state.selectedBenchmark = selections.selectedBenchmark;
  state.selectedDifficulty = selections.selectedDifficulty;
  state.selectedScenario = selections.selectedScenario;
  state.dailyReviewDate = selections.dailyReviewDateIsManual ? selections.dailyReviewDate : "";
  state.dailyReviewMetric = selections.dailyReviewMetric;
  state.dailyReviewScope = selections.dailyReviewScope;
  return state;
}

export function saveState(storageKey: string, state: AppState, selections: StateSelections, storage: StorageLike = localStorage): void {
  applySelectionsToState(state, selections);
  try {
    storage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Keep the in-memory app usable if browser storage quota is exceeded.
  }
}

export function openHandleDb(indexedDb: IDBFactory, dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHandle({
  indexedDb,
  dbName,
  storeName,
  key,
  handle,
}: {
  indexedDb: IDBFactory;
  dbName: string;
  storeName: string;
  key: string;
  handle: FileSystemDirectoryHandle;
}): Promise<void> {
  const db = await openHandleDb(indexedDb, dbName, storeName);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadHandle({
  indexedDb,
  dbName,
  storeName,
  key,
}: {
  indexedDb: IDBFactory;
  dbName: string;
  storeName: string;
  key: string;
}): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDb(indexedDb, dbName, storeName);
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}
