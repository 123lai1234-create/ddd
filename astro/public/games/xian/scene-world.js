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
    g.fillStyle(0x1a3c0a, 1); g.fillRect(x, y, s, s);
    // Trunk
    g.fillStyle(0x5a3010, 1);
    g.fillRect(x+hs-5, y+s*0.6, 10, s*0.4);
    // Canopy layers
    g.fillStyle(0x2d5a14, 1);
    g.fillCircle(x+hs, y+hs-2, s*0.42);
    g.fillStyle(0x3d7020, 0.8);
    g.fillCircle(x+hs-4, y+hs-6, s*0.28);
    g.fillStyle(0x4a8828, 0.6);
    g.fillCircle(x+hs+3, y+hs-2, s*0.20);
    // Top highlight
    g.fillStyle(0x60aa32, 0.3);
    g.fillCircle(x+hs-4, y+hs-10, s*0.12);
  } else if (type === 4) { // Water — deep blue
    g.fillStyle(0x162e6e, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x2040a0, 0.5);
    g.fillRect(x+3, y+hs-4, s-6, 7);
    g.fillStyle(0x3060c0, 0.4);
    g.fillRect(x+7, y+hs+6, s-16, 4);
    g.fillStyle(0x90c8ff, 0.12);
    g.fillRect(x+4, y+hs-6, s/3, 2);
    g.fillRect(x+s/2, y+hs+4, s/4, 2);
    // Shimmer
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(x, y, s, 1);
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

    // Player
    this.playerGfx = this.add.graphics().setDepth(6);
    this._drawPlayer();

    // HUD (camera-fixed)
    this._buildHud(W, HUD_H, MAP_W);

    // Camera setup
    const camH = MAP_H;
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H + HUD_H);
    this.cameras.main.startFollow(this.playerGfx, true, 0.12, 0.12);

    // Input
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,    w: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
      z: Phaser.Input.Keyboard.KeyCodes.Z, enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      x: Phaser.Input.Keyboard.KeyCodes.X,  esc: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this.moveDelay = 0;
    this.inDialog = false;
    this.bobTimer = 0;
  }

  _drawNpc(g, x, y, color=0xd4b060) {
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.25); g.fillEllipse(x, y+18, 20, 7);
    // Body
    g.fillStyle(color, 1);
    g.fillCircle(x, y-16, 10);
    g.fillRect(x-8, y-7, 16, 18);
    g.fillRect(x-8, y+11, 7, 9);
    g.fillRect(x+1, y+11, 7, 9);
    // Clothing highlight
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(x-2, y-19, 4);
    // Glow indicator
    g.lineStyle(1, color, 0.6);
    g.strokeCircle(x, y-16, 11);
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
    this.playerGfx.fillEllipse(sx, sy+20, 24, 8);

    // Body
    this.playerGfx.fillStyle(col, 1);
    this.playerGfx.fillCircle(sx, sy-18+bob, 11);
    this.playerGfx.fillRect(sx-9, sy-8+bob, 18, 20);
    this.playerGfx.fillRect(sx-9, sy+12+bob, 8, 10);
    this.playerGfx.fillRect(sx+1,  sy+12+bob, 8, 10);

    // Clothes detail
    this.playerGfx.fillStyle(0xffffff, 0.15);
    this.playerGfx.fillCircle(sx-2, sy-22+bob, 4);

    // Weapon
    if (!m || m.shape === 'sword') {
      this.playerGfx.fillStyle(0xdddddd, 1);
      this.playerGfx.fillRect(sx+10, sy-16+bob, 3, 22);
      this.playerGfx.fillRect(sx+5,  sy-18+bob, 13, 3);
      this.playerGfx.fillStyle(0xffe060, 1);
      this.playerGfx.fillRect(sx+10, sy-20+bob, 3, 5);
    } else if (m.shape === 'mage') {
      this.playerGfx.fillStyle(0x9060ff, 1);
      this.playerGfx.fillCircle(sx, sy-32+bob, 5);
      this.playerGfx.fillRect(sx-1, sy-32+bob, 3, 16);
    } else if (m.shape === 'archer') {
      this.playerGfx.lineStyle(2, 0xdddddd, 1);
      this.playerGfx.beginPath();
      this.playerGfx.arc(sx-12, sy-6+bob, 14, Math.PI*0.25, Math.PI*1.75);
      this.playerGfx.strokePath();
      this.playerGfx.fillStyle(0xdddddd, 1);
      this.playerGfx.fillRect(sx-12, sy-20+bob, 2, 28);
    }

    // Direction indicator
    this.playerGfx.lineStyle(2, 0xffffff, 0.35);
    this.playerGfx.strokeCircle(sx, sy-18+bob, 12);

    // Move camera reference point to player center
    this.playerGfx.setPosition(0, 0);
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

    this.add.text(W-16, this.cameras.main.height - HUD_H + HUD_H/2, 'X = 選單', {
      fontSize:'11px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
  }

  _refreshHud() {
    if (this.hudGold) this.hudGold.setText('💰 ' + GS.gold);
    this.hudHpBars.forEach(({hpBar, mpBar, m}) => {
      if (hpBar.active) hpBar.destroy();
      if (mpBar.active) mpBar.destroy();
    });
    // Rebuild bars
    GS.party.forEach((m, i) => {
      const barX = 360 + i * 200;
      const barY = this.cameras.main.height - 52 + 12;
      mkBar(this, barX, barY+14, 120, 8, m.hp, m.maxHp, 0xe05050).setScrollFactor(0).setDepth(11);
      mkBar(this, barX, barY+26, 120, 6, m.mp, m.maxMp||1, 0x5080e8).setScrollFactor(0).setDepth(11);
    });
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
    if (Math.random() < enc.rate) {
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
      this.scene.start('BattleScene');
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
  }

  _doExit(exit) {
    GS.map = exit.to;
    GS.player.x = exit.toX; GS.player.y = exit.toY; GS.player.facing = 'down';
    this.scene.restart();
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
            this._showDialog(['全員體力恢復！'], () => this._refreshHud());
          } else { this._showDialog(['靈石不足…']); }
        });
      });
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
      });
      return;
    }
    if (npc.join) {
      this._showDialog([...npc.dlg], () => {
        GS.addMember(npc.join);
        this._showDialog([`${CHAR_BASE[npc.join].name} 加入了隊伍！`], () => this.scene.restart());
      });
      return;
    }
    this._showDialog([...npc.dlg]);
  }

  _showDialog(lines, onDone=null) {
    if (!lines.length) { if (onDone) onDone(); return; }
    this.inDialog = true;
    let idx = 0;

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

    const txt = this.add.text(40, boxY+20, lines[0], {
      fontSize:'15px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width: W-80 },
    }).setDepth(21);

    const hint = this.add.text(W-30, boxY+boxH-18, 'Z ▶', {
      fontSize:'11px', fontFamily:'serif', color:'#9a7040', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5).setDepth(21);

    // Blink hint
    const blinker = this.time.addEvent({ delay:500, loop:true, callback:() => { hint.setAlpha(hint.alpha > 0.5 ? 0.3 : 1); }});

    const handler = (evt) => {
      if (evt.code === 'KeyZ' || evt.code === 'Enter') {
        idx++;
        if (idx < lines.length) {
          txt.setText(lines[idx]);
        } else {
          blinker.destroy(); box.destroy(); txt.destroy(); hint.destroy();
          this.inDialog = false;
          this.input.keyboard.off('keydown', handler);
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
    if (this.inDialog) return;
    this.bobTimer++;
    this.moveDelay = Math.max(0, this.moveDelay - 1);
    if (this.moveDelay > 0) { this._drawPlayer(); return; }

    const up    = this.keys.up.isDown    || this.keys.w.isDown;
    const down  = this.keys.down.isDown  || this.keys.s.isDown;
    const left  = this.keys.left.isDown  || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const menu  = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc);

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
      this._drawPlayer();
      this._checkAutoExit();
      if (!this.inDialog) this._checkEnc();
    } else {
      this._drawPlayer();
    }
  }
}
