// Pure helpers for importing KovaaK stats CSV files into the saved state.
import { dedupeRecords } from "../domain/stats.ts";
import type { CsvImportStatus, ScoreRecord } from "../domain/types.ts";
import type { FailedImport } from "./trackerData.ts";

const FAILURE_TEXT: Record<string, string> = {
  empty: "文件为空",
  "missing-scenario": "找不到场景名",
  "missing-score": "找不到分数",
  "read-error": "读取失败",
};

export function failureText(reason: string): string {
  return FAILURE_TEXT[reason] ?? (reason || "无法解析");
}

/** The stats file a CSV run came from. */
export function sourceFileOf(record: ScoreRecord): string | null {
  if (record.source !== "csv") return null;
  return record.metadata?.sourceFile || record.note || null;
}

/** File names already imported successfully, so a rescan only has to read new files. */
export function importedFileNames(records: ScoreRecord[]): Set<string> {
  const names = new Set<string>();
  records.forEach((record) => {
    const name = sourceFileOf(record);
    if (name) names.add(name);
  });
  return names;
}

export interface ImportOutcome {
  csvRecords: ScoreRecord[];
  /** Runs that were not in the saved state before. */
  added: ScoreRecord[];
  failedImports: FailedImport[];
  scanned: number;
  succeeded: number;
}

/**
 * Merges freshly parsed runs into the saved CSV runs. A re-read file replaces its old run;
 * failures are remembered per file and cleared once the file imports successfully.
 */
export function mergeImport(existing: ScoreRecord[], imported: ScoreRecord[], statuses: CsvImportStatus[], previousFailures: FailedImport[]): ImportOutcome {
  const reread = new Set(imported.map(sourceFileOf).filter((name): name is string => Boolean(name)));
  const kept = existing.filter((record) => {
    const name = sourceFileOf(record);
    return !name || !reread.has(name);
  });
  const csvRecords = dedupeRecords([...kept, ...imported]);
  const before = new Set(existing.map((record) => record.id));
  const added = imported.filter((record) => !before.has(record.id));

  const scannedNames = new Set(statuses.map((status) => status.fileName));
  const failedImports = [
    ...previousFailures.filter((item) => !scannedNames.has(item.fileName)),
    ...statuses.filter((status) => !status.success).map((status) => ({ fileName: status.fileName, reason: failureText(status.failureReason) })),
  ];
  return {
    csvRecords,
    added,
    failedImports,
    scanned: statuses.length,
    succeeded: statuses.filter((status) => status.success).length,
  };
}

export function importMessage(outcome: ImportOutcome, folderName: string): string {
  if (!outcome.scanned) return `${folderName} · 没有新的成绩文件`;
  const failed = outcome.scanned - outcome.succeeded;
  return `${folderName} · 读取 ${outcome.scanned} 个文件 · 新增 ${outcome.added.length} 局${failed ? ` · ${failed} 个失败` : ""}`;
}
