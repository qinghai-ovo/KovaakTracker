import { parseKovaakCsvWithStatus, type ParseKovaakCsvOptions } from "../core/csv.ts";
import { dedupeRecords } from "../core/stats.ts";
import type { CsvImportStatus, ScoreRecord } from "../core/types.ts";

export interface CsvReadableFile {
  name: string;
  lastModified?: number;
  text(): Promise<string>;
}

export async function parseCsvFiles(
  files: CsvReadableFile[],
  options: ParseKovaakCsvOptions = {},
): Promise<{ csvFiles: CsvReadableFile[]; imported: ScoreRecord[]; fileStatuses: CsvImportStatus[] }> {
  const csvFiles = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));
  const imported: ScoreRecord[] = [];
  const fileStatuses: CsvImportStatus[] = [];

  for (const file of csvFiles) {
    try {
      const result = parseKovaakCsvWithStatus(await file.text(), file.name, file.lastModified, options);
      fileStatuses.push(result.status);
      if (result.record) imported.push(result.record);
    } catch {
      fileStatuses.push({
        fileName: file.name,
        success: false,
        failureReason: "read-error",
        dateSource: "",
        matchedCurrentBenchmark: false,
      });
    }
  }

  return { csvFiles, imported, fileStatuses };
}

export function mergeImportedCsvRecords(existingRecords: ScoreRecord[], importedRecords: ScoreRecord[]): ScoreRecord[] {
  const importedFileNames = new Set(importedRecords.map((record) => record.metadata?.sourceFile || record.note).filter(Boolean));
  const retainedCsvRecords = existingRecords.filter((record) => record.source !== "csv" || !importedFileNames.has(record.metadata?.sourceFile || record.note));
  return dedupeRecords([...retainedCsvRecords, ...importedRecords]);
}

export async function filesFromStatsDirectory(directory: FileSystemDirectoryHandle): Promise<CsvReadableFile[]> {
  const files: CsvReadableFile[] = [];
  const entries = (directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  }).entries();
  for await (const [, handle] of entries) {
    if (handle.kind === "file" && handle.name.toLowerCase().endsWith(".csv")) {
      try {
        files.push(await handle.getFile());
      } catch {
        files.push({
          name: handle.name,
          lastModified: Date.now(),
          text: async () => {
            throw new Error("Cannot read file");
          },
        });
      }
    }
  }
  return files;
}
