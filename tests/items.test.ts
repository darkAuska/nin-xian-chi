import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseAnotherItem,
  getItemDefinition,
  grantRandomItems,
  itemGrantCountForRound,
  MAX_ITEM_SLOTS,
  removeItemInstance,
} from "../src/items.ts";

test("item grants scale from one to three and never exceed slot capacity", () => {
  assert.deepEqual([1, 2, 3, 4, 20].map(itemGrantCountForRound), [1, 2, 3, 3, 3]);
  assert.ok(itemGrantCountForRound(20) <= MAX_ITEM_SLOTS);
});

test("granted item instances have stable unique ids and registered definitions", () => {
  const items = grantRandomItems(3, "player", () => 0);
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map((item) => item.instanceId)).size, 3);
  items.forEach((item) => assert.equal(getItemDefinition(item.definitionId).id, "toothpick"));
});

test("the chopsticks are registered as an immediate queue-swap item", () => {
  const item = getItemDefinition("serving-chopsticks");
  assert.equal(item.effectId, "swap-next-food");
  assert.equal(item.foodTargetCount, 0);
});

test("only two items may be used during one action", () => {
  assert.equal(canUseAnotherItem(0), true);
  assert.equal(canUseAnotherItem(1), true);
  assert.equal(canUseAnotherItem(2), false);
  assert.equal(canUseAnotherItem(3), false);
});

test("consuming an item removes only the selected instance", () => {
  const items = grantRandomItems(3, "dealer", () => 0);
  const remaining = removeItemInstance(items, items[1].instanceId);
  assert.equal(remaining.length, 2);
  assert.equal(remaining.some((item) => item.instanceId === items[1].instanceId), false);
});
