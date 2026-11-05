import { test } from "node:test";
import assert from "node:assert/strict";
import { isDayInRange, previousTrainingWeek, shiftDayKey, trainingDayKey, trainingWeekRange } from "../../src/domain/day.ts";

test("runs before the day-start hour belong to the previous training day", () => {
  assert.equal(trainingDayKey("2026-11-04T02:30:00"), "2026-11-03");
  assert.equal(trainingDayKey("2026-11-04T03:59:59"), "2026-11-03");
  assert.equal(trainingDayKey("2026-11-04T04:00:00"), "2026-11-04");
  assert.equal(trainingDayKey("2026-11-04T02:30:00", 0), "2026-11-04");
  assert.equal(trainingDayKey("not a date"), "");
});

test("training week runs Monday to Sunday and respects the day-start hour", () => {
  assert.deepEqual(trainingWeekRange(new Date(2026, 10, 3, 21)), { start: "2026-11-02", end: "2026-11-08" });
  // Monday 03:00 still belongs to Sunday, i.e. the previous week.
  assert.deepEqual(trainingWeekRange(new Date(2026, 10, 2, 3)), { start: "2026-10-26", end: "2026-11-01" });
  // Sunday night counts in the same week.
  assert.deepEqual(trainingWeekRange(new Date(2026, 10, 8, 23)), { start: "2026-11-02", end: "2026-11-08" });
  assert.deepEqual(previousTrainingWeek({ start: "2026-11-02", end: "2026-11-08" }), { start: "2026-10-26", end: "2026-11-01" });
});

test("day key helpers", () => {
  assert.equal(shiftDayKey("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftDayKey("2026-01-01", -1), "2025-12-31");
  assert.ok(isDayInRange("2026-11-05", { start: "2026-11-02", end: "2026-11-08" }));
  assert.ok(!isDayInRange("2026-11-09", { start: "2026-11-02", end: "2026-11-08" }));
  assert.ok(!isDayInRange("", { start: "2026-11-02", end: "2026-11-08" }));
});
