'use strict';

const TILE_SZ = 48;

// ── Tile renderer ──────────────────────────────────────────
function drawTile(g, type, x, y, sz) {
  const s = sz, hs = sz/2;

  if (type === 0) { // Path — sandy cobblestone
    g.fillStyle(0x8a7348, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x6e5c38, 0.4);
    g.fillRect(x+2, y+2, s/2-3, s/2-3);
    g.fillRect(x+s/2+1, y+s/2+1, s/2-3, s/2-3);
    g.fillStyle(0xa08850, 0.3);
    g.fillRect(x+s/2+1, y+2, s/2-3, s/2-3);
    g.fillRect(x+2, y+s/2+1, s/2-3, s/2-3);
    g.lineStyle(1, 0x5a4828, 0.3);
    g.strokeRect(x, y, s, s);
  } else if (type === 1) { // Wall — dark stone bricks
    g.fillStyle(0x2c1e12, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x3e2a1a, 0.8);
    // Brick rows
    g.fillRect(x+1, y+1, s-2, s/3-2);
    g.fillRect(x+s/4, y+s/3, s*3/4-1, s/3-2);
    g.fillRect(x+1, y+s*2/3, s/2-2, s/3-2);
    g.fillStyle(0x1a100a, 0.5);
    g.fillRect(x, y+s/3, s, 2);
    g.fillRect(x, y+s*2/3, s, 2);
    // Mortar lines
    g.fillRect(x+s/2, y, 2, s/3);
    g.fillRect(x+s/4, y+s/3, 2, s/3);
    g.fillRect(x+s*3/4, y+s/3, 2, s/3);
    g.fillRect(x+s/2, y+s*2/3, 2, s/3);
    // Top highlight
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(x, y, s, 2);
  } else if (type === 2) { // Grass — rich green
    g.fillStyle(0x3a6c1a, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x4a8a22, 0.6);
    g.fillRect(x+3, y+4, 7, 5); g.fillRect(x+s-12, y+3, 8, 6);
    g.fillRect(x+6, y+s-10, 9, 7); g.fillRect(x+s-14, y+s-12, 7, 8);
    g.fillStyle(0x2a5010, 0.5);
    g.fillRect(x+s/2-4, y+s/2-3, 8, 6);
    g.fillStyle(0x5aa02a, 0.25);
    g.fillRect(x, y, s/2, 2); g.fillRect(x+s/2, y+s-2, s/2, 2);
  } else if (type === 3) { // Tree — dark forest
    g.fillStyle(0x142e07, 1); g.fillRect(x, y, s, s);
    // Root flare
    g.fillStyle(0x3a2008, 0.6);
    g.fillEllipse(x+hs, y+s*0.9, s*0.55, s*0.22);
    // Trunk
    g.fillStyle(0x5a3010, 1);
    g.fillRect(x+hs-4, y+s*0.55, 8, s*0.45);
    // Bark detail
    g.fillStyle(0x3a1e08, 0.6);
    g.fillRect(x+hs-2, y+s*0.6, 2, s*0.3);
    g.fillRect(x+hs+1, y+s*0.65, 2, s*0.25);
    // Canopy shadow
    g.fillStyle(0x1a3c0a, 1);
    g.fillCircle(x+hs, y+hs-4, s*0.44);
    // Main canopy
    g.fillStyle(0x2d6814, 1);
    g.fillCircle(x+hs, y+hs-7, s*0.38);
    // Secondary leaf clusters
    g.fillStyle(0x3a8020, 0.85);
    g.fillCircle(x+hs-8, y+hs-10, s*0.27);
    g.fillCircle(x+hs+8, y+hs-5, s*0.23);
    // Light-side highlight
    g.fillStyle(0x50a030, 0.55);
    g.fillCircle(x+hs-7, y+hs-15, s*0.2);
    // Top glint
    g.fillStyle(0x70c040, 0.3);
    g.fillCircle(x+hs-7, y+hs-19, s*0.1);
  } else if (type === 4) { // Water — deep blue
    g.fillStyle(0x0d2058, 1); g.fillRect(x, y, s, s);
    // Depth wave layers
    g.fillStyle(0x1838a8, 0.45);
    g.fillEllipse(x+s*0.3, y+hs-3, s*0.7, 10);
    g.fillStyle(0x2855b8, 0.35);
    g.fillEllipse(x+s*0.65, y+hs+5, s*0.55, 8);
    g.fillStyle(0x1a3898, 0.3);
    g.fillEllipse(x+s*0.2, y+hs+10, s*0.45, 6);
    // Foam / light ripples
    g.fillStyle(0x80b8ff, 0.18);
    g.fillEllipse(x+s*0.28, y+hs-4, s*0.35, 4);
    g.fillEllipse(x+s*0.65, y+hs+4, s*0.28, 3);
    // Shimmer highlights
    g.fillStyle(0xffffff, 0.08);
    g.fillEllipse(x+s*0.15, y+hs-9, s*0.18, 2);
    g.fillEllipse(x+s*0.55, y+hs+8, s*0.14, 2);
    // Edge shadow
    g.fillStyle(0x000000, 0.15);
    g.fillRect(x, y, s, 2);
    g.fillRect(x, y+s-2, s, 2);
  } else if (type === 5) { // Floor — dungeon stone
    g.fillStyle(0x211610, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x2e1e14, 0.8);
    g.fillRect(x+1, y+1, s/2-2, s/2-2);
    g.fillRect(x+s/2+1, y+s/2+1, s/2-2, s/2-2);
    g.fillStyle(0x1a100c, 0.6);
    g.fillRect(x+s/2+1, y+1, s/2-2, s/2-2);
    g.fillRect(x+1, y+s/2+1, s/2-2, s/2-2);
    g.lineStyle(1, 0x0a0604, 0.8);
    g.lineBetween(x, y+s/2, x+s, y+s/2);
    g.lineBetween(x+s/2, y, x+s/2, y+s);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(x, y, s, 1); g.fillRect(x, y, 1, s);
  } else if (type === 6) { // Door — golden arch
    g.fillStyle(0x6a4e10, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0xb08020, 0.9);
    g.fillRect(x+s*0.25, y+s*0.15, s*0.5, s*0.8);
    g.fillStyle(0xd4a030, 0.7);
    g.fillCircle(x+hs, y+s*0.28, s*0.24);
    g.fillStyle(0xe8c060, 0.4);
    g.fillCircle(x+hs+4, y+hs, 3);
    g.lineStyle(2, 0x7a5800, 0.8);
    g.strokeRect(x+s*0.25, y+s*0.15, s*0.5, s*0.8);
  }
}

// ══════════════════════════════════════════════════════════
class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  create() {
    Sound?.bgm(MAPS[GS.map]?.music || 'village');
    // Track maps visited
    if (!GS.flags._mapsVis) GS.flags._mapsVis = {};
    GS.flags._mapsVis[GS.map] = true;
    if (Object.keys(GS.flags._mapsVis).length >= 3) Achieve?.unlock('all_maps');
    if (GS.party.length >= 3) Achieve?.unlock('full_party');
    const map = MAPS[GS.map];
    const MAP_W = map.w * TILE_SZ;
    const MAP_H = map.h * TILE_SZ;
    const W = this.scale.width, H = this.scale.height;
    const HUD_H = 52;

    // Tiles
    this.tileGfx = this.add.graphics();
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        drawTile(this.tileGfx, map.tiles[y][x], x*TILE_SZ, y*TILE_SZ, TILE_SZ);
      }
    }

    // Map name banner
    const banner = this.add.graphics().setDepth(2);
    banner.fillStyle(0x0e0a1c, 0.85);
    banner.fillRoundedRect(8, 8, 180, 36, 8);
    banner.lineStyle(1, 0x9a7828, 0.7);
    banner.strokeRoundedRect(8, 8, 180, 36, 8);
    this.add.text(98, 26, map.name, {
      fontSize:'16px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0.5).setDepth(3);

    // NPCs
    this.npcObjects = (map.npcs||[]).map(npc => {
      const sx = npc.x * TILE_SZ + TILE_SZ/2;
      const sy = npc.y * TILE_SZ + TILE_SZ/2;
      const g = this.add.graphics().setDepth(4);
      this._drawNpc(g, sx, sy, npc.join ? 0x80e0c0 : 0xd4b060);
      const lbl = this.add.text(sx, sy-36, npc.name, {
        fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#f0e090', stroke:'#000', strokeThickness:3,
        backgroundColor: '#00000066', padding:{ x:4, y:2 },
      }).setOrigin(0.5, 0.5).setDepth(5);
      return { npc, g, lbl };
    });

    // Chests
    if (!GS.flags.chests) GS.flags.chests = {};
    this.chestObjects = (map.chests||[]).map(chest => {
      const sx = chest.x * TILE_SZ + TILE_SZ/2;
      const sy = chest.y * TILE_SZ + TILE_SZ/2;
      const g = this.add.graphics().setDepth(4);
      const opened = !!GS.flags.chests[chest.id];
      this._drawChest(g, sx, sy, opened);
      return { chest, g, opened };
    });

    // Player
    this.playerGfx = this.add.graphics().setDepth(6);
    this._drawPlayer();

    // HUD (camera-fixed)
    this._buildHud(W, HUD_H, MAP_W);

    // Camera setup
    const camH = MAP_H;
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H + HUD_H);
    this.cameras.main.startFollow(this.playerGfx, true, 0.12, 0.12);

    // Atmosphere particles
    this._spawnAtmosphere(MAP_W, MAP_H);

    // Mini-map
    const mms = 5, mmX = W - map.w*mms - 12, mmY = 10;
    this._mmapX = mmX; this._mmapY = mmY; this._mmapS = mms;
    const mmBg = this.add.graphics().setScrollFactor(0).setDepth(18);
    mmBg.fillStyle(0x000000, 0.72); mmBg.fillRect(mmX-2, mmY-2, map.w*mms+4, map.h*mms+4);
    mmBg.lineStyle(1, 0x9a7828, 0.7); mmBg.strokeRect(mmX-2, mmY-2, map.w*mms+4, map.h*mms+4);
    const MM_CLR = {0:0x7a6030, 1:0x141010, 2:0x2a5010, 3:0x0e2005, 4:0x0a1840, 5:0x1e1408, 6:0x9a7828};
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        mmBg.fillStyle(MM_CLR[map.tiles[ty][tx]] ?? 0x1a1010, 1);
        mmBg.fillRect(mmX + tx*mms, mmY + ty*mms, mms-0.5, mms-0.5);
      }
    }
    (map.exits||[]).forEach(e => { mmBg.fillStyle(0x40ff80, 0.85); mmBg.fillRect(mmX+e.x*mms, mmY+e.y*mms, mms, mms); });
    (map.npcs||[]).forEach(n => { mmBg.fillStyle(0xe8c060, 0.7); mmBg.fillCircle(mmX+n.x*mms+mms/2, mmY+n.y*mms+mms/2, mms*0.45); });
    (map.chests||[]).forEach(c => {
      mmBg.fillStyle(GS.flags.chests?.[c.id] ? 0x555555 : 0xffd700, 0.9);
      mmBg.fillRect(mmX+c.x*mms+1, mmY+c.y*mms+1, mms-2, mms-2);
    });
    this._mmapFg = this.add.graphics().setScrollFactor(0).setDepth(19);
    this._refreshMinimap();

    // Post-battle pending dialogue (e.g. after boss)
    if (GS.flags._pendingLines) {
      const lines = [...GS.flags._pendingLines];
      const isFinal = !!GS.flags._isFinalBoss;
      delete GS.flags._pendingLines; delete GS.flags._isFinalBoss;
      this.cameras.main.fadeIn(400, 0, 0, 0);
      this.time.delayedCall(600, () => this._showDialog(lines, () => {
        if (isFinal) {
          Sound?.stopBgm();
          this.cameras.main.fadeOut(1200, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'));
        }
      }));
    }

    // Input
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,    w: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
      z: Phaser.Input.Keyboard.KeyCodes.Z, enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      x: Phaser.Input.Keyboard.KeyCodes.X,  esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      m: Phaser.Input.Keyboard.KeyCodes.M,
    });

    this.moveDelay = 0;
    this.inDialog = false;
    this.bobTimer = 0;
    this._dayStep = 0;
    this._skyOverlay = this.add.graphics().setScrollFactor(0).setDepth(9);

    // Castle visit flag for quest tracking
    if (GS.map === 'castle') GS.flags.visitedCastle = true;

    // Achievement toast listener
    this._onAchieve = (e) => this._showAchieveToast(e.detail);
    window.addEventListener('xian:achievement', this._onAchieve);
    this.events.once('shutdown', () => window.removeEventListener('xian:achievement', this._onAchieve));

    // Playtime counter (seconds)
    this._ptCounter = 0;
  }

  _drawNpc(g, x, y, color=0xd4b060) {
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.25); g.fillEllipse(x, y+21, 26, 7);
    // Robe skirt (tapered wider at bottom — xianxia style)
    g.fillStyle(color, 1);
    g.fillTriangle(x-10, y+8, x+10, y+8, x-15, y+23);
    g.fillTriangle(x-10, y+8, x+10, y+8, x+15, y+23);
    g.fillRect(x-10, y+6, 20, 4);
    // Upper body / torso
    g.fillRect(x-9, y-8, 18, 16);
    // Sleeves / arms
    g.fillRect(x-19, y-5, 11, 6);
    g.fillRect(x+8,  y-5, 11, 6);
    // Collar / sash center line
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(x-1, y-8, 2, 14);
    // Head
    g.fillStyle(color, 1);
    g.fillCircle(x, y-18, 10);
    // Topknot (xianxia hair bun)
    g.fillStyle(0x1c1000, 1);
    g.fillRect(x-2, y-31, 4, 11);
    g.fillCircle(x, y-32, 3);
    // Eyes
    g.fillStyle(0x1a0800, 1);
    g.fillCircle(x-3, y-18, 1.5);
    g.fillCircle(x+3, y-18, 1.5);
    // Face highlight
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(x-3, y-22, 3);
    // Glow indicator
    g.lineStyle(1, color, 0.5);
    g.strokeCircle(x, y-18, 12);
  }

  _drawChest(g, x, y, opened) {
    g.clear();
    const w = 22, h = 16;
    // Shadow
    g.fillStyle(0x000000, 0.22); g.fillEllipse(x, y+h/2+4, w+6, 5);
    // Chest body
    g.fillStyle(opened ? 0x4a3010 : 0x7a5218, 1);
    g.fillRect(x-w/2, y-h/2, w, h);
    // Lid
    g.fillStyle(opened ? 0x362208 : 0x9a6a24, 1);
    g.fillRect(x-w/2, y-h/2-5, w, 7);
    // Metal bands
    g.fillStyle(opened ? 0x3a3020 : 0xc8a040, 1);
    g.fillRect(x-w/2, y-3, w, 3);
    g.fillRect(x-2, y-h/2-5, 4, h+5);
    // Lock
    g.fillStyle(opened ? 0x2a2010 : 0xffe080, 1);
    g.fillRect(x-3, y-5, 6, 5);
    // Shine (closed only)
    if (!opened) {
      g.fillStyle(0xffffff, 0.15);
      g.fillRect(x-w/2+2, y-h/2-4, w-4, 3);
    }
    // Open lid gap
    if (opened) {
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x-w/2+1, y-h/2-4, w-2, 4);
    }
  }

  _spawnAtmosphere(mapW, mapH) {
    const cfgs = {
      forest:  { color:0x80e840, alpha:0.55, size:2,   count:2, dy:-55, dx:30, dur:2200 },
      cave:    { color:0xff8030, alpha:0.40, size:1.5,  count:1, dy:-70, dx:15, dur:2800 },
      shrine:  { color:0xffe080, alpha:0.65, size:2.5,  count:1, dy:-90, dx:25, dur:3000 },
      castle:  { color:0x9050c0, alpha:0.25, size:1.5,  count:1, dy:-60, dx:20, dur:2500 },
    };
    const cfg = cfgs[GS.map];
    if (!cfg) return;
    this.time.addEvent({
      delay: 350, loop: true, callback: () => {
        for (let i = 0; i < cfg.count; i++) {
          const px = Math.random() * mapW;
          const py = Math.random() * mapH;
          const p = this.add.graphics().setDepth(3);
          p.fillStyle(cfg.color, cfg.alpha);
          p.fillCircle(0, 0, cfg.size + Math.random() * cfg.size * 0.5);
          p.setPosition(px, py);
          this.tweens.add({
            targets: p,
            x: px + (Math.random()-0.5) * cfg.dx,
            y: py + cfg.dy * (0.6 + Math.random() * 0.7),
            alpha: 0,
            duration: cfg.dur * (0.7 + Math.random() * 0.6),
            onComplete: () => p.destroy(),
          });
        }
      },
    });
  }

  _openChest(chest) {
    if (!GS.flags.chests) GS.flags.chests = {};
    GS.flags.chests[chest.id] = true;
    const rewards = [];
    if (chest.gold) { GS.gold += chest.gold; rewards.push(`${chest.gold} 靈石`); }
    if (chest.item) { GS.addItem(chest.item); rewards.push(ITEMS[chest.item]?.name || chest.item); }
    Sound?.play('shopBuy');
    const co = this.chestObjects?.find(c => c.chest === chest);
    if (co) { co.opened = true; this._drawChest(co.g, chest.x*TILE_SZ+TILE_SZ/2, chest.y*TILE_SZ+TILE_SZ/2, true); }
    this._showDialog(['打開了寶箱！', `獲得：${rewards.join('、')}！`], () => this._refreshHud());
  }

  _refreshMinimap() {
    if (!this._mmapFg) return;
    this._mmapFg.clear();
    const { x, y } = GS.player;
    const mms = this._mmapS;
    const mx = this._mmapX + x*mms + mms/2;
    const my = this._mmapY + y*mms + mms/2;
    this._mmapFg.fillStyle(0xffffff, 1);
    this._mmapFg.fillCircle(mx, my, mms*0.75);
    this._mmapFg.lineStyle(1, 0x000000, 0.4);
    this._mmapFg.strokeCircle(mx, my, mms*0.75);
  }

  _drawPlayer() {
    this.playerGfx.clear();
    const { x, y } = GS.player;
    const sx = x * TILE_SZ + TILE_SZ/2;
    const sy = y * TILE_SZ + TILE_SZ/2;
    const bob = Math.sin(this.bobTimer * 0.15) * 1.5;
    const m = GS.party[0];
    const col = m ? m.color : 0x4a9eff;

    // Shadow
    this.playerGfx.fillStyle(0x000000, 0.3);
    this.playerGfx.fillEllipse(sx, sy+23, 30, 8);

    // Robe skirt (tapered wider at bottom — xianxia style)
    this.playerGfx.fillStyle(col, 1);
    this.playerGfx.fillTriangle(sx-11, sy+7+bob, sx+11, sy+7+bob, sx-17, sy+25+bob);
    this.playerGfx.fillTriangle(sx-11, sy+7+bob, sx+11, sy+7+bob, sx+17, sy+25+bob);
    this.playerGfx.fillRect(sx-11, sy+5+bob, 22, 4);

    // Upper body / torso
    this.playerGfx.fillStyle(col, 1);
    this.playerGfx.fillRect(sx-9, sy-8+bob, 18, 15);

    // Sleeves / arms
    this.playerGfx.fillRect(sx-21, sy-5+bob, 13, 6);
    this.playerGfx.fillRect(sx+8,  sy-5+bob, 13, 6);

    // Collar / sash center line
    this.playerGfx.fillStyle(0xffffff, 0.22);
    this.playerGfx.fillRect(sx-1, sy-8+bob, 2, 13);

    // Head
    this.playerGfx.fillStyle(col, 1);
    this.playerGfx.fillCircle(sx, sy-19+bob, 11);

    // Topknot (xianxia style)
    this.playerGfx.fillStyle(0x1c1000, 1);
    this.playerGfx.fillRect(sx-2, sy-33+bob, 4, 12);
    this.playerGfx.fillCircle(sx, sy-34+bob, 3);

    // Eyes
    this.playerGfx.fillStyle(0x0d0600, 1);
    this.playerGfx.fillCircle(sx-4, sy-19+bob, 2);
    this.playerGfx.fillCircle(sx+4, sy-19+bob, 2);

    // Face highlight
    this.playerGfx.fillStyle(0xffffff, 0.2);
    this.playerGfx.fillCircle(sx-3, sy-23+bob, 3.5);

    // Weapon
    if (!m || m.shape === 'sword') {
      // Blade
      this.playerGfx.fillStyle(0xe8e8e8, 1);
      this.playerGfx.fillRect(sx+11, sy-22+bob, 3, 28);
      // Guard
      this.playerGfx.fillRect(sx+4,  sy-22+bob, 17, 3);
      // Handle
      this.playerGfx.fillStyle(0xb07820, 1);
      this.playerGfx.fillRect(sx+11, sy+6+bob, 3, 8);
      // Tip
      this.playerGfx.fillStyle(0xffe060, 1);
      this.playerGfx.fillTriangle(sx+11, sy-22+bob, sx+14, sy-22+bob, sx+12, sy-30+bob);
    } else if (m.shape === 'mage') {
      // Staff
      this.playerGfx.fillStyle(0x806020, 1);
      this.playerGfx.fillRect(sx-2, sy-36+bob, 3, 30);
      // Orb
      this.playerGfx.fillStyle(col, 1);
      this.playerGfx.fillCircle(sx-1, sy-38+bob, 7);
      this.playerGfx.fillStyle(0xffffff, 0.5);
      this.playerGfx.fillCircle(sx-3, sy-41+bob, 2.5);
    } else if (m.shape === 'archer') {
      this.playerGfx.lineStyle(2, 0xdddddd, 1);
      this.playerGfx.beginPath();
      this.playerGfx.arc(sx-14, sy-6+bob, 16, Math.PI*0.22, Math.PI*1.78);
      this.playerGfx.strokePath();
      this.playerGfx.lineStyle(1, 0xaaaaaa, 0.7);
      this.playerGfx.lineBetween(sx-14, sy-22+bob, sx-14, sy+10+bob);
      this.playerGfx.fillStyle(0xdddddd, 1);
      this.playerGfx.fillRect(sx-15, sy-22+bob, 2, 32);
    }

    // Direction indicator
    this.playerGfx.lineStyle(2, 0xffffff, 0.28);
    this.playerGfx.strokeCircle(sx, sy-19+bob, 14);

    // Move camera reference point to player center
    this.playerGfx.setPosition(0, 0);
    this._refreshMinimap();
  }

  _drawSky() {
    this._skyOverlay.clear();
    const t=(this._dayStep%400)/400;
    const night=0.5-0.5*Math.cos(t*Math.PI*2);
    if (night<0.03) return;
    const isNight=night>0.5;
    this._skyOverlay.fillStyle(isNight?0x1a3080:0xff7820, Math.min(0.16, isNight?(night-0.5)*0.26:night*0.14));
    this._skyOverlay.fillRect(0,0,this.scale.width,this.scale.height);
  }

  _buildHud(W, HUD_H, MAP_W) {
    const hudY = MAPS[GS.map].h * TILE_SZ;

    const hudBg = this.add.graphics().setDepth(10).setScrollFactor(0);
    hudBg.fillStyle(0x0a0816, 0.96);
    hudBg.fillRect(0, 0, W, HUD_H);
    hudBg.lineStyle(1, 0x9a7828, 0.6);
    hudBg.lineBetween(0, 0, W, 0);

    // Map name (scrollfactor 0)
    this.hudMapText = this.add.text(16, HUD_H/2, MAPS[GS.map].name, {
      fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0, 0.5).setDepth(11).setScrollFactor(0).setY(this.cameras.main.height - HUD_H + HUD_H/2);

    this.hudGold = this.add.text(200, 0, '💰 ' + GS.gold, {
      fontSize:'14px', fontFamily:'serif', color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0, 0.5).setDepth(11).setScrollFactor(0).setY(this.cameras.main.height - HUD_H + HUD_H/2);

    this.hudHpBars = [];
    this.hudHpTexts = [];
    GS.party.forEach((m, i) => {
      const barX = 360 + i * 200;
      const barY = this.cameras.main.height - HUD_H + 12;
      const nameT = this.add.text(barX, barY, m.name, {
        fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:1,
      }).setScrollFactor(0).setDepth(11);
      const hpBar = mkBar(this, barX, barY+14, 120, 8, m.hp, m.maxHp, 0xe05050).setScrollFactor(0).setDepth(11);
      const mpBar = mkBar(this, barX, barY+26, 120, 6, m.mp, m.maxMp||1, 0x5080e8).setScrollFactor(0).setDepth(11);
      this.hudHpBars.push({ hpBar, mpBar, m });
    });

    this.add.text(W-16, this.cameras.main.height - HUD_H + HUD_H/2, 'X=選單  M=靜音', {
      fontSize:'11px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
  }

  _refreshHud() {
    if (this.hudGold) this.hudGold.setText('💰 ' + GS.gold);
    this.hudHpBars.forEach(({hpBar, mpBar, m}) => {
      if (hpBar.active) hpBar.destroy();
      if (mpBar.active) mpBar.destroy();
    });
    if (this._hudStatusObjs) this._hudStatusObjs.forEach(o=>{ if(o&&o.active) o.destroy(); });
    this._hudStatusObjs = [];
    GS.party.forEach((m, i) => {
      const barX = 360 + i * 200;
      const barY = this.cameras.main.height - 52 + 12;
      const hpClr = m.dead ? 0x443838 : m.hp<=Math.floor(m.maxHp*0.25) ? 0xff6020 : 0xe05050;
      this._hudStatusObjs.push(
        mkBar(this, barX, barY+14, 120, 8, m.hp, m.maxHp, hpClr).setScrollFactor(0).setDepth(11),
        mkBar(this, barX, barY+26, 120, 6, m.mp, m.maxMp||1, 0x5080e8).setScrollFactor(0).setDepth(11),
      );
      if (m.dead) {
        const dt=this.add.text(barX+60,barY+20,'陣亡',{fontSize:'9px',fontFamily:'serif',color:'#886060',stroke:'#000',strokeThickness:1}).setScrollFactor(0).setDepth(12).setOrigin(0.5);
        this._hudStatusObjs.push(dt);
      } else if (m.status?.includes('poison')) {
        const dg=this.add.graphics().setScrollFactor(0).setDepth(12);
        dg.fillStyle(0xb040e0,0.9); dg.fillCircle(barX+130,barY+20,4);
        this._hudStatusObjs.push(dg);
      }
    });
  }

  _showAchieveToast(a) {
    if (!a) return;
    const W = this.scale.width;
    const toastW = Math.min(340, W - 30);
    const tx = W/2 - toastW/2;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(30);
    bg.fillStyle(0x121808, 0.96);
    bg.fillRoundedRect(tx, 12, toastW, 56, 8);
    bg.lineStyle(2, 0xffd700, 0.95);
    bg.strokeRoundedRect(tx, 12, toastW, 56, 8);
    const t1 = this.add.text(W/2, 22, '★ 成就解鎖！', {
      fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#ffd700', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31);
    const t2 = this.add.text(W/2, 36, `${a.icon||'🏆'} ${a.name} — ${a.desc}`, {
      fontSize:'13px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31);
    this.tweens.add({ targets:[bg,t1,t2], alpha:0, duration:500, delay:2800,
      onComplete: () => { bg.destroy(); t1.destroy(); t2.destroy(); } });
  }

  _canWalk(x, y) {
    const map = MAPS[GS.map];
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = map.tiles[y][x];
    return t !== 1 && t !== 3 && t !== 4;
  }

  _tryMove(dx, dy) {
    const nx = GS.player.x + dx, ny = GS.player.y + dy;
    if (!this._canWalk(nx, ny)) return false;
    GS.player.x = nx; GS.player.y = ny;
    if (dx < 0) GS.player.facing='left';
    else if (dx > 0) GS.player.facing='right';
    else if (dy < 0) GS.player.facing='up';
    else GS.player.facing='down';
    return true;
  }

  _checkEnc() {
    const enc = MAPS[GS.map].enc;
    if (!enc.rate || !enc.enemies.length) return;
    GS.encStep++;
    if (GS.encStep < 5) return;
    const avgLv = Math.floor(GS.party.reduce((s,m)=>s+(m.lv||1),0) / Math.max(1,GS.party.length));
    const scaledRate = enc.rate * Math.max(0.3, 1 - (avgLv - 1) * 0.07);
    if (Math.random() < scaledRate) {
      GS.encStep = 0;
      const pool = enc.enemies.filter(e => !GS.defeated[e]);
      if (!pool.length) return;
      const count = 1 + Math.floor(Math.random() * 2);
      const enemies = [];
      for (let i = 0; i < count; i++) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        const base = ENEMIES[id];
        enemies.push({ id, name:base.name, hp:base.hp, maxHp:base.hp,
          atk:base.atk, def:base.def, spd:base.spd,
          color:base.color, sz:base.sz, acts:base.acts, drops:base.drops,
          status:[], dead:false });
      }
      GS.battleData = { enemies };
      this.inDialog = true;
      this.cameras.main.flash(100, 255, 30, 30, true);
      this.cameras.main.shake(180, 0.006);
      const W2=this.scale.width, H2=this.scale.height;
      const et=this.add.text(W2/2, H2/2, '！', {
        fontSize:Math.floor(H2*0.18)+'px', fontFamily:'serif',
        color:'#ff2020', stroke:'#000', strokeThickness:8,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(28).setAlpha(0).setScale(0.4);
      this.tweens.add({targets:et, alpha:1, scaleX:1.5, scaleY:1.5, duration:120, ease:'Back.easeOut',
        onComplete:()=>this.time.delayedCall(180,()=>{
          this.cameras.main.fadeOut(280,0,0,0);
          this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('BattleScene'));
        })
      });
    }
  }

  _interact() {
    const { x, y, facing } = GS.player;
    const dx = facing==='right'?1:facing==='left'?-1:0;
    const dy = facing==='down'?1:facing==='up'?-1:0;
    const tx = x+dx, ty = y+dy;

    const map = MAPS[GS.map];
    const exit = map.exits?.find(e => e.x===x && e.y===y);
    if (exit) { this._doExit(exit); return; }

    const npc = map.npcs?.find(n => n.x===tx && n.y===ty);
    if (npc) { this._talkNpc(npc); return; }

    const chest = map.chests?.find(c => c.x===tx && c.y===ty && !GS.flags.chests?.[c.id]);
    if (chest) { this._openChest(chest); return; }
    const openedChest = map.chests?.find(c => c.x===tx && c.y===ty && GS.flags.chests?.[c.id]);
    if (openedChest) { this._showDialog(['寶箱已被打開。']); }
  }

  _doExit(exit) {
    if (this._exiting) return;
    if (exit.to === 'shrine' && !GS.flags.defeatedDragon) {
      this._showDialog(['【虎先鋒守護此路！須先擊敗虎先鋒，方可進入小西天。】']);
      return;
    }
    this._exiting = true;
    const W = this.scale.width;
    const banner = this.add.text(W/2, 56, exit.msg, {
      fontSize:'17px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#ffd700', stroke:'#000', strokeThickness:3,
      backgroundColor:'#00000099', padding:{x:14, y:7},
    }).setOrigin(0.5).setScrollFactor(0).setDepth(25).setAlpha(0);
    this.tweens.add({ targets:banner, alpha:1, duration:160 });
    GS.map = exit.to;
    GS.player.x = exit.toX; GS.player.y = exit.toY; GS.player.facing = 'down';
    GS.save(0);
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
  }

  _talkNpc(npc) {
    if (npc.shop) {
      this.scene.launch('ShopScene', { stock: SHOP_STOCK[npc.shop], caller:'WorldScene' });
      this.scene.pause(); return;
    }
    if (npc.inn) {
      this._showDialog([...npc.dlg], () => {
        this._showDialog([`住宿費 ${npc.inn} 靈石。是否休息？（Z確認）`], () => {
          if (GS.gold >= npc.inn) {
            GS.gold -= npc.inn;
            GS.party.forEach(m => { m.hp=m.maxHp; m.mp=m.maxMp; m.status=[]; m.dead=false; });
            Sound?.play('inn');
            this._showDialog(['全員體力恢復！'], () => this._refreshHud());
          } else { this._showDialog(['靈石不足…']); }
        });
      }, npc.name);
      return;
    }
    if (npc.boss) {
      if (npc.trigger) {
        const parts = npc.trigger.split('.');
        let val = GS;
        for (const p of parts) val = val?.[p];
        if (!val) { this._showDialog(['此路不通…']); return; }
      }
      this._showDialog([...npc.dlg], () => {
        const base = ENEMIES[npc.boss];
        GS.battleData = { enemies:[{
          id:npc.boss, name:base.name, hp:base.hp, maxHp:base.hp,
          atk:base.atk, def:base.def, spd:base.spd,
          color:base.color, sz:base.sz, acts:base.acts, drops:base.drops,
          status:[], dead:false, boss:true,
        }], isBoss:true };
        this.scene.start('BattleScene');
      }, npc.name);
      return;
    }
    if (npc.join) {
      if (GS.getMember(npc.join)) {
        this._showDialog([...npc.dlg], null, npc.name);
        return;
      }
      this._showDialog([...npc.dlg], () => {
        GS.addMember(npc.join);
        this._showDialog([`${CHAR_BASE[npc.join].name} 加入了隊伍！`], () => this.scene.restart());
      }, npc.name);
      return;
    }
    this._showDialog([...npc.dlg], null, npc.name);
  }

  _showDialog(lines, onDone=null, speaker=null) {
    if (!lines.length) { if (onDone) onDone(); return; }
    this.inDialog = true;
    let idx = 0;
    let typing = false;
    let typeTimer = null;

    const W = this.scale.width;
    const boxH = 110;
    const boxY = this.cameras.main.scrollY + this.cameras.main.height - boxH - 56;

    const box = this.add.graphics().setDepth(20);
    box.fillStyle(0x0c0818, 0.97);
    box.fillRoundedRect(20, boxY, W-40, boxH, 10);
    box.lineStyle(2, 0x9a7828, 1);
    box.strokeRoundedRect(20, boxY, W-40, boxH, 10);
    box.lineStyle(1, 0x4a3810, 0.6);
    box.strokeRoundedRect(24, boxY+4, W-48, boxH-8, 7);

    const speakerTxt = speaker ? this.add.text(36, boxY-22, speaker, {
      fontSize:'13px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#ffd700', stroke:'#000', strokeThickness:3,
      backgroundColor:'#0c0818cc', padding:{ x:8, y:3 },
    }).setDepth(21) : null;

    const txt = this.add.text(40, boxY+20, '', {
      fontSize:'15px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width: W-80 },
    }).setDepth(21);

    const hint = this.add.text(W-30, boxY+boxH-18, 'Z ▶', {
      fontSize:'11px', fontFamily:'serif', color:'#9a7040', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5).setDepth(21).setAlpha(0);

    const blinker = this.time.addEvent({ delay:500, loop:true, callback:() => {
      if (!typing) hint.setAlpha(hint.alpha > 0.5 ? 0.3 : 1);
    }});

    const startTyping = () => {
      const full = lines[idx];
      let ci = 0;
      typing = true;
      hint.setAlpha(0);
      if (typeTimer) typeTimer.destroy();
      typeTimer = this.time.addEvent({ delay:35, loop:true, callback:() => {
        ci++;
        txt.setText(full.slice(0, ci));
        if (ci >= full.length) {
          typeTimer.destroy(); typeTimer = null;
          typing = false;
          hint.setAlpha(1);
        }
      }});
    };
    startTyping();

    const padTimer = this.time.addEvent({ delay:80, loop:true, callback:() => {
      if (window.PAD?.ok) { window.PAD.ok = false; handler({ code:'KeyZ' }); }
    }});

    const cleanup = () => {
      if (typeTimer) { typeTimer.destroy(); typeTimer = null; }
      blinker.destroy(); padTimer.destroy();
      box.destroy(); txt.destroy(); hint.destroy();
      if (speakerTxt) speakerTxt.destroy();
      this.inDialog = false;
      this.input.keyboard.off('keydown', handler);
    };

    const handler = (evt) => {
      if (evt.code === 'KeyZ' || evt.code === 'Enter') {
        if (typing) {
          if (typeTimer) { typeTimer.destroy(); typeTimer = null; }
          typing = false;
          txt.setText(lines[idx]);
          hint.setAlpha(1);
          return;
        }
        idx++;
        if (idx < lines.length) {
          txt.setText('');
          startTyping();
        } else {
          cleanup();
          if (onDone) onDone();
        }
      }
    };
    this.input.keyboard.on('keydown', handler);
  }

  _checkAutoExit() {
    const { x, y } = GS.player;
    const exit = MAPS[GS.map].exits?.find(e => e.x===x && e.y===y);
    if (exit) this._doExit(exit);
  }

  update() {
    this._ptCounter++;
    if (this._ptCounter >= 60) { this._ptCounter = 0; GS.flags.playtime = (GS.flags.playtime||0) + 1; }
    if (this.inDialog) return;
    this.bobTimer++;
    this.moveDelay = Math.max(0, this.moveDelay - 1);
    if (this.moveDelay > 0) { this._drawPlayer(); return; }

    const up    = this.keys.up.isDown    || this.keys.w.isDown    || !!window.PAD?.up;
    const down  = this.keys.down.isDown  || this.keys.s.isDown   || !!window.PAD?.down;
    const left  = this.keys.left.isDown  || this.keys.a.isDown   || !!window.PAD?.left;
    const right = this.keys.right.isDown || this.keys.d.isDown   || !!window.PAD?.right;
    const okPad = !!window.PAD?.ok;  if (okPad && window.PAD) window.PAD.ok   = false;
    const mnPad = !!window.PAD?.menu; if (mnPad && window.PAD) window.PAD.menu = false;
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter) || okPad;
    const menu  = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc)  || mnPad;

    const muteKey = Phaser.Input.Keyboard.JustDown(this.keys.m);
    if (muteKey) {
      const muted = Sound?.toggleMute();
      if (this._muteHint) this._muteHint.destroy();
      this._muteHint = this.add.text(this.scale.width - 20, 20, muted ? '靜音 ON' : '音樂 ON', {
        fontSize:'13px', fontFamily:'serif',
        color: muted ? '#ff8888' : '#88ffcc',
        stroke:'#000', strokeThickness:2,
        backgroundColor:'#00000088', padding:{x:6, y:3},
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
      this.time.delayedCall(1500, () => { if (this._muteHint) { this._muteHint.destroy(); this._muteHint = null; } });
    }
    if (menu) {
      this.scene.launch('MenuScene', { caller:'WorldScene' });
      this.scene.pause(); return;
    }
    if (ok) { this._interact(); return; }

    let moved = false;
    if (up)         moved = this._tryMove(0,-1);
    else if (down)  moved = this._tryMove(0,1);
    else if (left)  moved = this._tryMove(-1,0);
    else if (right) moved = this._tryMove(1,0);

    if (moved) {
      this.moveDelay = 7;
      this._dayStep++;
      if (this._dayStep % 4 === 0) this._drawSky();
      if (this.bobTimer % 12 === 0) Sound?.play('step');
      this._drawPlayer();
      this._checkAutoExit();
      if (!this.inDialog) this._checkEnc();
    } else {
      this._drawPlayer();
    }
  }
}
