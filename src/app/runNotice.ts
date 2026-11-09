import { rankIndexForScore } from "../domain/rank.ts";
import { resolveScenarioName } from "../domain/screens/data.ts";
import type { ScoreRecord } from "../domain/types.ts";
import type { TrackerSnapshot } from "../data/trackerData.ts";

export interface RunNotice {
  title: string;
  body: string;
  tag: string;
}

/** What "打完一局后通知" says about a new run: score, a new PB, the rank reached. */
export function runNotice(record: ScoreRecord, snapshot: TrackerSnapshot): RunNotice {
  const { scenarios, rankColors } = snapshot.benchmark;
  const name = resolveScenarioName(record.scenario, scenarios, snapshot.aliases);
  const scenario = scenarios.find((item) => item.name === name);
  const earlier = name ? snapshot.records.filter((item) => item !== record && item.id !== record.id && resolveScenarioName(item.scenario, scenarios, snapshot.aliases) === name) : [];
  const isPb = earlier.length > 0 && earlier.every((item) => item.score < record.score);
  const rankIndex = scenario ? rankIndexForScore(record.score, scenario.rankMaxes ?? []) : -1;
  const parts = [`${record.score} 分`, isPb ? "新的个人最佳" : null, rankIndex >= 0 ? Object.keys(rankColors)[rankIndex] : null].filter(Boolean);
  return { title: name ?? record.scenario, body: parts.join(" · "), tag: `run-${record.id ?? record.date}` };
}

/** How recent a run must be to be announced; catching up on a folder brings in old ones too. */
export const FRESH_MS = 15 * 60_000;

/** The runs worth a notification: just played, at most the last three. */
export function freshRuns(records: ScoreRecord[], now: Date): ScoreRecord[] {
  return records.filter((record) => new Date(record.date).getTime() >= now.getTime() - FRESH_MS).slice(-3);
}

/** In a browser: notify only while the player is elsewhere (the page is hidden or not in front). */
export function playerIsElsewhere(doc: Pick<Document, "visibilityState" | "hasFocus"> | undefined): boolean {
  if (!doc) return true;
  return doc.visibilityState !== "visible" || !doc.hasFocus();
}
