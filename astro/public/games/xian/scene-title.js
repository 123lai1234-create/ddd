'use strict';

// ── Shared UI helpers ─────────────────────────────────────
function mkPanel(scene, x, y, w, h, alpha=0.97) {
  const g = scene.add.graphics();
  g.fillStyle(0x0e0a1c, alpha);
  g.fillRoundedRect(x, y, w, h, 10);
  g.lineStyle(2, 0x9a7a28, 1);
  g.strokeRoundedRect(x, y, w, h, 10);
  g.lineStyle(1, 0x4a3a10, 0.7);
  g.strokeRoundedRect(x+3, y+3, w-6, h-6, 8);
  return g;
}

function mkText(scene, x, y, str, opts={}) {
  const { size=14, color='#f0e6c8', align='left', bold=false } = opts;
  return scene.add.text(x, y, str, {
    fontSize: size + 'px',
    fontFamily: '"Noto Serif TC","SimSun",serif',
    color,
    align,
    fontStyle: bold ? 'bold' : 'normal',
    stroke: '#000',
    strokeThickness: bold ? 3 : 2,
  }).setOrigin(align === 'center' ? 0.5 : 0, 0.5);
}

function mkBar(scene, x, y, w, h, val, max, color) {
  const g = scene.add.graphics();
  g.fillStyle(0x0a0a0a, 1); g.fillRoundedRect(x, y, w, h, 2);
  const pct = Math.max(0, Math.min(1, val / max));
  if (pct > 0) { g.fillStyle(color, 1); g.fillRoundedRect(x+1, y+1, Math.max(0, Math.floor((w-2)*pct)), h-2, 2); }
  g.lineStyle(1, 0xffffff, 0.12); g.strokeRoundedRect(x, y, w, h, 2);
  return g;
}

// ══════════════════════════════════════════════════════════
class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    Sound?.init(); Sound?.bgm('village');
    const W = this.scale.width, H = this.scale.height;
    this.cursor = 0;

    // Auth-aware menu: when logged in show name; always show login/logout option
    const authLabel = Auth?.isLoggedIn()
      ? `登出 (${(Auth.displayName() || Auth.email() || '').slice(0,8)})`
      : '帳號登入';
    this.opts = ['開始新遊戲', '繼續遊戲', '關　於', authLabel];

    // Re-draw when auth state changes (sign-in redirect returns here)
    this._authListener = () => this.scene.restart();
    window.addEventListener('xian:authchange', this._authListener);

    // Full-screen gradient background — dark amber/black
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x120800, 0x100600, 0x060200, 0x080400, 1);
    bg.fillRect(0, 0, W, H);

    // Star particles
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.3 + Math.random() * 1.2,
        alpha: 0.2 + Math.random() * 0.7,
        speed: 0.05 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.starGfx = this.add.graphics();

    // Golden sparks
    this.sparks = [];
    this.sparkGfx = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      this.sparks.push({
        x: Math.random() * W,
        y: H + Math.random() * H,
        vy: -(0.5 + Math.random() * 1.8),
        vx: (Math.random() - 0.5) * 0.6,
        r: 0.8 + Math.random() * 1.8,
        alpha: 0.6 + Math.random() * 0.4,
        fade: 0.004 + Math.random() * 0.008,
      });
    }

    // Floating light orbs
    this.orbs = [];
    for (let i = 0; i < 8; i++) {
      this.orbs.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4,
        r: 30 + Math.random()*60,
        color: [0xe8c060, 0x9060e8, 0x60c8e8][Math.floor(Math.random()*3)],
        alpha: 0.03 + Math.random()*0.05,
      });
    }
    this.orbGfx = this.add.graphics();

    // Decorative lines
    const deco = this.add.graphics();
    deco.lineStyle(1, 0x7a5c1e, 0.3);
    for (let i = 0; i < 6; i++) {
      deco.lineBetween(0, i*H/6, W, i*H/6);
    }

    // Title
    const titleY = H * 0.28;
    this.add.text(W/2, titleY, '悟 空 傳', {
      fontSize: Math.min(88, W * 0.1) + 'px',
      fontFamily: '"Noto Serif TC","SimSun",serif',
      color: '#f0a010',
      fontStyle: 'bold',
      stroke: '#1a0800',
      strokeThickness: 8,
      shadow: { offsetX:0, offsetY:0, color:'#f0a010', blur:45, fill:true },
    }).setOrigin(0.5, 0.5);

    this.add.text(W/2, titleY + 64, '— 天命之人的征途 —', {
      fontSize: '17px', fontFamily: '"Noto Serif TC","SimSun",serif',
      color: '#9a6030', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0.5);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x9a7a28, 0.5);
    const dw = Math.min(340, W * 0.35);
    div.lineBetween(W/2 - dw, titleY+94, W/2 + dw, titleY+94);

    // Menu
    const menuY = H * 0.58;
    this.menuBgs = [];
    this.menuTexts = this.opts.map((o, i) => {
      const y = menuY + i * 62;
      const bg2 = this.add.graphics();
      const t = this.add.text(W/2, y, o, {
        fontSize: '24px', fontFamily: '"Noto Serif TC","SimSun",serif',
        color: '#c8a060', fontStyle:'bold',
        stroke:'#000', strokeThickness:3,
      }).setOrigin(0.5, 0.5);
      this.menuBgs.push({ g:bg2, y });
      return t;
    });

    this.add.text(W/2, H - 40, '方向鍵 / WASD 移動　Z / Enter 確認　X / Esc 取消', {
      fontSize: '12px', fontFamily: '"Noto Serif TC","SimSun",serif',
      color: '#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0.5);

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP, w: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
      z: Phaser.Input.Keyboard.KeyCodes.Z, enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });

    // Show login status near subtitle
    if (Auth?.isLoggedIn()) {
      this.add.text(W/2, H * 0.28 + 120, `☁ ${Auth.displayName() || Auth.email()}`, {
        fontSize: '13px', fontFamily: '"Noto Serif TC","SimSun",serif',
        color: '#50c878', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0.5);
    }

    this._updateMenu();
    this.t = 0;
  }

  _updateMenu() {
    const W = this.scale.width;
    this.menuBgs.forEach(({g, y}, i) => {
      g.clear();
      const sel = i === this.cursor;
      if (sel) {
        g.fillStyle(0x9a7828, 0.2);
        g.fillRoundedRect(W/2 - 160, y-28, 320, 56, 6);
        g.lineStyle(1, 0x9a7828, 0.7);
        g.strokeRoundedRect(W/2 - 160, y-28, 320, 56, 6);
      }
      this.menuTexts[i].setColor(sel ? '#ffd700' : '#c8a060');
      if (sel) {
        this.menuTexts[i].setShadow(0, 0, '#ffd700', 12, true, true);
      } else {
        this.menuTexts[i].setShadow(0, 0, '#000', 0, false, false);
      }
    });
  }

  update() {
    this.t++;
    // Stars
    this.starGfx.clear();
    this.stars.forEach(s => {
      const a = s.alpha * (0.7 + 0.3 * Math.sin(this.t * s.speed + s.phase));
      this.starGfx.fillStyle(0xfff8e0, a);
      this.starGfx.fillCircle(s.x, s.y, s.r);
    });
    // Orbs
    this.orbGfx.clear();
    this.orbs.forEach(o => {
      o.x += o.vx; o.y += o.vy;
      if (o.x < -100) o.x = this.scale.width + 100;
      if (o.x > this.scale.width + 100) o.x = -100;
      if (o.y < -100) o.y = this.scale.height + 100;
      if (o.y > this.scale.height + 100) o.y = -100;
      this.orbGfx.fillStyle(o.color, o.alpha);
      this.orbGfx.fillCircle(o.x, o.y, o.r);
    });
    // Golden sparks
    this.sparkGfx.clear();
    const H = this.scale.height, Ws = this.scale.width;
    this.sparks.forEach(s => {
      s.x += s.vx; s.y += s.vy; s.alpha -= s.fade;
      if (s.alpha <= 0 || s.y < -10) {
        s.x = Math.random() * Ws; s.y = H + Math.random() * 40;
        s.alpha = 0.6 + Math.random() * 0.4;
      }
      this.sparkGfx.fillStyle(0xf0c020, s.alpha * (0.6 + 0.4 * Math.sin(this.t * 0.12 + s.x)));
      this.sparkGfx.fillCircle(s.x, s.y, s.r);
    });

    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up)   || Phaser.Input.Keyboard.JustDown(this.keys.w);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down) || Phaser.Input.Keyboard.JustDown(this.keys.s);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z)    || Phaser.Input.Keyboard.JustDown(this.keys.enter);

    const okPad = !!window.PAD?.ok;  if (okPad && window.PAD) window.PAD.ok   = false;
    const upPad = !!window.PAD?.up;  if (upPad && window.PAD) window.PAD.up   = false;
    const dnPad = !!window.PAD?.down;if (dnPad && window.PAD) window.PAD.down = false;

    if (up || upPad) { this.cursor = Math.max(0, this.cursor-1);                    this._updateMenu(); Sound?.play('menuMove'); }
    if (down || dnPad){ this.cursor = Math.min(this.opts.length-1, this.cursor+1);  this._updateMenu(); Sound?.play('menuMove'); }
    if (ok || okPad) { Sound?.play('menuSelect'); this._select(); }
  }

  _select() {
    if (this.cursor === 0) { GS.init(); this.scene.start('WorldScene'); }
    else if (this.cursor === 1) { this.scene.start('LoadScene'); }
    else if (this.cursor === 2) { this.scene.start('AboutScene'); }
    else {
      // Auth toggle — let the overlay button handle sign-in/out; just dispatch event
      if (Auth?.isLoggedIn()) {
        Auth.signOut().then(() => {
          window.dispatchEvent(new CustomEvent('xian:authchange'));
        });
      } else {
        document.getElementById('auth-open-btn')?.click();
      }
    }
  }

  shutdown() {
    if (this._authListener) window.removeEventListener('xian:authchange', this._authListener);
  }
}

// ══════════════════════════════════════════════════════════
class AboutScene extends Phaser.Scene {
  constructor() { super('AboutScene'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x16082e, 0x16082e, 0x060210, 0x060210, 1);
    bg.fillRect(0, 0, W, H);

    const pw = Math.min(640, W - 80), ph = Math.min(480, H - 80);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    mkPanel(this, px, py, pw, ph);

    mkText(this, W/2, py+40, '關　於', { size:24, color:'#e8c060', align:'center', bold:true });

    const lines = [
      ['悟空傳 — 天命之人的征途', '#f0a010', true],
      ['', '#f0e6c8', false],
      ['角色', '#e8c060', true],
      ['  雲逸：青雲劍客，劍術高手', '#f0e6c8', false],
      ['  靈兒：靈族後裔，精通法術', '#f0e6c8', false],
      ['  月華：飛羽弓手，箭術無雙', '#f0e6c8', false],
      ['', '#f0e6c8', false],
      ['操作', '#e8c060', true],
      ['  方向鍵 / WASD：移動', '#f0e6c8', false],
      ['  Z / Enter：確認・與NPC對話', '#f0e6c8', false],
      ['  X / Esc：取消・開啟選單', '#f0e6c8', false],
      ['', '#f0e6c8', false],
      ['目標：斬殺千魔城魔君，守護青雲村。', '#c8d0c8', false],
    ];
    lines.forEach(([ text, color, bold ], i) => {
      mkText(this, px+36, py+90+i*27, text, { size:14, color, bold });
    });

    mkText(this, W/2, py+ph-30, 'Z / Enter / Esc：返回', { size:12, color:'#5a4a2a', align:'center' });

    this.input.keyboard.once('keydown-Z',     () => this.scene.start('TitleScene'));
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('TitleScene'));
    this.input.keyboard.once('keydown-ESC',   () => this.scene.start('TitleScene'));
  }
}

// ══════════════════════════════════════════════════════════
class LoadScene extends Phaser.Scene {
  constructor() { super('LoadScene'); }

  init(data) { this.synced = data?.synced || false; }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this.cursor = 0;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x16082e, 0x16082e, 0x060210, 0x060210, 1);
    bg.fillRect(0, 0, W, H);

    const pw = Math.min(560, W - 80), ph = Math.min(480, H - 80);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    mkPanel(this, px, py, pw, ph);
    mkText(this, W/2, py+44, '讀取存檔', { size:22, color:'#e8c060', align:'center', bold:true });

    this.panelGfx = this.add.graphics();
    this.slotBgs = [];
    for (let i = 0; i < 3; i++) {
      const d = Save.read(i);
      const sy = py + 110 + i * 105;
      const bg2 = this.add.graphics();
      let mainStr = `欄位 ${i+1}`;
      let sub1 = d ? `Lv.${d.party?.[0]?.lv||'?'} · ${MAPS[d.map]?.name||d.map} · 靈石 ${d.gold||0}` : '── 空欄 ──';
      let sub2 = d ? (d.party||[]).map(m=>m.name).join(' · ') : '';
      mkText(this, px+40, sy+8,  mainStr, { size:15, color:'#c8b080', bold:true });
      mkText(this, W/2,  sy+34, sub1,    { size:12, color: d ? '#9a8060' : '#444', align:'center' });
      if (sub2) mkText(this, W/2, sy+56, sub2, { size:11, color:'#7a7060', align:'center' });
      this.slotBgs.push({ g:bg2, sy, pw, px });
    }

    this.msgText = mkText(this, W/2, py+ph-50, '', { size:14, color:'#80e090', align:'center' });
    mkText(this, W/2, py+ph-24, '↑↓ 選擇　Z 讀取　Esc 返回', { size:11, color:'#5a4a2a', align:'center' });

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP, down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      z: Phaser.Input.Keyboard.KeyCodes.Z, enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
    });
    this._draw();

    if (!this.synced) {
      this.msgText.setText('☁ 雲端同步中…');
      Save.syncFromCloud().then(ok => {
        if (ok) this.scene.restart({ synced: true });
        else this.msgText.setText('');
      });
    }
  }

  _draw() {
    this.slotBgs.forEach(({g, sy, pw, px}, i) => {
      g.clear();
      const sel = i === this.cursor;
      if (sel) {
        g.fillStyle(0xe8c060, 0.08); g.fillRoundedRect(px+16, sy-14, pw-32, 90, 6);
        g.lineStyle(1, 0x9a7828, 0.8); g.strokeRoundedRect(px+16, sy-14, pw-32, 90, 6);
      }
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
      if (GS.load(this.cursor)) { this.scene.start('WorldScene'); }
      else {
        this.msgText.setText('此欄位為空！');
        this.time.delayedCall(1500, () => this.msgText.setText(''));
      }
    }
  }
}
