import type { Target } from "./gameRules";

export type FoodKnowledge = "safe" | "spicy" | null;

export type DealerDecisionInput = {
  currentKnowledge: FoodKnowledge;
  nextKnowledge: FoodKnowledge;
  safeProbability: number;
  dealerHealth: number;
  playerHealth: number;
  oilArmed: boolean;
  canUseItem: boolean;
  availableEffectIds: string[];
};

export type DealerAction =
  | { type: "use-item"; effectId: string }
  | { type: "choose-target"; target: Target };

function hasEffect(input: DealerDecisionInput, effectId: string): boolean {
  return input.availableEffectIds.includes(effectId);
}

export function chooseDealerAction(input: DealerDecisionInput): DealerAction {
  if (input.canUseItem) {
    if (input.currentKnowledge === null && hasEffect(input, "peek-food")) {
      return { type: "use-item", effectId: "peek-food" };
    }

    if (
      input.currentKnowledge === "spicy" &&
      !input.oilArmed &&
      hasEffect(input, "boost-next-spicy")
    ) {
      return { type: "use-item", effectId: "boost-next-spicy" };
    }

    if (
      input.currentKnowledge === null &&
      input.nextKnowledge !== null &&
      hasEffect(input, "swap-next-food") &&
      (input.nextKnowledge === "spicy" || input.dealerHealth === 1)
    ) {
      return { type: "use-item", effectId: "swap-next-food" };
    }

    if (
      input.currentKnowledge === null &&
      input.dealerHealth === 1 &&
      input.safeProbability <= 0.55 &&
      hasEffect(input, "discard-current-food")
    ) {
      return { type: "use-item", effectId: "discard-current-food" };
    }

    if (
      input.currentKnowledge === null &&
      input.playerHealth <= 2 &&
      input.safeProbability <= 0.5 &&
      !input.oilArmed &&
      hasEffect(input, "boost-next-spicy")
    ) {
      return { type: "use-item", effectId: "boost-next-spicy" };
    }
  }

  if (input.currentKnowledge === "spicy") {
    return { type: "choose-target", target: "player" };
  }
  if (input.currentKnowledge === "safe") {
    return { type: "choose-target", target: "dealer" };
  }
  return {
    type: "choose-target",
    target: input.safeProbability >= 0.58 ? "dealer" : "player",
  };
}
