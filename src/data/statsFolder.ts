// Browser access to the KovaaK stats folder (File System Access API, Chrome / Edge).
// The folder handle is stored in the same IndexedDB slot as the classic app, so both share it.
import { loadHandle, saveHandle } from "../services/storage.ts";

const HANDLE_DB = "kovaak-benchmark-tracker-handles";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "stats-directory";

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};

export function folderPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Opens the folder picker; null when the user cancels. */
export async function pickStatsFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await (window as unknown as {
      showDirectoryPicker(options?: { mode?: "read"; id?: string }): Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({ mode: "read", id: "kovaak-stats" });
    await saveHandle({ indexedDb: indexedDB, dbName: HANDLE_DB, storeName: HANDLE_STORE, key: HANDLE_KEY, handle });
    return handle;
  } catch (error) {
    if ((error as DOMException | undefined)?.name === "AbortError") return null;
    throw error;
  }
}

export async function rememberedStatsFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!folderPickerSupported()) return null;
  try {
    return await loadHandle({ indexedDb: indexedDB, dbName: HANDLE_DB, storeName: HANDLE_STORE, key: HANDLE_KEY });
  } catch {
    return null;
  }
}

/** Current read permission; `request` asks the user (must run inside a click). */
export async function folderPermission(handle: FileSystemDirectoryHandle, request = false): Promise<PermissionState> {
  const withPermission = handle as PermissionHandle;
  try {
    const state = await withPermission.queryPermission({ mode: "read" });
    if (state === "granted" || !request) return state;
    return await withPermission.requestPermission({ mode: "read" });
  } catch {
    return "denied";
  }
}
