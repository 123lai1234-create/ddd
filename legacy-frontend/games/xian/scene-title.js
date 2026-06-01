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

    // Wukong figure (right side, animated)
    this.wukongGfx = this.add.graphics();

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

    // Check if any save exists
    const hasSave = [0,1,2].some(i => !!Save?.read(i));

    // Menu
    const menuY = H * 0.58;
    this.menuBgs = [];
    this.menuTexts = this.opts.map((o, i) => {
      const y = menuY + i * 62;
      const bg2 = this.add.graphics();
      // "繼續遊戲" glows green if a save exists
      const col = (i === 1 && hasSave) ? '#80e8a0' : '#c8a060';
      const t = this.add.text(W/2, y, o, {
        fontSize: '24px', fontFamily: '"Noto Serif TC","SimSun",serif',
        color: col, fontStyle:'bold',
        stroke:'#000', strokeThickness:3,
      }).setOrigin(0.5, 0.5);
      this.menuBgs.push({ g:bg2, y });
      return t;
    });
    // Save summary blurb under "繼續遊戲"
    if (hasSave) {
      const d0 = Save?.read(0) || Save?.read(1) || Save?.read(2);
      if (d0) {
        const ng = d0.flags?.ngplus ? ' ★NG+' : '';
        this.add.text(W/2, menuY + 62 + 24, `${MAPS[d0.map]?.name||''} · Lv.${d0.party?.[0]?.lv||'?'}${ng}`, {
          fontSize:'12px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#5a7050', stroke:'#000', strokeThickness:1,
        }).setOrigin(0.5, 0.5);
      }
    }

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
    const hasSave = [0,1,2].some(i => !!Save?.read(i));
    this.menuBgs.forEach(({g, y}, i) => {
      g.clear();
      const sel = i === this.cursor;
      if (sel) {
        g.fillStyle(0x9a7828, 0.2);
        g.fillRoundedRect(W/2 - 160, y-28, 320, 56, 6);
        g.lineStyle(1, 0x9a7828, 0.7);
        g.strokeRoundedRect(W/2 - 160, y-28, 320, 56, 6);
      }
      const baseCol = (i === 1 && hasSave) ? '#80e8a0' : '#c8a060';
      this.menuTexts[i].setColor(sel ? '#ffd700' : baseCol);
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
    // Wukong figure
    if (this.t % 2 === 0) this._drawWukong(this.t);

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
    if (this.cursor === 0) { GS.init(); this.scene.start('OpeningScene'); }
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

  _drawWukong(t) {
    this.wukongGfx.clear();
    const W = this.scale.width, H = this.scale.height;
    const cx = W * 0.80, cy = H * 0.52;
    const sc = Math.min(H * 0.26, 110);
    const bob = Math.sin(t * 0.025) * 3;
    const fy = cy + bob;
    // Shadow
    this.wukongGfx.fillStyle(0x000000, 0.12);
    this.wukongGfx.fillEllipse(cx, fy + sc*0.54, sc*0.95, sc*0.1);
    // Legs
    this.wukongGfx.fillStyle(0xb06010, 0.9);
    this.wukongGfx.fillRoundedRect(cx - sc*0.15, fy + sc*0.42, sc*0.12, sc*0.14, sc*0.03);
    this.wukongGfx.fillRoundedRect(cx + sc*0.03, fy + sc*0.42, sc*0.12, sc*0.14, sc*0.03);
    // Body
    this.wukongGfx.fillStyle(0xd08010, 0.88);
    this.wukongGfx.fillRoundedRect(cx - sc*0.19, fy, sc*0.38, sc*0.44, sc*0.07);
    // Arms
    this.wukongGfx.lineStyle(sc*0.06, 0xd08010, 0.88);
    this.wukongGfx.lineBetween(cx - sc*0.19, fy + sc*0.06, cx - sc*0.32, fy + sc*0.25);
    this.wukongGfx.lineBetween(cx + sc*0.19, fy + sc*0.06, cx + sc*0.32, fy + sc*0.18);
    // Head
    this.wukongGfx.fillStyle(0xf0a010, 0.92);
    this.wukongGfx.fillCircle(cx, fy - sc*0.07, sc*0.22);
    // 金箍
    this.wukongGfx.lineStyle(sc*0.044, 0xffe060, 0.95);
    this.wukongGfx.strokeEllipse(cx, fy - sc*0.08, sc*0.46, sc*0.14);
    // Eyes (fire glare)
    this.wukongGfx.fillStyle(0xfff060, 1);
    this.wukongGfx.fillCircle(cx - sc*0.07, fy - sc*0.11, sc*0.038);
    this.wukongGfx.fillCircle(cx + sc*0.07, fy - sc*0.11, sc*0.038);
    // Staff swing animation
    const swingCycle = t % 200;
    const swingA = swingCycle < 28 ? (swingCycle / 28) * 0.55 : 0;
    const angle = Math.PI * (-0.55 + Math.sin(t * 0.028) * 0.08 - swingA);
    const staffLen = sc * 1.6;
    const sx = cx + sc*0.28, sy = fy + sc*0.14;
    const ex = sx + Math.cos(angle)*staffLen, ey = sy + Math.sin(angle)*staffLen;
    // Staff glow
    this.wukongGfx.lineStyle(sc*0.13, 0xf0c020, 0.08);
    this.wukongGfx.lineBetween(sx, sy, ex, ey);
    // Staff body
    this.wukongGfx.lineStyle(sc*0.042, 0x7a4c18, 1);
    this.wukongGfx.lineBetween(sx, sy, ex, ey);
    // Gold rings
    for (let r = 0.25; r <= 0.78; r += 0.26) {
      const rx = sx + Math.cos(angle)*staffLen*r, ry = sy + Math.sin(angle)*staffLen*r;
      this.wukongGfx.lineStyle(sc*0.044, 0xffd040, 0.9);
      this.wukongGfx.strokeCircle(rx, ry, sc*0.04);
    }
    // Orb at top
    this.wukongGfx.fillStyle(0xffc020, 0.92);
    this.wukongGfx.fillCircle(ex, ey, sc*0.065);
    this.wukongGfx.fillStyle(0xffffff, 0.45);
    this.wukongGfx.fillCircle(ex - sc*0.025, ey - sc*0.025, sc*0.022);
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
      ['  天命人：齊天後裔，金箍棒闖天涯', '#f0e6c8', false],
      ['  土地：山神使者，靈法護眾生', '#f0e6c8', false],
      ['  楊嬋：天神弓手，天箭誅妖魔', '#f0e6c8', false],
      ['', '#f0e6c8', false],
      ['操作', '#e8c060', true],
      ['  方向鍵 / WASD：移動', '#f0e6c8', false],
      ['  Z / Enter：確認・與NPC對話', '#f0e6c8', false],
      ['  X / Esc：取消・開啟選單', '#f0e6c8', false],
      ['', '#f0e6c8', false],
      ['目標：擊敗黃眉大王，解救蒼生於水火。', '#c8d0c8', false],
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
//  OpeningScene — intro cinematic (4 slides, Z to advance)
// ══════════════════════════════════════════════════════════
class OpeningScene extends Phaser.Scene {
  constructor() { super('OpeningScene'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this._slide = 0;

    const ngplus = !!GS.flags?.ngplus;
    this._slides = ngplus ? [
      {
        bg: [0x0a0020, 0x140030, 0x060010, 0x0a0018],
        lines: [
          { t:'天命不滅', c:'#ffd700', sz:30, bold:true, y:0.28 },
          { t:'上一次的試煉，已刻入記憶。', c:'#c8b090', sz:15, y:0.44 },
          { t:'妖王記住了你。', c:'#ff8060', sz:16, y:0.52 },
        ],
      },
      {
        bg: [0x1a0800, 0x120400, 0x200a00, 0x0e0200],
        lines: [
          { t:'二周目開始', c:'#ff9020', sz:28, bold:true, y:0.28 },
          { t:'黃眉大王更強，妖兵更兇猛，', c:'#c8b090', sz:15, y:0.43 },
          { t:'但你的力量，也更甚以往。', c:'#c8d0c0', sz:15, y:0.51 },
          { t:'── 天命之路，從未止息 ──', c:'#9a6030', sz:14, y:0.64 },
        ],
      },
      {
        bg: [0x080a18, 0x04060e, 0x06080c, 0x030408],
        lines: [
          { t:'三英再聚', c:'#80d0ff', sz:28, bold:true, y:0.28 },
          { t:'天命人、土地、楊嬋，', c:'#c8d0e0', sz:15, y:0.43 },
          { t:'三人之羈絆，跨越輪迴。', c:'#c8d0e0', sz:15, y:0.51 },
          { t:'再次並肩，斬妖除魔。', c:'#a0b8a0', sz:14, y:0.60 },
        ],
      },
      {
        bg: [0x100820, 0x080414, 0x060210, 0x040108],
        lines: [
          { t:'★ 二周目啟程 ★', c:'#ffd700', sz:26, bold:true, y:0.30 },
          { t:'這一次，你已不再是新手。', c:'#f0e6c8', sz:17, y:0.46 },
          { t:'天命，再次召喚你。', c:'#ffd700', sz:16, y:0.56 },
        ],
      },
    ] : [
      {
        bg: [0x000000, 0x060214, 0x000000, 0x040108],
        lines: [
          { t:'洪荒之時', c:'#f0e6c8', sz:28, bold:true, y:0.30 },
          { t:'天地初開，妖氣漫天，', c:'#c8b090', sz:16, y:0.45 },
          { t:'萬妖出沒，生靈塗炭。', c:'#c8b090', sz:16, y:0.53 },
        ],
      },
      {
        bg: [0x1a0600, 0x0e0200, 0x120400, 0x0a0300],
        lines: [
          { t:'黑山村告急', c:'#f0a010', sz:26, bold:true, y:0.28 },
          { t:'妖兵橫行，村民流離，', c:'#c8b090', sz:16, y:0.43 },
          { t:'無數百姓哭天喊地，求助無門。', c:'#c8b090', sz:16, y:0.51 },
          { t:'── 救世主，何時降臨？ ──', c:'#9a6030', sz:14, y:0.63 },
        ],
      },
      {
        bg: [0x000820, 0x000618, 0x000412, 0x00060e],
        lines: [
          { t:'天命之人', c:'#60c8ff', sz:28, bold:true, y:0.28 },
          { t:'傳說中，大聖悟空轉世，', c:'#c8d0e0', sz:16, y:0.43 },
          { t:'天命加身，手持如意金箍棒，', c:'#c8d0e0', sz:16, y:0.51 },
          { t:'能鎮壓妖亂，還世間清平。', c:'#c8d0e0', sz:16, y:0.59 },
        ],
      },
      {
        bg: [0x0e0820, 0x080414, 0x060210, 0x040108],
        lines: [
          { t:'征途啟程', c:'#ffd700', sz:30, bold:true, y:0.30 },
          { t:'你，正是那天命之人。', c:'#f0e6c8', sz:18, y:0.46 },
          { t:'命運，從此刻改變。', c:'#f0e6c8', sz:18, y:0.55 },
        ],
      },
    ];

    this._bgGfx = this.add.graphics();
    this._textObjs = [];
    this._hint = this.add.text(W/2, H*0.88, '按 Z 繼續', {
      fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0.5).setAlpha(0);
    this.tweens.add({ targets:this._hint, alpha:0.8, duration:900, delay:1200, yoyo:true, repeat:-1 });

    this._showSlide(0);

    this.keys = this.input.keyboard.addKeys({
      z:     Phaser.Input.Keyboard.KeyCodes.Z,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      esc:   Phaser.Input.Keyboard.KeyCodes.ESC,
    });
  }

  _showSlide(idx) {
    const W = this.scale.width, H = this.scale.height;
    const s = this._slides[idx];

    this._textObjs.forEach(o => o.destroy());
    this._textObjs = [];

    this._bgGfx.clear();
    this._bgGfx.fillGradientStyle(...s.bg, 1);
    this._bgGfx.fillRect(0, 0, W, H);

    // Stars
    const sg = this.add.graphics();
    this._textObjs.push(sg);
    for (let i = 0; i < 60; i++) {
      sg.fillStyle(0xfff8e0, 0.1 + Math.random()*0.5);
      sg.fillCircle(Math.random()*W, Math.random()*H, 0.3 + Math.random()*1.0);
    }

    // Divider lines
    const dg = this.add.graphics();
    this._textObjs.push(dg);
    dg.lineStyle(1, 0x5a4a2a, 0.35);
    dg.lineBetween(W*0.25, H*0.82, W*0.75, H*0.82);

    // Progress dots
    this._slides.forEach((_, i) => {
      const dot = this.add.graphics();
      dot.fillStyle(i===idx ? 0xffd700 : 0x3a3020, i===idx ? 0.9 : 0.5);
      dot.fillCircle(W/2 + (i - (this._slides.length-1)/2)*22, H*0.86, i===idx ? 5 : 3);
      this._textObjs.push(dot);
    });

    // Text lines with stagger
    s.lines.forEach((l, li) => {
      const fontSize = Math.min(l.sz, Math.floor(W * l.sz/560));
      const t = this.add.text(W/2, H*l.y, l.t, {
        fontSize: fontSize+'px',
        fontFamily: '"Noto Serif TC","SimSun",serif',
        color: l.c,
        fontStyle: l.bold ? 'bold' : 'normal',
        stroke: '#000', strokeThickness: l.bold ? 4 : 2,
        shadow: l.bold ? { offsetX:0, offsetY:0, color:l.c, blur:20, fill:true } : undefined,
      }).setOrigin(0.5, 0.5).setAlpha(0);
      this._textObjs.push(t);
      this.tweens.add({ targets:t, alpha:1, duration:600, delay:li*500 });
    });
  }

  update() {
    const ok  = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const esc = Phaser.Input.Keyboard.JustDown(this.keys.esc);
    const padOk = !!window.PAD?.ok; if (padOk && window.PAD) window.PAD.ok = false;

    if (esc) { this.scene.start('TitleScene'); return; }
    if (ok || padOk) {
      this._slide++;
      if (this._slide >= this._slides.length) {
        this.scene.start('WorldScene');
      } else {
        Sound?.play('menuSelect');
        this._showSlide(this._slide);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
//  EndingScene — game clear screen with New Game+ option
// ══════════════════════════════════════════════════════════
class EndingScene extends Phaser.Scene {
  constructor() { super('EndingScene'); }

  create() {
    this.cursor = 0;
    const W = this.scale.width, H = this.scale.height;
    Sound?.stopBgm();
    this.time.delayedCall(1200, () => Sound?.bgm('shrine'));

    // Background — deep celestial gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050112, 0x080422, 0x030110, 0x060218, 1);
    bg.fillRect(0, 0, W, H);

    // Nebula glow blobs
    const nebula = this.add.graphics().setAlpha(0.12);
    [[W*0.2,H*0.3,0x4060ff],[W*0.8,H*0.5,0x8020ff],[W*0.5,H*0.7,0x2080ff]].forEach(([nx,ny,nc]) => {
      nebula.fillStyle(nc, 1); nebula.fillCircle(nx, ny, W*0.28);
    });

    // Stars — two layers for depth
    const sg = this.add.graphics();
    for (let i = 0; i < 160; i++) {
      sg.fillStyle(0xfff8e0, 0.04 + Math.random()*0.65);
      sg.fillCircle(Math.random()*W, Math.random()*H, 0.3 + Math.random()*1.8);
    }

    // Gold sparks — more, spread wider
    this.sparks = [];
    this.sparkGfx = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      const angle = Math.random()*Math.PI*2, speed = 0.4 + Math.random()*4.2;
      this.sparks.push({
        x: W*0.5 + (Math.random()-0.5)*200, y: H*0.08,
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 1.1,
        alpha: 0.4 + Math.random()*0.6, fade: 0.003 + Math.random()*0.009,
        r: 1 + Math.random()*2.6,
        color: [0xffd700, 0xff9040, 0xffffc0, 0xff6020, 0xff80ff][Math.floor(Math.random()*5)],
      });
    }

    // Title — scale-in + float
    const titleT = this.add.text(W/2, H*0.06, '天命達成', {
      fontSize: Math.min(54, Math.floor(W*0.1))+'px',
      fontFamily: '"Noto Serif TC","SimSun",serif',
      color:'#ffd700', fontStyle:'bold',
      stroke:'#1a0800', strokeThickness:8,
      shadow:{ offsetX:0, offsetY:0, color:'#ffd700', blur:38, fill:true },
    }).setOrigin(0.5, 0.5).setAlpha(0).setScale(0.3);
    this.tweens.add({ targets:titleT, alpha:1, scaleX:1, scaleY:1, y:H*0.09, duration:1000, ease:'Back.easeOut', delay:200 });
    this.titleT = titleT;

    const subT = this.add.text(W/2, H*0.175, '黃眉大王已伏誅，天下太平。', {
      fontSize: Math.min(16, Math.floor(W*0.028))+'px',
      fontFamily: '"Noto Serif TC","SimSun",serif',
      color:'#c8b080', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0.5).setAlpha(0);
    this.tweens.add({ targets:subT, alpha:1, duration:600, delay:1100 });

    const divG = this.add.graphics();
    divG.lineStyle(1, 0x9a7828, 0.5);
    divG.lineBetween(W*0.12, H*0.225, W*0.88, H*0.225);

    // ── Character showcase ────────────────────────────────────
    const heroes = [
      { name:'天命人', title:'齊天後裔',  color:0xffd060, tc:'#ffd060', skills:'金箍棒・天命之力' },
      { name:'土地',   title:'山神使者',  color:0x60e880, tc:'#80ff90', skills:'靈法・自然之力' },
      { name:'楊嬋',   title:'天神弓手',  color:0x80d0ff, tc:'#a0e0ff', skills:'天箭・神力' },
    ];
    const cardH = Math.floor(H * 0.16);
    const cardW = Math.floor(Math.min((W - 30) / 3, 140));
    const totalCardW = cardW * 3;
    const startX = (W - totalCardW) / 2;
    const cardY = H * 0.26;
    heroes.forEach(({ name, title, color, tc, skills }, i) => {
      const cx = startX + cardW * i + cardW / 2;
      const cy = cardY + cardH / 2;
      const card = this.add.graphics().setAlpha(0);
      card.fillStyle(0x060220, 0.82); card.fillRoundedRect(cx-cardW/2+2, cy-cardH/2, cardW-4, cardH, 7);
      card.lineStyle(1.5, color, 0.7); card.strokeRoundedRect(cx-cardW/2+2, cy-cardH/2, cardW-4, cardH, 7);
      const fs = Math.max(11, Math.floor(cardW * 0.12));
      const nm = this.add.text(cx, cy - cardH*0.26, name, {
        fontSize:(fs+3)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:tc, fontStyle:'bold', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5).setAlpha(0);
      const tl = this.add.text(cx, cy + cardH*0.04, title, {
        fontSize:Math.max(9, fs-1)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#9a8060', stroke:'#000', strokeThickness:1,
      }).setOrigin(0.5, 0.5).setAlpha(0);
      const lv = this.add.text(cx, cy + cardH*0.32, `Lv.${GS.party[i]?.lv || 1}`, {
        fontSize:Math.max(9, fs)+'px', fontFamily:'monospace',
        color:'#ffd700', fontStyle:'bold', stroke:'#000', strokeThickness:1,
      }).setOrigin(0.5, 0.5).setAlpha(0);
      const delay = 1400 + i * 280;
      this.tweens.add({ targets:[card,nm,tl,lv], alpha:1, duration:480, delay, ease:'Power2' });
      // Flash glow on appear
      this.time.delayedCall(delay+80, () => {
        const gl = this.add.graphics();
        gl.lineStyle(10, color, 0.5); gl.strokeRoundedRect(cx-cardW/2+2, cy-cardH/2, cardW-4, cardH, 7);
        this.tweens.add({ targets:gl, alpha:0, duration:500, onComplete:()=>gl.destroy() });
      });
    });

    const divG2 = this.add.graphics();
    divG2.lineStyle(1, 0x9a7828, 0.35);
    divG2.lineBetween(W*0.12, H*0.445, W*0.88, H*0.445);

    // ── Stats panel ───────────────────────────────────────────
    const panW = Math.min(470, W-40), panH = Math.floor(H*0.21);
    const panX = (W-panW)/2, panY = Math.floor(H*0.46);
    mkPanel(this, panX, panY, panW, panH, 0.88);

    const pt = GS.flags?.playtime || 0;
    const maxLv = GS.party.reduce((mx,m) => Math.max(mx, m.lv||1), 1);
    const achList = Achieve?.getAll() || [];
    const achDone = achList.filter(a=>a.unlocked).length;
    const stats = [
      ['遊玩時間', `${Math.floor(pt/3600)}時 ${Math.floor((pt%3600)/60)}分 ${pt%60}秒`],
      ['最高等級', `Lv.${maxLv}`],
      ['所得靈石', `${GS.gold} 靈石`],
      ['成就解鎖', `${achDone} / ${achList.length}`],
    ];
    const rowH2 = Math.floor(panH / stats.length);
    stats.forEach(([lbl, val], i) => {
      const sy = panY + i*rowH2 + rowH2/2;
      const fsL = Math.max(11, Math.floor(panW*0.024));
      const lblT = this.add.text(panX + panW*0.44, sy, lbl+'：', {
        fontSize: fsL+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#9a8060', stroke:'#000', strokeThickness:1,
      }).setOrigin(1, 0.5).setAlpha(0);
      const valT = this.add.text(panX + panW*0.46, sy, val, {
        fontSize: fsL+'px', fontFamily:'monospace',
        color:'#ffd700', fontStyle:'bold', stroke:'#000', strokeThickness:1,
      }).setOrigin(0, 0.5).setAlpha(0);
      this.tweens.add({ targets:[lblT,valT], alpha:1, duration:500, delay:2300+i*180 });
    });

    // ── Buttons ───────────────────────────────────────────────
    const btnFontSz = Math.min(19, Math.floor(W*0.030));
    this.opts = ['新遊戲＋（繼承 60% 靈石）', '回到標題'];
    this.optBgs = [];
    this.optTexts = this.opts.map((o, i) => {
      const oy = panY + panH + 28 + i*50;
      const bg2 = this.add.graphics();
      const t = this.add.text(W/2, oy, o, {
        fontSize: btnFontSz+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:3,
      }).setOrigin(0.5, 0.5).setAlpha(0);
      this.tweens.add({ targets:t, alpha:1, duration:400, delay:3100+i*150 });
      this.optBgs.push({ g:bg2, y:oy });
      return t;
    });

    this.add.text(W/2, H*0.97, '↑↓ 選擇　Z/Enter 確認', {
      fontSize:'11px', fontFamily:'serif', color:'#5a4a2a',
    }).setOrigin(0.5, 0.5);

    this.t = 0;
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      z: Phaser.Input.Keyboard.KeyCodes.Z,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });
    this._updateOpts();
  }

  _updateOpts() {
    const W = this.scale.width;
    const bw = Math.min(360, W*0.7);
    this.optBgs.forEach(({g, y}, i) => {
      g.clear();
      const sel = i === this.cursor;
      if (sel) {
        g.fillStyle(0x9a7828, 0.2);
        g.fillRoundedRect(W/2-bw/2, y-24, bw, 48, 6);
        g.lineStyle(1, 0x9a7828, 0.75);
        g.strokeRoundedRect(W/2-bw/2, y-24, bw, 48, 6);
      }
      this.optTexts[i].setColor(sel ? '#ffd700' : '#c8a060');
    });
  }

  update() {
    this.t++;
    // Title gentle pulse
    if (this.titleT) {
      this.titleT.setScale(1 + Math.sin(this.t * 0.04) * 0.018);
    }
    this.sparkGfx.clear();
    const W = this.scale.width;
    this.sparks.forEach(s => {
      s.x += s.vx; s.y += s.vy; s.vy += 0.05;
      s.alpha -= s.fade;
      if (s.alpha <= 0) {
        const angle = Math.random()*Math.PI*2, speed = 0.4 + Math.random()*4.2;
        s.x = W*0.5 + (Math.random()-0.5)*200; s.y = this.scale.height*0.08;
        s.vx = Math.cos(angle)*speed; s.vy = Math.sin(angle)*speed - 1.1;
        s.alpha = 0.4 + Math.random()*0.6;
      }
      this.sparkGfx.fillStyle(s.color, s.alpha);
      this.sparkGfx.fillCircle(s.x, s.y, s.r);
    });

    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const padOk = !!window.PAD?.ok; if (padOk && window.PAD) window.PAD.ok = false;
    const padUp = !!window.PAD?.up;  if (padUp  && window.PAD) window.PAD.up = false;
    const padDn = !!window.PAD?.down; if (padDn  && window.PAD) window.PAD.down = false;

    if (up || padUp)   { this.cursor = Math.max(0, this.cursor-1); this._updateOpts(); Sound?.play('menuMove'); }
    if (down || padDn) { this.cursor = Math.min(1, this.cursor+1); this._updateOpts(); Sound?.play('menuMove'); }
    if (ok || padOk) {
      Sound?.play('menuSelect');
      if (this.cursor === 0) {
        const savedGold = Math.floor((GS.gold||0) * 0.6) + 200;
        const savedPlaytime = GS.flags?.playtime || 0;
        GS.init();
        GS.gold = savedGold;
        GS.flags.ngplus = true;
        GS.flags.playtime = savedPlaytime;
        Achieve?.unlock('ngplus');
        this.scene.start('OpeningScene');
      } else {
        this.scene.start('TitleScene');
      }
    }
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
      const ngTag = d?.flags?.ngplus ? ' ★NG+' : '';
      let mainStr = `欄位 ${i+1}${ngTag}`;
      let sub1 = '── 空欄 ──';
      if (d) {
        const pt = d.flags?.playtime || 0;
        const ptStr = pt > 0 ? `　${Math.floor(pt/3600)}h${Math.floor((pt%3600)/60)}m` : '';
        sub1 = `Lv.${d.party?.[0]?.lv||'?'} · ${MAPS[d.map]?.name||d.map} · 靈石 ${d.gold||0}${ptStr}`;
      }
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
