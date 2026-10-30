import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { findBenchmarkScenarioName as matchBenchmarkScenarioName } from "../../core/scenario.ts";
import { loadHandle, saveHandle } from "../../core/storage.ts";
import type { AppState, BenchmarkScenario } from "../../core/types.ts";
import { filesFromStatsDirectory, mergeImportedCsvRecords, parseCsvFiles } from "../../services/fileImport.ts";

const STATS_HANDLE_DB = "kovaak-benchmark-tracker-handles";
const STATS_HANDLE_STORE = "handles";
const STATS_HANDLE_KEY = "stats-directory";

export function useStatsImport({
  scenarios,
  setState,
}: {
  scenarios: BenchmarkScenario[];
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  const [statsStatus, setStatsStatus] = useState("等待选择 Stats 文件夹");

  const importStatsDirectory = useCallback(
    async (directory: FileSystemDirectoryHandle) => {
      setStatsStatus(`正在读取 ${directory.name}...`);
      const files = await filesFromStatsDirectory(directory);
      const { imported, fileStatuses } = await parseCsvFiles(files, {
        matchScenarioName: (name) => matchBenchmarkScenarioName(name, scenarios),
      });
      setState((current) => ({
        ...current,
        csvRecords: mergeImportedCsvRecords(current.csvRecords, imported),
        statsFolderName: directory.name,
        statsFolderUpdatedAt: new Date().toISOString(),
      }));
      const successful = fileStatuses.filter((status) => status.success).length;
      setStatsStatus(`扫描 ${fileStatuses.length} 个 CSV · 成功 ${successful}`);
    },
    [scenarios, setState],
  );

  const restoreSavedStatsFolder = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) return;
    try {
      const directory = await loadHandle({
        indexedDb: indexedDB,
        dbName: STATS_HANDLE_DB,
        storeName: STATS_HANDLE_STORE,
        key: STATS_HANDLE_KEY,
      });
      if (!directory) return;
      setState((current) => ({ ...current, statsFolderName: directory.name }));
      const permission = await (directory as FileSystemDirectoryHandle & {
        queryPermission(options: { mode: "read" }): Promise<PermissionState>;
      }).queryPermission({ mode: "read" });
      if (permission === "granted") {
        await importStatsDirectory(directory);
      } else {
        setStatsStatus(`已记住 ${directory.name}，点击按钮授权后更新`);
      }
    } catch {
      setStatsStatus("浏览器需要重新授权 Stats 文件夹，请点击选择");
    }
  }, [importStatsDirectory, setState]);

  const selectStatsFolder = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      setStatsStatus("当前浏览器不支持文件夹选择，请使用 CSV 导入");
      return;
    }
    try {
      const directory = await (window as Window & {
        showDirectoryPicker(options?: { mode?: "read" }): Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: "read" });
      await saveHandle({
        indexedDb: indexedDB,
        dbName: STATS_HANDLE_DB,
        storeName: STATS_HANDLE_STORE,
        key: STATS_HANDLE_KEY,
        handle: directory,
      });
      await importStatsDirectory(directory);
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") setStatsStatus("读取文件夹失败");
    }
  }, [importStatsDirectory]);

  const importCsvFileList = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));
      if (!csvFiles.length) {
        setStatsStatus("没有找到 CSV 文件");
        return;
      }
      const folderName = csvFiles[0]?.webkitRelativePath?.split("/")?.[0];
      setStatsStatus(`正在读取 ${csvFiles.length} 个 CSV...`);
      const { imported, fileStatuses } = await parseCsvFiles(csvFiles, {
        matchScenarioName: (name) => matchBenchmarkScenarioName(name, scenarios),
      });
      setState((current) => ({
        ...current,
        csvRecords: mergeImportedCsvRecords(current.csvRecords, imported),
        statsFolderName: folderName || current.statsFolderName,
      }));
      const successful = fileStatuses.filter((status) => status.success).length;
      setStatsStatus(`扫描 ${fileStatuses.length} 个 CSV · 成功 ${successful} · 失败 ${fileStatuses.length - successful}`);
    },
    [scenarios, setState],
  );

  const clearCsvRecords = useCallback(() => {
    setState((current) => ({ ...current, csvRecords: [] }));
    setStatsStatus("已清空 CSV 导入记录");
  }, [setState]);

  return {
    clearCsvRecords,
    importCsvFileList,
    restoreSavedStatsFolder,
    selectStatsFolder,
    statsStatus,
  };
}
