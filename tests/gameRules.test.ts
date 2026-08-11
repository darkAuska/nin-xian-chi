import assert from "node:assert/strict";
import test from "node:test";
import {
  createRoundFoodFlags,
  FOOD_COUNT,
  resolveTurn,
  spicyCountForRound,
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
