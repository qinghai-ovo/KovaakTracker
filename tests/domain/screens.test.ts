import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestNextScenario, todayScreen } from "../../src/domain/screens/today.ts";
import { mapScreen } from "../../src/domain/screens/map.ts";
import { NOW, mapFixture, rankColors, recordsLookup, todayFixture } from "../../src/data/fixtures/designSample.ts";

const close = (actual: number | null, expected: number, message?: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-6, `${message ?? ""} expected ${expected}, got ${actual}`);

function buildToday(overrides: Partial<Parameters<typeof todayScreen>[0]> = {}) {
  const { scenarios, records } = todayFixture();
  return todayScreen({ scenarios, rankColors, recordsForScenario: recordsLookup(records), exclusions: {}, now: NOW, ...overrides });
}

test("today: Smoothbot Arm matches the design (rank by PB, stable marker, in-rank progress)", () => {
  const view = buildToday();
  assert.equal(view.dayKey, "2026-11-03");
  const arm = view.scenarios.find((s) => s.name === "Smoothbot Arm")!;
  assert.equal(arm.rank.name, "Puffin");
  close(arm.rank.inRank, 20 / 240);
  assert.deepEqual(arm.rank.next, { index: 4, name: "Penguin", points: 220 });
  assert.equal(arm.personalBest, 2740);
  assert.equal(arm.previousBest, 2720);
  assert.equal(arm.newPersonalBest, true);
  assert.equal(arm.personalBestGain, 20);
  assert.equal(arm.runs.length, 4);
  assert.equal(arm.countedRuns, 3, "980 is suspicious and ignored by default");
  assert.deepEqual(arm.runs.map((r) => [r.score, r.excluded, r.suspicious]), [[2610, false, false], [2702, false, false], [980, true, true], [2740, false, false]]);
  assert.equal(arm.latest, 2740);
  close(arm.todayAverage, (2610 + 2702 + 2740) / 3);
  close(arm.stable, 2677.2, "stable = last 10 counted runs");
  close(arm.stableGap, 2740 - 2677.2);
  assert.ok(arm.stableProgress! < arm.personalBestProgress);

  // Today against the usual level (the stable window over the runs before today) and the PB.
  const average = (2610 + 2702 + 2740) / 3;
  close(arm.usual, 2647, "last 10 runs before today");
  close(arm.averageVsUsual, average - 2647);
  close(arm.averageOfBest, average / 2740);
  assert.ok(arm.todayAverageProgress! > arm.usualProgress! && arm.todayAverageProgress! < arm.personalBestProgress);
});

test("today: played scenarios, totals, feed and suggestion", () => {
  const view = buildToday();
  assert.deepEqual(view.scenarios.map((s) => [s.name, s.rank.name]), [
    ["Smoothbot Arm", "Puffin"],
    ["Wrist Strafe", "Ermine"],
    ["Speed Switch", "Ermine"],
    ["Pasu Reading", "Ermine"],
    ["Micro Flick", "Lemming"],
    ["Controlsphere", "Ermine"],
  ]);
  assert.deepEqual(view.played.map((s) => s.name), ["Pasu Reading", "Speed Switch", "Wrist Strafe", "Smoothbot Arm"], "only played scenarios, most recent first");
  assert.deepEqual(view.totals, { countedRuns: 9, newPersonalBests: 3, playedScenarios: 4 });
  const micro = view.scenarios.find((s) => s.name === "Micro Flick")!;
  assert.deepEqual([micro.runs.length, micro.lastPlayed, micro.todayAverage, micro.averageVsUsual], [0, null, null, null]);
  assert.equal(view.feed.length, 10);
  assert.equal(view.feed[0].scenarioName, "Pasu Reading", "newest first");
  assert.deepEqual(view.feed.filter((r) => r.isPersonalBest).map((r) => `${r.scenarioName} ${r.score}`).sort(), [
    "Smoothbot Arm 2740",
    "Speed Switch 1420",
    "Wrist Strafe 1955",
  ]);
  assert.equal(suggestNextScenario(view, "Smoothbot Arm")?.name, "Micro Flick");
  assert.equal(suggestNextScenario(view, "Micro Flick")?.name, "Controlsphere");
});

test("today: settings change the result everywhere", () => {
  const warn = buildToday({ settings: { suspiciousPolicy: "warn" } });
  const arm = warn.scenarios.find((s) => s.name === "Smoothbot Arm")!;
  assert.equal(arm.countedRuns, 4, "suspicious runs count when the policy is 'warn'");
  assert.equal(arm.runs[2].excluded, false);
  assert.equal(arm.runs[2].suspicious, true);

  const last20 = buildToday({ settings: { stableWindow: "last20" } });
  close(last20.scenarios[0].stable, (26_470 + 2610 + 2702 + 2740) / 13);
});

test("today: a run at 02:30 still belongs to the previous training day", () => {
  const { scenarios, records } = todayFixture();
  records.push({ id: "late", scenario: "Pasu Reading", score: 875, date: "2026-11-04T02:30:00", source: "csv" });
  const view = todayScreen({ scenarios, rankColors, recordsForScenario: recordsLookup(records), exclusions: {}, now: new Date(2026, 10, 4, 3, 0) });
  assert.equal(view.dayKey, "2026-11-03");
  assert.equal(view.scenarios.find((s) => s.name === "Pasu Reading")!.countedRuns, 2);
});

test("map: scenario rows use PB rank, weekly averages and the stable marker", () => {
  const { scenarios, records } = mapFixture();
  const view = mapScreen({ scenarios, rankColors, recordsForScenario: recordsLookup(records), exclusions: {}, now: NOW, settings: { stableWindow: "week" } });
  const rows = view.categories.flatMap((c) => c.subcategories.flatMap((s) => s.scenarios));
  const arm = rows.find((r) => r.name === "Smoothbot Arm")!;
  assert.equal(arm.rank.name, "Puffin");
  assert.equal(arm.week.current, 2700);
  assert.equal(arm.week.previous, 2650);
  close(arm.week.deltaPercent, (50 / 2650) * 100);
  assert.equal(arm.stable, 2700);

  const micro = rows.find((r) => r.name === "Micro Flick")!;
  assert.equal(micro.rank.name, "Lemming");
  close(micro.rank.inRank, 90 / 110);
  close(micro.stableProgress, ((1 + 65 / 110) / 9) * 100);

  const tiny = rows.find((r) => r.name === "Tiny Track")!;
  assert.equal(tiny.trained, false);
  assert.equal(tiny.week.deltaPercent, null);
  assert.equal(tiny.stable, 900, "untrained this week: stable falls back to last week");

  assert.deepEqual(view.categories.map((c) => c.name), ["Control Tracking", "Reactive Tracking", "Flick Tech", "Click Timing"]);
  assert.deepEqual(view.categories[0].subcategories.map((s) => s.name), ["Arm", "Wrist", "Fingertip", "Blending"]);
  assert.deepEqual(view.insights.coverage, { trained: 14, total: 16 });
});

test("map: category ranks, overall rank and insights", () => {
  const { scenarios, records } = mapFixture();
  const view = mapScreen({ scenarios, rankColors, recordsForScenario: recordsLookup(records), exclusions: {}, now: NOW });
  for (const category of view.categories) {
    const rows = category.subcategories.flatMap((s) => s.scenarios);
    const avg = rows.reduce((sum, r) => sum + r.rank.progress, 0) / rows.length;
    close(category.rank.progress, avg, category.name);
    assert.equal(category.rank.index, Math.min(8, Math.floor((avg * 9) / 100 + 1e-9) - 1), category.name);
  }
  const weakest = view.categories.slice().sort((a, b) => a.rank.progress - b.rank.progress)[0];
  assert.equal(view.insights.weakestCategory?.name, weakest.name);

  // Overall rank as KovaaK computes it: every scenario counts the same, so bigger categories weigh more.
  const allRows = view.categories.flatMap((c) => c.subcategories.flatMap((s) => s.scenarios));
  close(view.overall.progress, allRows.reduce((sum, r) => sum + r.rank.progress, 0) / allRows.length);
  assert.notEqual(view.overall.progress, view.categories.reduce((s, c) => s + c.rank.progress, 0) / view.categories.length, "not the average of categories");

  const closest = view.insights.closestRankUp!;
  const rows = view.categories.flatMap((c) => c.subcategories.flatMap((s) => s.scenarios));
  assert.equal(closest.rank.inRank, Math.max(...rows.filter((r) => r.rank.next).map((r) => r.rank.inRank)));
});
