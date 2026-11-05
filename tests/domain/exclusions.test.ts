import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecordExclusions, countsTowardMetrics, recordKey, toggleRecordCounted } from "../../src/domain/exclusions.ts";
import type { ScoreRecord } from "../../src/domain/types.ts";

const history: ScoreRecord[] = Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, scenario: "A", score: 1000 + i, date: `2026-10-${String(10 + i).padStart(2, "0")}T20:00:00` }));
const low: ScoreRecord = { id: "low", scenario: "A", score: 300, date: "2026-10-25T20:00:00" };

test("a restored suspicious run stays counted after flags are rebuilt", () => {
  const flagged = buildRecordExclusions([...history, low]);
  assert.equal(flagged[recordKey(low)]?.status, "suspicious");
  assert.equal(countsTowardMetrics(low, flagged, "ignore"), false);

  const kept = toggleRecordCounted(low, flagged, false);
  const rebuilt = buildRecordExclusions([...history, low], kept);
  assert.equal(rebuilt[recordKey(low)]?.status, "kept");
  assert.equal(countsTowardMetrics(low, rebuilt, "ignore"), true);

  const ignoredAgain = toggleRecordCounted(low, rebuilt, true);
  assert.equal(countsTowardMetrics(low, ignoredAgain, "warn"), false, "a manual ignore wins over the policy");
});

test("zero-score runs cannot be brought back", () => {
  const zero: ScoreRecord = { id: "zero", scenario: "A", score: 0, date: "2026-10-26T20:00:00" };
  const flags = buildRecordExclusions([zero]);
  assert.equal(countsTowardMetrics(zero, toggleRecordCounted(zero, flags, false)), false);
});
