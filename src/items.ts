export type ItemOwner = "player" | "dealer";

export type ItemDefinition = {
  id: string;
  name: string;
  englishName: string;
  shortLabel: string;
  englishShortLabel: string;
  description: string;
  englishDescription: string;
  effectId: string;
  foodTargetCount: number;
  targetPrompt: string;
  englishTargetPrompt: string;
  tint: number;
};

export type ItemInstance = {
  instanceId: string;
  definitionId: string;
};

export const MAX_ITEM_SLOTS = 4;
export const MAX_ITEMS_PER_ACTION = 2;

const itemDefinitions = new Map<string, ItemDefinition>();

export function registerItemDefinition(definition: ItemDefinition): void {
  if (itemDefinitions.has(definition.id)) {
    throw new Error(`Duplicate item definition: ${definition.id}`);
  }
  itemDefinitions.set(definition.id, Object.freeze({ ...definition }));
}

export function getItemDefinition(id: string): ItemDefinition {
  const definition = itemDefinitions.get(id);
  if (!definition) throw new Error(`Unknown item definition: ${id}`);
  return definition;
}

export function listItemDefinitions(): ItemDefinition[] {
  return [...itemDefinitions.values()];
}

export function itemGrantCountForRound(round: number): number {
  return Math.min(3, Math.max(1, Math.floor(round)));
}

export function canUseAnotherItem(itemsUsedThisAction: number): boolean {
  return itemsUsedThisAction < MAX_ITEMS_PER_ACTION;
}

export function grantRandomItems(
  round: number,
  owner: ItemOwner,
  random: () => number = Math.random,
): ItemInstance[] {
  const definitions = listItemDefinitions();
  if (definitions.length === 0) return [];

  const count = Math.min(MAX_ITEM_SLOTS, itemGrantCountForRound(round));
  return Array.from({ length: count }, (_, index) => {
    const definitionIndex = Math.min(definitions.length - 1, Math.floor(random() * definitions.length));
    const definition = definitions[definitionIndex];
    return {
      instanceId: `${owner}-r${round}-s${index}-${definition.id}`,
      definitionId: definition.id,
    };
  });
}

export function removeItemInstance(items: ItemInstance[], instanceId: string): ItemInstance[] {
  return items.filter((item) => item.instanceId !== instanceId);
}

registerItemDefinition({
  id: "toothpick",
  name: "牙签",
  englishName: "Toothpick",
  shortLabel: "牙",
  englishShortLabel: "P",
  description: "私下查看一个餐盖里的食物，然后重新盖好。",
  englishDescription: "Peek under the current cloche, then cover it again.",
  effectId: "peek-food",
  foodTargetCount: 1,
  targetPrompt: "点击眼前的餐盖，用牙签悄悄挑开一条缝。",
  englishTargetPrompt: "Select the current cloche to peek underneath.",
  tint: 0xd8bd7f,
});

registerItemDefinition({
  id: "serving-chopsticks",
  name: "公筷",
  englishName: "Chopsticks",
  shortLabel: "筷",
  englishShortLabel: "S",
  description: "公开交换眼前这一盆和固定队列中的下一盆。",
  englishDescription: "Swap the current serving with the next one in public.",
  effectId: "swap-next-food",
  foodTargetCount: 0,
  targetPrompt: "",
  englishTargetPrompt: "",
  tint: 0xc98b52,
});

registerItemDefinition({
  id: "takeout-box",
  name: "打包盒",
  englishName: "Takeout",
  shortLabel: "盒",
  englishShortLabel: "T",
  description: "公开打包眼前这一盆，不触发食物效果，然后继续上菜。",
  englishDescription: "Discard the current serving without triggering it.",
  effectId: "discard-current-food",
  foodTargetCount: 0,
  targetPrompt: "",
  englishTargetPrompt: "",
  tint: 0xb7c6a1,
});

registerItemDefinition({
  id: "devil-chili-oil",
  name: "魔鬼辣椒油",
  englishName: "Devil Oil",
  shortLabel: "油",
  englishShortLabel: "O",
  description: "让下一颗真正被吃掉的超级辣椒造成双倍伤害。",
  englishDescription: "The next super chili eaten deals double damage.",
  effectId: "boost-next-spicy",
  foodTargetCount: 0,
  targetPrompt: "",
  englishTargetPrompt: "",
  tint: 0xe5401d,
});
