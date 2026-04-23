'use strict';
// ── Tile colors ─────────────────────────────────────────────
const TILE_SZ = 40;
const TILE_COLOR = {
  0: [0x7a6545, 0x8a7555], // path
  1: [0x3c2d1e, 0x4a3828], // wall
  2: [0x2a5218, 0x336622], // grass
  3: [0x193810, 0x224d14], // tree
  4: [0x1a3468, 0x1e3d78], // water
  5: [0x2a1e12, 0x332515], // floor
  6: [0x8b6914, 0x9a7820], // door
};

// ══════════════════════════════════════════════════════════
class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  create() {
    const map = MAPS[GS.map];

    // Tile layer
    this.tileGfx = this.add.graphics();
    this._drawTiles(map);

    // NPC sprites
    this.npcSprites = [];
    (map.npcs || []).forEach(npc => {
      const sx = npc.x * TILE_SZ + TILE_SZ/2;
      const sy = npc.y * TILE_SZ + TILE_SZ/2;
      const g = this._drawNpc(sx, sy);
      const lbl = this.add.text(sx, sy - 22, npc.name, {
        fontSize:'10px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#d4b060', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5);
      this.npcSprites.push({ npc, g, lbl, sx, sy });
    });

    // Player sprite
    this.playerGfx = this.add.graphics();
    this._drawPlayer();

    // HUD
    this._buildHud();

    // Input
    this.keys = this.input.keyboard.addKeys({
      up:   Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:    Phaser.Input.Keyboard.KeyCodes.W,
      s:    Phaser.Input.Keyboard.KeyCodes.S,
      a:    Phaser.Input.Keyboard.KeyCodes.A,
      d:    Phaser.Input.Keyboard.KeyCodes.D,
      z:    Phaser.Input.Keyboard.KeyCodes.Z,
      enter:Phaser.Input.Keyboard.KeyCodes.ENTER,
      x:    Phaser.Input.Keyboard.KeyCodes.X,
      esc:  Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this.moveDelay = 0;
    this.msgQueue = [];
    this.inDialog = false;
    this.msgBox = null;
  }

  // ── Tile rendering ─────────────────────────────────────
  _drawTiles(map) {
    this.tileGfx.clear();
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.tiles[y][x];
        const colors = TILE_COLOR[t] || [0x444444, 0x555555];
        const shade = (x+y) % 2 === 0 ? colors[0] : colors[1];
        this.tileGfx.fillStyle(shade, 1);
        this.tileGfx.fillRect(x*TILE_SZ, y*TILE_SZ, TILE_SZ, TILE_SZ);
        // Border
        this.tileGfx.lineStyle(1, 0x000000, 0.2);
        this.tileGfx.strokeRect(x*TILE_SZ, y*TILE_SZ, TILE_SZ, TILE_SZ);
      }
    }
  }

  _drawNpc(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0xd4b060, 1);
    g.fillCircle(x, y-14, 8);
    g.fillRect(x-7, y-8, 14, 16);
    g.fillStyle(0xe8c060, 1);
    g.fillRect(x-2, y-6, 4, 12);
    return g;
  }

  _drawPlayer() {
    this.playerGfx.clear();
    const { x, y } = GS.player;
    const sx = x * TILE_SZ + TILE_SZ/2;
    const sy = y * TILE_SZ + TILE_SZ/2;
    const m = GS.party[0];
    const col = m ? m.color : 0x4a9eff;

    // Shadow
    this.playerGfx.fillStyle(0x000000, 0.3);
    this.playerGfx.fillEllipse(sx, sy+14, 22, 8);

    // Body
    this.playerGfx.fillStyle(col, 1);
    this.playerGfx.fillCircle(sx, sy-14, 9);  // head
    this.playerGfx.fillRect(sx-8, sy-6, 16, 18); // torso
    this.playerGfx.fillRect(sx-8, sy+12, 7, 10);  // left leg
    this.playerGfx.fillRect(sx+1, sy+12, 7, 10);  // right leg

    // Sword (for yunyi)
    if (!m || m.shape === 'sword') {
      this.playerGfx.fillStyle(0xcccccc, 1);
      this.playerGfx.fillRect(sx+9, sy-10, 3, 18);
      this.playerGfx.fillRect(sx+5, sy-12, 11, 3);
    }

    // Position indicator
    this.playerGfx.lineStyle(2, 0xffffff, 0.4);
    this.playerGfx.strokeCircle(sx, sy-14, 9);
  }

  // ── HUD ────────────────────────────────────────────────
  _buildHud() {
    const map = MAPS[GS.map];
    this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.hudGfx.fillStyle(0x08060e, 0.85);
    this.hudGfx.fillRect(0, 560, 800, 40);
    this.hudGfx.lineStyle(1, 0x7a5c1e, 0.8);
    this.hudGfx.lineBetween(0, 560, 800, 560);

    this.hudMapName = this.add.text(10, 576, map.name, {
      fontSize:'13px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setScrollFactor(0).setDepth(11).setOrigin(0, 0.5);

    this.hudGold = this.add.text(200, 576, '💰 ' + GS.gold, {
      fontSize:'13px', fontFamily:'serif', color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setScrollFactor(0).setDepth(11).setOrigin(0, 0.5);

    // HP bars
    this.hudHpTexts = [];
    GS.party.forEach((m, i) => {
      const x = 360 + i * 145;
      this.add.text(x, 568, m.name, {
        fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:1,
      }).setScrollFactor(0).setDepth(11).setOrigin(0, 0.5);
      const ht = this.add.text(x, 584, `${m.hp}/${m.maxHp}`, {
        fontSize:'10px', fontFamily:'monospace', color:'#e05050', stroke:'#000', strokeThickness:1,
      }).setScrollFactor(0).setDepth(11).setOrigin(0, 0.5);
      this.hudHpTexts.push(ht);
    });

    this.add.text(790, 576, 'X=選單', {
      fontSize:'11px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setScrollFactor(0).setDepth(11).setOrigin(1, 0.5);
  }

  _refreshHud() {
    this.hudGold.setText('💰 ' + GS.gold);
    this.hudHpTexts.forEach((t, i) => {
      if (GS.party[i]) t.setText(`${GS.party[i].hp}/${GS.party[i].maxHp}`);
    });
  }

  // ── Movement ───────────────────────────────────────────
  _canWalk(x, y) {
    const map = MAPS[GS.map];
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = map.tiles[y][x];
    return t !== 1 && t !== 3 && t !== 4;
  }

  _tryMove(dx, dy) {
    const nx = GS.player.x + dx;
    const ny = GS.player.y + dy;
    if (!this._canWalk(nx, ny)) return false;
    GS.player.x = nx; GS.player.y = ny;
    if (dx < 0) GS.player.facing = 'left';
    else if (dx > 0) GS.player.facing = 'right';
    else if (dy < 0) GS.player.facing = 'up';
    else GS.player.facing = 'down';
    return true;
  }

  // ── Random encounter ───────────────────────────────────
  _checkEnc() {
    const enc = MAPS[GS.map].enc;
    if (!enc.rate || enc.enemies.length === 0) return;
    GS.encStep++;
    if (GS.encStep < 5) return;
    if (Math.random() < enc.rate) {
      GS.encStep = 0;
      const pool = enc.enemies.filter(e => !GS.defeated[e]);
      if (pool.length === 0) return;
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

  // ── Interactions ───────────────────────────────────────
  _interact() {
    const { x, y, facing } = GS.player;
    const dx = facing==='right'?1:facing==='left'?-1:0;
    const dy = facing==='down'?1:facing==='up'?-1:0;
    const tx = x+dx, ty = y+dy;

    // Check exit tiles
    const map = MAPS[GS.map];
    const exit = map.exits?.find(e => e.x===x && e.y===y);
    if (exit) { this._doExit(exit); return; }

    // Check NPC
    const npc = map.npcs?.find(n => n.x===tx && n.y===ty);
    if (npc) { this._talkNpc(npc); return; }
  }

  _doExit(exit) {
    GS.map = exit.to;
    GS.player.x = exit.toX;
    GS.player.y = exit.toY;
    GS.player.facing = 'down';
    this.scene.restart();
  }

  _talkNpc(npc) {
    if (npc.shop) {
      this.scene.launch('ShopScene', { stock: SHOP_STOCK[npc.shop], caller:'WorldScene' });
      this.scene.pause();
      return;
    }
    if (npc.inn) {
      this._showDialog([...npc.dlg], () => {
        this._showDialog([`住宿費 ${npc.inn} 靈石，是否要休息？（Z確認 / X取消）`], () => {
          if (GS.gold >= npc.inn) {
            GS.gold -= npc.inn;
            GS.party.forEach(m => { m.hp = m.maxHp; m.mp = m.maxMp; m.status = []; m.dead = false; });
            this._showDialog(['已充分休息，全員體力恢復！'], () => { this._refreshHud(); });
          } else {
            this._showDialog(['靈石不足…']);
          }
        }, true);
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
      const lines = [...npc.dlg];
      this._showDialog(lines, () => {
        GS.addMember(npc.join);
        this._showDialog([`${CHAR_BASE[npc.join].name} 加入了隊伍！`], () => {
          this.scene.restart();
        });
      });
      return;
    }
    this._showDialog([...npc.dlg]);
  }

  _showDialog(lines, onDone=null, promptConfirm=false) {
    this.inDialog = true;
    let idx = 0;

    const boxH = 120;
    const boxY = 560 - boxH - 8;
    const box = this.add.graphics().setDepth(20);
    box.fillStyle(0x100c1e, 0.97);
    box.fillRoundedRect(20, boxY, 760, boxH, 8);
    box.lineStyle(2, 0x7a5c1e, 1);
    box.strokeRoundedRect(20, boxY, 760, boxH, 8);

    const txt = this.add.text(40, boxY+20, lines[0], {
      fontSize:'15px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width:720 },
    }).setDepth(21);

    const hint = this.add.text(750, boxY+boxH-18, 'Z→', {
      fontSize:'11px', fontFamily:'serif', color:'#9a8060', stroke:'#000', strokeThickness:1,
    }).setDepth(21).setOrigin(1,0.5);

    const advance = () => {
      idx++;
      if (idx < lines.length) {
        txt.setText(lines[idx]);
      } else {
        box.destroy(); txt.destroy(); hint.destroy();
        this.inDialog = false;
        if (onDone) onDone();
      }
    };

    const handler = (evt) => {
      if (evt.code === 'KeyZ' || evt.code === 'Enter') {
        advance();
        if (!this.inDialog) this.input.keyboard.off('keydown', handler);
      }
    };
    this.input.keyboard.on('keydown', handler);
  }

  // ── Auto-check exits ───────────────────────────────────
  _checkAutoExit() {
    const { x, y } = GS.player;
    const map = MAPS[GS.map];
    const exit = map.exits?.find(e => e.x===x && e.y===y);
    if (exit) { this._doExit(exit); }
  }

  // ── Main update ────────────────────────────────────────
  update(time) {
    if (this.inDialog) return;
    this.moveDelay = Math.max(0, this.moveDelay - 1);
    if (this.moveDelay > 0) return;

    const up    = this.keys.up.isDown    || this.keys.w.isDown;
    const down  = this.keys.down.isDown  || this.keys.s.isDown;
    const left  = this.keys.left.isDown  || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const menu  = Phaser.Input.Keyboard.JustDown(this.keys.x) || Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (menu) {
      this.scene.launch('MenuScene', { caller:'WorldScene' });
      this.scene.pause();
      return;
    }

    if (ok) { this._interact(); return; }

    let moved = false;
    if (up)    moved = this._tryMove(0,-1);
    else if (down)  moved = this._tryMove(0,1);
    else if (left)  moved = this._tryMove(-1,0);
    else if (right) moved = this._tryMove(1,0);

    if (moved) {
      this.moveDelay = 8;
      this._drawPlayer();
      this._checkAutoExit();
      if (!this.inDialog) this._checkEnc();
    }
  }
}
