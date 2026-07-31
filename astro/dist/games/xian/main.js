'use strict';

const config = {
  type: Phaser.AUTO,
  backgroundColor: '#08060e',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [
    TitleScene,
    OpeningScene,
    EndingScene,
    AboutScene,
    LoadScene,
    WorldScene,
    BattleScene,
    MenuScene,
    ShopScene,
  ],
  render: { antialias: true, pixelArt: false },
};

GS.init();
const game = new Phaser.Game(config);
