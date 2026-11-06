import { median } from "./stats.ts";
import type { RecordExclusion, ScoreRecord } from "./types.ts";

export function recordKey(record: ScoreRecord): string {
  return record.id || `${record.source || "unknown"}:${record.scenario}:${record.date}:${record.score}`;
}

export function isExcluded(record: ScoreRecord, exclusions: Record<string, RecordExclusion>): boolean {
  return exclusions[recordKey(record)]?.status === "excluded";
}

export function isSuspicious(record: ScoreRecord, exclusions: Record<string, RecordExclusion>): boolean {
  return exclusions[recordKey(record)]?.status === "suspicious";
}

export function effectiveRecords(records: ScoreRecord[], exclusions: Record<string, RecordExclusion>): ScoreRecord[] {
  return records.filter((record) => !isExcluded(record, exclusions));
}

export function annotateRecordExclusions(records: ScoreRecord[], exclusions: Record<string, RecordExclusion>): Array<{ record: ScoreRecord; exclusion: RecordExclusion | null }> {
  return records.map((record) => ({ record, exclusion: exclusions[recordKey(record)] || null }));
}

export function buildRecordExclusions(records: ScoreRecord[], existing: Record<string, RecordExclusion> = {}, now = new Date().toISOString()): Record<string, RecordExclusion> {
  const next: Record<string, RecordExclusion> = { ...existing };
  records.forEach((record) => {
    const key = recordKey(record);
    if (record.score === 0) {
      next[key] = { recordKey: key, status: "excluded", reason: "zero-score", updatedAt: next[key]?.updatedAt || now };
    }
  });

  const byScenario = new Map<string, ScoreRecord[]>();
  records
    .filter((record) => Number.isFinite(record.score) && record.score > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((record) => {
      const key = recordKey(record);
      const previous = byScenario.get(record.scenario) || [];
      const baseline = previous
        .filter((item) => next[recordKey(item)]?.status !== "excluded")
        .slice(-30)
        .map((item) => item.score);
      const baselineMedian = median(baseline);
      if (!next[key] && baselineMedian !== null && record.score < baselineMedian * 0.5) {
        next[key] = { recordKey: key, status: "suspicious", reason: "low-vs-median", updatedAt: now };
      }
      if (next[key]?.status !== "excluded") previous.push(record);
      byScenario.set(record.scenario, previous);
    });

  return next;
}

export function excludeRecordManually(
  record: ScoreRecord,
  exclusions: Record<string, RecordExclusion>,
  note = "",
  now = new Date().toISOString(),
): Record<string, RecordExclusion> {
  const key = recordKey(record);
  return {
    ...exclusions,
    [key]: { recordKey: key, status: "excluded", reason: "manual", note, updatedAt: now },
  };
}

export function restoreRecordExclusion(record: ScoreRecord, exclusions: Record<string, RecordExclusion>): Record<string, RecordExclusion> {
  const key = recordKey(record);
  if (record.score === 0) return exclusions;
  const { [key]: _removed, ...rest } = exclusions;
  return rest;
}

/** How runs flagged as suspicious are treated: left out of metrics, or kept with a warning. */
export type SuspiciousPolicy = "ignore" | "warn";

export function countsTowardMetrics(record: ScoreRecord, exclusions: Record<string, RecordExclusion>, policy: SuspiciousPolicy = "ignore"): boolean {
  const status = exclusions[recordKey(record)]?.status;
  if (status === "excluded") return false;
  if (status === "suspicious") return policy === "warn";
  return true;
}

/** Marks a run the low-score rule flagged as valid, so it is never re-flagged. */
export function keepRecordManually(record: ScoreRecord, exclusions: Record<string, RecordExclusion>, now = new Date().toISOString()): Record<string, RecordExclusion> {
  const key = recordKey(record);
  if (record.score === 0) return exclusions;
  return { ...exclusions, [key]: { recordKey: key, status: "kept", reason: "manual", updatedAt: now } };
}

/** Toggles whether a run counts: ignore a counted run, or bring back an ignored / flagged one. */
export function toggleRecordCounted(
  record: ScoreRecord,
  exclusions: Record<string, RecordExclusion>,
  currentlyCounts: boolean,
  now = new Date().toISOString(),
): Record<string, RecordExclusion> {
  if (currentlyCounts) return excludeRecordManually(record, exclusions, "", now);
  return keepRecordManually(record, exclusions, now);
}
