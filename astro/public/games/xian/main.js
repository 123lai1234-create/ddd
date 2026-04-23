'use strict';
// ── Phaser 3 Game Config ───────────────────────────────────
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#08060e',
  scene: [
    TitleScene,
    AboutScene,
    LoadScene,
    WorldScene,
    BattleScene,
    MenuScene,
    ShopScene,
  ],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,
    pixelArt: false,
  },
};

GS.init();
const game = new Phaser.Game(config);
