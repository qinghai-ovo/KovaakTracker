// Interim desktop data source: the browser data source running inside the Tauri webview, with the
// stats folder read through Rust commands and threshold sync through tauri-plugin-http.
// Replaced by a SQLite-backed TauriData in roadmap M2d.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { CsvReadableFile } from "../services/fileImport.ts";
import type { StorageLike } from "../services/storage.ts";
import { createBrowserData, type StatsFolderApi, type StatsFolderRef } from "./browserData.ts";
import type { TrackerData } from "./trackerData.ts";

/** Where the chosen folder path is remembered between launches. */
export const DESKTOP_STATS_DIR_KEY = "kovaak-tracker-desktop-stats-dir";

interface DesktopFolder extends StatsFolderRef {
  /** Full path; also used as the display name, so the Data page shows where runs come from. */
  readonly path: string;
}

/** The Tauri calls the folder API needs; replaceable in tests. */
export interface DesktopFolderBackend {
  pickDirectory(defaultPath?: string): Promise<string | null>;
  listCsv(dir: string): Promise<string[]>;
  readCsv(dir: string, name: string): Promise<string>;
}

const tauriBackend: DesktopFolderBackend = {
  async pickDirectory(defaultPath) {
    const picked = await open({ directory: true, multiple: false, title: "选择 KovaaK 的 stats 文件夹", defaultPath });
    return typeof picked === "string" ? picked : null;
  },
  listCsv: (dir) => invoke<string[]>("list_stats_files", { dir }),
  readCsv: (dir, name) => invoke<string>("read_stats_file", { dir, name }),
};

const folderAt = (path: string): DesktopFolder => ({ name: path, path });

export function desktopFolderApi(storage: StorageLike, backend: DesktopFolderBackend = tauriBackend): StatsFolderApi {
  const remembered = () => storage.getItem(DESKTOP_STATS_DIR_KEY) || null;
  return {
    supported: () => true,
    async pick() {
      const path = await backend.pickDirectory(remembered() ?? undefined);
      if (!path) return null;
      try {
        storage.setItem(DESKTOP_STATS_DIR_KEY, path);
      } catch {
        // Still usable for this session; it just won't be remembered.
      }
      return folderAt(path);
    },
    async remembered() {
      const path = remembered();
      return path ? folderAt(path) : null;
    },
    // The app reads the folder itself; there is no browser permission to ask for.
    permission: async () => "granted",
    async files(handle) {
      const dir = (handle as DesktopFolder).path ?? handle.name;
      const names = await backend.listCsv(dir);
      return names.map((name): CsvReadableFile => ({ name, text: () => backend.readCsv(dir, name) }));
    },
  };
}

export function createDesktopData(storage: StorageLike = localStorage): TrackerData {
  return createBrowserData({ storage, folderApi: desktopFolderApi(storage), fetchImpl: tauriFetch as typeof fetch });
}
