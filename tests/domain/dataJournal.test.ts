import { test } from "node:test";
import assert from "node:assert/strict";
import { dataScreen, resolveScenarioName } from "../../src/domain/screens/data.ts";
import { journalScreen, trainingMinutes } from "../../src/domain/screens/journal.ts";
import { excludeRecordManually } from "../../src/domain/exclusions.ts";
import { NOW, rankColors, recordsLookup, todayFixture, unmatchedRecords } from "../../src/data/fixtures/designSample.ts";

test("data: statuses, filters and unmatched scenarios", () => {
  const { scenarios, records } = todayFixture();
  const extra = unmatchedRecords();
  const manual = { id: "m1", scenario: "Wrist Strafe", score: 1700, date: "2026-11-02T21:00:00", source: "manual" as const };
  const ignored = records.find((record) => record.scenario === "Pasu Reading" && record.date.startsWith("2026-11-03"))!;
  const view = dataScreen({
    scenarios,
    rankColors,
    records: [...records, ...extra, manual],
    exclusions: excludeRecordManually(ignored, {}),
    aliases: {},
  });

  assert.equal(view.totals.imported, records.length + extra.length + 1);
  assert.equal(view.totals.unmatched, extra.length);
  assert.equal(view.totals.unmatchedNames, 4);
  assert.equal(view.records[0].date >= view.records[1].date, true, "newest first");

  const byScore = (scenario: string, score: number) => view.records.find((row) => row.record.scenario === scenario && row.score === score)!;
  assert.equal(byScore("Smoothbot Arm", 980).status, "suspicious-ignored");
  assert.equal(byScore("Smoothbot Arm", 2740).status, "pb");
  assert.equal(byScore("Smoothbot Arm", 2740).rankName, "Puffin");
  assert.equal(view.records.find((row) => row.record === ignored)!.status, "ignored");
  assert.equal(byScore("Wrist Strafe", 1700).source, "manual");
  assert.equal(view.counts.manual, 1);
  assert.equal(view.counts.ignored, 2);

  const vt = view.unmatched.find((item) => item.rawName === "VT Smoothbot Arm Easy")!;
  assert.equal(vt.suggestion, "Smoothbot Arm");
  assert.equal(view.unmatched.find((item) => item.rawName === "1wall6targets TE")!.suggestion, null);
});

test("data: a confirmed alias makes runs count toward the scenario", () => {
  const { scenarios, records } = todayFixture();
  const extra = unmatchedRecords();
  const aliases = { "VT Smoothbot Arm Easy": "Smoothbot Arm" };
  assert.equal(resolveScenarioName("VT Smoothbot Arm Easy", scenarios, aliases), "Smoothbot Arm");
  const view = dataScreen({ scenarios, rankColors, records: [...records, ...extra], exclusions: {}, aliases });
  assert.equal(view.unmatched.some((item) => item.rawName === "VT Smoothbot Arm Easy"), false);
  assert.equal(view.totals.unmatched, extra.length - 6);
});

test("journal: today's timeline, totals and heatmap", () => {
  const { scenarios, records } = todayFixture();
  const view = journalScreen({ scenarios, rankColors, recordsForScenario: recordsLookup(records), exclusions: {}, now: NOW });
  assert.equal(view.selectedDay, "2026-11-03");
  assert.deepEqual(view.blocks.map((block) => block.scenarioName), ["Smoothbot Arm", "Wrist Strafe", "Speed Switch", "Pasu Reading"]);
  assert.equal(view.totals.minutes, 20, "19:31 to 19:49 plus one run");
  assert.equal(view.totals.countedRuns, 9);
  assert.equal(view.totals.ignoredRuns, 1);
  assert.equal(view.totals.scenarios, 4);
  assert.deepEqual(view.totals.newPersonalBests, ["Smoothbot Arm", "Wrist Strafe", "Speed Switch"]);
  const arm = view.blocks[0];
  assert.equal(arm.personalBestGain, 20);
  assert.equal(arm.suspiciousIgnored, 1);
  assert.deepEqual(arm.runs.filter((run) => run.isBlockBest).map((run) => run.score), [2740]);

  assert.equal(view.weeks.length, 16);
  assert.equal(view.weeks[15][0].dayKey, "2026-11-02", "last column is the current week, Monday first");
  assert.equal(view.weeks[15][2].minutes, null, "Wednesday is in the future");
  assert.equal(view.streak, 11, "ten history days plus today");
  assert.equal(view.trainedLast30, 11);
  assert.equal(view.totals.minutesDelta, 20 - 2, "previous day had one run");
});

test("journal: selecting a past day and the minutes helper", () => {
  const { scenarios, records } = todayFixture();
  const view = journalScreen({ scenarios, rankColors, recordsForScenario: recordsLookup(records), exclusions: {}, now: NOW, dayKey: "2026-11-01" });
  assert.equal(view.selectedDay, "2026-11-01");
  assert.equal(view.totals.countedRuns, 6, "one history run per plan scenario");
  assert.equal(view.totals.minutesDelta, 0);
  assert.equal(trainingMinutes([]), 0);
  assert.equal(trainingMinutes(["2026-11-03T19:00:00", "2026-11-03T19:30:00"]), 32);
});
