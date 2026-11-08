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

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Local "HH:MM" of a timestamp; works for local ISO strings and UTC ("…Z") strings alike. */
export function fmtClock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Local "MM-DD" of a timestamp. */
export function fmtMonthDay(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local "11月3日 09:12" of a timestamp. */
export function fmtDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日 ${fmtClock(value)}`;
}

/** "VT Smoothbot Arm Easy" → "Smoothbot Arm" (only when the user turned on short names). */
export function shortScenarioName(name: string): string {
  return name.replace(/^VT\s+/i, "").replace(/\s+(Easier|Easy|Medium|Hard|Harder)$/i, "").trim() || name;
}

/** Short label of where the data comes from, shown next to import status. */
export function sourceLabel(source: "fixture" | "browser" | "tauri"): string {
  if (source === "fixture") return " · 示例数据";
  if (source === "browser") return " · 浏览器里的数据";
  return " · 桌面版";
}
