export type Actor = "player" | "dealer";
export type Target = "player" | "dealer";

export type TurnResolution = {
  damageTo: Target | null;
  extraTurn: boolean;
  nextActor: Actor;
};

export const MAX_HEALTH = 3;
export const FOOD_COUNT = 6;

export function otherActor(actor: Actor): Actor {
  return actor === "player" ? "dealer" : "player";
}

export function resolveTurn(actor: Actor, target: Target, spicy: boolean): TurnResolution {
  const extraTurn = !spicy && actor === target;
  return {
    damageTo: spicy ? target : null,
    extraTurn,
    nextActor: extraTurn ? actor : otherActor(actor),
  };
}

export function spicyCountForRound(round: number): number {
  const normalizedRound = Math.max(1, Math.floor(round));
  return Math.min(4, normalizedRound + 1);
}

export function createRoundFoodFlags(round: number, random: () => number = Math.random): boolean[] {
  const spicyCount = spicyCountForRound(round);
  const flags = [
    ...Array.from({ length: spicyCount }, () => true),
    ...Array.from({ length: FOOD_COUNT - spicyCount }, () => false),
  ];

  for (let index = flags.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [flags[index], flags[swapIndex]] = [flags[swapIndex], flags[index]];
  }

  return flags;
}
