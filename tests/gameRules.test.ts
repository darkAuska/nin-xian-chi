import assert from "node:assert/strict";
import test from "node:test";
import {
  createRoundFoodFlags,
  discardServedEntry,
  FOOD_COUNT,
  nextServingId,
  resolveTurn,
  spicyCountForRound,
  swapServedWithNext,
} from "../src/gameRules.ts";

test("safe food eaten by the acting side grants an extra turn", () => {
  assert.deepEqual(resolveTurn("player", "player", false), {
    damageTo: null,
    extraTurn: true,
    nextActor: "player",
  });
  assert.deepEqual(resolveTurn("dealer", "dealer", false), {
    damageTo: null,
    extraTurn: true,
    nextActor: "dealer",
  });
});

test("safe food given to the opponent passes control", () => {
  assert.deepEqual(resolveTurn("player", "dealer", false), {
    damageTo: null,
    extraTurn: false,
    nextActor: "dealer",
  });
  assert.deepEqual(resolveTurn("dealer", "player", false), {
    damageTo: null,
    extraTurn: false,
    nextActor: "player",
  });
});

test("spicy food damages its target and always passes control", () => {
  assert.deepEqual(resolveTurn("player", "player", true), {
    damageTo: "player",
    extraTurn: false,
    nextActor: "dealer",
  });
  assert.deepEqual(resolveTurn("dealer", "dealer", true), {
    damageTo: "dealer",
    extraTurn: false,
    nextActor: "player",
  });
});

test("the first three rounds contain two, three, and four spicy peppers", () => {
  assert.deepEqual([1, 2, 3].map(spicyCountForRound), [2, 3, 4]);
});

test("round creation preserves food and spicy counts after shuffling", () => {
  for (const round of [1, 2, 3]) {
    const foods = createRoundFoodFlags(round, () => 0.37);
    assert.equal(foods.length, FOOD_COUNT);
    assert.equal(foods.filter(Boolean).length, spicyCountForRound(round));
  }
});

test("the waiter always serves the first unconsumed entry in queue order", () => {
  const queue = [
    { id: 0, consumed: true },
    { id: 1, consumed: false },
    { id: 2, consumed: false },
  ];
  assert.equal(nextServingId(queue), 1);
});

test("chopsticks swap only the served entry and the next queue entry", () => {
  const queue = [
    { id: 0, consumed: true },
    { id: 1, consumed: false },
    { id: 2, consumed: false },
    { id: 3, consumed: false },
  ];
  const result = swapServedWithNext(queue, 1);
  assert.equal(result.swapped, true);
  assert.equal(result.servedId, 2);
  assert.deepEqual(result.entries.map((entry) => entry.id), [0, 2, 1, 3]);
  assert.deepEqual(queue.map((entry) => entry.id), [0, 1, 2, 3]);
});

test("chopsticks do nothing when only the final serving remains", () => {
  const queue = [
    { id: 0, consumed: true },
    { id: 1, consumed: false },
  ];
  const result = swapServedWithNext(queue, 1);
  assert.equal(result.swapped, false);
  assert.equal(result.servedId, 1);
  assert.deepEqual(result.entries, queue);
});

test("a takeout box discards only the served entry without mutating the queue", () => {
  const queue = [
    { id: 0, consumed: true },
    { id: 1, consumed: false },
    { id: 2, consumed: false },
  ];
  const result = discardServedEntry(queue, 1);
  assert.equal(result.discarded, true);
  assert.equal(result.discardedId, 1);
  assert.deepEqual(result.entries.map((entry) => entry.consumed), [true, true, false]);
  assert.deepEqual(queue.map((entry) => entry.consumed), [true, false, false]);
});

test("a takeout box cannot discard a missing or already consumed serving", () => {
  const queue = [{ id: 0, consumed: true }];
  assert.equal(discardServedEntry(queue, 0).discarded, false);
  assert.equal(discardServedEntry(queue, null).discarded, false);
});
