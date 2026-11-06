import { test } from "node:test";
import assert from "node:assert/strict";
import { personalBest, stableLevel, weekComparison, weeklyAverages } from "../../src/domain/metrics.ts";
import { categoryRankPosition, overallRankPosition } from "../../src/domain/category.ts";

const now = new Date(2026, 10, 3, 21); // Tuesday
const at = (day: number, hour = 20) => `2026-${day > 31 ? "11" : "10"}-${String(day > 31 ? day - 31 : day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00`;
// Days 26..31 = Oct 26..31, 32.. = Nov 1..
const runs = [
  { score: 100, date: at(26) }, // last week
  { score: 110, date: at(28) }, // last week
  { score: 130, date: at(33, 2) }, // Nov 2 02:00 -> still Sunday Nov 1 -> last week
  { score: 120, date: at(33) }, // this week
  { score: 140, date: at(34) }, // this week
  { score: 999, date: at(35) }, // future, ignored
];

test("personal best", () => {
  assert.equal(personalBest(runs.slice(0, 5)), 140);
  assert.equal(personalBest([]), null);
});

test("week comparison uses training weeks and ignores future runs", () => {
  const week = weekComparison(runs, { now });
  assert.equal(week.current, 130);
  assert.equal(week.previous, 340 / 3);
  assert.equal(week.currentRuns, 2);
  assert.equal(week.previousRuns, 3);
  assert.ok(Math.abs((week.deltaPercent ?? 0) - ((130 - 340 / 3) / (340 / 3)) * 100) < 1e-9);
  assert.equal(weekComparison(runs.slice(0, 2), { now }).deltaPercent, null);
});

test("stable level windows", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ score: i + 1, date: new Date(2026, 9, 1, 12, i).toISOString() }));
  assert.equal(stableLevel(many, "last10", { now }), 20.5); // 16..25
  assert.equal(stableLevel(many, "last20", { now }), 15.5); // 6..25
  assert.equal(stableLevel(runs, "week", { now }), 130);
  assert.equal(stableLevel(runs.slice(0, 3), "week", { now }), 340 / 3, "falls back to last week");
  assert.equal(stableLevel([], "last10", { now }), null);
});

test("category and overall rank positions", () => {
  // 9 ranks: progress 40% -> position 3.6 -> rank index 2, 60% inside it.
  const category = categoryRankPosition([30, 50], 9);
  assert.equal(category.index, 2);
  assert.ok(Math.abs(category.inRank - 0.6) < 1e-6);
  assert.equal(categoryRankPosition([], 9).index, -1);
  assert.equal(overallRankPosition([40, 80], 9, "weakest").index, 2);
  assert.equal(overallRankPosition([40, 80], 9, "average").index, 4);
});

test("weekly averages for the sparkline, oldest first", () => {
  const values = weeklyAverages(runs, 3, { now });
  assert.equal(values.length, 3);
  assert.equal(values[0], null, "two weeks ago had no runs");
  assert.equal(values[1], 340 / 3);
  assert.equal(values[2], 130);
});
