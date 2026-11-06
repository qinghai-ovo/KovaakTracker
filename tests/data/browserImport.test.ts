import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserData, FOLDER_NOT_PICKED, type StatsFolderApi } from "../../src/data/browserData.ts";
import { importedFileNames, mergeImport } from "../../src/data/importLogic.ts";
import { APP_STORAGE_KEY, LEGACY_STORAGE_KEY, parseAppStore } from "../../src/data/legacyState.ts";
import { rankColors, sampleThresholds } from "../../src/data/fixtures/designSample.ts";
import { memoryRecordStore } from "../../src/data/recordStore.ts";
import type { CsvReadableFile } from "../../src/services/fileImport.ts";
import type { TrackerEvent } from "../../src/data/trackerData.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

function statsFile(scenario: string, score: number, stamp: string): CsvReadableFile {
  const name = `${scenario} - Challenge - ${stamp} Stats.csv`;
  return { name, lastModified: 0, text: async () => `Scenario,Score,Sensitivity,FOV,DPI\n${scenario},${score},0.32,103,1600` };
}

const brokenFile: CsvReadableFile = { name: "Broken - Challenge - 2026.11.05-20.00.00 Stats.csv", lastModified: 0, text: async () => "" };

function savedState() {
  return {
    benchmarks: [{ benchmarkName: "Viscose Benchmarks S2", difficulties: [{ difficultyName: "Easier", kovaaksBenchmarkId: 2335, rankColors, scenarios: [{ name: "Smoothbot Arm", category: "Control Tracking", subcategory: "Arm", rankMaxes: sampleThresholds(2000) }] }] }],
    csvRecords: [],
    manualRecords: [],
    selectedBenchmark: "Viscose Benchmarks S2",
    selectedDifficulty: "Easier",
  };
}

function fakeFolder(files: CsvReadableFile[]): StatsFolderApi & { files: StatsFolderApi["files"]; reads: number } {
  const handle = { name: "stats", kind: "directory" } as unknown as FileSystemDirectoryHandle;
  const api = {
    reads: 0,
    supported: () => true,
    pick: async () => handle,
    remembered: async () => handle,
    permission: async () => "granted" as PermissionState,
    files: async () => {
      api.reads += 1;
      return files;
    },
  };
  return api;
}

const clock = () => new Date(2026, 10, 5, 21, 0);

test("mergeImport replaces re-read files and tracks failures per file", () => {
  const first = { id: "a", scenario: "S", score: 1, date: "2026-11-01T00:00:00Z", source: "csv" as const, metadata: { sourceFile: "f1.csv", sourceType: "csv" as const } };
  const reread = { ...first, id: "a2", score: 2 };
  const outcome = mergeImport(
    [first],
    [reread],
    [
      { fileName: "f1.csv", success: true, failureReason: "", dateSource: "csv", matchedCurrentBenchmark: true },
      { fileName: "bad.csv", success: false, failureReason: "missing-score", dateSource: "", matchedCurrentBenchmark: false },
    ],
    [{ fileName: "old.csv", reason: "文件为空" }, { fileName: "f1.csv", reason: "读取失败" }],
  );
  assert.deepEqual(outcome.csvRecords.map((record) => record.score), [2]);
  assert.deepEqual(outcome.added.map((record) => record.id), ["a2"]);
  assert.deepEqual(outcome.failedImports, [
    { fileName: "old.csv", reason: "文件为空" },
    { fileName: "bad.csv", reason: "找不到分数" },
  ]);
  assert.deepEqual([...importedFileNames(outcome.csvRecords)], ["f1.csv"]);
});

test("choosing the stats folder imports runs into the record store", async () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(savedState()) });
  const folder = fakeFolder([statsFile("Smoothbot Arm", 2740, "2026.11.05-19.31.00"), statsFile("Smoothbot Arm", 2610, "2026.11.05-19.35.00"), brokenFile]);
  const recordStore = memoryRecordStore();
  const data = createBrowserData({ storage, clock, watch: false, folderApi: folder, recordStore });
  const events: TrackerEvent[] = [];
  data.onEvent((event) => events.push(event));

  const message = await data.chooseStatsFolder!();
  assert.match(message, /读取 3 个文件 · 新增 2 局 · 1 个失败/);
  const snapshot = data.getSnapshot();
  assert.equal(snapshot.records.length, 2);
  assert.equal(snapshot.statsDir, "stats");
  assert.equal(snapshot.folderAccess, "ready");
  assert.deepEqual(snapshot.failedImports.map((item) => item.reason), ["文件为空"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].records.length, 2);

  const saved = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY)!);
  assert.equal(saved.statsFolderName, "stats");
  assert.equal((saved.csvRecords ?? []).length, 0, "runs no longer go into the small localStorage entry");
  const stored = await recordStore.loadAll();
  assert.equal(stored.length, 2);
  assert.equal(stored[0].scenario, "Smoothbot Arm");
  assert.equal(stored[0].metadata?.rawMetadata, undefined, "raw CSV fields are not kept");
  assert.equal(stored[0].metadata?.dpi, 1600);
  assert.equal(parseAppStore(storage.getItem(APP_STORAGE_KEY)).failedImports.length, 1);

  // A rescan only reads files it has not imported yet (the broken one is retried).
  const again = await data.rescanStatsFolder!();
  assert.match(again, /读取 1 个文件 · 新增 0 局 · 1 个失败/);
  const full = await data.rescanStatsFolder!({ full: true });
  assert.match(full, /读取 3 个文件 · 新增 0 局/);
  assert.equal(data.getSnapshot().records.length, 2, "re-reading never duplicates runs");
});

test("a folder pick that comes back empty points to Chrome/Edge and changes nothing", async () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(savedState()) });
  const folder = fakeFolder([statsFile("Smoothbot Arm", 2740, "2026.11.05-19.31.00")]);
  folder.pick = async () => null;
  const data = createBrowserData({ storage, clock, watch: false, folderApi: folder });

  const message = await data.chooseStatsFolder!();
  assert.equal(message, FOLDER_NOT_PICKED);
  assert.match(message, /Chrome 或 Edge/);
  assert.equal(folder.reads, 0);
  assert.equal(data.getSnapshot().records.length, 0);
  assert.notEqual(data.getSnapshot().folderAccess, "ready");
});

test("backup round trip restores runs and the new UI's own state", async () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(savedState()) });
  const data = createBrowserData({ storage, clock, watch: false, folderApi: fakeFolder([statsFile("Smoothbot Arm", 2740, "2026.11.05-19.31.00")]) });
  await data.chooseStatsFolder!();
  data.addToPlan("Smoothbot Arm");
  const backup = JSON.stringify(data.backup!());

  const fresh = memoryStorage();
  const restored = createBrowserData({ storage: fresh, clock, watch: false, folderApi: fakeFolder([]) });
  const message = await restored.importBackup!({ text: async () => backup } as File);
  assert.equal(message, "已恢复 1 局成绩");
  assert.equal(restored.getSnapshot().records.length, 1);
  assert.deepEqual(restored.getSnapshot().plan, [{ scenarioName: "Smoothbot Arm", targetRuns: 3 }]);
  await assert.rejects(restored.importBackup!({ text: async () => "{\"hello\":1}" } as File), /不是可识别的备份文件/);
});

test("benchmark sync keeps the list when EVXL fails and stores the KovaaK thresholds", async () => {
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(savedState()) });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("kovaaks.com")) {
      return new Response(JSON.stringify({ categories: { "Control Tracking": { subcategories: { Arm: { scenarios: { "Smoothbot Arm": { rank_maxes: [2100, 2300] }, "Air Angelic": { rank_maxes: [1700, 1900] } } } } } } }));
    }
    return new Response("nope", { status: 500 });
  }) as typeof fetch;
  const data = createBrowserData({ storage, clock, watch: false, folderApi: fakeFolder([]), fetchImpl });
  const message = await data.syncBenchmark!();
  assert.match(message, /EVXL 列表更新失败/);
  assert.match(message, /段位线：Easier · 2 个场景/);
  const snapshot = data.getSnapshot();
  assert.deepEqual(snapshot.benchmark.scenarios.map((scenario) => scenario.name).sort(), ["Air Angelic", "Smoothbot Arm"]);
  assert.deepEqual(snapshot.benchmark.scenarios.find((scenario) => scenario.name === "Smoothbot Arm")!.rankMaxes, [2100, 2300]);
  assert.ok(snapshot.benchmark.syncedAt);
});

const settle = async (data: { getSnapshot(): { loading: boolean } }) => {
  for (let i = 0; i < 50 && data.getSnapshot().loading; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

test("runs the classic app kept in localStorage move into the record store", async () => {
  const legacyRun = { id: "csv:old", scenario: "Smoothbot Arm", score: 2500, date: "2026-11-01T12:00:00.000Z", source: "csv", note: "old.csv", metadata: { sourceFile: "old.csv", sourceType: "csv", rawMetadata: { a: "1" } } };
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify({ ...savedState(), csvRecords: [legacyRun] }) });
  const recordStore = memoryRecordStore();
  const data = createBrowserData({ storage, clock, watch: false, folderApi: fakeFolder([]), recordStore });
  await settle(data);
  assert.equal(data.getSnapshot().loading, false);
  assert.equal(data.getSnapshot().records.length, 1);
  assert.deepEqual((await recordStore.loadAll()).map((record) => record.id), ["csv:old"]);
  assert.equal(JSON.parse(storage.getItem(LEGACY_STORAGE_KEY)!).csvRecords.length, 0, "localStorage is freed");
  // A second start reads the record store, not localStorage.
  const again = createBrowserData({ storage, clock, watch: false, folderApi: fakeFolder([]), recordStore });
  await settle(again);
  assert.equal(again.getSnapshot().records.length, 1);
});

test("a full browser storage is reported instead of silently dropping the change", async () => {
  const items = new Map([[LEGACY_STORAGE_KEY, JSON.stringify(savedState())]]);
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
  };
  const data = createBrowserData({ storage, clock, watch: false, folderApi: fakeFolder([]), recordStore: memoryRecordStore() });
  await settle(data);
  data.updateSetup({ dpi: "800" });
  assert.equal(data.getSnapshot().setup.dpi, "800", "the edit is kept for this session");
  assert.match(data.getSnapshot().storageWarning ?? "", /存储空间不足/);
});
