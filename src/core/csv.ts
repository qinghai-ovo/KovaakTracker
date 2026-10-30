import { normalizeScenarioName, scenarioFromFileName } from "./scenario.ts";
import type { CsvParseResult, ScoreRecord } from "./types.ts";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

export function makeHeaderLookup(header: string[], row: string[]): Record<string, string | undefined> {
  return header.reduce<Record<string, string | undefined>>((lookup, name, index) => {
    lookup[normalizeFieldName(name)] = row[index];
    return lookup;
  }, {});
}

export function makeKeyValueLookup(rows: string[][]): Record<string, string | undefined> {
  const lookup: Record<string, string | undefined> = {};
  rows.forEach((row) => {
    if (row.length < 2) return;
    const key = normalizeFieldName(row[0]);
    if (!key) return;
    lookup[key] = row[1];
  });
  return lookup;
}

export function pick(lookup: Record<string, string | undefined>, names: string[]): string {
  for (const name of names) {
    const key = normalizeFieldName(name);
    if (lookup[key] !== undefined && String(lookup[key]).trim() !== "") return String(lookup[key]);
  }
  return "";
}

export function rowContainsField(row: string[], names: string[]): boolean {
  const fields = new Set(row.map((cell) => normalizeFieldName(cell)));
  return names.some((name) => fields.has(normalizeFieldName(name)));
}

export function normalizeFieldName(value: unknown): string {
  return String(value).replace(/:$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  return Number(String(value).replace(/,/g, "").trim());
}

export function parseKovaakDate(value: unknown): Date | null {
  if (!value) return null;
  const direct = new Date(String(value));
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

export function parseKovaakDateFromFileName(fileName: string): Date | null {
  const match = fileName.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})-(\d{1,2})[.-](\d{1,2})[.-](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function parseKovaakCsv(text: string, fileName: string, lastModified?: number, options: ParseKovaakCsvOptions = {}): ScoreRecord | null {
  return parseKovaakCsvWithStatus(text, fileName, lastModified, options).record;
}

export interface ParseKovaakCsvOptions {
  matchScenarioName?: (name: string) => string | null;
}

export function parseKovaakCsvWithStatus(text: string, fileName: string, lastModified?: number, options: ParseKovaakCsvOptions = {}): CsvParseResult {
  const matchScenarioName = options.matchScenarioName || (() => null);
  const status: CsvParseResult["status"] = {
    fileName,
    success: false,
    failureReason: "",
    dateSource: "",
    matchedCurrentBenchmark: false,
  };
  const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell).trim()));
  if (!rows.length) {
    status.failureReason = "empty";
    return { record: null, status };
  }
  const headerIndex = rows.findIndex(
    (row) =>
      rowContainsField(row, ["score", "final score", "challenge score", "score (final)"]) &&
      rowContainsField(row, ["scenario", "scenario name", "challenge", "challenge name", "map", "name"]),
  );
  const header = headerIndex >= 0 ? rows[headerIndex] : rows[0];
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows.slice(1);
  const row = dataRows.find((item) => item.some((cell) => Number.isFinite(parseNumber(cell)))) || dataRows[0] || header;
  const byHeader = makeHeaderLookup(header, row);
  const byKeyValue = makeKeyValueLookup(rows);
  const scenarioName =
    pick(byHeader, ["scenario", "scenario name", "challenge", "challenge name", "map", "name"]) ||
    pick(byKeyValue, ["scenario", "scenario name", "challenge", "challenge name", "map", "name"]) ||
    scenarioFromFileName(fileName);
  const scoreValue =
    pick(byHeader, ["score", "final score", "challenge score", "score (final)"]) ||
    pick(byKeyValue, ["score", "final score", "challenge score", "score (final)"]);
  const score = parseNumber(scoreValue);
  if (!scenarioName) {
    status.failureReason = "missing-scenario";
    return { record: null, status };
  }
  if (!Number.isFinite(score)) {
    status.failureReason = "missing-score";
    return { record: null, status };
  }
  const dateText =
    pick(byHeader, ["challenge start", "challenge start time", "date", "time", "timestamp"]) ||
    pick(byKeyValue, ["challenge start", "challenge start time", "date", "time", "timestamp"]);
  const fileNameDate = parseKovaakDateFromFileName(fileName);
  const csvDate = parseKovaakDate(dateText);
  const date = fileNameDate || csvDate || new Date(lastModified || Date.now());
  const matchedScenarioName = matchScenarioName(scenarioName);
  const matchedScenario = matchedScenarioName || scenarioName;
  const rawMetadata = buildRawMetadata(byKeyValue, byHeader);
  const sensitivity = metadataNumber(pick(byHeader, ["sensitivity", "sens"]) || pick(byKeyValue, ["sensitivity", "sens"]));
  const fov = metadataNumber(pick(byHeader, ["fov", "field of view"]) || pick(byKeyValue, ["fov", "field of view"]));
  const dpi = metadataNumber(pick(byHeader, ["dpi", "mouse dpi"]) || pick(byKeyValue, ["dpi", "mouse dpi"]));
  status.dateSource = fileNameDate ? "filename" : csvDate ? "csv" : "fallback";
  status.success = true;
  status.matchedCurrentBenchmark = Boolean(matchedScenarioName);
  return {
    status,
    record: {
      id: `csv:${fileName}:${date.toISOString()}:${score}`,
      scenario: normalizeScenarioName(matchedScenario),
      rawScenario: normalizeScenarioName(scenarioName),
      score,
      date: date.toISOString(),
      note: fileName,
      source: "csv",
      metadata: {
        sourceFile: fileName,
        sourceType: "csv",
        ...(Number.isFinite(sensitivity) ? { sensitivity } : {}),
        ...(Number.isFinite(fov) ? { fov } : {}),
        ...(Number.isFinite(dpi) ? { dpi } : {}),
        rawMetadata,
      },
    },
  };
}

function metadataNumber(value: string): number {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function cleanRawMetadata(value: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[0]) && entry[1] !== undefined && String(entry[1]).trim() !== ""));
}

const rawMetadataFields = [
  "scenario",
  "scenario name",
  "challenge",
  "challenge name",
  "map",
  "name",
  "score",
  "final score",
  "challenge score",
  "score (final)",
  "challenge start",
  "challenge start time",
  "date",
  "time",
  "timestamp",
  "sensitivity",
  "sens",
  "fov",
  "field of view",
  "dpi",
  "mouse dpi",
];

function buildRawMetadata(byKeyValue: Record<string, string | undefined>, byHeader: Record<string, string | undefined>): Record<string, string> {
  const raw: Record<string, string | undefined> = { ...byKeyValue };
  rawMetadataFields.forEach((field) => {
    const key = normalizeFieldName(field);
    if (byHeader[key] !== undefined) raw[key] = byHeader[key];
  });
  return cleanRawMetadata(raw);
}
