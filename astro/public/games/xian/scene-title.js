'use strict';
// ── Shared UI helpers ──────────────────────────────────────
function mkPanel(scene, x, y, w, h) {
  const g = scene.add.graphics();
  g.fillStyle(0x100c1e, 0.97);
  g.fillRoundedRect(x, y, w, h, 8);
  g.lineStyle(2, 0x7a5c1e, 1);
  g.strokeRoundedRect(x, y, w, h, 8);
  g.lineStyle(1, 0x3a2a0e, 0.5);
  g.strokeRoundedRect(x+2, y+2, w-4, h-4, 6);
  return g;
}

function mkText(scene, x, y, str, opts={}) {
  const { size=14, color='#f0e6c8', align='left', bold=false } = opts;
  return scene.add.text(x, y, str, {
    fontSize: size+'px',
    fontFamily: '"Noto Serif TC","SimSun",serif',
    color,
    align,
    fontStyle: bold ? 'bold' : 'normal',
    stroke: '#000',
    strokeThickness: bold ? 3 : 2,
  }).setOrigin(align==='center'?0.5:0, 0.5);
}

function mkBar(scene, x, y, w, h, val, max, color) {
  const g = scene.add.graphics();
  g.fillStyle(0x111111, 1); g.fillRect(x, y, w, h);
  const pct = Math.max(0, Math.min(1, val/max));
  g.fillStyle(color, 1); g.fillRect(x, y, Math.floor(w*pct), h);
  g.lineStyle(1, 0xffffff, 0.15); g.strokeRect(x, y, w, h);
  return g;
}

// ══════════════════════════════════════════════════════════
class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    const W=800, H=600;
    this.cursor = 0;
    this.opts = ['開始新遊戲','繼續遊戲','關　於'];

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a0a2e, 0x1a0a2e, 0x08040e, 0x08040e, 1);
    bg.fillRect(0, 0, W, H);

    // Particles
    this.particles = [];
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vy: -(0.3 + Math.random() * 0.8),
        size: 0.5 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.5,
      });
    }
    this.particleGfx = this.add.graphics();

    // Title glow
    this.add.text(W/2, 160, '仙 俠 傳', {
      fontSize: '72px',
      fontFamily: '"Noto Serif TC","SimSun",serif',
      color: '#e8c060',
      fontStyle: 'bold',
      stroke: '#3a2000',
      strokeThickness: 6,
      shadow: { offsetX:0, offsetY:0, color:'#e8c060', blur:30, fill:true },
    }).setOrigin(0.5, 0.5);

    this.add.text(W/2, 220, '— 回合制 · 仙劍風格 RPG —', {
      fontSize: '16px', fontFamily: '"Noto Serif TC","SimSun",serif',
      color: '#9a8060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0.5);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x7a5c1e, 0.6);
    div.lineBetween(240, 248, 560, 248);

    // Menu
    this.menuItems = this.opts.map((o, i) => {
      const y = 300 + i * 54;
      const bg = this.add.graphics();
      const t = this.add.text(W/2, y, o, {
        fontSize: '22px', fontFamily: '"Noto Serif TC","SimSun",serif',
        color: '#c8a060', fontStyle:'bold',
        stroke:'#000', strokeThickness:3,
      }).setOrigin(0.5, 0.5);
      return { bg, t, y };
    });

    this.add.text(W/2, 548, '方向鍵選擇　Z / Enter 確認', {
      fontSize: '12px', fontFamily: '"Noto Serif TC","SimSun",serif',
      color: '#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0.5);

    // Input
    this.keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      z:     Phaser.Input.Keyboard.KeyCodes.Z,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });
    this.justDown = { up:false, down:false, z:false };

    this._updateMenu();
    this.t = 0;
  }

  _updateMenu() {
    this.menuItems.forEach(({bg,t},i) => {
      bg.clear();
      if (i === this.cursor) {
        bg.fillStyle(0x7a5c1e, 0.25);
        bg.fillRoundedRect(800/2-130, this.menuItems[i].y-22, 260, 44, 4);
        bg.lineStyle(1, 0x7a5c1e, 0.8);
        bg.strokeRoundedRect(800/2-130, this.menuItems[i].y-22, 260, 44, 4);
        t.setColor('#ffd700');
      } else {
        t.setColor('#c8a060');
      }
    });
  }

  update() {
    this.t++;
    // Particles
    this.particleGfx.clear();
    this.particles.forEach(p => {
      p.y += p.vy;
      if (p.y < -10) { p.y = 610; p.x = Math.random() * 800; }
      this.particleGfx.fillStyle(0xe8c060, p.alpha);
      this.particleGfx.fillCircle(p.x, p.y, p.size);
    });

    // Input
    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);

    if (up)   { this.cursor = Math.max(0, this.cursor-1); this._updateMenu(); }
    if (down) { this.cursor = Math.min(2, this.cursor+1); this._updateMenu(); }
    if (ok)   { this._select(); }
  }

  _select() {
    if (this.cursor === 0) { GS.init(); this.scene.start('WorldScene'); }
    else if (this.cursor === 1) { this.scene.start('LoadScene'); }
    else { this.scene.start('AboutScene'); }
  }
}

// ══════════════════════════════════════════════════════════
class AboutScene extends Phaser.Scene {
  constructor() { super('AboutScene'); }

  create() {
    const W=800, H=600;
    this.add.graphics().fillStyle(0x08060e,1).fillRect(0,0,W,H);
    mkPanel(this, 100, 60, 600, 480);

    mkText(this, W/2, 100, '關　於', { size:24, color:'#e8c060', align:'center', bold:true });

    const lines = [
      '仙俠傳 — 回合制 RPG',
      '',
      '角色',
      '  雲逸：青雲劍客，劍術高手',
      '  靈兒：靈族後裔，精通法術',
      '  月華：飛羽弓手，箭術無雙',
      '',
      '操作',
      '  方向鍵 / WASD：移動',
      '  Z / Enter：確認',
      '  X / Esc：取消 / 選單',
      '',
      '目標：斬殺千魔城魔君，守護青雲村。',
    ];
    lines.forEach((l, i) => {
      mkText(this, 160, 150 + i*26, l, { size:14, color: l.startsWith('角') || l.startsWith('操') ? '#e8c060' : '#f0e6c8' });
    });

    mkText(this, W/2, 510, 'Z / Enter：返回', { size:12, color:'#5a4a2a', align:'center' });

    this.input.keyboard.once('keydown-Z', () => this.scene.start('TitleScene'));
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('TitleScene'));
    this.input.keyboard.once('keydown-ESC', () => this.scene.start('TitleScene'));
  }
}

// ══════════════════════════════════════════════════════════
class LoadScene extends Phaser.Scene {
  constructor() { super('LoadScene'); }

  create() {
    const W=800, H=600;
    this.cursor = 0;

    this.add.graphics().fillStyle(0x08060e,1).fillRect(0,0,W,H);
    mkPanel(this, 150, 80, 500, 440);

    mkText(this, W/2, 120, '讀取存檔', { size:20, color:'#e8c060', align:'center', bold:true });

    this.slotTexts = [];
    for (let i = 0; i < 3; i++) {
      const d = Save.read(i);
      const y = 200 + i * 110;
      const bg = this.add.graphics();
      let main, sub1='', sub2='';
      if (d) {
        main = `欄位 ${i+1}`;
        sub1 = `Lv.${d.party?.[0]?.lv||'?'} · ${MAPS[d.map]?.name||d.map} · 靈石 ${d.gold||0}`;
        sub2 = (d.party||[]).map(m=>m.name).join(' · ');
      } else {
        main = `欄位 ${i+1}`;
        sub1 = '── 空欄 ──';
      }
      const t0 = mkText(this, 200, y,    main, { size:15, color:'#c8b080', bold:true });
      const t1 = mkText(this, W/2, y+28, sub1, { size:12, color:'#9a8060', align:'center' });
      const t2 = mkText(this, W/2, y+48, sub2, { size:11, color:'#7a7060', align:'center' });
      this.slotTexts.push({ bg, t0, y, hasSave:!!d });
    }

    this.msgText = mkText(this, W/2, 490, '', { size:13, color:'#80e090', align:'center' });
    mkText(this, W/2, 520, '↑↓ 選擇　Z 讀取　Esc 返回', { size:11, color:'#5a4a2a', align:'center' });

    this.keys = this.input.keyboard.addKeys({
      up:  Phaser.Input.Keyboard.KeyCodes.UP,
      down:Phaser.Input.Keyboard.KeyCodes.DOWN,
      z:   Phaser.Input.Keyboard.KeyCodes.Z,
      enter:Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this._draw();
  }

  _draw() {
    this.slotTexts.forEach(({bg,t0,y},i) => {
      bg.clear();
      const sel = i === this.cursor;
      if (sel) {
        bg.fillStyle(0xe8c060, 0.1); bg.fillRect(160, y-18, 480, 90);
        bg.lineStyle(1, 0x7a5c1e, 0.8); bg.strokeRect(160, y-18, 480, 90);
      }
      t0.setColor(sel ? '#ffe080' : '#c8b080');
    });
  }

  update() {
    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const esc  = Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (up)   { this.cursor = Math.max(0, this.cursor-1); this._draw(); }
    if (down) { this.cursor = Math.min(2, this.cursor+1); this._draw(); }
    if (esc)  { this.scene.start('TitleScene'); }
    if (ok) {
      if (GS.load(this.cursor)) {
        this.scene.start('WorldScene');
      } else {
        this.msgText.setText('此欄位為空！');
        this.time.delayedCall(1500, () => this.msgText.setText(''));
      }
    }
  }
}
