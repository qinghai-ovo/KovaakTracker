import type { ScoreRecord } from "./types.ts";

export function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function median(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2) return valid[middle];
  return (valid[middle - 1] + valid[middle]) / 2;
}

export function daysBetween(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / 86_400_000;
}

export function dedupeRecords<T extends ScoreRecord>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id || `${record.scenario}:${record.date}:${record.score}`, record])).values()];
}

export function localDateKey(date: Date | string): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
