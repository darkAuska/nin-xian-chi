import assert from "node:assert/strict";
import test from "node:test";
import {
  decideExhibitionResult,
  EXHIBITION_SECONDS,
  formatExhibitionTime,
} from "../src/contestMode.ts";

test("the exhibition clock starts at three minutes", () => {
  assert.equal(EXHIBITION_SECONDS, 180);
  assert.equal(formatExhibitionTime(EXHIBITION_SECONDS), "3:00");
});

test("the exhibition clock clamps and pads its display", () => {
  assert.equal(formatExhibitionTime(61.9), "1:01");
  assert.equal(formatExhibitionTime(-4), "0:00");
});

test("the player must lead when the exhibition clock expires", () => {
  assert.equal(decideExhibitionResult(2, 2), "lost");
  assert.equal(decideExhibitionResult(1, 2), "lost");
  assert.equal(decideExhibitionResult(2, 1), "won");
});
