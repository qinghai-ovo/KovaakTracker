import { test } from "node:test";
import assert from "node:assert/strict";
import { DESKTOP_STATS_DIR_KEY, desktopFolderApi, type DesktopFolderBackend } from "../../src/data/desktopData.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

function fakeBackend(picked: string | null) {
  const calls: string[] = [];
  const backend: DesktopFolderBackend = {
    async pickDirectory(defaultPath) {
      calls.push(`pick:${defaultPath ?? ""}`);
      return picked;
    },
    async listCsv(dir) {
      calls.push(`list:${dir}`);
      return ["a.csv", "b.csv"];
    },
    async readCsv(dir, name) {
      calls.push(`read:${dir}:${name}`);
      return `text of ${name}`;
    },
  };
  return { backend, calls };
}

const STATS = "D:\\Games\\steam\\steamapps\\common\\FPSAimTrainer\\FPSAimTrainer\\stats";

test("picking a folder remembers its path and reads files through the backend", async () => {
  const storage = memoryStorage();
  const { backend, calls } = fakeBackend(STATS);
  const api = desktopFolderApi(storage, backend);

  assert.equal(api.supported(), true);
  assert.equal(await api.remembered(), null);
  const folder = await api.pick();
  assert.equal(folder?.name, STATS, "the full path is shown as the folder name");
  assert.equal(storage.getItem(DESKTOP_STATS_DIR_KEY), STATS);
  assert.equal(await api.permission(folder!, true), "granted");

  const files = await api.files(folder!);
  assert.deepEqual(files.map((file) => file.name), ["a.csv", "b.csv"]);
  assert.equal(await files[1].text(), "text of b.csv");
  assert.deepEqual(calls, ["pick:", `list:${STATS}`, `read:${STATS}:b.csv`], "files are read only when needed");

  // After a restart the remembered folder is used without asking again.
  const restarted = desktopFolderApi(storage, fakeBackend(null).backend);
  assert.equal((await restarted.remembered())?.name, STATS);
});

test("cancelling the picker keeps the remembered folder and opens at it", async () => {
  const storage = memoryStorage({ [DESKTOP_STATS_DIR_KEY]: STATS });
  const { backend, calls } = fakeBackend(null);
  const api = desktopFolderApi(storage, backend);

  assert.equal(await api.pick(), null);
  assert.equal(storage.getItem(DESKTOP_STATS_DIR_KEY), STATS);
  assert.deepEqual(calls, [`pick:${STATS}`]);
});
