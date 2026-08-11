export type Actor = "player" | "dealer";
export type Target = "player" | "dealer";

export type TurnResolution = {
  damageTo: Target | null;
  extraTurn: boolean;
  nextActor: Actor;
};

export type ServingQueueEntry = {
  id: number;
  consumed: boolean;
};

export type QueueSwapResult<T extends ServingQueueEntry> = {
  entries: T[];
  servedId: number | null;
  swapped: boolean;
};

export type QueueDiscardResult<T extends ServingQueueEntry> = {
  entries: T[];
  discardedId: number | null;
  discarded: boolean;
};

export type SpicyDamageResolution = {
  damage: number;
  nextPendingDamage: number;
  boosted: boolean;
};

export const MAX_HEALTH = 3;
export const FOOD_COUNT = 6;
export const BASE_SPICY_DAMAGE = 1;
export const BOOSTED_SPICY_DAMAGE = 2;

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

export function nextServingId<T extends ServingQueueEntry>(entries: T[]): number | null {
  return entries.find((entry) => !entry.consumed)?.id ?? null;
}

export function swapServedWithNext<T extends ServingQueueEntry>(
  entries: T[],
  servedId: number | null,
): QueueSwapResult<T> {
  const nextEntries = [...entries];
  const currentIndex = nextEntries.findIndex(
    (entry) => entry.id === servedId && !entry.consumed,
  );
  const nextIndex = nextEntries.findIndex(
    (entry, index) => index > currentIndex && !entry.consumed,
  );
  if (currentIndex < 0 || nextIndex < 0) {
    return { entries: nextEntries, servedId, swapped: false };
  }

  [nextEntries[currentIndex], nextEntries[nextIndex]] = [
    nextEntries[nextIndex],
    nextEntries[currentIndex],
  ];
  return {
    entries: nextEntries,
    servedId: nextEntries[currentIndex].id,
    swapped: true,
  };
}

export function discardServedEntry<T extends ServingQueueEntry>(
  entries: T[],
  servedId: number | null,
): QueueDiscardResult<T> {
  const currentIndex = entries.findIndex(
    (entry) => entry.id === servedId && !entry.consumed,
  );
  if (currentIndex < 0) {
    return { entries: [...entries], discardedId: null, discarded: false };
  }

  const nextEntries = [...entries];
  nextEntries[currentIndex] = {
    ...nextEntries[currentIndex],
    consumed: true,
  };
  return {
    entries: nextEntries,
    discardedId: servedId,
    discarded: true,
  };
}

export function armSpicyOil(pendingDamage: number): {
  pendingDamage: number;
  armed: boolean;
} {
  if (pendingDamage > BASE_SPICY_DAMAGE) {
    return { pendingDamage, armed: false };
  }
  return { pendingDamage: BOOSTED_SPICY_DAMAGE, armed: true };
}

export function resolveSpicyDamage(
  spicy: boolean,
  pendingDamage: number,
): SpicyDamageResolution {
  const normalizedDamage = Math.min(
    BOOSTED_SPICY_DAMAGE,
    Math.max(BASE_SPICY_DAMAGE, Math.floor(pendingDamage)),
  );
  if (!spicy) {
    return {
      damage: 0,
      nextPendingDamage: normalizedDamage,
      boosted: false,
    };
  }
  return {
    damage: normalizedDamage,
    nextPendingDamage: BASE_SPICY_DAMAGE,
    boosted: normalizedDamage > BASE_SPICY_DAMAGE,
  };
}
