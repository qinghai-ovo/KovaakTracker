const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function fmtScore(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? "—" : String(Math.round(value));
}

export function fmtPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function fmtSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "±0.0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}

export function deltaColor(value: number | null): string {
  if (value === null) return "var(--faint)";
  if (value >= 0.05) return "var(--positive)";
  if (value <= -0.05) return "var(--negative)";
  return "var(--muted)";
}

/** "2026-11-03" → "11月3日 · 周二" */
export function fmtDayHeader(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${month}月${day}日 · ${WEEKDAYS[date.getDay()]}`;
}

/** "2026-10-27" → "10月27日" */
export function fmtShortDay(dayKey: string): string {
  const [, month, day] = dayKey.split("-").map(Number);
  return `${month}月${day}日`;
}

export function fmtClock(localIso: string): string {
  return localIso.slice(11, 16);
}
