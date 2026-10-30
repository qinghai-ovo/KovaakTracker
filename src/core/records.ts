import { findRecordBenchmarkScenarioKey, canonicalScenario, normalizeImportedScenarioLabel } from "./scenario.ts";
import { dedupeRecords } from "./stats.ts";
import type { BenchmarkScenario, RecordIndex, ScoreRecord } from "./types.ts";

export function emptyRecordIndex(scenarios: BenchmarkScenario[] = []): RecordIndex {
  return {
    all: [],
    matched: [],
    byScenario: new Map(scenarios.map((item) => [canonicalScenario(item.name), []])),
  };
}

export function recordIndexVersion({
  csvRecords,
  manualRecords,
  selectedBenchmark,
  selectedDifficulty,
  scenarios,
}: {
  csvRecords: ScoreRecord[];
  manualRecords: ScoreRecord[];
  selectedBenchmark: string;
  selectedDifficulty: string;
  scenarios: BenchmarkScenario[];
}): string {
  return [csvRecords.length, manualRecords.length, selectedBenchmark, selectedDifficulty, scenarios.map((item) => item.name).join("|")].join("::");
}

export function buildRecordIndex({
  csvRecords,
  manualRecords,
  scenarios,
}: {
  csvRecords: ScoreRecord[];
  manualRecords: ScoreRecord[];
  scenarios: BenchmarkScenario[];
}): RecordIndex {
  const all = dedupeRecords([...csvRecords, ...manualRecords]).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const scenarioKeyToName = new Map(scenarios.map((item) => [canonicalScenario(item.name), item.name]));
  const byScenario = new Map(scenarios.map((item) => [canonicalScenario(item.name), [] as ScoreRecord[]]));
  const matched: ScoreRecord[] = [];

  all.forEach((record) => {
    const key = findRecordBenchmarkScenarioKey(record, scenarios);
    if (!key || !scenarioKeyToName.has(key)) return;
    const normalizedName = scenarioKeyToName.get(key);
    if (!normalizedName) return;
    const normalizedRecord = record.scenario === normalizedName ? record : { ...record, scenario: normalizedName };
    byScenario.get(key)?.push(normalizedRecord);
    matched.push(normalizedRecord);
  });

  return { all, matched, byScenario };
}

export function rebuildRecordIndexIfNeeded({
  currentVersion,
  csvRecords,
  manualRecords,
  scenarios,
  selectedBenchmark,
  selectedDifficulty,
}: {
  currentVersion: string;
  csvRecords: ScoreRecord[];
  manualRecords: ScoreRecord[];
  scenarios: BenchmarkScenario[];
  selectedBenchmark: string;
  selectedDifficulty: string;
}): { changed: boolean; version: string; index: RecordIndex | null } {
  const nextVersion = recordIndexVersion({ csvRecords, manualRecords, selectedBenchmark, selectedDifficulty, scenarios });
  if (currentVersion === nextVersion) return { changed: false, version: currentVersion, index: null };
  return {
    changed: true,
    version: nextVersion,
    index: buildRecordIndex({ csvRecords, manualRecords, scenarios }),
  };
}

export function recordsForScenario(index: RecordIndex, scenarioName: string): ScoreRecord[] {
  return index.byScenario.get(canonicalScenario(scenarioName)) || [];
}

export function scopedRecords(index: RecordIndex, selectedScenario: string): ScoreRecord[] {
  if (selectedScenario === "all") return index.matched;
  return recordsForScenario(index, selectedScenario);
}

export function unmatchedCsvScenarioCounts(csvRecords: ScoreRecord[], scenarios: BenchmarkScenario[]): Array<{ scenario: string; count: number }> {
  if (!scenarios.length) return [];
  const counts = new Map<string, number>();
  csvRecords.forEach((record) => {
    const displayScenario = normalizeImportedScenarioLabel(record.rawScenario || record.scenario || "未知场景");
    const key = findRecordBenchmarkScenarioKey(record, scenarios);
    if (key) return;
    counts.set(displayScenario, (counts.get(displayScenario) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ scenario: name, count }))
    .sort((a, b) => b.count - a.count || a.scenario.localeCompare(b.scenario));
}
