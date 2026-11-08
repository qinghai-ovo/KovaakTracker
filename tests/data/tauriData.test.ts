import { test } from "node:test";
import assert from "node:assert/strict";
import { createTauriData, DESKTOP_STATS_DIR_KEY, importSummaryMessage, type TauriBackend } from "../../src/data/tauriData.ts";
import { benchmarksFromRows, recordFromRun, restoreFromBackup, rowsFromBenchmarks, runFromRecord, type AppData, type StoredRun } from "../../src/data/tauriRows.ts";
import { APP_STORAGE_KEY, LEGACY_STORAGE_KEY } from "../../src/data/legacyState.ts";
import { sampleThresholds, rankColors } from "../../src/data/fixtures/designSample.ts";
import { compactRecord } from "../../src/data/recordStore.ts";
import { parseKovaakCsvWithStatus } from "../../src/services/csv.ts";
import type { Benchmark, ScoreRecord } from "../../src/domain/types.ts";

const BENCHMARK = "Viscose Benchmarks S2";
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0).getTime();
const now = () => new Date(2026, 10, 6, 3, 0);

function fileRun(id: number, score: number, day: number, scenario = "Smoothbot Arm"): StoredRun {
  const playedAt = at(day, 20);
  const file = `${scenario} - Challenge - 2026.11.0${day}-20.00.00 Stats.csv`;
  return {
    id,
    identity: `csv:${file}:${new Date(playedAt).toISOString()}:${score}`,
    source: "file",
    scenario,
    score,
    playedAt,
    playedLocal: `2026-11-0${day}T20:00:00`,
    sourceFile: file,
    sensitivity: null,
    fov: 103,
    dpi: 1600,
    note: null,
  };
}

const benchmarks: Benchmark[] = [
  {
    benchmarkName: BENCHMARK,
    difficulties: [
      { difficultyName: "Easier", kovaaksBenchmarkId: "617", rankColors, scenarios: [{ name: "Smoothbot Arm", category: "Control Tracking", subcategory: "Arm", rankMaxes: sampleThresholds(2000) }] },
      { difficultyName: "Medium", rankColors, scenarios: [{ name: "Smoothbot Arm", category: "Control Tracking", subcategory: "Arm", rankMaxes: sampleThresholds(2400) }] },
    ],
  },
];

function savedData(): AppData {
  return {
    runs: [
      fileRun(1, 2580, 1),
      fileRun(2, 2620, 2),
      { ...fileRun(3, 2500, 3), identity: "manual-1", source: "manual", sourceFile: null, fov: null, dpi: null, note: "warm-up" },
      fileRun(4, 2700, 4),
    ],
    overrides: [{ identity: fileRun(2, 2620, 2).identity, status: "excluded", reason: "manual", note: null, updatedAt: at(5, 1) }],
    aliases: [{ rawName: "Smoothbot Arm Old", scenarioName: "Smoothbot Arm" }],
    benchmarks: rowsFromBenchmarks(benchmarks),
    tracked: [
      { benchmark: BENCHMARK, difficulty: "Medium", active: false },
      { benchmark: BENCHMARK, difficulty: "Easier", active: true },
    ],
    days: [{ dayKey: "2026-11-05", mood: { sleep: "一般" }, note: "手腕有点紧" }],
    plan: [{ scenarioName: "Smoothbot Arm", targetRuns: 4 }],
    setup: { mouse: "M", mousepad: "P", sensitivity: "0.32", dpi: "1600", fov: "103", notes: "" },
    settings: { "source.statsDir": "D:\\stats", "rules.dayStartHour": 5, "appearance.shortNames": true, "benchmark.syncedAt": "2026-11-05T01:12:00.000Z", "migration.webviewStorage": true },
    lastImportAt: at(5, 21),
  };
}

/** Stands in for the Rust commands: keeps a copy of the data and records every call. */
function fakeBackend(data: AppData = savedData()) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  let nextId = Math.max(0, ...data.runs.map((run) => run.id)) + 1;
  const backend: TauriBackend = {
    async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      calls.push({ command, args });
      const result = (() => {
        switch (command) {
          case "data_load":
            return structuredClone(data);
          case "import_status":
            return { dir: data.settings["source.statsDir"] ?? null, watching: true, error: null, runs: data.runs.length, failed: [{ fileName: "bad.csv", reason: "missing-score" }] };
          case "runs_after":
            return data.runs.filter((run) => run.id > (args!.after as number));
          case "manual_run_save":
            data.runs.push({ ...(args!.run as StoredRun), id: nextId++ });
            return null;
          case "setting_set":
            data.settings[args!.key as string] = args!.value;
            return null;
          case "stats_dir_set":
          case "import_rescan":
            return { files: 10, read: 2, added: 1, failed: [] };
          default:
            return null;
        }
      })();
      return result as T;
    },
    async listen<T>(event: string, handler: (payload: T) => void) {
      handlers.set(event, handler as (payload: unknown) => void);
      return () => handlers.delete(event);
    },
    pickDirectory: async () => "E:\\KovaaK\\stats",
    fetch: (async () => {
      throw new Error("offline");
    }) as typeof fetch,
  };
  return {
    backend,
    calls,
    data,
    emit: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    called: (command: string) => calls.filter((call) => call.command === command),
    addRun: (run: StoredRun) => data.runs.push({ ...run, id: nextId++ }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loaded(fake: ReturnType<typeof fakeBackend>, webviewStorage: Storage | null = null) {
  const data = createTauriData({ backend: fake.backend, clock: now, webviewStorage, tick: false });
  for (let i = 0; i < 20 && data.getSnapshot().loading; i += 1) await settle();
  assert.equal(data.getSnapshot().loading, false);
  return data;
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    key: () => null,
    get length() {
      return items.size;
    },
  };
}

test("builds the snapshot from the database", async () => {
  const fake = fakeBackend();
  const data = await loaded(fake);
  const snapshot = data.getSnapshot();
  assert.equal(snapshot.source, "tauri");
  assert.equal(snapshot.records.length, 4);
  assert.equal(snapshot.records.filter((record) => record.source === "manual").length, 1);
  assert.equal(snapshot.benchmark.difficulty, "Easier");
  assert.equal(snapshot.benchmark.scenarios.length, 1);
  assert.deepEqual(
    snapshot.tracked.map((item) => [item.difficulty, item.active]),
    [
      ["Medium", false],
      ["Easier", true],
    ],
  );
  assert.equal(snapshot.exclusions[fileRun(2, 2620, 2).identity]?.status, "excluded");
  assert.deepEqual(snapshot.aliases, { "Smoothbot Arm Old": "Smoothbot Arm" });
  assert.deepEqual(snapshot.plan, [{ scenarioName: "Smoothbot Arm", targetRuns: 4 }]);
  assert.deepEqual(snapshot.days["2026-11-05"], { mood: { sleep: "一般" }, note: "手腕有点紧" });
  assert.equal(snapshot.settings.dayStartHour, 5);
  assert.equal(snapshot.preferences.shortNames, true);
  assert.equal(snapshot.preferences.autoImport, true, "missing settings use the defaults");
  assert.equal(snapshot.setup.mouse, "M");
  assert.equal(snapshot.statsDir, "D:\\stats");
  assert.equal(snapshot.watching, true);
  assert.deepEqual(snapshot.failedImports, [{ fileName: "bad.csv", reason: "找不到分数" }]);
  assert.equal(snapshot.lastImportAt, "21:00");
  assert.equal(fake.called("data_restore").length, 0, "nothing to migrate");
});

test("a stored file run looks like the same run imported in the browser", () => {
  const file = "VT Pasu Intermediate S5 - Challenge - 2026.11.03-19.31.02 Stats.csv";
  const csv = "Kill #,Timestamp\n1,19:31:02\n\nScore:,712.5\nScenario:,VT Pasu Intermediate S5\nFOV:,103.0\nDPI:,1600\n";
  const browser = compactRecord(parseKovaakCsvWithStatus(csv, file, 0).record!);
  const playedAt = new Date(browser.date).getTime();
  const stored = recordFromRun({
    id: 1,
    identity: browser.id!,
    source: "file",
    scenario: "VT Pasu Intermediate S5",
    score: 712.5,
    playedAt,
    playedLocal: "2026-11-03T19:31:02",
    sourceFile: file,
    sensitivity: null,
    fov: 103,
    dpi: 1600,
    note: null,
  });
  // The one intended difference: no sensitivity in the file is "unknown" in Rust, 0 in TypeScript.
  assert.equal(browser.metadata?.sensitivity, 0);
  const { sensitivity: _zero, ...browserMetadata } = browser.metadata!;
  assert.deepEqual(stored, { ...browser, metadata: browserMetadata });
});

test("changes are written through the matching commands", async () => {
  const fake = fakeBackend();
  const data = await loaded(fake);
  const run = data.getSnapshot().records.find((record) => record.score === 2700)!;

  data.toggleRunCounted(run, true);
  assert.equal(data.getSnapshot().exclusions[run.id!]?.status, "excluded");
  const [set] = fake.called("override_set");
  assert.deepEqual({ ...(set.args!.item as object), updatedAt: 0 }, { identity: run.id, status: "excluded", reason: "manual", note: null, updatedAt: 0 });

  data.addManualRun({ scenario: "Smoothbot Arm", score: 2650, date: "2026-11-06T02:30:00", note: "late" });
  const saved = fake.called("manual_run_save")[0].args!.run as StoredRun;
  assert.equal(saved.source, "manual");
  assert.equal(saved.playedLocal, "2026-11-06T02:30:00");
  assert.equal(saved.playedAt, new Date(2026, 10, 6, 2, 30).getTime());
  assert.equal(saved.note, "late");
  data.deleteManualRun(saved.identity);
  assert.deepEqual(fake.called("manual_run_delete")[0].args, { identity: saved.identity });
  assert.equal(data.getSnapshot().records.some((record) => record.id === saved.identity), false);

  data.confirmAlias("Smoothbot", "Smoothbot Arm");
  assert.deepEqual(fake.called("alias_set")[0].args, { alias: { rawName: "Smoothbot", scenarioName: "Smoothbot Arm" } });

  data.updateSettings({ dayStartHour: 4 });
  assert.deepEqual(fake.called("setting_set").map((call) => call.args), [{ key: "rules.dayStartHour", value: 4 }], "only the changed setting");

  data.updatePreferences({ autoImport: false });
  assert.deepEqual(fake.called("import_set_auto")[0].args, { enabled: false });

  data.updateDay("2026-11-05", { mood: { energy: "充沛" } });
  assert.deepEqual(fake.called("day_save")[0].args, { day: { dayKey: "2026-11-05", mood: { sleep: "一般", energy: "充沛" }, note: "手腕有点紧" } });

  data.selectTracked(`${BENCHMARK}::Medium`);
  assert.equal(data.getSnapshot().benchmark.difficulty, "Medium");
  assert.deepEqual(fake.called("tracked_save").at(-1)!.args, {
    items: [
      { benchmark: BENCHMARK, difficulty: "Medium", active: true },
      { benchmark: BENCHMARK, difficulty: "Easier", active: false },
    ],
  });

  data.setTracked(BENCHMARK, "Medium", false);
  assert.equal(data.getSnapshot().benchmark.difficulty, "Easier", "stopping the active one switches to the next");
  assert.deepEqual(fake.called("tracked_save").at(-1)!.args, { items: [{ benchmark: BENCHMARK, difficulty: "Easier", active: true }] });

  data.addToPlan("Smoothbot Arm");
  assert.equal(fake.called("plan_save").length, 0, "already planned");
});

test("new runs from the importer are added once and announced", async () => {
  const fake = fakeBackend();
  const data = await loaded(fake);
  const announced: ScoreRecord[][] = [];
  data.onEvent((event) => announced.push(event.records));

  fake.addRun(fileRun(0, 2760, 5));
  fake.emit("runs:added", { count: 1 });
  fake.emit("runs:added", { count: 1 });
  for (let i = 0; i < 10; i += 1) await settle();

  assert.equal(data.getSnapshot().records.length, 5);
  assert.equal(announced.length, 1);
  assert.equal(announced[0][0].score, 2760);
  assert.deepEqual(
    fake.called("runs_after").map((call) => call.args),
    [{ after: 4 }, { after: 5 }],
  );

  fake.emit("import:progress", { done: 1000, total: 15000 });
  assert.deepEqual(data.getSnapshot().importProgress, { done: 1000, total: 15000 });
  fake.emit("watcher:status", { dir: "D:\\stats", watching: false, error: "无法监听 stats 文件夹：gone" });
  assert.equal(data.getSnapshot().watching, false);
  assert.equal(data.getSnapshot().folderError, "无法监听 stats 文件夹：gone");
});

test("choosing the folder and rescanning wait for the import and report it", async () => {
  const fake = fakeBackend();
  const data = await loaded(fake);
  assert.equal(await data.chooseStatsFolder!(), "E:\\KovaaK\\stats · 读取 2 个文件 · 新增 1 局");
  assert.deepEqual(fake.called("stats_dir_set")[0].args, { path: "E:\\KovaaK\\stats" });
  assert.equal(data.getSnapshot().statsDir, "E:\\KovaaK\\stats");
  await data.rescanStatsFolder!({ full: true });
  assert.deepEqual(fake.called("import_rescan")[0].args, { full: true });
  assert.equal(importSummaryMessage({ files: 3, read: 0, added: 0, failed: [] }, "stats"), "stats · 没有新的成绩文件");
});

test("a browser backup is restored into the database", async () => {
  const fake = fakeBackend();
  const data = await loaded(fake);
  const backup = {
    benchmarks,
    csvRecords: [{ id: "csv:x.csv:2026-11-01T11:00:00.000Z:2580", scenario: "Smoothbot Arm", rawScenario: "Smoothbot Arm", score: 2580, date: "2026-11-01T11:00:00.000Z", source: "csv", metadata: { sourceFile: "x.csv", sourceType: "csv" } }],
    manualRecords: [{ id: "manual-9", scenario: "Smoothbot Arm", score: 2500, date: "2026-11-03T12:00:00.000Z", source: "manual", note: "n" }],
    selectedBenchmark: BENCHMARK,
    selectedDifficulty: "Medium",
    recordExclusions: { "manual-9": { recordKey: "manual-9", status: "excluded", reason: "manual", updatedAt: "2026-11-04T00:00:00.000Z" } },
    dailyReviews: { "2026-11-03": { dateKey: "2026-11-03", note: "ok" } },
    newUi: { plan: [{ scenarioName: "Smoothbot Arm", targetRuns: 2 }], aliases: { a: "Smoothbot Arm" }, moods: { "2026-11-03": { sleep: "好" } }, tracked: [{ benchmark: BENCHMARK, difficulty: "Easier" }] },
  };
  const file = { text: async () => JSON.stringify(backup) } as File;
  assert.equal(await data.importBackup!(file), "已恢复 2 局成绩");
  const restore = fake.called("data_restore")[0].args!.backup as ReturnType<typeof restoreFromBackup>;
  assert.deepEqual(
    restore.runs.map((run) => [run.identity, run.source, run.sourceFile]),
    [
      ["csv:x.csv:2026-11-01T11:00:00.000Z:2580", "legacy", "x.csv"],
      ["manual-9", "manual", null],
    ],
  );
  assert.deepEqual(restore.overrides.map((item) => [item.identity, item.status, item.updatedAt]), [["manual-9", "excluded", Date.parse("2026-11-04T00:00:00.000Z")]]);
  assert.deepEqual(restore.tracked, [
    { benchmark: BENCHMARK, difficulty: "Easier", active: false },
    { benchmark: BENCHMARK, difficulty: "Medium", active: true },
  ]);
  assert.deepEqual(restore.days, [{ dayKey: "2026-11-03", mood: { sleep: "好" }, note: "ok" }]);
  assert.deepEqual(benchmarksFromRows(restore.benchmarks!), benchmarks, "benchmarks survive the trip through database rows");
  assert.equal(fake.called("data_load").length, 2, "reloaded after the restore");
  await assert.rejects(data.importBackup!({ text: async () => "{}" } as File), /不是可识别的备份文件/);
});

test("data from the interim desktop app's webview storage moves into an empty database once", async () => {
  const fresh: AppData = { ...savedData(), runs: [], overrides: [], aliases: [], tracked: [], days: [], plan: [], settings: {} };
  const fake = fakeBackend(fresh);
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify({ benchmarks, manualRecords: [{ id: "manual-1", scenario: "Smoothbot Arm", score: 2500, date: "2026-11-03T12:00:00.000Z", source: "manual" }], csvRecords: [] }),
    [APP_STORAGE_KEY]: JSON.stringify({ plan: [{ scenarioName: "Smoothbot Arm", targetRuns: 3 }] }),
    [DESKTOP_STATS_DIR_KEY]: "D:\\old\\stats",
  });
  await loaded(fake, storage);
  const restore = fake.called("data_restore")[0].args!.backup as ReturnType<typeof restoreFromBackup>;
  assert.deepEqual(restore.runs.map((run) => run.identity), ["manual-1"]);
  assert.deepEqual(restore.plan, [{ scenarioName: "Smoothbot Arm", targetRuns: 3 }]);
  assert.deepEqual(fake.called("stats_dir_set")[0].args, { path: "D:\\old\\stats" });
  assert.equal(fake.data.settings["migration.webviewStorage"], true);

  await loaded(fake, storage);
  assert.equal(fake.called("data_restore").length, 1, "only once");
});

test("a manual run keeps its local time when stored", () => {
  const run = runFromRecord({ id: "manual-2", scenario: "Smoothbot Arm", score: 1, date: new Date(2026, 10, 3, 23, 5, 9).toISOString(), source: "manual" }, "manual")!;
  assert.equal(run.playedLocal, "2026-11-03T23:05:09");
  assert.equal(runFromRecord({ id: "x", scenario: "", score: 1, date: "bad" }, "legacy"), null);
});
