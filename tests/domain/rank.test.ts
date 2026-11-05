import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inRankProgress,
  pointsToNextRank,
  progressPercentForScore,
  rankIndexForScore,
  rankPositionFromProgress,
} from "../../src/domain/rank.ts";
import { sampleThresholds } from "../fixtures/design.ts";

const th = sampleThresholds(2000); // [2000, 2240, 2480, 2720, 2960, 3200, 3440, 3680, 3920]

test("rank index uses the highest threshold reached", () => {
  assert.equal(rankIndexForScore(1999, th), -1);
  assert.equal(rankIndexForScore(2000, th), 0);
  assert.equal(rankIndexForScore(2740, th), 3);
  assert.equal(rankIndexForScore(9999, th), 8);
});

test("in-rank progress and points to next rank", () => {
  assert.ok(Math.abs(inRankProgress(2740, th) - 20 / 240) < 1e-9);
  assert.equal(pointsToNextRank(2740, th), 220);
  assert.equal(inRankProgress(1000, th), 0.5, "below the first rank: progress toward it");
  assert.equal(pointsToNextRank(1000, th), 1000);
  assert.equal(inRankProgress(4000, th), 1);
  assert.equal(pointsToNextRank(4000, th), null);
  assert.equal(inRankProgress(100, []), 0);
});

test("ladder progress converts back to the same rank, including exact rank lines", () => {
  for (let score = 0; score <= 4200; score += 5) {
    const position = rankPositionFromProgress(progressPercentForScore(score, th), th.length);
    assert.equal(position.index, rankIndexForScore(score, th), `score ${score}`);
    if (position.index >= 0 && position.index < th.length - 1) {
      assert.ok(Math.abs(position.inRank - inRankProgress(score, th)) < 1e-6, `inRank at ${score}`);
    }
  }
});
