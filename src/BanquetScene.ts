import * as Phaser from "phaser";
import {
  createRoundFoodFlags,
  discardServedEntry,
  MAX_HEALTH,
  nextServingId,
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

export class BanquetScene extends Phaser.Scene {
  private phase: Phase = "intro";
  private foods: Food[] = [];
  private foodObjects = new Map<number, Phaser.GameObjects.Container>();
  private playerHealth = MAX_HEALTH;
  private dealerHealth = MAX_HEALTH;
  private round = 0;
  private selectedFoodId: number | null = null;
  private servedFoodId: number | null = null;
  private playerItems: ItemInstance[] = [];
  private dealerItems: ItemInstance[] = [];
  private itemsUsedThisAction = 0;
  private activeItem: ItemInstance | null = null;
  private itemTargetIds: number[] = [];
  private readonly itemEffectHandlers = new Map<
    string,
    (item: ItemInstance, foodIds: number[]) => void
  >();
  private statusText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private remainingText!: Phaser.GameObjects.Text;
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
  private flash!: Phaser.GameObjects.Rectangle;
  private audioContext?: AudioContext;

  constructor() {
    super("BanquetScene");
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
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x160907);
    this.add.rectangle(WIDTH / 2, 170, WIDTH, 340, 0x210d0a);

    const wall = this.add.graphics();
    wall.fillStyle(0x3a1710, 0.55);
    wall.fillTriangle(450, 0, 830, 0, 710, 340);
    wall.fillTriangle(0, 0, 225, 0, 330, 370);
    wall.fillTriangle(WIDTH, 0, WIDTH - 225, 0, 950, 370);
    wall.lineStyle(2, 0x7f3622, 0.28);
    for (let x = 70; x < WIDTH; x += 110) wall.lineBetween(x, 0, x - 18, 350);

    this.add
      .text(WIDTH / 2, 54, "年度新品试吃交流会", {
        fontFamily: "serif",
        fontSize: "34px",
        color: "#7c3024",
        letterSpacing: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0.48);

    this.add
      .text(WIDTH / 2, 92, "请保持微笑 · 请服从夹菜 · 请不要浪费牛奶", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#6f3329",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.dealerSilhouette = this.createDealer();

    this.add.ellipse(WIDTH / 2, 598, 1390, 505, 0x1c0705).setStrokeStyle(16, 0x090202, 0.9);
    this.add.ellipse(WIDTH / 2, 552, 1300, 370, 0x4b170f).setStrokeStyle(8, 0x7a2a19, 0.65);
    this.add.ellipse(WIDTH / 2, 545, 750, 245, 0x2b0c08).setStrokeStyle(4, 0x8b351e, 0.55);
    this.add.ellipse(WIDTH / 2, 535, 700, 210, 0x35110b).setStrokeStyle(2, 0xd06a38, 0.25);

    this.createPlayerHands();

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
    const container = this.add.container(WIDTH / 2, 235).setDepth(2);
    const body = this.add.graphics();
    body.fillStyle(0x030202, 1);
    body.fillEllipse(0, 115, 330, 230);
    body.fillCircle(0, -18, 86);
    body.fillTriangle(-34, 40, 0, 132, 34, 40);
    body.fillStyle(0x6f0f0c, 1);
    body.fillTriangle(0, 58, -19, 91, 0, 132);
    body.fillTriangle(0, 58, 19, 91, 0, 132);

    const face = this.add.graphics();
    face.fillStyle(0xf5e7ce, 0.96);
    face.fillRoundedRect(-35, 2, 70, 20, 8);
    face.fillStyle(0x170403, 1);
    for (let x = -25; x <= 25; x += 12) face.fillRect(x, 3, 3, 18);
    face.fillStyle(0xe7c9a0, 0.8);
    face.fillCircle(-31, -29, 5);
    face.fillCircle(31, -29, 5);

    container.add([body, face]);
    this.tweens.add({
      targets: container,
      y: 239,
      duration: 2300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    return container;
  }

  private createPlayerHands() {
    const left = this.add.graphics().setDepth(22);
    left.fillStyle(0x070202, 1);
    left.fillRoundedRect(-135, -48, 270, 95, 46);
    left.setPosition(190, 696).setAngle(-6);
    const right = this.add.graphics().setDepth(22);
    right.fillStyle(0x070202, 1);
    right.fillRoundedRect(-135, -48, 270, 95, 46);
    right.setPosition(1090, 696).setAngle(6);
  }

  private createHud() {
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
      .text(WIDTH / 2, 125, "请坐。", {
        fontFamily: "serif",
        fontSize: "24px",
        color: "#ffe6b7",
        align: "center",
        wordWrap: { width: 760 },
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.remainingText = this.add
      .text(WIDTH / 2, 160, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#b86b4b",
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(30);

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

    for (let index = 0; index < MAX_HEALTH; index += 1) {
      const glass = this.add.graphics();
      const alive = index < health;
      glass.lineStyle(3, alive ? 0xe7e0cc : 0x5b4037, alive ? 0.9 : 0.35);
      glass.strokeRoundedRect(index * 48, 0, 34, 42, 5);
      if (alive) {
        glass.fillStyle(0xd7edf0, 0.9);
        glass.fillRoundedRect(index * 48 + 4, 13, 26, 25, 3);
        glass.fillStyle(0xffffff, 0.5);
        glass.fillRect(index * 48 + 8, 17, 4, 15);
      } else {
        glass.lineStyle(2, 0x8e251d, 0.55);
        glass.lineBetween(index * 48 + 5, 5, index * 48 + 29, 36);
      }
      root.add(glass);
    }
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
      canUseAnotherItem(this.itemsUsedThisAction);
    const label = this.add
      .text(
        player ? 0 : -4,
        player ? -31 : -27,
        player
          ? `你的道具 · 本次还可用 ${Math.max(0, MAX_ITEMS_PER_ACTION - this.itemsUsedThisAction)} 件`
          : "领导的道具",
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
      const background = this.add
        .rectangle(0, 0, player ? 94 : 88, 43, item ? 0x2b130d : 0x120705, item ? 0.96 : 0.55)
        .setStrokeStyle(active ? 3 : 2, active ? 0xffd36f : 0x8d563d, item ? 0.8 : 0.25);
      slot.add(background);

      if (item) {
        const definition = getItemDefinition(item.definitionId);
        const icon = this.add
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
          background.setInteractive({ useHandCursor: true });
          background.on("pointerover", () => slot.setScale(1.05));
          background.on("pointerout", () => slot.setScale(1));
          background.on("pointerdown", () => this.activatePlayerItem(item.instanceId));
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
    const background = this.add
      .rectangle(0, 0, width, height, color, 0.95)
      .setStrokeStyle(2, 0xffd29b, 0.55)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "serif",
        fontSize: "22px",
        color: "#fff0d2",
      })
      .setOrigin(0.5);
    background.on("pointerover", () => root.setScale(1.04));
    background.on("pointerout", () => root.setScale(1));
    background.on("pointerdown", onClick);
    root.add([background, text]);
    return root;
  }

  private showIntro() {
    const overlay = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x090202, 0.91);
    const panel = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, 820, 530, 0x1c0907, 0.98)
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
        "① 记住本轮辣椒与甜椒的总数\n② 服务员每次只端上一盆\n③ 决定自己吃，还是请领导吃",
        {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#e1c9aa",
          align: "left",
          lineSpacing: 12,
        },
      )
      .setOrigin(0.5);
    const start = this.makeButton(WIDTH / 2, 515, 360, 74, "开始入席", 0x8f1e15, () => this.startGame());
    const warning = this.add
      .text(WIDTH / 2, 580, "友情提示：领导坚持认为自己不怕辣", {
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
    this.phase = "round-preview";
    this.round = 0;
    this.playerHealth = MAX_HEALTH;
    this.dealerHealth = MAX_HEALTH;
    this.selectedFoodId = null;
    this.servedFoodId = null;
    this.playerItems = [];
    this.dealerItems = [];
    this.itemsUsedThisAction = 0;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.clearFoods();
    this.drawMilkRows();
    this.renderItemSlots();
    this.prepareRound();
  }

  private prepareRound() {
    this.phase = "round-preview";
    this.round += 1;
    this.selectedFoodId = null;
    this.servedFoodId = null;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.itemsUsedThisAction = 0;
    this.playerItems = grantRandomItems(this.round, "player");
    this.dealerItems = grantRandomItems(this.round, "dealer");
    this.targetPanel.setVisible(false);
    this.renderItemSlots();

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
        const pepper = this.drawPepper(food.spicy);
        const label = this.add
          .text(0, 53, food.spicy ? "超级无敌辣椒" : "普通甜椒", {
            fontFamily: "monospace",
            fontSize: "10px",
            color: food.spicy ? "#ff6a3d" : "#9fcf75",
          })
          .setOrigin(0.5);
        container.add([graphics, pepper, label]);
      } else {
        graphics.fillStyle(0x9d8b7d, 1);
        graphics.fillEllipse(0, -3, 112, 52);
        graphics.fillStyle(0xb7a79a, 1);
        graphics.fillRect(-49, -5, 98, 19);
        graphics.fillStyle(0xd6c7b8, 1);
        graphics.fillEllipse(0, -16, 96, 32);
        graphics.fillStyle(0x5a4d45, 1);
        graphics.fillRoundedRect(-12, -38, 24, 15, 7);
        graphics.lineStyle(2, 0xf5e1ca, 0.45);
        graphics.strokeEllipse(0, -16, 96, 32);
        container.add(graphics);
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

  private drawPepper(spicy: boolean) {
    const root = this.add.container(0, -5);
    const pepper = this.add.graphics();
    const color = spicy ? 0xd91f13 : 0x65a844;
    pepper.fillStyle(color, 1);
    pepper.fillEllipse(-6, 0, 70, 25);
    pepper.fillTriangle(18, -11, 52, 2, 19, 10);
    pepper.fillStyle(spicy ? 0xff5a24 : 0x8dcf58, 0.65);
    pepper.fillEllipse(-21, -4, 25, 8);
    pepper.lineStyle(6, 0x39733a, 1);
    pepper.lineBetween(-40, -4, -53, -15);
    root.add(pepper);

    if (spicy) {
      const flame = this.add.graphics();
      flame.fillStyle(0xffb000, 0.88);
      flame.fillTriangle(-16, -17, -5, -42, 2, -16);
      flame.fillTriangle(3, -16, 14, -35, 21, -13);
      root.add(flame);
    }
    return root;
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
          canUseAnotherItem(this.itemsUsedThisAction)
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
      this.servedFoodId = swap.servedId;
      this.selectedFoodId = this.servedFoodId;
      this.renderFoods();
      this.setMessage("领导看着你用公筷，把眼前这盆和下一盆公开调换了位置……");
      this.tone(225, 0.08, "square");

      this.time.delayedCall(650, () => {
        this.consumePlayerItem(item);
        this.resumePlayerChoice(
          canUseAnotherItem(this.itemsUsedThisAction)
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
            canUseAnotherItem(this.itemsUsedThisAction)
              ? `${this.servingLabel()}已经上桌。你还可以使用道具，或决定谁吃。`
              : `${this.servingLabel()}已经上桌。本次道具额度已用完，请决定谁吃。`,
          );
        });
      });
    });
  }

  private activatePlayerItem(instanceId: string) {
    if (this.phase !== "player-target" && this.phase !== "player-item-target") return;

    if (this.activeItem?.instanceId === instanceId) {
      this.cancelActiveItem("已收起道具。你可以换一件，或直接决定谁吃眼前这盆。");
      return;
    }
    if (!canUseAnotherItem(this.itemsUsedThisAction)) {
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
    this.itemsUsedThisAction += 1;
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

  private resolveChoice(actor: Actor, target: Target, foodId: number) {
    const food = this.foods.find((candidate) => candidate.id === foodId);
    if (!food || food.consumed || this.phase === "resolving") return;
    const resolution = resolveTurn(actor, target, food.spicy);

    this.phase = "resolving";
    this.targetPanel.setVisible(false);
    this.selectedFoodId = foodId;
    food.revealed = true;
    this.renderFoods();
    this.renderItemSlots();

    const actorName = actor === "player" ? "你" : "领导";
    const targetName = target === actor ? "自己" : target === "player" ? "你" : "领导";
    this.setMessage(`${actorName}把餐盖推向${targetName}……`);
    this.tone(155, 0.11, "sawtooth");

    this.time.delayedCall(650, () => {
      if (resolution.damageTo) {
        if (resolution.damageTo === "player") this.playerHealth = Math.max(0, this.playerHealth - 1);
        else this.dealerHealth = Math.max(0, this.dealerHealth - 1);
        this.playSpicyReaction(resolution.damageTo);
        this.setMessage(
          target === "player"
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
      this.drawMilkRows();
      this.updateHud();

      this.time.delayedCall(900, () => {
        food.consumed = true;
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
    });
  }

  private beginPlayerTurn(continuing: boolean, message?: string) {
    this.phase = "player-target";
    this.selectedFoodId = this.servedFoodId;
    this.activeItem = null;
    this.itemTargetIds = [];
    this.itemsUsedThisAction = 0;
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
    this.targetPanel.setVisible(false);
    this.renderFoods();
    this.renderItemSlots();
    this.turnText.setText(continuing ? "领导继续决定" : "轮到领导决定");
    this.setMessage(
      continuing
        ? `服务员端上${this.servingLabel()}。领导决定再试一次。`
        : `服务员端上${this.servingLabel()}。领导正在进行风险评估……`,
    );

    this.time.delayedCall(800, () => {
      if (this.phase !== "ai-turn") return;
      const remaining = this.foods.filter((food) => !food.consumed);
      const spicyLeft = remaining.filter((food) => food.spicy).length;
      const safeProbability = remaining.length === 0 ? 0 : (remaining.length - spicyLeft) / remaining.length;
      const selected = remaining.find((food) => food.id === this.servedFoodId);
      if (!selected) return;
      const confidenceWobble = Phaser.Math.FloatBetween(-0.08, 0.08);
      const target: Target = safeProbability + confidenceWobble >= 0.58 ? "dealer" : "player";

      this.selectedFoodId = selected.id;
      this.renderFoods();
      this.setMessage(target === "dealer" ? "领导决定以身作则。" : "领导微笑着把餐盖推向了你。 ");
      this.time.delayedCall(650, () => this.resolveChoice("dealer", target, selected.id));
    });
  }

  private playSpicyReaction(target: Target) {
    this.tone(72, 0.28, "sawtooth");
    this.cameras.main.shake(280, target === "player" ? 0.014 : 0.009);
    this.flash.setAlpha(target === "player" ? 0.48 : 0.3);
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
    }
  }

  private finishGame(result: "won" | "lost") {
    this.phase = result;
    this.turnText.setText(result === "won" ? "宴会结束" : "表情管理失败");
    this.showResult(result);
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

  private setMessage(message: string) {
    this.statusText.setText(message);
  }

  private ensureAudio() {
    if (this.audioContext || typeof window === "undefined") return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) this.audioContext = new AudioContextClass();
  }

  private tone(frequency: number, duration: number, type: OscillatorType) {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.028, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }
}
