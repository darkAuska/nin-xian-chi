import assert from "node:assert/strict";
import test from "node:test";
import { chooseDealerAction, type DealerDecisionInput } from "../src/aiStrategy.ts";

const baseInput: DealerDecisionInput = {
  currentKnowledge: null,
  nextKnowledge: null,
  safeProbability: 0.5,
  dealerHealth: 3,
  playerHealth: 3,
  oilArmed: false,
  canUseItem: true,
  availableEffectIds: [],
};

test("dealer peeks when the current serving is unknown", () => {
  assert.deepEqual(
    chooseDealerAction({ ...baseInput, availableEffectIds: ["peek-food"] }),
    { type: "use-item", effectId: "peek-food" },
  );
});

test("dealer oils a known spicy serving before targeting the player", () => {
  assert.deepEqual(
    chooseDealerAction({
      ...baseInput,
      currentKnowledge: "spicy",
      availableEffectIds: ["boost-next-spicy"],
    }),
    { type: "use-item", effectId: "boost-next-spicy" },
  );
  assert.deepEqual(
    chooseDealerAction({
      ...baseInput,
      currentKnowledge: "spicy",
      oilArmed: true,
      availableEffectIds: ["boost-next-spicy"],
    }),
    { type: "choose-target", target: "player" },
  );
});

test("dealer eats a known safe serving", () => {
  assert.deepEqual(
    chooseDealerAction({ ...baseInput, currentKnowledge: "safe" }),
    { type: "choose-target", target: "dealer" },
  );
});

test("dealer can swap a known next spicy serving into the current position", () => {
  assert.deepEqual(
    chooseDealerAction({
      ...baseInput,
      nextKnowledge: "spicy",
      availableEffectIds: ["swap-next-food"],
    }),
    { type: "use-item", effectId: "swap-next-food" },
  );
});

test("dealer uses a takeout box only when vulnerable and poorly informed", () => {
  assert.deepEqual(
    chooseDealerAction({
      ...baseInput,
      dealerHealth: 1,
      safeProbability: 0.4,
      availableEffectIds: ["discard-current-food"],
    }),
    { type: "use-item", effectId: "discard-current-food" },
  );
});

test("unknown food decisions use only public probability", () => {
  assert.deepEqual(
    chooseDealerAction({ ...baseInput, canUseItem: false, safeProbability: 0.7 }),
    { type: "choose-target", target: "dealer" },
  );
  assert.deepEqual(
    chooseDealerAction({ ...baseInput, canUseItem: false, safeProbability: 0.3 }),
    { type: "choose-target", target: "player" },
  );
});
