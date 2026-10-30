import type { BenchmarkScenario, ScoreRecord } from "./types.ts";

export function normalizeScenarioName(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizeImportedScenarioLabel(value: unknown): string {
  const datePattern = "\\d{4}[.-]\\d{1,2}[.-]\\d{1,2}-\\d{1,2}[.-]\\d{1,2}[.-]\\d{1,2}";
  return normalizeScenarioName(value)
    .replace(/\.csv$/i, "")
    .replace(new RegExp(`\\s+-\\s+Challenge\\s+-\\s+${datePattern}\\s+Stats$`, "i"), "")
    .replace(new RegExp(`\\s+-\\s+${datePattern}\\s+Stats$`, "i"), "")
    .replace(/\s+-\s+Challenge$/i, "")
    .trim();
}

export function scenarioFromFileName(fileName: string): string {
  return normalizeImportedScenarioLabel(fileName.replace(/_/g, " "));
}

export function canonicalScenario(value: unknown): string {
  return normalizeScenarioName(value)
    .toLowerCase()
    .replace(/\bchallenge\b/g, "")
    .replace(/\bscenario\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function sameScenario(a: unknown, b: unknown): boolean {
  return canonicalScenario(a) === canonicalScenario(b);
}

export function scenarioMatchesRecord(scenarioName: string, record: ScoreRecord): boolean {
  return sameScenario(scenarioName, record.scenario) || sameScenario(scenarioName, record.rawScenario || "");
}

export function findBenchmarkScenarioKey(value: unknown, scenarios: BenchmarkScenario[], options: { loose?: boolean } = {}): string | null {
  const target = canonicalScenario(value);
  if (!target) return null;
  const scenarioKeys = scenarios.map((item) => ({ key: canonicalScenario(item.name), name: item.name }));
  const exact = scenarioKeys.find((item) => item.key === target);
  if (exact) return exact.key;
  if (!options.loose) return null;
  const loose = scenarioKeys.find((item) => item.key.includes(target) || target.includes(item.key));
  return loose?.key || null;
}

export function findBenchmarkScenarioName(value: unknown, scenarios: BenchmarkScenario[], options: { loose?: boolean } = {}): string | null {
  const key = findBenchmarkScenarioKey(value, scenarios, options);
  if (!key) return null;
  return scenarios.find((item) => canonicalScenario(item.name) === key)?.name || null;
}

export function findRecordBenchmarkScenarioKey(record: ScoreRecord, scenarios: BenchmarkScenario[]): string | null {
  const rawKey = findBenchmarkScenarioKey(record.rawScenario || "", scenarios);
  if (rawKey) return rawKey;
  if (record.source === "csv") return null;
  return findBenchmarkScenarioKey(record.scenario, scenarios);
}
