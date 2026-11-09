import { test } from "node:test";
import assert from "node:assert/strict";
import { freshRuns, playerIsElsewhere, runNotice } from "../../src/app/runNotice.ts";
import { createFixtureData } from "../../src/data/fixtureData.ts";
import type { ScoreRecord } from "../../src/domain/types.ts";

test("a run notice gives the score, a new PB and the rank reached", () => {
  const snapshot = createFixtureData().getSnapshot();
  const scenario = snapshot.benchmark.scenarios.find((item) => snapshot.records.some((record) => record.scenario === item.name))!;
  const best = Math.max(...snapshot.records.filter((record) => record.scenario === scenario.name).map((record) => record.score));
  const top = scenario.rankMaxes!.at(-1)!;
  const rankNames = Object.keys(snapshot.benchmark.rankColors);

  const record: ScoreRecord = { id: "csv:new", scenario: scenario.name, score: Math.max(best, top) + 1, date: snapshot.now.toISOString(), source: "csv" };
  const pb = runNotice(record, { ...snapshot, records: [...snapshot.records, record] });
  assert.equal(pb.title, scenario.name);
  assert.equal(pb.body, `${record.score} 分 · 新的个人最佳 · ${rankNames[scenario.rankMaxes!.length - 1]}`);
  assert.equal(pb.tag, "run-csv:new");

  const low = { ...record, id: "csv:low", score: 1 };
  assert.equal(runNotice(low, { ...snapshot, records: [...snapshot.records, low] }).body, "1 分");

  const other = { ...record, id: "csv:x", scenario: "Not A Benchmark Scenario" };
  assert.deepEqual(runNotice(other, snapshot), { title: "Not A Benchmark Scenario", body: `${record.score} 分`, tag: "run-csv:x" });
});

test("only just-played runs are announced, at most three", () => {
  const now = new Date(2026, 10, 9, 21, 0);
  const at = (minutesAgo: number, id: string): ScoreRecord => ({ id, scenario: "A", score: 1, date: new Date(now.getTime() - minutesAgo * 60_000).toISOString(), source: "csv" });
  assert.deepEqual(
    freshRuns([at(60 * 24, "old"), at(20, "earlier"), at(14, "a"), at(5, "b"), at(1, "c"), at(0, "d")], now).map((record) => record.id),
    ["b", "c", "d"],
  );
  assert.deepEqual(freshRuns([at(16, "x")], now), [], "catching up on old runs is quiet");
});

test("notices go out only while the player is elsewhere", () => {
  const doc = (visibilityState: DocumentVisibilityState, focused: boolean) => ({ visibilityState, hasFocus: () => focused });
  assert.equal(playerIsElsewhere(doc("visible", true)), false, "looking at the app");
  assert.equal(playerIsElsewhere(doc("visible", false)), true, "KovaaK is in front");
  assert.equal(playerIsElsewhere(doc("hidden", false)), true, "in the tray or minimized");
  assert.equal(playerIsElsewhere(undefined), true);
});
