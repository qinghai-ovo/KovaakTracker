import { effectiveRecords } from "./exclusions.ts";
import { localDateKey } from "./stats.ts";
import type { DailyReviewEntry, DailyReviewState, RecordExclusion, ScoreRecord, SetupProfile } from "./types.ts";

export const emptySetupProfile: SetupProfile = {
  mouse: "",
  mousepad: "",
  sensitivity: "",
  dpi: "",
  fov: "",
  notes: "",
};

export function normalizeSetupProfile(value: Partial<SetupProfile> | null | undefined): SetupProfile {
  const source = value || {};
  return {
    mouse: String(source.mouse || ""),
    mousepad: String(source.mousepad || ""),
    sensitivity: String(source.sensitivity || ""),
    dpi: String(source.dpi || ""),
    fov: String(source.fov || ""),
    notes: String(source.notes || ""),
  };
}

export function normalizeDailyReviewEntry(value: Partial<DailyReviewEntry> | null | undefined, dateKey: string): DailyReviewEntry {
  const source = value || {};
  const start = source.trainingTimeOverride?.start || "";
  const end = source.trainingTimeOverride?.end || "";
  const state = normalizeDailyReviewState(source.state);
  return {
    dateKey,
    note: String(source.note || ""),
    ...(hasDailyReviewState(state) ? { state } : {}),
    ...(start || end ? { trainingTimeOverride: { start, end } } : {}),
    ...(source.setupOverride ? { setupOverride: normalizeSetupOverride(source.setupOverride) } : {}),
  };
}

export function normalizeDailyReviews(value: Record<string, Partial<DailyReviewEntry>> | null | undefined): Record<string, DailyReviewEntry> {
  const source = value || {};
  return Object.fromEntries(Object.entries(source).map(([dateKey, entry]) => [dateKey, normalizeDailyReviewEntry(entry, dateKey)]));
}

export function normalizeSetupOverride(value: Partial<SetupProfile>): Partial<SetupProfile> {
  const normalized = normalizeSetupProfile(value);
  return Object.fromEntries(Object.entries(normalized).filter(([, item]) => item !== "")) as Partial<SetupProfile>;
}

export function normalizeDailyReviewState(value: Partial<DailyReviewState> | null | undefined): DailyReviewState {
  const source = value || {};
  return {
    caffeine: String(source.caffeine || ""),
    fatigue: String(source.fatigue || ""),
    sleep: String(source.sleep || ""),
    warmup: String(source.warmup || ""),
  };
}

function hasDailyReviewState(state: DailyReviewState): boolean {
  return Boolean(state.caffeine || state.fatigue || state.sleep || state.warmup);
}

export function inferTrainingTimeForDate(records: ScoreRecord[], exclusions: Record<string, RecordExclusion>, dateKey: string): { start: string; end: string } | null {
  const sameDay = effectiveRecords(records, exclusions)
    .filter((record) => localDateKey(record.date) === dateKey)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (!sameDay.length) return null;
  return {
    start: timePart(sameDay[0].date),
    end: timePart(sameDay[sameDay.length - 1].date),
  };
}

export function resolvedSetupProfile(defaultProfile: SetupProfile, entry: DailyReviewEntry | undefined): SetupProfile {
  return {
    ...defaultProfile,
    ...(entry?.setupOverride || {}),
  };
}

function timePart(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
