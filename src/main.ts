import * as Phaser from "phaser";
import { BanquetScene } from "./BanquetScene";
import "./style.css";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#160907",
  scene: [BanquetScene],
  input: { activePointers: 3 },
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
