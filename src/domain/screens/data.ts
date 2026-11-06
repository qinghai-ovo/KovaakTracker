import { buildRecordExclusions, countsTowardMetrics, recordKey } from "../exclusions.ts";
import { chronological } from "../metrics.ts";
import { rankIndexForScore } from "../rank.ts";
import { findBenchmarkScenarioName } from "../scenario.ts";
import type { BenchmarkScenario, RecordExclusion, ScoreRecord } from "../types.ts";
import { rankNames, resolveSettings, UNRANKED_NAME, type ScreenSettings } from "./shared.ts";

/** Raw scenario name → benchmark scenario name, confirmed by the user on the Data screen. */
export type ScenarioAliases = Record<string, string>;

export type RecordStatus =
  | "ok"
  /** Beat every earlier counted run of the scenario. */
  | "pb"
  /** Flagged by the low-score rule and left out (policy "ignore"). */
  | "suspicious-ignored"
  /** Flagged by the low-score rule but counted (policy "warn"). */
  | "suspicious-counted"
  /** Ignored by the user, or a zero score. */
  | "ignored"
  /** A flagged run the user confirmed as valid. */
  | "kept";

export interface DataRecordView {
  key: string;
  record: ScoreRecord;
  /** Benchmark scenario the run counts toward, or null when unmatched. */
  scenarioName: string | null;
  score: number;
  date: string;
  source: "csv" | "manual";
  rankIndex: number;
  rankName: string;
  status: RecordStatus;
  counts: boolean;
}

export interface UnmatchedScenarioView {
  rawName: string;
  count: number;
  /** Likely benchmark scenario (loose name match), if any. */
  suggestion: string | null;
}

export interface DataView {
  totals: { imported: number; matched: number; unmatched: number; unmatchedNames: number };
  /** Newest first. */
  records: DataRecordView[];
  counts: { ignored: number; manual: number; pb: number };
  unmatched: UnmatchedScenarioView[];
}

export interface DataInput {
  scenarios: BenchmarkScenario[];
  rankColors: Record<string, string>;
  records: ScoreRecord[];
  exclusions: Record<string, RecordExclusion>;
  aliases: ScenarioAliases;
  settings?: Partial<ScreenSettings>;
}

/** Benchmark scenario a raw scenario name belongs to: confirmed alias first, then an exact name match. */
export function resolveScenarioName(rawName: string, scenarios: BenchmarkScenario[], aliases: ScenarioAliases): string | null {
  return aliases[rawName] ?? findBenchmarkScenarioName(rawName, scenarios);
}

export function suggestScenarioName(rawName: string, scenarios: BenchmarkScenario[]): string | null {
  return findBenchmarkScenarioName(rawName, scenarios, { loose: true });
}

export function dataScreen(input: DataInput): DataView {
  const settings = resolveSettings(input.settings);
  const names = rankNames(input.rankColors);
  const thresholdsByName = new Map(input.scenarios.map((scenario) => [scenario.name, scenario.rankMaxes || []]));

  const groups = new Map<string, ScoreRecord[]>();
  const unmatchedGroups = new Map<string, ScoreRecord[]>();
  input.records.forEach((record) => {
    const name = resolveScenarioName(record.scenario, input.scenarios, input.aliases);
    const target = name ? groups : unmatchedGroups;
    const key = name ?? record.scenario;
    target.set(key, [...(target.get(key) || []), record]);
  });

  const views: DataRecordView[] = [];
  const pushGroup = (scenarioName: string | null, records: ScoreRecord[]) => {
    const ordered = chronological(records);
    const flags = buildRecordExclusions(ordered, input.exclusions);
    const thresholds = scenarioName ? thresholdsByName.get(scenarioName) ?? [] : [];
    let best: number | null = null;
    ordered.forEach((record) => {
      const key = recordKey(record);
      const flag = flags[key];
      const counts = countsTowardMetrics(record, flags, settings.suspiciousPolicy);
      const isPb = scenarioName !== null && counts && best !== null && record.score > best;
      let status: RecordStatus = "ok";
      if (flag?.status === "excluded") status = "ignored";
      else if (flag?.status === "suspicious") status = counts ? "suspicious-counted" : "suspicious-ignored";
      else if (isPb) status = "pb";
      else if (flag?.status === "kept") status = "kept";
      if (counts) best = best === null ? record.score : Math.max(best, record.score);
      const rankIndex = thresholds.length ? rankIndexForScore(record.score, thresholds) : -1;
      views.push({
        key,
        record,
        scenarioName,
        score: record.score,
        date: record.date,
        source: record.source === "manual" ? "manual" : "csv",
        rankIndex,
        rankName: scenarioName && rankIndex >= 0 ? names[rankIndex] ?? UNRANKED_NAME : "—",
        status,
        counts,
      });
    });
  };
  groups.forEach((records, name) => pushGroup(name, records));
  unmatchedGroups.forEach((records) => pushGroup(null, records));
  views.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const unmatched = [...unmatchedGroups]
    .map(([rawName, records]) => ({ rawName, count: records.length, suggestion: suggestScenarioName(rawName, input.scenarios) }))
    .sort((a, b) => b.count - a.count);
  const unmatchedCount = unmatched.reduce((sum, item) => sum + item.count, 0);

  return {
    totals: {
      imported: input.records.length,
      matched: input.records.length - unmatchedCount,
      unmatched: unmatchedCount,
      unmatchedNames: unmatched.length,
    },
    records: views,
    counts: {
      ignored: views.filter((view) => !view.counts).length,
      manual: views.filter((view) => view.source === "manual").length,
      pb: views.filter((view) => view.status === "pb").length,
    },
    unmatched,
  };
}
