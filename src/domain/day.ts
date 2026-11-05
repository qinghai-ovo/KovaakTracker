import { localDateKey } from "./stats.ts";
import type { WeekRange } from "./weeklyReview.ts";

/** Runs played before this hour count toward the previous training day. */
export const DEFAULT_DAY_START_HOUR = 4;

const HOUR_MS = 60 * 60 * 1000;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Local date key (YYYY-MM-DD) of the training day a moment belongs to. */
export function trainingDayKey(value: Date | string, dayStartHour = DEFAULT_DAY_START_HOUR): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return localDateKey(new Date(date.getTime() - dayStartHour * HOUR_MS));
}

export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

/** Monday-to-Sunday training week containing the given moment. */
export function trainingWeekRange(value: Date | string, dayStartHour = DEFAULT_DAY_START_HOUR): WeekRange {
  const dayKey = trainingDayKey(value, dayStartHour);
  const [year, month, day] = dayKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = shiftDayKey(dayKey, mondayOffset);
  return { start, end: shiftDayKey(start, 6) };
}

export function previousTrainingWeek(range: WeekRange): WeekRange {
  return { start: shiftDayKey(range.start, -7), end: shiftDayKey(range.end, -7) };
}

export function isDayInRange(dayKey: string, range: WeekRange): boolean {
  return Boolean(dayKey) && dayKey >= range.start && dayKey <= range.end;
}
