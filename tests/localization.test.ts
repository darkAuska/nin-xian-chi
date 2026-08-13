import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDecisionCopy,
  getDecisionCopy,
  getInterfaceCopy,
  type TextSink,
} from "../src/localization.ts";

const containsHan = (value: string) => /\p{Script=Han}/u.test(value);
const containsLatinOutsideKeyHints = (value: string) =>
  /[A-Za-z]/.test(value.replace(/\[(?:L|R|ENTER)\]/g, ""));

test("English gameplay copy contains no Chinese characters", () => {
  const decision = getDecisionCopy("en");
  const ui = getInterfaceCopy("en");
  const values = [
    decision.prompt,
    decision.selfChoice,
    decision.dealerChoice,
    ui.restart,
    ui.retry,
    ui.emptyDish,
    ui.superChili,
    ui.sweetPepper,
  ];

  assert.equal(values.some(containsHan), false);
});

test("Chinese gameplay copy contains no English words outside keyboard hints", () => {
  const decision = getDecisionCopy("zh");
  const ui = getInterfaceCopy("zh");
  const values = [
    decision.prompt,
    decision.selfChoice,
    decision.dealerChoice,
    ui.restart,
    ui.retry,
    ui.emptyDish,
    ui.superChili,
    ui.sweetPepper,
  ];

  assert.equal(values.some(containsLatinOutsideKeyHints), false);
});

test("switching language replaces every decision label", () => {
  const values = { prompt: "", selfChoice: "", dealerChoice: "" };
  const sink = (key: keyof typeof values): TextSink => ({
    setText(text) {
      values[key] = text;
    },
  });
  const sinks = {
    prompt: sink("prompt"),
    selfChoice: sink("selfChoice"),
    dealerChoice: sink("dealerChoice"),
  };

  applyDecisionCopy("en", sinks);
  assert.deepEqual(values, getDecisionCopy("en"));

  applyDecisionCopy("zh", sinks);
  assert.deepEqual(values, getDecisionCopy("zh"));

  applyDecisionCopy("en", sinks);
  assert.deepEqual(values, getDecisionCopy("en"));
});

test("the language button names only the alternate language", () => {
  assert.equal(getInterfaceCopy("en").languageToggle, "[L] 中文");
  assert.equal(getInterfaceCopy("zh").languageToggle, "[L] EN");
});
