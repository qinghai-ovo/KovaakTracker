export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value.toFixed(2)).toLocaleString("zh-CN");
}

export function formatSigned(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "-";
  const numericValue = Number(value);
  return `${numericValue >= 0 ? "+" : "-"}${formatNumber(Math.abs(numericValue))}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function toDateTimeInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
