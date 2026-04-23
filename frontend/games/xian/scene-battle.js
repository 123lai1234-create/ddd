'use strict';
// ══════════════════════════════════════════════════════════
class BattleScene extends Phaser.Scene {
  constructor() { super('BattleScene'); }

  create() {
    Sound?.bgm('battle');
    const W = this.scale.width, H = this.scale.height;
    this.W = W; this.H = H;
    this.phase = 'playerTurn';
    this.actorIdx = 0;
    this.cursor = 0;
    this.subCursor = 0;
    this.subMode = null;
    this.targetList = [];
    this.log = [];
    this.waiting = false;

    this.party   = GS.party.map(m => ({ ...m, status:[...m.status] }));
    this.enemies = GS.battleData.enemies.map(e => ({ ...e, status:[...e.status] }));

    this.groundY = Math.floor(H * 0.56);

    // ── Background ──────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0c0418, 0x100820, 0x040210, 0x060316, 1);
    bg.fillRect(0, 0, W, H);

    // Moon
    const moonG = this.add.graphics();
    moonG.fillStyle(0xfff4d0, 1);
    moonG.fillCircle(W*0.82, H*0.13, H*0.048);
    moonG.fillStyle(0xffffff, 0.2);
    moonG.fillCircle(W*0.808, H*0.118, H*0.02);
    moonG.fillStyle(0x0c0418, 1);
    moonG.fillCircle(W*0.836, H*0.12, H*0.042);

    // Stars
    const starG = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      const sx = Math.random()*W, sy = Math.random()*this.groundY*0.92;
      starG.fillStyle(0xfff8e0, 0.2 + Math.random()*0.7);
      starG.fillCircle(sx, sy, 0.3 + Math.random()*1.1);
    }

    // Mountains (back layer)
    const mtn1 = this.add.graphics();
    mtn1.fillStyle(0x180c2a, 1);
    const pts1 = [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38]];
    mtn1.beginPath();
    pts1.forEach(([rx,ry],i) => { const px=rx*W, py=ry*this.groundY; i===0?mtn1.moveTo(px,py):mtn1.lineTo(px,py); });
    mtn1.lineTo(W,this.groundY); mtn1.lineTo(0,this.groundY); mtn1.closePath(); mtn1.fillPath();

    // Mountains (front layer)
    const mtn2 = this.add.graphics();
    mtn2.fillStyle(0x1e1030, 1);
    const pts2 = [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52]];
    mtn2.beginPath();
    pts2.forEach(([rx,ry],i) => { const px=rx*W, py=ry*this.groundY; i===0?mtn2.moveTo(px,py):mtn2.lineTo(px,py); });
    mtn2.lineTo(W,this.groundY); mtn2.lineTo(0,this.groundY); mtn2.closePath(); mtn2.fillPath();

    // Ground
    const gndG = this.add.graphics();
    gndG.fillGradientStyle(0x1c1008, 0x1c1008, 0x080604, 0x080604, 1);
    gndG.fillRect(0, this.groundY, W, H - this.groundY);
    gndG.lineStyle(2, 0xb07828, 0.65);
    gndG.lineBetween(0, this.groundY, W, this.groundY);
    gndG.lineStyle(1, 0x3a2606, 0.4);
    for (let i = 1; i < 6; i++) gndG.lineBetween(0, this.groundY+i*7, W, this.groundY+i*7);

    // Arena glow
    const arenaG = this.add.graphics();
    arenaG.fillStyle(0x280840, 0.2);
    arenaG.fillEllipse(W*0.38, this.groundY+3, W*0.65, 28);

    // ── Enemy sprites ────────────────────────────────────
    this.enemySprites = [];
    const eCount = this.enemies.length;
    this.enemies.forEach((e, i) => {
      const ex = eCount === 1 ? W*0.22 : W*(0.13 + i*0.18);
      const sz = e.sz || 28;
      const g = this.add.graphics();
      this._drawEnemy(g, e, ex, this.groundY);
      const hp  = mkBar(this, ex-sz, this.groundY+6, sz*2, 7, e.hp, e.maxHp, 0xe04040);
      const lbl = this.add.text(ex, this.groundY+20, e.name, {
        fontSize: Math.max(11,Math.floor(H*0.02))+'px',
        fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5,0.5);
      this.enemySprites.push({ g, hp, lbl, x:ex, y:this.groundY, e });
    });

    // ── Hero sprites ─────────────────────────────────────
    this.partySprites = [];
    this.party.forEach((m, i) => {
      const hx = W*(0.62 + i*0.13);
      const g = this.add.graphics();
      this._drawHero(g, m, hx, this.groundY);
      this.partySprites.push({ g, x:hx, y:this.groundY, m });
    });

    // ── Log strip ────────────────────────────────────────
    const logY = this.groundY + 34;
    const logH = Math.max(32, Math.floor(H*0.065));
    const logBg = this.add.graphics();
    logBg.fillStyle(0x050410, 0.93);
    logBg.fillRect(0, logY, W, logH);
    logBg.lineStyle(1, 0x5a3e10, 0.8);
    logBg.lineBetween(0, logY, W, logY);
    logBg.lineBetween(0, logY+logH, W, logY+logH);
    this.logText = this.add.text(14, logY+logH/2, '', {
      fontSize: Math.max(12,Math.floor(H*0.023))+'px',
      fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width: W-28 },
    }).setOrigin(0,0.5).setDepth(5);

    // ── UI panels ────────────────────────────────────────
    this.uiY     = logY + logH + 2;
    this.uiH     = H - this.uiY;
    this.splitX  = Math.floor(W*0.44);

    this.statusPanel = this.add.graphics();
    this.statusTexts = [];
    this._rebuildStatus();

    this.menuPanel = this.add.graphics();
    this.menuTexts = [];
    this._rebuildMenu();

    this.keys = this.input.keyboard.addKeys({
      up:   Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:Phaser.Input.Keyboard.KeyCodes.RIGHT,
      z:    Phaser.Input.Keyboard.KeyCodes.Z,
      enter:Phaser.Input.Keyboard.KeyCodes.ENTER,
      x:    Phaser.Input.Keyboard.KeyCodes.X,
      esc:  Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this._addLog(this.enemies.length > 1
      ? `遭遇了 ${this.enemies.map(e=>e.name).join('、')}！`
      : `遭遇了 ${this.enemies[0].name}！`);
  }

  // ── Sprite drawing ────────────────────────────────────
  _drawEnemy(g, e, x, y) {
    g.clear();
    if (e.dead) return;
    const sz  = e.sz || 28;
    const col = e.color || 0x884422;
    const cy  = y - sz * 0.85;
    const hy  = y - sz * 1.8;
    const hr  = sz * 0.62;

    // Shadow
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(x, y+3, sz*2.4, sz*0.3);

    // Body
    g.fillStyle(col, 1);
    g.fillEllipse(x, cy, sz*2.0, sz*1.4);
    g.fillStyle(0xffffff, 0.07);
    g.fillEllipse(x-sz*0.15, cy-sz*0.18, sz*0.9, sz*0.5);
    g.lineStyle(1, 0x000000, 0.35);
    g.strokeEllipse(x, cy, sz*2.0, sz*1.4);

    // Head
    g.fillStyle(col, 1);
    g.fillCircle(x, hy, hr);
    g.fillStyle(0xffffff, 0.06);
    g.fillCircle(x-hr*0.3, hy-hr*0.3, hr*0.45);
    g.lineStyle(1, 0x000000, 0.35);
    g.strokeCircle(x, hy, hr);

    // Horns
    if (!e.boss) {
      g.fillStyle(0x604820, 1);
      g.fillTriangle(x-sz*0.27, hy-hr*0.82, x-sz*0.52, hy-hr*1.55, x-sz*0.02, hy-hr*0.72);
      g.fillTriangle(x+sz*0.27, hy-hr*0.82, x+sz*0.52, hy-hr*1.55, x+sz*0.02, hy-hr*0.72);
    }

    // Eyes (glowing)
    const er = sz*0.11;
    g.fillStyle(0xff0000, 0.28);
    g.fillCircle(x-sz*0.24, hy-sz*0.06, er*2.0);
    g.fillCircle(x+sz*0.24, hy-sz*0.06, er*2.0);
    g.fillStyle(0xff2020, 1);
    g.fillCircle(x-sz*0.24, hy-sz*0.06, er);
    g.fillCircle(x+sz*0.24, hy-sz*0.06, er);
    g.fillStyle(0x080000, 1);
    g.fillCircle(x-sz*0.22, hy-sz*0.05, er*0.5);
    g.fillCircle(x+sz*0.26, hy-sz*0.05, er*0.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x-sz*0.28, hy-sz*0.08, er*0.28);
    g.fillCircle(x+sz*0.20, hy-sz*0.08, er*0.28);

    // Mouth + fangs
    g.fillStyle(0x180000, 1);
    g.fillEllipse(x, hy+sz*0.28, sz*0.55, sz*0.2);
    g.fillStyle(0xeeeeee, 1);
    g.fillTriangle(x-sz*0.16, hy+sz*0.20, x-sz*0.06, hy+sz*0.38, x+sz*0.04, hy+sz*0.20);
    g.fillTriangle(x+sz*0.05, hy+sz*0.20, x+sz*0.15, hy+sz*0.38, x+sz*0.25, hy+sz*0.20);

    // Arms
    g.fillStyle(col, 1);
    g.fillEllipse(x-sz*1.1, cy+sz*0.08, sz*0.55, sz*0.75);
    g.fillEllipse(x+sz*1.1, cy+sz*0.08, sz*0.55, sz*0.75);
    const cly = cy + sz*0.42;
    g.fillStyle(0x604820, 1);
    g.fillTriangle(x-sz*1.28, cly-sz*0.05, x-sz*1.08, cly+sz*0.22, x-sz*0.88, cly-sz*0.05);
    g.fillTriangle(x+sz*0.88, cly-sz*0.05, x+sz*1.08, cly+sz*0.22, x+sz*1.28, cly-sz*0.05);

    // Boss crown
    if (e.boss) {
      g.fillStyle(0xffd700, 1);
      g.fillRect(x-sz*0.56, hy-hr*1.08, sz*1.12, sz*0.22);
      g.fillTriangle(x-sz*0.5, hy-hr*1.08, x-sz*0.3, hy-hr*1.72, x-sz*0.1, hy-hr*1.08);
      g.fillTriangle(x-sz*0.1, hy-hr*1.08, x+sz*0.10, hy-hr*1.95, x+sz*0.3, hy-hr*1.08);
      g.fillTriangle(x+sz*0.1, hy-hr*1.08, x+sz*0.34, hy-hr*1.68, x+sz*0.56, hy-hr*1.08);
      g.fillStyle(0xff4040, 1);
      g.fillCircle(x, hy-hr*1.2, sz*0.12);
    }
  }

  _drawHero(g, m, x, y) {
    g.clear();
    const s   = 14;
    const col = m.dead ? 0x282828 : (m.color || 0x4a9eff);

    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x, y+2, s*2.2, s*0.45);

    if (m.dead) {
      g.fillStyle(0x282828, 0.75);
      g.fillEllipse(x-s*0.4, y-s*0.35, s*2.6, s*0.85);
      g.lineStyle(1, 0xff4040, 0.75);
      g.lineBetween(x-11, y-8, x+11, y+8);
      g.lineBetween(x+11, y-8, x-11, y+8);
      return;
    }

    // Legs
    g.fillStyle(col, 0.65);
    g.fillRect(x-s*0.5, y-s*0.85, s*0.42, s*0.85);
    g.fillRect(x+s*0.08, y-s*0.85, s*0.42, s*0.85);

    // Robe
    g.fillStyle(col, 1);
    g.fillTriangle(x-s*0.65, y-s*0.85, x+s*0.65, y-s*0.85, x+s*0.48, y-s*2.25);
    g.fillTriangle(x-s*0.65, y-s*0.85, x-s*0.48, y-s*2.25, x+s*0.48, y-s*2.25);
    g.fillStyle(0xffffff, 0.1);
    g.fillTriangle(x-s*0.22, y-s*0.95, x+s*0.22, y-s*0.95, x, y-s*2.1);
    // Trim
    g.lineStyle(1.5, 0xffd700, 0.4);
    g.lineBetween(x-s*0.48, y-s*2.25, x, y-s*2.42);
    g.lineBetween(x+s*0.48, y-s*2.25, x, y-s*2.42);
    // Belt
    g.fillStyle(0x906030, 1);
    g.fillRect(x-s*0.65, y-s*1.05, s*1.3, s*0.2);

    // Arms
    g.fillStyle(col, 0.8);
    g.fillRect(x-s*0.95, y-s*2.2, s*0.33, s*0.85);
    g.fillRect(x+s*0.62, y-s*2.2, s*0.33, s*0.85);

    // Neck
    g.fillStyle(0xd4a078, 1);
    g.fillRect(x-s*0.18, y-s*2.38, s*0.36, s*0.18);

    // Head
    g.fillStyle(0xd4a078, 1);
    g.fillCircle(x, y-s*2.82, s*0.65);
    g.lineStyle(0.8, 0xa07050, 0.4);
    g.strokeCircle(x, y-s*2.82, s*0.65);

    // Hair
    g.fillStyle(0x1c0c08, 1);
    g.fillCircle(x, y-s*3.15, s*0.65);
    g.fillRect(x-s*0.66, y-s*3.0, s*1.32, s*0.32);
    g.fillRect(x-s*0.70, y-s*2.98, s*0.19, s*0.48);
    g.fillRect(x+s*0.51, y-s*2.98, s*0.19, s*0.48);

    // Eyes
    g.fillStyle(0x0c0808, 1);
    g.fillCircle(x-s*0.26, y-s*2.80, s*0.12);
    g.fillCircle(x+s*0.26, y-s*2.80, s*0.12);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x-s*0.29, y-s*2.83, s*0.05);
    g.fillCircle(x+s*0.23, y-s*2.83, s*0.05);

    // Weapon
    if (m.shape === 'sword') {
      g.lineStyle(2.5, 0xd8d8d8, 1);
      g.lineBetween(x+s*0.98, y-s*3.25, x+s*0.98, y-s*0.95);
      g.lineStyle(2, 0xffd700, 1);
      g.lineBetween(x+s*0.64, y-s*2.65, x+s*1.32, y-s*2.65);
      g.fillStyle(0xa08030, 1);
      g.fillRect(x+s*0.88, y-s*1.08, s*0.2, s*0.2);
    } else if (m.shape === 'mage') {
      g.lineStyle(2, 0xb09050, 1);
      g.lineBetween(x-s*1.18, y, x-s*1.18, y-s*3.4);
      g.fillStyle(0x7888ff, 0.85);
      g.fillCircle(x-s*1.18, y-s*3.62, s*0.38);
      g.fillStyle(0xaabbff, 0.6);
      g.fillCircle(x-s*1.28, y-s*3.78, s*0.18);
      g.fillStyle(0x4455ff, 0.15);
      g.fillCircle(x-s*1.18, y-s*3.62, s*0.72);
    } else if (m.shape === 'archer') {
      g.lineStyle(2, 0x9a6830, 1);
      g.beginPath();
      g.arc(x+s*1.22, y-s*1.8, s*0.98, -Math.PI*0.55, Math.PI*0.55);
      g.strokePath();
      g.lineStyle(1, 0xd8c8a0, 0.75);
      g.lineBetween(x+s*1.22, y-s*2.6, x+s*1.22, y-s*1.0);
    }
  }

  // ── Status panel ──────────────────────────────────────
  _rebuildStatus() {
    this.statusPanel.clear();
    this.statusTexts.forEach(t => t.destroy());
    this.statusTexts = [];

    const px = 0, py = this.uiY, pw = this.splitX, ph = this.uiH;
    this.statusPanel.fillStyle(0x080612, 0.97);
    this.statusPanel.fillRect(px, py, pw, ph);
    this.statusPanel.lineStyle(1, 0x7a5c1e, 0.8);
    this.statusPanel.strokeRect(px, py, pw, ph);
    this.statusPanel.lineStyle(1, 0x3a2a0c, 0.5);
    this.statusPanel.strokeRect(px+2, py+2, pw-4, ph-4);

    const rowH = Math.floor(ph / this.party.length);
    const fs   = Math.max(11, Math.floor(rowH * 0.28));
    const fsS  = Math.max(9, fs - 3);

    this.party.forEach((m, i) => {
      const ry   = py + i * rowH;
      const dead = m.dead;
      const sel  = (i === this.actorIdx) && (this.phase === 'playerTurn');

      if (sel) {
        this.statusPanel.fillStyle(0x9a7828, 0.14);
        this.statusPanel.fillRect(px+2, ry, pw-4, rowH);
      }
      if (i > 0) {
        this.statusPanel.lineStyle(1, 0x3a2808, 0.5);
        this.statusPanel.lineBetween(px+6, ry, px+pw-6, ry);
      }

      const ty = ry + rowH * 0.18;
      const nameT = this.add.text(px+10, ty, (sel ? '▶ ' : '  ') + m.name, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: dead ? '#484040' : sel ? '#ffd700' : '#e8c060',
        stroke:'#000', strokeThickness: fs > 13 ? 2 : 1,
      }).setDepth(5);
      this.statusTexts.push(nameT);

      const barW = Math.floor(pw * 0.52);
      const bx   = px + 10;
      const by1  = ry + rowH * 0.46;
      const by2  = ry + rowH * 0.70;
      const bh2  = Math.max(5, Math.floor(rowH * 0.13));
      const st   = calcStats(m);

      const hpBar = mkBar(this, bx, by1, barW, bh2, m.hp, m.maxHp, 0xe04040);
      hpBar.setDepth(5);
      this.statusTexts.push(hpBar);
      const mpBar = mkBar(this, bx, by2, barW, bh2, m.mp, st.maxMp, 0x4060e0);
      mpBar.setDepth(5);
      this.statusTexts.push(mpBar);

      const hpT = this.add.text(bx+barW+5, by1+bh2/2, `${m.hp}`, {
        fontSize: fsS+'px', fontFamily:'monospace', color:'#e05050', stroke:'#000', strokeThickness:1,
      }).setOrigin(0, 0.5).setDepth(5);
      const mpT = this.add.text(bx+barW+5, by2+bh2/2, `${m.mp}`, {
        fontSize: fsS+'px', fontFamily:'monospace', color:'#5070e0', stroke:'#000', strokeThickness:1,
      }).setOrigin(0, 0.5).setDepth(5);
      this.statusTexts.push(hpT, mpT);

      if (m.status.length > 0) {
        const stT = this.add.text(px+pw-8, ty, m.status.slice(0,2).join(' '), {
          fontSize: fsS+'px', fontFamily:'serif', color:'#c050e8', stroke:'#000', strokeThickness:1,
        }).setOrigin(1, 0).setDepth(5);
        this.statusTexts.push(stT);
      }
    });
  }

  // ── Menu panel ────────────────────────────────────────
  _rebuildMenu() {
    this.menuPanel.clear();
    this.menuTexts.forEach(t => t.destroy());
    this.menuTexts = [];
    if (this.phase !== 'playerTurn') return;

    const px = this.splitX+2, py = this.uiY, pw = this.W-this.splitX-2, ph = this.uiH;
    this.menuPanel.fillStyle(0x080612, 0.97);
    this.menuPanel.fillRect(px, py, pw, ph);
    this.menuPanel.lineStyle(1, 0x7a5c1e, 0.8);
    this.menuPanel.strokeRect(px, py, pw, ph);
    this.menuPanel.lineStyle(1, 0x3a2a0c, 0.5);
    this.menuPanel.strokeRect(px+2, py+2, pw-4, ph-4);

    const actor = this.party[this.actorIdx];
    if (!actor || actor.dead) return;

    const fs = Math.max(13, Math.floor(ph * 0.18));

    if (!this.subMode) {
      const cmds = ['攻擊','技能','道具','防禦','逃跑'];
      const colW = Math.floor(pw / 2);
      const rowH = Math.floor(ph / 3);
      cmds.forEach((cmd, i) => {
        const col = Math.floor(i/3), row = i%3;
        const tx = px + col*colW + 20;
        const ty = py + row*rowH + rowH*0.5;
        const sel = i === this.cursor;
        if (sel) {
          this.menuPanel.fillStyle(0x9a7828, 0.25);
          this.menuPanel.fillRoundedRect(px+col*colW+4, py+row*rowH+4, colW-8, rowH-8, 5);
          this.menuPanel.lineStyle(1, 0xb09030, 0.6);
          this.menuPanel.strokeRoundedRect(px+col*colW+4, py+row*rowH+4, colW-8, rowH-8, 5);
        }
        const t = this.add.text(tx, ty, (sel?'▶ ':'')+cmd, {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness: sel?3:2,
        }).setDepth(5);
        if (sel) t.setShadow(0, 0, '#ffd700', 8, true, true);
        this.menuTexts.push(t);
      });

    } else if (this.subMode === 'skill') {
      const skills = actor.skills.map(sk => SKILLS[sk]).filter(Boolean);
      const rowH = Math.max(30, Math.floor(ph / Math.max(4, skills.length)));
      skills.forEach((sk, i) => {
        const ty = py + i*rowH + rowH*0.5;
        const sel = i === this.subCursor;
        const mpOk = actor.mp >= sk.mp;
        if (sel) {
          this.menuPanel.fillStyle(0x9a7828, 0.25);
          this.menuPanel.fillRoundedRect(px+4, py+i*rowH+4, pw-8, rowH-8, 5);
        }
        const t = this.add.text(px+18, ty, (sel?'▶ ':'')+sk.name, {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color: mpOk?(sel?'#ffd700':'#c8a060'):'#555', stroke:'#000', strokeThickness:2,
        }).setDepth(5);
        const mpT = this.add.text(px+pw-14, ty, `MP:${sk.mp}`, {
          fontSize: Math.max(10,fs-3)+'px', fontFamily:'monospace',
          color:'#5080e8', stroke:'#000', strokeThickness:1,
        }).setOrigin(1, 0.5).setDepth(5);
        this.menuTexts.push(t, mpT);
      });

    } else if (this.subMode === 'item') {
      const items = Object.entries(GS.inventory).filter(([id,n]) => n>0 && ITEMS[id]?.cat==='use');
      if (items.length === 0) {
        const t = this.add.text(px+pw/2, py+ph/2, '── 無道具 ──', {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#555', stroke:'#000', strokeThickness:1,
        }).setOrigin(0.5, 0.5).setDepth(5);
        this.menuTexts.push(t);
      } else {
        const rowH = Math.max(30, Math.floor(ph / Math.max(4, items.length)));
        items.forEach(([id, n], i) => {
          const ty = py + i*rowH + rowH*0.5;
          const sel = i === this.subCursor;
          if (sel) {
            this.menuPanel.fillStyle(0x9a7828, 0.25);
            this.menuPanel.fillRoundedRect(px+4, py+i*rowH+4, pw-8, rowH-8, 5);
          }
          const it = ITEMS[id];
          const t = this.add.text(px+18, ty, (sel?'▶ ':'')+it.name+` ×${n}`, {
            fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
            color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
          }).setDepth(5);
          this.menuTexts.push(t);
        });
      }

    } else if (this.subMode === 'target') {
      const rowH = Math.max(30, Math.floor(ph / Math.max(3, this.targetList.length)));
      this.targetList.forEach((tgt, i) => {
        const ty = py + i*rowH + rowH*0.5;
        const sel = i === this.subCursor;
        if (sel) {
          this.menuPanel.fillStyle(0x9a7828, 0.25);
          this.menuPanel.fillRoundedRect(px+4, py+i*rowH+4, pw-8, rowH-8, 5);
        }
        const label = tgt.isEnemy ? tgt.e.name : tgt.m.name;
        const t = this.add.text(px+18, ty, (sel?'▶ ':'')+label, {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
        }).setDepth(5);
        this.menuTexts.push(t);
      });
    }
  }

  _addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 2) this.log.pop();
    this.logText.setText(this.log[0] || '');
  }

  // ── Battle logic ──────────────────────────────────────
  _calcDmg(atk, def, pow, pierce=0) {
    const effDef = Math.floor(def * (1 - pierce));
    let dmg = Math.max(1, Math.floor(atk * pow - effDef * 0.7));
    return Math.max(1, Math.floor(dmg * (0.85 + Math.random()*0.3)));
  }

  _flashEnemy(idx) {
    const sp = this.enemySprites[idx];
    if (!sp) return;
    let c = 0;
    this.time.addEvent({ delay:80, repeat:5, callback:() => {
      c++; sp.g.setAlpha(c%2===0?1:0.3);
      if (c>=6) sp.g.setAlpha(sp.e.dead?0:1);
    }});
  }

  _refreshEnemyHp(idx) {
    const sp = this.enemySprites[idx];
    if (!sp) return;
    sp.hp.destroy();
    const e  = sp.e;
    const sz = e.sz || 28;
    sp.hp = mkBar(this, sp.x-sz, this.groundY+6, sz*2, 7, e.hp, e.maxHp, 0xe04040);
    if (e.dead) { sp.g.setAlpha(0); sp.lbl.setAlpha(0.3); }
    this._drawEnemy(sp.g, e, sp.x, sp.y);
  }

  _heroAct(cmd, skillId=null, itemId=null, targetIdx=null) {
    const actor = this.party[this.actorIdx];
    this.waiting = true;

    const doAfter = (msg) => {
      this._addLog(msg);
      this._rebuildStatus();
      this._rebuildMenu();
      this.time.delayedCall(600, () => { this.waiting = false; this._nextActor(); });
    };

    if (cmd === 'defend') { actor.status.push('defend'); doAfter(`${actor.name} 防禦！`); return; }
    if (cmd === 'flee') {
      if (Math.random() < 0.5) { this._addLog('成功逃跑！'); this.time.delayedCall(500, () => this.scene.start('WorldScene')); }
      else doAfter('逃跑失敗！');
      return;
    }
    if (cmd === 'attack') {
      const tgt = this.enemies[targetIdx];
      const st  = calcStats(actor);
      const dmg = this._calcDmg(st.atk, tgt.def, 1.0);
      tgt.hp = Math.max(0, tgt.hp - dmg);
      if (tgt.hp === 0) { tgt.dead = true; Sound?.play('enemyDead'); } else Sound?.play('hit');
      this._flashEnemy(targetIdx);
      this._refreshEnemyHp(targetIdx);
      doAfter(`${actor.name} 攻擊 ${tgt.name}，造成 ${dmg} 點傷害！`);
      return;
    }
    if (cmd === 'skill') {
      const sk = SKILLS[skillId];
      if (!sk) { doAfter('…'); return; }
      if (actor.mp < sk.mp) { this._addLog('靈力不足！'); this.waiting = false; return; }
      actor.mp = Math.max(0, actor.mp - sk.mp);
      const st = calcStats(actor);
      let msg = '';
      if (sk.type === 'atk') {
        Sound?.play('magic');
        const targets = sk.tgt==='all' ? this.enemies.filter(e=>!e.dead) : [this.enemies[targetIdx]];
        const dmgs = targets.map(tgt => {
          const dmg = this._calcDmg(st.atk, tgt.def, sk.pow, sk.pierce||0);
          tgt.hp = Math.max(0, tgt.hp - dmg);
          if (tgt.hp === 0) tgt.dead = true;
          if (sk.debuff) Object.entries(sk.debuff).forEach(([k,v]) => { for(let j=0;j<v;j++) tgt.status.push(k); });
          return dmg;
        });
        targets.forEach(tgt => this._refreshEnemyHp(this.enemies.indexOf(tgt)));
        this.enemies.forEach((_,i) => this._flashEnemy(i));
        msg = `${actor.name} 施展 ${sk.name}，造成 ${dmgs.join('/')} 點傷害！`;
      } else if (sk.type === 'heal') {
        Sound?.play('heal');
        const targets = sk.tgt==='all' ? this.party.filter(m=>!m.dead) : [this.party[targetIdx]];
        const heals = targets.map(tgt => {
          const s2 = calcStats(tgt);
          const h = Math.floor(s2.atk * sk.pow * (0.9 + Math.random()*0.2));
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + h);
          return h;
        });
        msg = `${actor.name} 施展 ${sk.name}，恢復 ${heals.join('/')} 點生命值！`;
      }
      this._rebuildStatus();
      this._addLog(msg);
      this.time.delayedCall(600, () => { this.waiting = false; this._nextActor(); });
      return;
    }
    if (cmd === 'item') {
      const it  = ITEMS[itemId];
      if (!it) { doAfter('…'); return; }
      const tgt = this.party[targetIdx];
      GS.removeItem(itemId);
      let msg = '';
      if (it.hp)     { tgt.hp = Math.min(tgt.maxHp, tgt.hp + it.hp); msg = `${tgt.name} 恢復了 ${it.hp} HP！`; }
      if (it.mp)     { const s2=calcStats(tgt); tgt.mp = Math.min(s2.maxMp, tgt.mp + it.mp); msg += ` MP+${it.mp}`; }
      if (it.revive && tgt.dead) { tgt.dead=false; tgt.hp=Math.floor(tgt.maxHp*it.revive/100); msg=`${tgt.name} 復活了！`; }
      doAfter(msg || `使用了 ${it.name}！`);
      return;
    }
  }

  _nextActor() {
    const allEnemiesDead = this.enemies.every(e => e.dead);
    const allHeroesDead  = this.party.every(m => m.dead);
    if (allEnemiesDead) { this._winBattle(); return; }
    if (allHeroesDead)  { this._loseBattle(); return; }

    this.actorIdx++;
    if (this.actorIdx >= this.party.length) {
      this._enemyPhase();
    } else {
      while (this.actorIdx < this.party.length && this.party[this.actorIdx].dead) this.actorIdx++;
      if (this.actorIdx >= this.party.length) { this._enemyPhase(); return; }
      this.cursor = 0; this.subMode = null;
      this._rebuildStatus(); this._rebuildMenu();
    }
  }

  _enemyPhase() {
    this.phase = 'enemyTurn';
    this._rebuildMenu();
    let delay = 300;
    const living = this.enemies.filter(e => !e.dead);
    living.forEach(e => {
      this.time.delayedCall(delay, () => {
        if (this.party.every(m => m.dead)) return;
        this._doEnemyAct(e);
      });
      delay += 800;
    });
    this.time.delayedCall(delay + 200, () => {
      this.party.forEach(m => {
        if (m.dead) return;
        if (m.status.includes('poison')) {
          const dmg = Math.max(1, Math.floor(m.maxHp*0.05));
          m.hp = Math.max(1, m.hp - dmg);
          this._addLog(`${m.name} 中毒，損失 ${dmg} HP！`);
        }
        const poisonCount = m.status.filter(s=>s==='poison').length;
        m.status = m.status.filter(s => s!=='defend' && s!=='atkUp' && s!=='poison');
        for (let i = 0; i < poisonCount-1; i++) m.status.push('poison');
      });
      this._rebuildStatus();
      if (this.party.every(m=>m.dead)) { this._loseBattle(); return; }
      this.phase = 'playerTurn';
      this.actorIdx = 0;
      while (this.actorIdx < this.party.length && this.party[this.actorIdx].dead) this.actorIdx++;
      this.cursor = 0; this.subMode = null;
      this._rebuildStatus(); this._rebuildMenu();
    });
  }

  _doEnemyAct(e) {
    const act = ENEMY_ACTS[e.acts[Math.floor(Math.random()*e.acts.length)]];
    if (!act) return;
    const living = this.party.filter(m => !m.dead);
    if (living.length === 0) return;
    const tgt  = living[Math.floor(Math.random()*living.length)];
    const pIdx = this.party.indexOf(tgt);

    if (act.type === 'atk' || act.type === 'drain') {
      let def = tgt.baseDef;
      if (tgt.status.includes('defend')) def = Math.floor(def*1.5);
      const dmg = this._calcDmg(e.atk, def, act.pow||1);
      tgt.hp = Math.max(0, tgt.hp - dmg);
      if (tgt.hp === 0) tgt.dead = true;
      if (act.debuff) Object.entries(act.debuff).forEach(([k,v]) => { for(let i=0;i<v;i++) tgt.status.push(k); });
      if (act.type === 'drain') e.hp = Math.min(e.maxHp, e.hp + Math.floor(dmg*0.5));
      Sound?.play('damage');
      this._addLog(`${e.name} 使用 ${act.name}，${tgt.name} 受到 ${dmg} 點傷害！`);
      const sp = this.partySprites[pIdx];
      if (sp) {
        let c = 0;
        this.time.addEvent({ delay:80, repeat:5, callback:() => {
          c++; sp.g.setAlpha(c%2===0?1:0.3);
          if (c>=6) { sp.g.setAlpha(1); this._drawHero(sp.g, tgt, sp.x, sp.y); }
        }});
      }
    } else if (act.type === 'buff') {
      e.status.push(act.buff||'atkUp');
      this._addLog(`${e.name} 使用 ${act.name}！`);
    }
    this._rebuildStatus();
  }

  _winBattle() {
    this.phase = 'win';
    Sound?.play('victory'); Sound?.stopBgm();
    const expGain  = this.enemies.reduce((s,e) => s+(ENEMIES[e.id]?.exp||0), 0);
    const goldGain = this.enemies.reduce((s,e) => s+(ENEMIES[e.id]?.gold||0), 0);
    GS.gold += goldGain;
    const drops = [];
    this.enemies.forEach(e => {
      (e.drops||[]).forEach(drop => {
        if (Math.random() < drop.r) { GS.addItem(drop.id); drops.push(ITEMS[drop.id]?.name||drop.id); }
      });
    });
    const levelUps = [];
    GS.party.forEach(m => {
      if (m.dead) return;
      m.exp += expGain;
      while (m.exp >= expForLevel(m.lv)) {
        GS.levelUp(m); levelUps.push(m.name);
        Sound?.play('levelUp');
        if (m.lv >= 5)  Achieve?.unlock('level_5');
        if (m.lv >= 10) Achieve?.unlock('level_10');
      }
    });
    GS.party.forEach((gm, i) => { if (this.party[i]) Object.assign(gm, this.party[i]); });
    let msg = `戰鬥勝利！獲得 ${expGain} EXP、${goldGain} 靈石。`;
    if (drops.length)    msg += ` 獲得：${drops.join('、')}。`;
    if (levelUps.length) msg += ` ${levelUps.join('、')} 升級！`;
    this._addLog(msg);
    this._rebuildStatus();

    // Achievements
    Achieve?.unlock('first_blood');
    if (GS.gold >= 100)  Achieve?.unlock('gold_100');
    if (GS.gold >= 1000) Achieve?.unlock('gold_1000');
    if (GS.battleData?.isBoss) { Achieve?.unlock('boss_slayer'); this._submitLeaderboard(); }
    if (this.party.some(m => m.hp === 1 && !m.dead)) Achieve?.unlock('survivor');

    this.time.delayedCall(2000, () => this.scene.start('WorldScene'));
  }

  _submitLeaderboard() {
    const leader = GS.party.find(m => !m.dead) || GS.party[0];
    const maxLv  = GS.party.reduce((mx, m) => Math.max(mx, m.lv || 1), 1);
    const SUPA_URL = 'https://wbamdjgcoezevimohlcb.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW1kamdjb2V6ZXZpbW9obGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mzk1NDQsImV4cCI6MjA5MTExNTU0NH0.0YZUVDiCFYVDMDo20aG4sSBcON8SXoET6vEiX5NCEbs';
    fetch(`${SUPA_URL}/rest/v1/leaderboard`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:  leader?.name || '勇者',
        level: maxLv,
        gold:  GS.gold || 0,
        kills: 1,
      }),
    }).catch(() => {});
  }

  _loseBattle() {
    this.phase = 'lose';
    Sound?.play('dead'); Sound?.stopBgm();
    this._addLog('全員陣亡…');
    this.time.delayedCall(2000, () => { GS.init(); this.scene.start('TitleScene'); });
  }

  // ── Input ─────────────────────────────────────────────
  update() {
    if (this.waiting || this.phase !== 'playerTurn') return;
    const actor = this.party[this.actorIdx];
    if (!actor || actor.dead) { this._nextActor(); return; }

    const okPad   = !!window.PAD?.ok;   if (okPad   && window.PAD) window.PAD.ok   = false;
    const backPad = !!window.PAD?.menu; if (backPad && window.PAD) window.PAD.menu = false;
    const upPad   = !!window.PAD?.up;   if (upPad   && window.PAD) window.PAD.up   = false;
    const dnPad   = !!window.PAD?.down; if (dnPad   && window.PAD) window.PAD.down = false;
    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up)   || upPad;
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down) || dnPad;
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter) || okPad;
    const back = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc)  || backPad;

    if (!this.subMode) {
      if (up)   { this.cursor=(this.cursor-1+5)%5; this._rebuildMenu(); }
      if (down) { this.cursor=(this.cursor+1)%5;   this._rebuildMenu(); }
      if (ok) {
        if (this.cursor===0) {
          const alive = this.enemies.filter(e=>!e.dead);
          if (alive.length===1) { this._heroAct('attack',null,null,this.enemies.indexOf(alive[0])); }
          else { this.subMode='target'; this.subCursor=0; this.targetList=alive.map(e=>({isEnemy:true,e})); this._rebuildMenu(); }
        } else if (this.cursor===1) { this.subMode='skill'; this.subCursor=0; this._rebuildMenu(); }
        else if (this.cursor===2)   { this.subMode='item';  this.subCursor=0; this._rebuildMenu(); }
        else if (this.cursor===3)   { this._heroAct('defend'); }
        else if (this.cursor===4)   { this._heroAct('flee'); }
      }
    } else if (this.subMode === 'skill') {
      const skills = actor.skills.map(sk=>SKILLS[sk]).filter(Boolean);
      if (up)   { this.subCursor=(this.subCursor-1+skills.length)%skills.length; this._rebuildMenu(); }
      if (down) { this.subCursor=(this.subCursor+1)%skills.length; this._rebuildMenu(); }
      if (back) { this.subMode=null; this._rebuildMenu(); }
      if (ok) {
        const sk   = skills[this.subCursor];
        const skId = actor.skills[this.subCursor];
        if (!sk || actor.mp < sk.mp) { this._addLog('靈力不足！'); return; }
        if (sk.tgt==='all') { this._heroAct('skill',skId,null,0); this.subMode=null; }
        else if (sk.type==='heal') {
          this.targetList=this.party.filter(m=>!m.dead).map(m=>({isEnemy:false,m}));
          this.subMode='target'; this.subCursor=0; this._pendingSkill=skId; this._rebuildMenu();
        } else {
          const alive=this.enemies.filter(e=>!e.dead);
          if (alive.length===1) { this._heroAct('skill',skId,null,this.enemies.indexOf(alive[0])); this.subMode=null; }
          else { this.targetList=alive.map(e=>({isEnemy:true,e})); this.subMode='target'; this.subCursor=0; this._pendingSkill=skId; this._rebuildMenu(); }
        }
      }
    } else if (this.subMode === 'item') {
      const items = Object.entries(GS.inventory).filter(([id,n])=>n>0&&ITEMS[id]?.cat==='use');
      if (up)   { this.subCursor=(this.subCursor-1+Math.max(1,items.length))%Math.max(1,items.length); this._rebuildMenu(); }
      if (down) { this.subCursor=(this.subCursor+1)%Math.max(1,items.length); this._rebuildMenu(); }
      if (back) { this.subMode=null; this._rebuildMenu(); }
      if (ok && items.length>0) {
        const [itemId]=items[this.subCursor];
        this.targetList=this.party.filter(m=>!m.dead).map(m=>({isEnemy:false,m}));
        this.subMode='target'; this.subCursor=0; this._pendingItem=itemId; this._rebuildMenu();
      }
    } else if (this.subMode === 'target') {
      if (up)   { this.subCursor=(this.subCursor-1+this.targetList.length)%this.targetList.length; this._rebuildMenu(); }
      if (down) { this.subCursor=(this.subCursor+1)%this.targetList.length; this._rebuildMenu(); }
      if (back) { this.subMode=this._pendingItem?'item':this._pendingSkill?'skill':null; this._rebuildMenu(); }
      if (ok) {
        const tgt=this.targetList[this.subCursor];
        if (this._pendingSkill) {
          const idx=tgt.isEnemy?this.enemies.indexOf(tgt.e):this.party.indexOf(tgt.m);
          this._heroAct('skill',this._pendingSkill,null,idx); this._pendingSkill=null; this.subMode=null;
        } else if (this._pendingItem) {
          const idx=this.party.indexOf(tgt.m);
          this._heroAct('item',null,this._pendingItem,idx); this._pendingItem=null; this.subMode=null;
        } else {
          this._heroAct('attack',null,null,this.enemies.indexOf(tgt.e)); this.subMode=null;
        }
      }
    }
  }
}
