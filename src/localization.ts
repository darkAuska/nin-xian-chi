export type Language = "en" | "zh";

export type TextSink = {
  setText(text: string): unknown;
};

const decisionCopy = {
  en: {
    prompt: "WHO TAKES THE BITE?",
    selfChoice: "[1] I EAT",
    dealerChoice: "[2] YOU FIRST",
  },
  zh: {
    prompt: "眼前这盆，谁先吃？",
    selfChoice: "[1] 我先吃",
    dealerChoice: "[2] 您先吃",
  },
} as const;

const interfaceCopy = {
  en: {
    restart: "[R] RESTART",
    languageToggle: "[L] 中文",
    retry: "[ENTER] PLAY AGAIN",
    emptyDish: "EMPTY",
    superChili: "SUPER CHILI",
    sweetPepper: "SWEET PEPPER",
    documentTitle: "You First — A Corporate Chili Bluff",
    gameAriaLabel: "You First, a corporate chili bluff game",
    orientationHint: "ROTATE TO PLAY",
    screenReaderInstructions:
      "Memorize the safe and super chili counts. Use items if needed, then press 1 to eat or 2 to tell the boss ‘You first.’ Use L to switch to Chinese.",
  },
  zh: {
    restart: "[R] 重开",
    languageToggle: "[L] EN",
    retry: "[ENTER] 再吃一桌",
    emptyDish: "空",
    superChili: "超级无敌辣椒",
    sweetPepper: "普通甜椒",
    documentTitle: "您先吃——公司宴会辣椒心理战",
    gameAriaLabel: "您先吃，一款公司宴会辣椒心理战游戏",
    orientationHint: "请旋转手机横屏游玩",
    screenReaderInstructions:
      "记住普通甜椒和超级辣椒的数量。需要时先使用道具，再按 1 自己吃，或按 2 请领导先吃。按 L 可切换到英文。",
  },
} as const;

export function getDecisionCopy(language: Language) {
  return decisionCopy[language];
}

export function getInterfaceCopy(language: Language) {
  return interfaceCopy[language];
}

export function applyDecisionCopy(
  language: Language,
  sinks: {
    prompt: TextSink;
    selfChoice: TextSink;
    dealerChoice: TextSink;
  },
) {
  const copy = getDecisionCopy(language);
  sinks.prompt.setText(copy.prompt);
  sinks.selfChoice.setText(copy.selfChoice);
  sinks.dealerChoice.setText(copy.dealerChoice);
}
