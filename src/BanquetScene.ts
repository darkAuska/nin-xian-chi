import * as Phaser from "phaser";
import { chooseDealerAction, type FoodKnowledge } from "./aiStrategy";
import {
  armSpicyOil,
  BASE_SPICY_DAMAGE,
  createRoundFoodFlags,
  discardServedEntry,
  MAX_HEALTH,
  nextServingId,
  resolveSpicyDamage,
  resolveTurn,
  spicyCountForRound,
  swapServedWithNext,
  type Actor,
  type Target,
} from "./gameRules";
import {
  canUseAnotherItem,
  getItemDefinition,
  grantRandomItems,
  MAX_ITEM_SLOTS,
  MAX_ITEMS_PER_ACTION,
  removeItemInstance,
  type ItemInstance,
  type ItemOwner,
} from "./items";

type Phase =
  | "intro"
  | "round-preview"
  | "player-target"
  | "player-item-target"
  | "resolving"
  | "ai-turn"
  | "won"
  | "lost";

type Food = {
  id: number;
  spicy: boolean;
  revealed: boolean;
  consumed: boolean;
};

const WIDTH = 1280;
const HEIGHT = 720;
const DISH_POSITIONS = [
  { x: 325, y: 438, scale: 0.86 },
  { x: 485, y: 398, scale: 0.93 },
  { x: 645, y: 385, scale: 0.98 },
  { x: 805, y: 398, scale: 0.93 },
  { x: 965, y: 438, scale: 0.86 },
  { x: 645, y: 510, scale: 1.08 },
];
const SERVING_POSITION = { x: WIDTH / 2, y: 478, scale: 1.24 };
const ITEM_TEXTURES: Record<string, string> = {
  toothpick: "item-toothpick",
  "serving-chopsticks": "item-chopsticks",
  "takeout-box": "item-takeout",
  "devil-chili-oil": "item-chili-oil",
};

export class BanquetScene extends Phaser.Scene {
  private phase: Phase = "intro";
  private foods: Food[] = [];
  private foodObjects = new Map<number, Phaser.GameObjects.Container>();
  private playerHealth = MAX_HEALTH;
  private dealerHealth = MAX_HEALTH;
  private round = 0;
  private selectedFoodId: number | null = null;
  private servedFoodId: number | null = null;
  private pendingSpicyDamage = BASE_SPICY_DAMAGE;
  private playerItems: ItemInstance[] = [];
  private dealerItems: ItemInstance[] = [];
  private itemUsesThisAction: Record<ItemOwner, number> = { player: 0, dealer: 0 };
  private dealerKnowledge = new Map<number, boolean>();
  private activeItem: ItemInstance | null = null;
  private itemTargetIds: number[] = [];
  private readonly itemEffectHandlers = new Map<
    string,
    (item: ItemInstance, foodIds: number[]) => void
  >();
  private statusText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private remainingText!: Phaser.GameObjects.Text;
  private spicyOilText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private dealerCaption!: Phaser.GameObjects.Text;
  private playerMilk!: Phaser.GameObjects.Container;
  private dealerMilk!: Phaser.GameObjects.Container;
  private playerItemRoot!: Phaser.GameObjects.Container;
  private dealerItemRoot!: Phaser.GameObjects.Container;
  private targetPanel!: Phaser.GameObjects.Container;
  private introOverlay?: Phaser.GameObjects.Container;
  private resultOverlay?: Phaser.GameObjects.Container;
  private dealerSilhouette!: Phaser.GameObjects.Container;
  private playerHands!: Phaser.GameObjects.Container;
  private restartButton!: Phaser.GameObjects.Container;
  private flash!: Phaser.GameObjects.Rectangle;
  private audioContext?: AudioContext;

  constructor() {
    super("BanquetScene");
  }

  preload() {
    this.load.image("banquet-hall", "/assets/banquet-hall-v1.png");
    this.load.image("leader-silhouette", "/assets/leader-v1.png");
    this.load.image("cloche", "/assets/cloche-v1.png");
    this.load.image("sweet-pepper", "/assets/sweet-pepper-v1.png");
    this.load.image("super-chili", "/assets/super-chili-v1.png");
    this.load.image("item-toothpick", "/assets/item-toothpick-v1.png");
    this.load.image("item-chopsticks", "/assets/item-chopsticks-v1.png");
    this.load.image("item-takeout", "/assets/item-takeout-v1.png");
    this.load.image("item-chili-oil", "/assets/item-chili-oil-v1.png");
    this.load.image("player-hand", "/assets/player-hand-v1.png");
  }

  create() {
    this.cameras.main.setBackgroundColor("#160907");
    this.registerItemEffects();
    this.drawRoom();
    this.createHud();
    this.createTargetPanel();
    this.showIntro();
  }

  private drawRoom() {
    this.add
      .image(WIDTH / 2, HEIGHT / 2, "banquet-hall")
      .setDisplaySize(WIDTH, HEIGHT)
      .setDepth(0);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x120403, 0.2).setDepth(1);

    this.dealerSilhouette = this.createDealer();

    this.add
      .ellipse(WIDTH / 2, 598, 1390, 505, 0x1c0705)
      .setStrokeStyle(16, 0x090202, 0.9)
      .setDepth(5);
    this.add
      .ellipse(WIDTH / 2, 552, 1300, 370, 0x4b170f)
      .setStrokeStyle(8, 0x7a2a19, 0.65)
      .setDepth(5);
    this.add
      .ellipse(WIDTH / 2, 545, 750, 245, 0x2b0c08)
      .setStrokeStyle(4, 0x8b351e, 0.55)
      .setDepth(5);
    this.add
      .ellipse(WIDTH / 2, 535, 700, 210, 0x35110b)
      .setStrokeStyle(2, 0xd06a38, 0.25)
      .setDepth(5);

    this.playerHands = this.createPlayerHands();

    const noise = this.add.graphics().setDepth(90).setAlpha(0.13);
    noise.lineStyle(1, 0xf4d19a, 0.16);
    for (let y = 0; y < HEIGHT; y += 5) noise.lineBetween(0, y, WIDTH, y);
    noise.fillStyle(0xffffff, 0.2);
    for (let i = 0; i < 180; i += 1) {
      noise.fillRect(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), 1, 1);
    }

    this.flash = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xff2a12, 0).setDepth(80);
  }

  private createDealer() {
    const container = this.add.container(WIDTH / 2, 258).setDepth(2);
    const dimHalo = this.add.ellipse(0, 26, 470, 350, 0x7e1d13, 0.13);
    const portrait = this.add
      .image(0, 25, "leader-silhouette")
      .setDisplaySize(465, 465);

    container.add([dimHalo, portrait]);
    this.tweens.add({
      targets: container,
      y: 264,
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    return container;
  }

  private createPlayerHands() {
    const root = this.add.container(0, 0).setDepth(22);
    const left = this.add
      .image(150, 694, "player-hand")
      .setDisplaySize(310, 310)
      .setAngle(-7);
    const right = this.add
      .image(WIDTH - 150, 694, "player-hand")
      .setDisplaySize(310, 310)
      .setFlipX(true)
      .setAngle(7);
    root.add([left, right]);
    return root;
  }

  private createHud() {
    this.add
      .rectangle(WIDTH / 2, 70, 790, 100, 0x090202, 0.68)
      .setStrokeStyle(1, 0x7a2a19, 0.45)
      .setDepth(29);

    this.roundText = this.add
      .text(34, 26, "尚未入席", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#e3b76f",
      })
      .setDepth(30);

    this.turnText = this.add
      .text(WIDTH - 34, 28, "午夜宴会", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#e3b76f",
      })
      .setOrigin(1, 0)
      .setDepth(30);

    this.statusText = this.add
      .text(WIDTH / 2, 52, "请坐。", {
        fontFamily: "serif",
        fontSize: "21px",
        color: "#ffe6b7",
        align: "center",
        wordWrap: { width: 760 },
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.remainingText = this.add
      .text(WIDTH / 2, 88, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#b86b4b",
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.spicyOilText = this.add
      .text(WIDTH / 2, 119, "魔鬼辣椒油待触发 · 下一颗超级辣椒造成 2 点伤害", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ff7045",
        backgroundColor: "#3c0b06",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setVisible(false);

    this.dealerCaption = this.add
      .text(WIDTH / 2, 328, "笑容过于标准的领导", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#8b4c3e",
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(24);

    this.dealerMilk = this.add.container(1055, 126).setDepth(31);
    this.playerMilk = this.add.container(190, 625).setDepth(31);
    this.dealerItemRoot = this.add.container(1150, 230).setDepth(52);
    this.playerItemRoot = this.add.container(WIDTH / 2, 695).setDepth(70);
    this.restartButton = this.makeCompactButton(1191, 91, 142, 36, "立即重开", () => this.startGame())
      .setDepth(61)
      .setVisible(false);
    this.drawMilkRows();
    this.renderItemSlots();
  }

  private drawMilkRows() {
    this.drawMilkRow(this.dealerMilk, this.dealerHealth, false);
    this.drawMilkRow(this.playerMilk, this.playerHealth, true);
  }

  private drawMilkRow(root: Phaser.GameObjects.Container, health: number, player: boolean) {
    root.removeAll(true);
    const label = this.add
      .text(50, player ? 28 : -25, player ? "你的表情管理" : "领导的表情管理", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#caa57b",
      })
      .setOrigin(0.5);
    root.add(label);

    const glasses: Phaser.GameObjects.Container[] = [];
    for (let index = 0; index < MAX_HEALTH; index += 1) {
      const cup = this.add.container(index * 48, 0);
      const glass = this.add.graphics();
      const alive = index < health;
      glass.lineStyle(3, alive ? 0xe7e0cc : 0x5b4037, alive ? 0.9 : 0.35);
      glass.strokeRoundedRect(0, 0, 34, 42, 5);
      if (alive) {
        glass.fillStyle(0xd7edf0, 0.9);
        glass.fillRoundedRect(4, 13, 26, 25, 3);
        glass.fillStyle(0xffffff, 0.5);
        glass.fillRect(8, 17, 4, 15);
      } else {
        glass.lineStyle(2, 0x8e251d, 0.55);
        glass.lineBetween(5, 5, 29, 36);
      }
      cup.add(glass);
      root.add(cup);
      glasses.push(cup);
    }
    root.setData("milkGlasses", glasses);
  }

  private renderItemSlots() {
    this.drawItemSlots(this.dealerItemRoot, this.dealerItems, false);
    this.drawItemSlots(this.playerItemRoot, this.playerItems, true);
  }

  private drawItemSlots(
    root: Phaser.GameObjects.Container,
    items: ItemInstance[],
    player: boolean,
  ) {
    root.removeAll(true);
    const canInteract =
      player &&
      (this.phase === "player-target" || this.phase === "player-item-target") &&
      canUseAnotherItem(this.itemUsesThisAction.player);
    const label = this.add
      .text(
        player ? 0 : -4,
        player ? -31 : -27,
        player
          ? `你的道具 · 本次还可用 ${Math.max(0, MAX_ITEMS_PER_ACTION - this.itemUsesThisAction.player)} 件`
          : `领导的道具 · 已用 ${this.itemUsesThisAction.dealer}/${MAX_ITEMS_PER_ACTION}`,
        {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#caa57b",
        },
      )
      .setOrigin(player ? 0.5 : 1, 0.5);
    root.add(label);

    for (let index = 0; index < MAX_ITEM_SLOTS; index += 1) {
      const item = items[index];
      const x = player ? (index - 1.5) * 104 : 0;
      const y = player ? 0 : index * 53;
      const slot = this.add.container(x, y);
      const active = item?.instanceId === this.activeItem?.instanceId;
      const touchArea = this.add.rectangle(0, 0, player ? 100 : 92, player ? 78 : 51, 0xffffff, 0.001);
      const background = this.add
        .rectangle(0, 0, player ? 94 : 88, 43, item ? 0x2b130d : 0x120705, item ? 0.96 : 0.55)
        .setStrokeStyle(active ? 3 : 2, active ? 0xffd36f : 0x8d563d, item ? 0.8 : 0.25);
      slot.add([touchArea, background]);

      if (item) {
        const definition = getItemDefinition(item.definitionId);
        const iconTexture = ITEM_TEXTURES[definition.id];
        const icon = iconTexture
          ? this.add
              .image(player ? -29 : -27, 0, iconTexture)
              .setDisplaySize(34, 34)
              .setAlpha(player && !canInteract ? 0.58 : 0.92)
          : this.add
              .text(player ? -29 : -26, 0, definition.shortLabel, {
                fontFamily: "serif",
                fontSize: "21px",
                color: `#${definition.tint.toString(16).padStart(6, "0")}`,
              })
              .setOrigin(0.5);
        const name = this.add
          .text(player ? 12 : 10, 0, definition.name, {
            fontFamily: "monospace",
            fontSize: "11px",
            color: canInteract ? "#f3d9b2" : "#806459",
          })
          .setOrigin(0.5);
        slot.add([icon, name]);

        if (canInteract) {
          touchArea.setInteractive({ useHandCursor: true });
          touchArea.on("pointerover", () => slot.setScale(1.05));
          touchArea.on("pointerout", () => slot.setScale(1));
          touchArea.on("pointerdown", () => slot.setScale(0.96));
          touchArea.on("pointerup", () => {
            slot.setScale(1);
            this.activatePlayerItem(item.instanceId);
          });
        }
      } else {
        const empty = this.add
          .text(0, 0, "空", {
            fontFamily: "monospace",
            fontSize: "9px",
            color: "#4f332c",
          })
          .setOrigin(0.5);
        slot.add(empty);
      }

      root.add(slot);
    }
  }

  private createTargetPanel() {
    this.targetPanel = this.add.container(WIDTH / 2, 600).setDepth(60).setVisible(false);
    const prompt = this.add
      .text(0, -47, "眼前这盆，谁先吃？", {
        fontFamily: "serif",
        fontSize: "19px",
        color: "#ffe7b8",
      })
      .setOrigin(0.5);
    const selfButton = this.makeButton(-145, 0, 250, 62, "我先吃", 0x6e2b1c, () =>
      this.resolvePlayerChoice("player"),
    );
    const dealerButton = this.makeButton(145, 0, 250, 62, "您先吃", 0xa52218, () =>
      this.resolvePlayerChoice("dealer"),
    );
    this.targetPanel.add([prompt, selfButton, dealerButton]);
  }

  private makeButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color: number,
    onClick: () => void,
  ) {
    const root = this.add.container(x, y);
    const touchArea = this.add.rectangle(0, 0, width + 18, Math.max(height, 84), 0xffffff, 0.001);
    const background = this.add
      .rectangle(0, 0, width, height, color, 0.95)
      .setStrokeStyle(2, 0xffd29b, 0.55);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "serif",
        fontSize: "22px",
        color: "#fff0d2",
      })
      .setOrigin(0.5);
    touchArea.setInteractive({ useHandCursor: true });
    touchArea.on("pointerover", () => root.setScale(1.04));
    touchArea.on("pointerout", () => root.setScale(1));
    touchArea.on("pointerdown", () => root.setScale(0.96));
    touchArea.on("pointerup", () => {
      root.setScale(1);
      onClick();
    });
    root.add([touchArea, background, text]);
    return root;
  }

  private makeCompactButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
  ) {
    const root = this.add.container(x, y);
    const touchArea = this.add.rectangle(0, 0, width + 12, Math.max(height, 60), 0xffffff, 0.001);
    const background = this.add
      .rectangle(0, 0, width, height, 0x240b08, 0.92)
      .setStrokeStyle(1, 0xb05b38, 0.7);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#e8cda7",
      })
      .setOrigin(0.5);
    touchArea.setInteractive({ useHandCursor: true });
    touchArea.on("pointerover", () => root.setScale(1.04));
    touchArea.on("pointerout", () => root.setScale(1));
    touchArea.on("pointerdown", () => root.setScale(0.95));
    touchArea.on("pointerup", () => {
      root.setScale(1);
      onClick();
    });
    root.add([touchArea, background, text]);
    return root;
  }

  private showIntro() {
    const overlay = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x090202, 0.91);
    const panel = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, 860, 550, 0x1c0907, 0.98)
      .setStrokeStyle(3, 0x8f3422, 0.8);
    const eyebrow = this.add
      .text(WIDTH / 2, 150, "午夜公司年会 · 新品试吃环节", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#c46a42",
        letterSpacing: 4,
      })
      .setOrigin(0.5);
    const title = this.add
      .text(WIDTH / 2, 220, "您先吃", {
        fontFamily: "serif",
        fontSize: "82px",
        color: "#ffe5b5",
        stroke: "#6d130d",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(WIDTH / 2, 295, "普通甜椒不会伤人。超级无敌辣椒会让你失去一杯牛奶。", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#c9a588",
      })
      .setOrigin(0.5);
    const rules = this.add
      .text(
        WIDTH / 2,
        365,
        "① 记住本轮辣椒与甜椒的总数\n② 每次只看眼前一盆；道具可以先用，最多两件\n③ 最后点「我先吃」或「您先吃」——甜椒续手，辣椒换人",
        {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#e1c9aa",
          align: "left",
          lineSpacing: 12,
        },
      )
      .setOrigin(0.5);
    const start = this.makeButton(WIDTH / 2, 525, 360, 74, "开始入席", 0x8f1e15, () => this.startGame());
    const warning = this.add
      .text(WIDTH / 2, 590, "鼠标或触摸均可操作 · 领导坚持认为自己不怕辣", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#75443a",
      })
      .setOrigin(0.5);
    overlay.add([shade, panel, eyebrow, title, subtitle, rules, start, warning]);
    this.introOverlay = overlay;
  }

  private startGame() {
    this.ensureAudio();
    this.tone(120, 0.16, "sawtooth");
    this.introOverlay?.destroy(true);
    this.resultOverlay?.destroy(true);
    this.restartButton.setVisible(true);
    this.phase = "round-preview";
    this.round = 0;
    this.playerHealth = MAX_HEALTH;
    this.dealerHealth = MAX_HEALTH;
    this.selectedFoodId = null;
    this.servedFoodId = null;
    this.playerItems = [];
    this.dealerItems = [];
    this.itemUsesThisAction = { player: 0, dealer: 0 };
    this.dealerKnowledge.clear();
    this.pendingSpicyDamage = BASE_SPICY_DAMAGE;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.dealerSilhouette.setX(WIDTH / 2).setAngle(0).setAlpha(1);
    this.playerHands.setPosition(0, 0).setAngle(0).setAlpha(1);
    this.dealerCaption.setText("笑容过于标准的领导");
    this.flash.setAlpha(0);
    this.clearFoods();
    this.drawMilkRows();
    this.renderItemSlots();
    this.updateSpicyOilHud();
    this.prepareRound();
  }

  private prepareRound() {
    this.phase = "round-preview";
    this.round += 1;
    this.selectedFoodId = null;
    this.servedFoodId = null;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.itemUsesThisAction = { player: 0, dealer: 0 };
    this.dealerKnowledge.clear();
    this.pendingSpicyDamage = BASE_SPICY_DAMAGE;
    this.playerItems = grantRandomItems(this.round, "player");
    this.dealerItems = grantRandomItems(this.round, "dealer");
    this.targetPanel.setVisible(false);
    this.renderItemSlots();
    this.updateSpicyOilHud();

    const spicyCount = spicyCountForRound(this.round);
    const safeCount = 6 - spicyCount;
    const preview = [
      ...Array.from({ length: spicyCount }, () => true),
      ...Array.from({ length: safeCount }, () => false),
    ];

    this.foods = preview.map((spicy, id) => ({ id, spicy, revealed: true, consumed: false }));
    this.renderFoods();
    this.roundText.setText(`第 ${this.round} 轮`);
    this.turnText.setText("请记住数量");
    this.setMessage(
      `本轮有 ${spicyCount} 颗超级无敌辣椒，${safeCount} 颗普通甜椒。服务员送来 ${this.playerItems.length} 件道具。`,
    );
    this.updateHud();
    this.tone(240, 0.08, "triangle");

    this.time.delayedCall(1900, () => {
      const shuffled = createRoundFoodFlags(this.round);
      this.foods = shuffled.map((spicy, id) => ({ id, spicy, revealed: false, consumed: false }));
      this.serveNextFood();
      this.beginPlayerTurn(false, "服务员端上第 1 盆。餐盖扣得很严，决定谁先吃。");
      this.tone(90, 0.18, "square");
    });
  }

  private renderFoods() {
    this.clearFoods();

    const servedFood = this.foods.find((food) => food.id === this.servedFoodId);
    const displayedFoods =
      this.phase === "round-preview"
        ? this.foods.map((food, index) => ({ food, position: DISH_POSITIONS[index] }))
        : servedFood
          ? [{ food: servedFood, position: SERVING_POSITION }]
          : [];

    displayedFoods.forEach(({ food, position }) => {
      const container = this.add
        .container(position.x, position.y)
        .setDepth(20 + Math.round(position.y / 20))
        .setScale(position.scale);
      container.setData("baseScale", position.scale);

      const graphics = this.add.graphics();
      graphics.fillStyle(0x120403, 0.6);
      graphics.fillEllipse(0, 19, 130, 40);
      graphics.fillStyle(0xd3b991, food.consumed ? 0.18 : 0.82);
      graphics.fillEllipse(0, 10, 118, 42);
      graphics.lineStyle(3, 0xf2d9aa, food.consumed ? 0.15 : 0.45);
      graphics.strokeEllipse(0, 10, 118, 42);

      if (food.consumed) {
        const empty = this.add
          .text(0, 6, "空", { fontFamily: "serif", fontSize: "22px", color: "#5f3228" })
          .setOrigin(0.5);
        container.add([graphics, empty]);
      } else if (food.revealed) {
        const pepper = this.add
          .image(0, food.spicy ? -7 : -4, food.spicy ? "super-chili" : "sweet-pepper")
          .setDisplaySize(food.spicy ? 102 : 88, food.spicy ? 66 : 58);
        const label = this.add
          .text(0, 53, food.spicy ? "超级无敌辣椒" : "普通甜椒", {
            fontFamily: "monospace",
            fontSize: "10px",
            color: food.spicy ? "#ff6a3d" : "#9fcf75",
          })
          .setOrigin(0.5);
        container.add([graphics, pepper, label]);
        container.setData("foodVisuals", [pepper, label]);
      } else {
        const cloche = this.add.image(0, -7, "cloche").setDisplaySize(124, 82);
        container.add([graphics, cloche]);
        container.setData("cloche", cloche);
      }

      if ((this.selectedFoodId === food.id || this.itemTargetIds.includes(food.id)) && !food.consumed) {
        const ring = this.add.ellipse(0, 7, 142, 76).setStrokeStyle(4, 0xffd36f, 0.95);
        container.addAt(ring, 0);
      }

      if (!food.consumed && this.phase === "player-item-target") {
        container.setSize(132, 90);
        container.setInteractive(new Phaser.Geom.Rectangle(-66, -47, 132, 94), Phaser.Geom.Rectangle.Contains);
        container.on("pointerover", () => {
          const base = container.getData("baseScale") as number;
          container.setScale(base * 1.06);
        });
        container.on("pointerout", () => {
          const base = container.getData("baseScale") as number;
          container.setScale(base);
        });
        container.on("pointerdown", () => this.selectFood(food.id));
      }

      this.foodObjects.set(food.id, container);
    });
  }

  private clearFoods() {
    this.foodObjects.forEach((object) => object.destroy(true));
    this.foodObjects.clear();
  }

  private selectFood(id: number) {
    const food = this.foods.find((candidate) => candidate.id === id);
    if (!food || food.consumed) return;
    if (this.phase !== "player-item-target") return;
    this.selectItemFoodTarget(id);
  }

  private registerItemEffects() {
    this.itemEffectHandlers.set("peek-food", (item, foodIds) => {
      const food = this.foods.find((candidate) => candidate.id === foodIds[0]);
      if (!food || food.consumed) {
        this.cancelActiveItem("这个餐盖已经不能查看了，请重新选择。");
        return;
      }

      const wasRevealed = food.revealed;
      this.playItemSound("peek-food");
      food.revealed = true;
      this.renderFoods();
      this.setMessage(
        food.spicy
          ? "牙签挑开一条缝：眼前这盆是超级无敌辣椒。"
          : "牙签挑开一条缝：眼前这盆是普通甜椒。",
      );
      this.tone(food.spicy ? 118 : 410, 0.12, food.spicy ? "sawtooth" : "sine");

      this.time.delayedCall(1150, () => {
        food.revealed = wasRevealed;
        this.consumePlayerItem(item);
        this.resumePlayerChoice(
          canUseAnotherItem(this.itemUsesThisAction.player)
            ? "餐盖重新盖好了。你还可以使用道具，或决定谁吃眼前这盆。"
            : "餐盖重新盖好了。本次道具额度已用完，请决定谁吃眼前这盆。",
        );
      });
    });

    this.itemEffectHandlers.set("swap-next-food", (item) => {
      const swap = swapServedWithNext(this.foods, this.servedFoodId);
      if (!swap.swapped) {
        this.cancelActiveItem("只剩最后一盆了，公筷已经没有可以交换的对象。");
        return;
      }

      this.foods = swap.entries;
      this.playItemSound("swap-next-food");
      this.servedFoodId = swap.servedId;
      this.selectedFoodId = this.servedFoodId;
      this.renderFoods();
      this.setMessage("领导看着你用公筷，把眼前这盆和下一盆公开调换了位置……");
      this.tone(225, 0.08, "square");

      this.time.delayedCall(650, () => {
        this.consumePlayerItem(item);
        this.resumePlayerChoice(
          canUseAnotherItem(this.itemUsesThisAction.player)
            ? "交换完成。你还可以使用道具，或决定谁吃换上来的这一盆。"
            : "交换完成。本次道具额度已用完，请决定谁吃换上来的这一盆。",
        );
      });
    });

    this.itemEffectHandlers.set("discard-current-food", (item) => {
      const food = this.foods.find(
        (candidate) => candidate.id === this.servedFoodId && !candidate.consumed,
      );
      if (!food) {
        this.cancelActiveItem("眼前没有可以打包的食物。");
        return;
      }

      this.playItemSound("discard-current-food");
      food.revealed = true;
      this.renderFoods();
      this.setMessage(
        food.spicy
          ? "打包盒掀开餐盖：超级无敌辣椒被装走了，没有人受伤。"
          : "打包盒掀开餐盖：普通甜椒被装走了，没有人获得额外行动。",
      );
      this.tone(food.spicy ? 145 : 360, 0.1, "triangle");

      this.time.delayedCall(850, () => {
        const discard = discardServedEntry(this.foods, this.servedFoodId);
        if (!discard.discarded) {
          this.cancelActiveItem("这盆食物已经不能打包了。");
          return;
        }

        this.foods = discard.entries;
        if (discard.discardedId !== null) this.dealerKnowledge.delete(discard.discardedId);
        this.consumePlayerItem(item);
        this.servedFoodId = null;
        this.selectedFoodId = null;
        this.renderFoods();
        this.renderItemSlots();
        this.updateHud();

        if (this.finishRoundIfEmpty()) return;

        this.setMessage("打包盒被服务员封好带走。现在从固定队列端来下一盆……");
        this.time.delayedCall(650, () => {
          this.serveNextFood();
          this.resumePlayerChoice(
            canUseAnotherItem(this.itemUsesThisAction.player)
              ? `${this.servingLabel()}已经上桌。你还可以使用道具，或决定谁吃。`
              : `${this.servingLabel()}已经上桌。本次道具额度已用完，请决定谁吃。`,
          );
        });
      });
    });

    this.itemEffectHandlers.set("boost-next-spicy", (item) => {
      const armed = armSpicyOil(this.pendingSpicyDamage);
      if (!armed.armed) {
        this.cancelActiveItem("魔鬼辣椒油已经在桌上了，不能继续叠加。");
        return;
      }

      this.pendingSpicyDamage = armed.pendingDamage;
      this.playItemSound("boost-next-spicy");
      this.consumePlayerItem(item);
      this.updateSpicyOilHud();
      this.renderItemSlots();
      this.flash.setFillStyle(0xff4a18, 0.22).setAlpha(0.22);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 460, ease: "Quad.Out" });
      this.setMessage("魔鬼辣椒油已经倒进公用蘸碟：下一颗被吃掉的超级辣椒造成双倍伤害。");
      this.tone(82, 0.22, "sawtooth");

      this.time.delayedCall(650, () => {
        this.resumePlayerChoice(
          canUseAnotherItem(this.itemUsesThisAction.player)
            ? "辣椒油效果正在等待触发。你还可以使用道具，或决定谁吃眼前这盆。"
            : "辣椒油效果正在等待触发。本次道具额度已用完，请决定谁吃。",
        );
      });
    });
  }

  private activatePlayerItem(instanceId: string) {
    if (this.phase !== "player-target" && this.phase !== "player-item-target") return;

    if (this.activeItem?.instanceId === instanceId) {
      this.cancelActiveItem("已收起道具。你可以换一件，或直接决定谁吃眼前这盆。");
      return;
    }
    if (!canUseAnotherItem(this.itemUsesThisAction.player)) {
      this.cancelActiveItem("本次最多使用两件道具，请选择一份食物。");
      return;
    }

    const item = this.playerItems.find((candidate) => candidate.instanceId === instanceId);
    if (!item) return;
    const definition = getItemDefinition(item.definitionId);
    if (!this.itemEffectHandlers.has(definition.effectId)) {
      this.cancelActiveItem(`${definition.name}暂时没有可用效果。`);
      return;
    }

    this.activeItem = item;
    this.itemTargetIds = [];
    this.selectedFoodId = this.servedFoodId;
    this.targetPanel.setVisible(false);
    this.tone(275, 0.05, "triangle");

    if (definition.foodTargetCount === 0) {
      this.phase = "resolving";
      this.renderFoods();
      this.renderItemSlots();
      this.itemEffectHandlers.get(definition.effectId)?.(item, []);
      return;
    }

    this.phase = "player-item-target";
    this.renderFoods();
    this.renderItemSlots();
    this.setMessage(definition.targetPrompt);
  }

  private selectItemFoodTarget(id: number) {
    if (this.phase !== "player-item-target" || !this.activeItem) return;
    const food = this.foods.find((candidate) => candidate.id === id);
    if (!food || food.consumed) return;

    const definition = getItemDefinition(this.activeItem.definitionId);
    if (this.itemTargetIds.includes(id)) {
      this.itemTargetIds = this.itemTargetIds.filter((targetId) => targetId !== id);
    } else if (this.itemTargetIds.length < definition.foodTargetCount) {
      this.itemTargetIds.push(id);
    }
    this.tone(340, 0.045, "triangle");
    this.renderFoods();

    if (this.itemTargetIds.length < definition.foodTargetCount) {
      const remaining = definition.foodTargetCount - this.itemTargetIds.length;
      this.setMessage(`${definition.targetPrompt} 还需选择 ${remaining} 个餐盖。`);
      return;
    }

    const handler = this.itemEffectHandlers.get(definition.effectId);
    if (!handler) {
      this.cancelActiveItem(`${definition.name}暂时没有可用效果。`);
      return;
    }
    const targets = [...this.itemTargetIds];
    this.phase = "resolving";
    this.renderFoods();
    this.renderItemSlots();
    handler(this.activeItem, targets);
  }

  private consumePlayerItem(item: ItemInstance) {
    this.playerItems = removeItemInstance(this.playerItems, item.instanceId);
    this.itemUsesThisAction.player += 1;
    this.activeItem = null;
    this.itemTargetIds = [];
  }

  private cancelActiveItem(message: string) {
    this.resumePlayerChoice(message);
  }

  private resumePlayerChoice(message: string) {
    this.phase = "player-target";
    this.activeItem = null;
    this.itemTargetIds = [];
    this.selectedFoodId = this.servedFoodId;
    this.targetPanel.setVisible(true);
    this.renderFoods();
    this.renderItemSlots();
    this.turnText.setText("轮到你决定");
    this.setMessage(message);
  }

  private serveNextFood() {
    this.servedFoodId = nextServingId(this.foods);
    this.selectedFoodId = this.servedFoodId;
  }

  private servingLabel() {
    const servingNumber = this.foods.filter((food) => food.consumed).length + 1;
    return `第 ${servingNumber} / ${this.foods.length} 盆`;
  }

  private finishRoundIfEmpty() {
    if (!this.foods.every((food) => food.consumed)) return false;
    this.phase = "resolving";
    this.targetPanel.setVisible(false);
    this.setMessage("本轮六盆已经全部端完。服务员正在准备更危险的下一轮。 ");
    this.turnText.setText("正在换盘");
    this.renderItemSlots();
    this.time.delayedCall(1050, () => this.prepareRound());
    return true;
  }

  private resolvePlayerChoice(target: Target) {
    if (this.phase !== "player-target" || this.servedFoodId === null) return;
    this.resolveChoice("player", target, this.servedFoodId);
  }

  private liftCloche(foodId: number, onComplete: () => void) {
    const holder = this.foodObjects.get(foodId);
    const cloche = holder?.getData("cloche") as Phaser.GameObjects.Image | undefined;
    if (!cloche) {
      onComplete();
      return;
    }

    this.playClocheSound();
    this.tweens.add({
      targets: cloche,
      y: -112,
      x: 20,
      angle: 16,
      alpha: 0,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 420,
      ease: "Back.In",
      onComplete,
    });
  }

  private playEatingMotion(foodId: number, target: Target, onComplete: () => void) {
    const holder = this.foodObjects.get(foodId);
    const visuals = holder?.getData("foodVisuals") as Phaser.GameObjects.GameObject[] | undefined;
    if (!visuals?.length) {
      onComplete();
      return;
    }

    if (target === "player") {
      this.tweens.add({
        targets: this.playerHands,
        y: -18,
        duration: 150,
        yoyo: true,
        ease: "Quad.Out",
      });
    } else {
      this.tweens.add({
        targets: this.dealerSilhouette,
        scaleX: 1.035,
        scaleY: 1.035,
        duration: 170,
        yoyo: true,
        ease: "Quad.Out",
      });
    }

    this.playSwallowSound();
    this.tweens.add({
      targets: visuals,
      y: target === "player" ? "+=105" : "-=125",
      scaleX: 0.18,
      scaleY: 0.18,
      alpha: 0,
      duration: 360,
      ease: "Quad.In",
      onComplete,
    });
  }

  private playRevealEffect(foodId: number, spicy: boolean) {
    const holder = this.foodObjects.get(foodId);
    if (!holder) return;
    const baseScale = holder.getData("baseScale") as number;
    this.tweens.add({
      targets: holder,
      scaleX: baseScale * (spicy ? 1.08 : 1.035),
      scaleY: baseScale * (spicy ? 1.08 : 1.035),
      duration: spicy ? 95 : 150,
      yoyo: true,
      repeat: spicy ? 1 : 0,
      ease: "Quad.Out",
    });
    if (!spicy) return;

    const fire = this.add.container(0, -42).setDepth(8);
    const colors = [0x74170f, 0xd33a19, 0xf48b2d, 0xffd06a, 0x1a0805];
    for (let index = 0; index < 7; index += 1) {
      const x = -42 + index * 14;
      const height = 34 + (index % 3) * 9;
      const flame = this.add
        .triangle(x, 10, 0, height, 11, 0, 22, height, colors[index % colors.length], 0.96)
        .setStrokeStyle(2, 0x250704, 0.75)
        .setAngle(index % 2 === 0 ? -8 : 9)
        .setScale(0.25)
        .setAlpha(0);
      fire.add(flame);
      this.tweens.add({
        targets: flame,
        y: -12 - (index % 3) * 5,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        angle: index % 2 === 0 ? 8 : -10,
        duration: 170,
        delay: index * 18,
        yoyo: true,
        repeat: 1,
        ease: "Sine.InOut",
      });
    }
    holder.add(fire);
  }

  private playPaperFireBurst(target: Target, boosted: boolean) {
    const originX = target === "dealer" ? WIDTH / 2 + 8 : WIDTH / 2;
    const originY = target === "dealer" ? 247 : 665;
    const fire = this.add.container(originX, originY).setDepth(76);
    const colors = [0x7b140d, 0xd62d16, 0xff7729, 0xffd477, 0x170302];
    const pieceCount = boosted ? 13 : 9;

    for (let index = 0; index < pieceCount; index += 1) {
      const angle = target === "dealer" ? -42 + index * 8 : -142 + index * 9;
      const distance = (boosted ? 150 : 110) + (index % 3) * 20;
      const radians = Phaser.Math.DegToRad(angle);
      const flame = this.add
        .triangle(0, 0, 0, 27, 9, 0, 18, 27, colors[index % colors.length], 0.98)
        .setStrokeStyle(2, 0x260402, 0.8)
        .setAngle(angle + 90)
        .setScale(0.3);
      fire.add(flame);
      this.tweens.add({
        targets: flame,
        x: Math.cos(radians) * distance,
        y: Math.sin(radians) * distance,
        scaleX: boosted ? 1.35 : 1,
        scaleY: boosted ? 1.35 : 1,
        alpha: 0,
        angle: `+=${index % 2 === 0 ? 28 : -28}`,
        duration: boosted ? 520 : 390,
        delay: index * 18,
        ease: "Quad.Out",
      });
    }

    for (let index = 0; index < 4; index += 1) {
      const smoke = this.add
        .ellipse(0, 0, 28 + index * 7, 20 + index * 5, index % 2 ? 0x351a15 : 0x160b09, 0.78)
        .setStrokeStyle(1, 0xb2603b, 0.22);
      fire.add(smoke);
      this.tweens.add({
        targets: smoke,
        x: target === "dealer" ? 65 + index * 25 : (index - 1.5) * 24,
        y: target === "dealer" ? -28 - index * 18 : -58 - index * 24,
        scaleX: 1.8,
        scaleY: 1.8,
        alpha: 0,
        duration: 720,
        delay: 140 + index * 60,
        ease: "Sine.Out",
      });
    }
    this.time.delayedCall(950, () => fire.destroy(true));
  }

  private animateMilkLoss(target: Target, oldHealth: number, newHealth: number) {
    const root = target === "player" ? this.playerMilk : this.dealerMilk;
    const glasses = root.getData("milkGlasses") as Phaser.GameObjects.Container[] | undefined;
    const count = Math.max(0, oldHealth - newHealth);
    if (!glasses?.length || count === 0) {
      this.drawMilkRows();
      return;
    }

    for (let offset = 0; offset < count; offset += 1) {
      const cup = glasses[oldHealth - 1 - offset];
      if (!cup) continue;
      const delay = offset * 230;
      this.time.delayedCall(delay, () => this.playMilkSound());
      this.tweens.add({
        targets: cup,
        x: target === "player" ? 455 : -415,
        y: target === "player" ? 102 : 112,
        angle: target === "player" ? 38 : -62,
        scaleX: 1.18,
        scaleY: 1.18,
        alpha: 0,
        duration: 430,
        delay,
        ease: "Cubic.In",
      });
    }
    this.time.delayedCall(520 + Math.max(0, count - 1) * 230, () => this.drawMilkRows());
  }

  private resolveChoice(actor: Actor, target: Target, foodId: number) {
    const food = this.foods.find((candidate) => candidate.id === foodId);
    if (!food || food.consumed || this.phase === "resolving") return;
    const resolution = resolveTurn(actor, target, food.spicy);
    const spicyDamage = resolveSpicyDamage(food.spicy, this.pendingSpicyDamage);

    this.phase = "resolving";
    this.targetPanel.setVisible(false);
    this.selectedFoodId = foodId;
    this.renderFoods();
    this.renderItemSlots();

    const actorName = actor === "player" ? "你" : "领导";
    const targetName = target === actor ? "自己" : target === "player" ? "你" : "领导";
    this.setMessage(`${actorName}把餐盖推向${targetName}……`);
    this.tone(155, 0.11, "sawtooth");

    this.liftCloche(foodId, () => {
      if (this.phase !== "resolving" || food.consumed) return;
      food.revealed = true;
      this.renderFoods();
      this.playRevealEffect(foodId, food.spicy);
      this.setMessage(
        food.spicy
          ? "餐盖一掀：火苗比辣椒先站了起来。"
          : "餐盖一掀：只是一颗表情无辜的普通甜椒。",
      );
      this.tone(food.spicy ? 118 : 520, 0.11, food.spicy ? "sawtooth" : "sine");
      this.time.delayedCall(280, () => {
        this.playEatingMotion(foodId, target, () => {
          this.completeFoodResolution(food, target, resolution, spicyDamage);
        });
      });
    });
  }

  private completeFoodResolution(
    food: Food,
    target: Target,
    resolution: ReturnType<typeof resolveTurn>,
    spicyDamage: ReturnType<typeof resolveSpicyDamage>,
  ) {
    this.pendingSpicyDamage = spicyDamage.nextPendingDamage;
    this.updateSpicyOilHud();

    if (resolution.damageTo) {
      const previousHealth =
        resolution.damageTo === "player" ? this.playerHealth : this.dealerHealth;
      if (resolution.damageTo === "player") {
        this.playerHealth = Math.max(0, this.playerHealth - spicyDamage.damage);
      } else {
        this.dealerHealth = Math.max(0, this.dealerHealth - spicyDamage.damage);
      }
      this.playSpicyReaction(resolution.damageTo, spicyDamage.damage);
      this.animateMilkLoss(
        resolution.damageTo,
        previousHealth,
        resolution.damageTo === "player" ? this.playerHealth : this.dealerHealth,
      );
      this.setMessage(
        spicyDamage.boosted
          ? target === "player"
            ? "魔鬼辣椒油生效！你连续失去两杯牛奶。"
            : "魔鬼辣椒油生效！领导连续失去两杯牛奶。"
          : target === "player"
            ? "超级无敌辣椒。你的表情管理出现严重漏洞。"
            : "超级无敌辣椒。领导的标准笑容松动了。",
      );
    } else {
      this.tone(430, 0.08, "sine");
      this.setMessage(
        target === "player"
          ? "普通甜椒。你甚至尝到了少许清甜。"
          : "普通甜椒。领导礼貌地咀嚼了七次。",
      );
    }
    this.updateHud();

    this.time.delayedCall(900, () => {
      food.consumed = true;
      this.dealerKnowledge.delete(food.id);
      this.servedFoodId = null;
      this.selectedFoodId = null;
      this.renderFoods();
      this.updateHud();

      if (this.playerHealth <= 0) {
        this.finishGame("lost");
        return;
      }
      if (this.dealerHealth <= 0) {
        this.finishGame("won");
        return;
      }
      if (this.finishRoundIfEmpty()) return;

      this.phase = "resolving";
      this.turnText.setText("服务员正在上菜");
      this.setMessage("空盆被端走。服务员从固定队列中端来下一盆……");
      this.renderItemSlots();
      this.time.delayedCall(650, () => {
        this.serveNextFood();
        if (resolution.nextActor === "player") {
          this.beginPlayerTurn(resolution.extraTurn);
        } else {
          this.beginAiTurn(resolution.extraTurn);
        }
      });
    });
  }

  private beginPlayerTurn(continuing: boolean, message?: string) {
    this.phase = "player-target";
    this.selectedFoodId = this.servedFoodId;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.itemUsesThisAction.player = 0;
    this.targetPanel.setVisible(true);
    this.renderFoods();
    this.renderItemSlots();
    this.turnText.setText(continuing ? "你继续决定" : "轮到你决定");
    this.setMessage(
      message ??
        (continuing
          ? `安全。服务员端上${this.servingLabel()}，你可以继续决定谁吃。`
          : `服务员端上${this.servingLabel()}。决定自己吃，还是请领导吃。`),
    );
  }

  private beginAiTurn(continuing: boolean) {
    this.phase = "ai-turn";
    this.selectedFoodId = this.servedFoodId;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.itemUsesThisAction.dealer = 0;
    this.targetPanel.setVisible(false);
    this.renderFoods();
    this.renderItemSlots();
    this.turnText.setText(continuing ? "领导继续决定" : "轮到领导决定");
    this.setMessage(
      continuing
        ? `服务员端上${this.servingLabel()}。领导决定再试一次。`
        : `服务员端上${this.servingLabel()}。领导正在进行风险评估……`,
    );

    this.time.delayedCall(800, () => this.runDealerTurn());
  }

  private dealerKnowledgeFor(foodId: number | null): FoodKnowledge {
    if (foodId === null || !this.dealerKnowledge.has(foodId)) return null;
    return this.dealerKnowledge.get(foodId) ? "spicy" : "safe";
  }

  private runDealerTurn() {
    if (this.phase !== "ai-turn") return;
    const remaining = this.foods.filter((food) => !food.consumed);
    const current = remaining.find((food) => food.id === this.servedFoodId);
    if (!current) return;
    const currentIndex = this.foods.findIndex((food) => food.id === current.id);
    const next = this.foods.find((food, index) => index > currentIndex && !food.consumed);
    const spicyLeft = remaining.filter((food) => food.spicy).length;
    const safeProbability =
      remaining.length === 0 ? 0 : (remaining.length - spicyLeft) / remaining.length;
    const availableEffectIds = this.dealerItems.map(
      (item) => getItemDefinition(item.definitionId).effectId,
    );
    const action = chooseDealerAction({
      currentKnowledge: this.dealerKnowledgeFor(current.id),
      nextKnowledge: this.dealerKnowledgeFor(next?.id ?? null),
      safeProbability,
      dealerHealth: this.dealerHealth,
      playerHealth: this.playerHealth,
      oilArmed: this.pendingSpicyDamage > BASE_SPICY_DAMAGE,
      canUseItem: canUseAnotherItem(this.itemUsesThisAction.dealer),
      availableEffectIds,
    });

    if (action.type === "use-item") {
      const item = this.dealerItems.find(
        (candidate) => getItemDefinition(candidate.definitionId).effectId === action.effectId,
      );
      if (item) {
        this.useDealerItem(item, action.effectId, current);
        return;
      }
      this.time.delayedCall(250, () => this.runDealerTurn());
      return;
    }

    this.selectedFoodId = current.id;
    this.renderFoods();
    const knowledge = this.dealerKnowledgeFor(current.id);
    this.setMessage(
      knowledge === null
        ? action.target === "dealer"
          ? "领导根据剩余比例，决定以身作则。"
          : "领导根据剩余比例，微笑着把餐盖推向了你。"
        : action.target === "dealer"
          ? "领导看起来很有把握，决定自己吃。"
          : "领导看起来很有把握，把餐盖推向了你。",
    );
    this.time.delayedCall(650, () => this.resolveChoice("dealer", action.target, current.id));
  }

  private consumeDealerItem(item: ItemInstance) {
    this.dealerItems = removeItemInstance(this.dealerItems, item.instanceId);
    this.itemUsesThisAction.dealer += 1;
    this.renderItemSlots();
  }

  private useDealerItem(item: ItemInstance, effectId: string, current: Food) {
    if (effectId === "peek-food") {
      this.playItemSound(effectId);
      this.setMessage("领导用袖口挡住视线，拿牙签悄悄挑开了餐盖……");
      this.tone(205, 0.08, "triangle");
      this.time.delayedCall(700, () => {
        this.dealerKnowledge.set(current.id, current.spicy);
        this.consumeDealerItem(item);
        this.setMessage("领导已经看清了，但你什么也没看见。");
        this.time.delayedCall(520, () => this.runDealerTurn());
      });
      return;
    }

    if (effectId === "boost-next-spicy") {
      const armed = armSpicyOil(this.pendingSpicyDamage);
      if (!armed.armed) {
        this.time.delayedCall(250, () => this.runDealerTurn());
        return;
      }
      this.pendingSpicyDamage = armed.pendingDamage;
      this.playItemSound(effectId);
      this.consumeDealerItem(item);
      this.updateSpicyOilHud();
      this.setMessage("领导把魔鬼辣椒油倒进了公用蘸碟。下一颗超级辣椒将造成双倍伤害。");
      this.tone(82, 0.22, "sawtooth");
      this.time.delayedCall(700, () => this.runDealerTurn());
      return;
    }

    if (effectId === "swap-next-food") {
      const swap = swapServedWithNext(this.foods, this.servedFoodId);
      if (!swap.swapped) {
        this.time.delayedCall(250, () => this.runDealerTurn());
        return;
      }
      this.foods = swap.entries;
      this.playItemSound(effectId);
      this.servedFoodId = swap.servedId;
      this.selectedFoodId = this.servedFoodId;
      this.consumeDealerItem(item);
      this.renderFoods();
      this.setMessage("领导用公筷交换了眼前这盆和下一盆。交换过程对双方公开。");
      this.tone(225, 0.08, "square");
      this.time.delayedCall(700, () => this.runDealerTurn());
      return;
    }

    if (effectId === "discard-current-food") {
      this.playItemSound(effectId);
      current.revealed = true;
      this.renderFoods();
      this.setMessage(
        current.spicy
          ? "领导打开打包盒：一盆超级无敌辣椒被公开装走。"
          : "领导打开打包盒：一盆普通甜椒被公开装走。",
      );
      this.tone(current.spicy ? 145 : 360, 0.1, "triangle");
      this.time.delayedCall(850, () => {
        const discard = discardServedEntry(this.foods, this.servedFoodId);
        if (!discard.discarded) {
          this.runDealerTurn();
          return;
        }
        this.foods = discard.entries;
        if (discard.discardedId !== null) this.dealerKnowledge.delete(discard.discardedId);
        this.consumeDealerItem(item);
        this.servedFoodId = null;
        this.selectedFoodId = null;
        this.renderFoods();
        this.updateHud();
        if (this.finishRoundIfEmpty()) return;
        this.setMessage("打包盒被带走，服务员继续为领导端来下一盆……");
        this.time.delayedCall(650, () => {
          this.serveNextFood();
          this.selectedFoodId = this.servedFoodId;
          this.renderFoods();
          this.setMessage(`${this.servingLabel()}已经上桌，领导继续评估。`);
          this.time.delayedCall(450, () => this.runDealerTurn());
        });
      });
      return;
    }

    this.time.delayedCall(250, () => this.runDealerTurn());
  }

  private playSpicyReaction(target: Target, damage = BASE_SPICY_DAMAGE) {
    const boosted = damage > BASE_SPICY_DAMAGE;
    this.playFireSound(boosted);
    this.playPaperFireBurst(target, boosted);
    this.cameras.main.shake(
      boosted ? 420 : 280,
      (target === "player" ? 0.014 : 0.009) * (boosted ? 1.45 : 1),
    );
    this.flash.setFillStyle(0xff2a12, boosted ? 0.62 : 0.48);
    this.flash.setAlpha((target === "player" ? 0.48 : 0.3) * (boosted ? 1.25 : 1));
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 420, ease: "Quad.Out" });

    if (target === "dealer") {
      this.tweens.add({
        targets: this.dealerSilhouette,
        x: { from: WIDTH / 2 - 17, to: WIDTH / 2 + 17 },
        duration: 55,
        yoyo: true,
        repeat: 4,
      });
      this.dealerCaption.setText(this.dealerHealth === 1 ? "笑容正在冒烟的领导" : "努力维持标准笑容的领导");
    } else {
      this.tweens.add({
        targets: this.playerHands,
        x: { from: -12, to: 12 },
        y: { from: -8, to: 7 },
        duration: 48,
        yoyo: true,
        repeat: boosted ? 6 : 4,
        onComplete: () => this.playerHands.setPosition(0, 0),
      });
    }
  }

  private finishGame(result: "won" | "lost") {
    this.phase = result;
    this.turnText.setText(result === "won" ? "宴会结束" : "表情管理失败");
    this.restartButton.setVisible(false);
    this.targetPanel.setVisible(false);
    this.renderItemSlots();
    if (result === "won") {
      this.setMessage("领导连人带标准笑容，正在礼貌而迅速地退出宴会厅……");
      this.tone(74, 0.36, "sawtooth", 0.028);
      this.tweens.add({
        targets: this.dealerSilhouette,
        x: WIDTH + 330,
        angle: 7,
        duration: 720,
        ease: "Back.In",
        onComplete: () => this.showResult(result),
      });
    } else {
      this.setMessage("你的双手决定先于本人离席。表情管理宣告失败……");
      this.tone(86, 0.42, "square", 0.025);
      this.tweens.add({
        targets: this.playerHands,
        y: 220,
        angle: -4,
        alpha: 0.2,
        duration: 620,
        ease: "Cubic.In",
        onComplete: () => this.showResult(result),
      });
    }
  }

  private showResult(result: "won" | "lost") {
    const won = result === "won";
    const overlay = this.add.container(0, 0).setDepth(110);
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x080101, 0.88);
    const panel = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, 720, 460, 0x1c0806, 0.98)
      .setStrokeStyle(3, won ? 0xe3913f : 0xa91f18, 0.85);
    const kicker = this.add
      .text(WIDTH / 2, 215, won ? "试吃会圆满结束" : "事故调查结果", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: won ? "#e4aa5a" : "#d75342",
        letterSpacing: 4,
      })
      .setOrigin(0.5);
    const title = this.add
      .text(WIDTH / 2, 292, won ? "领导先走了" : "你辣到离职了", {
        fontFamily: "serif",
        fontSize: "55px",
        color: "#ffe6b8",
      })
      .setOrigin(0.5);
    const description = this.add
      .text(
        WIDTH / 2,
        360,
        won
          ? `你坚持了 ${this.round} 轮。领导连人带椅子退出了宴会厅。`
          : `第 ${this.round} 轮，你的最后一杯牛奶也没能挽救表情管理。`,
        {
          fontFamily: "sans-serif",
          fontSize: "17px",
          color: "#c9a98d",
        },
      )
      .setOrigin(0.5);
    const retry = this.makeButton(WIDTH / 2, 470, 330, 70, "再吃一桌", 0x8e2118, () => {
      this.startGame();
    });
    overlay.add([shade, panel, kicker, title, description, retry]);
    this.resultOverlay = overlay;
  }

  private updateHud() {
    const remaining = this.foods.filter((food) => !food.consumed);
    const spicy = remaining.filter((food) => food.spicy).length;
    const safe = remaining.length - spicy;
    this.remainingText.setText(
      remaining.length > 0 ? `剩余：普通甜椒 ${safe}  ·  超级无敌辣椒 ${spicy}` : "本轮餐盘已空",
    );
  }

  private updateSpicyOilHud() {
    this.spicyOilText?.setVisible(this.pendingSpicyDamage > BASE_SPICY_DAMAGE);
  }

  private setMessage(message: string) {
    this.statusText.setText(message);
  }

  private ensureAudio() {
    if (this.audioContext || typeof window === "undefined") return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      this.audioContext = new AudioContextClass();
      if (this.audioContext.state === "suspended") void this.audioContext.resume();
    }
  }

  private playClocheSound() {
    this.tone(760, 0.07, "triangle", 0.025);
    this.time.delayedCall(55, () => this.tone(415, 0.11, "square", 0.018));
    this.noiseBurst(0.09, 0.018, 1500);
  }

  private playSwallowSound() {
    this.tone(310, 0.055, "triangle", 0.02);
    this.time.delayedCall(85, () => this.tone(185, 0.09, "sine", 0.026));
  }

  private playFireSound(boosted: boolean) {
    this.tone(boosted ? 48 : 67, boosted ? 0.46 : 0.31, "sawtooth", boosted ? 0.045 : 0.035);
    this.noiseBurst(boosted ? 0.48 : 0.32, boosted ? 0.045 : 0.032, boosted ? 720 : 980);
    this.time.delayedCall(70, () => this.tone(boosted ? 96 : 124, 0.18, "square", 0.018));
  }

  private playMilkSound() {
    this.tone(390, 0.055, "sine", 0.018);
    this.time.delayedCall(55, () => this.tone(285, 0.09, "sine", 0.022));
    this.time.delayedCall(130, () => this.tone(205, 0.08, "triangle", 0.016));
  }

  private playItemSound(effectId: string) {
    const frequency =
      effectId === "peek-food"
        ? 540
        : effectId === "swap-next-food"
          ? 330
          : effectId === "discard-current-food"
            ? 215
            : 92;
    this.tone(frequency, 0.09, effectId === "boost-next-spicy" ? "sawtooth" : "triangle", 0.024);
    this.time.delayedCall(60, () => this.tone(frequency * 0.72, 0.07, "square", 0.012));
  }

  private noiseBurst(duration: number, volume: number, filterFrequency: number) {
    if (!this.audioContext) return;
    if (this.audioContext.state === "suspended") void this.audioContext.resume();
    const frameCount = Math.max(1, Math.floor(this.audioContext.sampleRate * duration));
    const buffer = this.audioContext.createBuffer(1, frameCount, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.audioContext.createBufferSource();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();
    filter.type = "lowpass";
    filter.frequency.value = filterFrequency;
    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    source.start();
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume = 0.028) {
    if (!this.audioContext) return;
    if (this.audioContext.state === "suspended") void this.audioContext.resume();
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }
}
