'use strict';
// Element colour/text maps for skill visuals
const ELEM_CLR = { fire:0xff5020, ice:0x40c8ff, thunder:0xffee20, wind:0x40e880, light:0x88ffcc, none:0x8888ff };
const ELEM_TXT = { fire:'#ff8040', ice:'#60ccff', thunder:'#ffe040', wind:'#80ee80', light:'#ccffcc', none:'#aaaaff' };
// ══════════════════════════════════════════════════════════
class BattleScene extends Phaser.Scene {
  constructor() { super('BattleScene'); }

  create() {
    Sound?.bgm('battle');
    const W = this.scale.width, H = this.scale.height;
    this.W = W; this.H = H;
    this.phase = 'intro';
    this.actorIdx = 0;
    this.cursor = 0;
    this.subCursor = 0;
    this.subMode = null;
    this.targetList = [];
    this.log = [];
    this.waiting = false;
    this._t = 0;

    this.party   = GS.party.map(m => ({ ...m, status:[...m.status] }));
    this.enemies = GS.battleData.enemies.map(e => ({ ...e, status:[...e.status] }));
    this.groundY = Math.floor(H * 0.56);

    // ── Background ──────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0c0418, 0x100820, 0x040210, 0x060316, 1);
    bg.fillRect(0, 0, W, H);

    // Moon + glow
    const moonG = this.add.graphics();
    moonG.fillStyle(0xfff4d0, 0.06); moonG.fillCircle(W*0.82, H*0.13, H*0.14);
    moonG.fillStyle(0xfff4d0, 1);    moonG.fillCircle(W*0.82, H*0.13, H*0.048);
    moonG.fillStyle(0xffffff, 0.2);  moonG.fillCircle(W*0.808, H*0.118, H*0.02);
    moonG.fillStyle(0x0c0418, 1);    moonG.fillCircle(W*0.836, H*0.12, H*0.042);

    // Stars (twinkling via update)
    this._stars = [];
    this._starG = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      this._stars.push({
        x: Math.random()*W, y: Math.random()*this.groundY*0.92,
        r: 0.3 + Math.random()*1.3,
        phase: Math.random()*Math.PI*2,
        speed: 0.02 + Math.random()*0.04,
      });
    }

    // Mountains back
    const mtn1 = this.add.graphics();
    mtn1.fillStyle(0x180c2a, 1);
    const pts1 = [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38]];
    mtn1.beginPath();
    pts1.forEach(([rx,ry],i) => { const px=rx*W,py=ry*this.groundY; i===0?mtn1.moveTo(px,py):mtn1.lineTo(px,py); });
    mtn1.lineTo(W,this.groundY); mtn1.lineTo(0,this.groundY); mtn1.closePath(); mtn1.fillPath();

    // Mountains front
    const mtn2 = this.add.graphics();
    mtn2.fillStyle(0x1e1030, 1);
    const pts2 = [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52]];
    mtn2.beginPath();
    pts2.forEach(([rx,ry],i) => { const px=rx*W,py=ry*this.groundY; i===0?mtn2.moveTo(px,py):mtn2.lineTo(px,py); });
    mtn2.lineTo(W,this.groundY); mtn2.lineTo(0,this.groundY); mtn2.closePath(); mtn2.fillPath();

    // Ground
    const gndG = this.add.graphics();
    gndG.fillGradientStyle(0x1c1008, 0x1c1008, 0x080604, 0x080604, 1);
    gndG.fillRect(0, this.groundY, W, H - this.groundY);
    gndG.lineStyle(2, 0xb07828, 0.65); gndG.lineBetween(0, this.groundY, W, this.groundY);
    gndG.lineStyle(1, 0x3a2606, 0.4);
    for (let i = 1; i < 6; i++) gndG.lineBetween(0, this.groundY+i*7, W, this.groundY+i*7);

    // Arena glow
    const arenaG = this.add.graphics();
    arenaG.fillStyle(0x280840, 0.25);
    arenaG.fillEllipse(W*0.38, this.groundY+3, W*0.65, 28);

    // ── Enemy sprites (off-screen right for intro) ────────
    this.enemySprites = [];
    const eCount = this.enemies.length;
    this.enemies.forEach((e, i) => {
      const ex = eCount === 1 ? W*0.22 : W*(0.13 + i*0.18);
      const sz = e.sz || 28;
      const g = this.add.graphics();
      this._drawEnemy(g, e);
      g.setPosition(W + 150 + i*60, this.groundY);
      const hp  = mkBar(this, ex-sz, this.groundY+6, sz*2, 7, e.hp, e.maxHp, 0xe04040);
      hp.setAlpha(0);
      const lbl = this.add.text(ex, this.groundY+20, e.name, {
        fontSize: Math.max(11,Math.floor(H*0.02))+'px',
        fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5,0.5).setAlpha(0);
      this.enemySprites.push({ g, hp, lbl, x:ex, y:this.groundY, e, statusTxt:null });
    });

    // ── Hero sprites (off-screen left for intro) ──────────
    this.partySprites = [];
    this.party.forEach((m, i) => {
      const hx = W*(0.62 + i*0.13);
      const g = this.add.graphics();
      this._drawHero(g, m);
      g.setPosition(-150 - i*40, this.groundY);
      this.partySprites.push({ g, x:hx, y:this.groundY, m });
    });

    // ── Log strip ────────────────────────────────────────
    const logY = this.groundY + 34;
    const logH = Math.max(32, Math.floor(H*0.065));
    const logBg = this.add.graphics();
    logBg.fillStyle(0x050410, 0.93); logBg.fillRect(0, logY, W, logH);
    logBg.lineStyle(1, 0x5a3e10, 0.8);
    logBg.lineBetween(0, logY, W, logY); logBg.lineBetween(0, logY+logH, W, logY+logH);
    this.logText = this.add.text(14, logY+logH/2, '', {
      fontSize: Math.max(12,Math.floor(H*0.023))+'px',
      fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width: W-28 },
    }).setOrigin(0,0.5).setDepth(5);

    // ── UI panels ────────────────────────────────────────
    this.uiY    = logY + logH + 2;
    this.uiH    = H - this.uiY;
    this.splitX = Math.floor(W*0.44);
    this.statusPanel = this.add.graphics(); this.statusTexts = []; this._rebuildStatus();
    this.menuPanel   = this.add.graphics(); this.menuTexts   = []; this._rebuildMenu();

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

    // ── Intro animation ───────────────────────────────────
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.enemySprites.forEach((sp, i) => {
      this.tweens.add({
        targets: sp.g, x: sp.x, duration: 520, ease: 'Back.easeOut', delay: 80 + i*80,
        onComplete: () => this.tweens.add({ targets:[sp.hp,sp.lbl], alpha:1, duration:300 }),
      });
    });
    this.partySprites.forEach((sp, i) => {
      this.tweens.add({ targets: sp.g, x: sp.x, duration: 520, ease: 'Back.easeOut', delay: 80 + i*80 });
    });
    this.time.delayedCall(900, () => {
      this.phase = 'playerTurn';
      this._addLog(this.enemies.length > 1
        ? `遭遇了 ${this.enemies.map(e=>e.name).join('、')}！`
        : `遭遇了 ${this.enemies[0].name}！`);
      if (GS.battleData?.isBoss) {
        this._shake(0.012, 500);
        const bt = this.add.text(this.W/2, this.H*0.32, this.enemies[0].name, {
          fontSize: Math.floor(this.H*0.065)+'px',
          fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#ff4040', stroke:'#600000', strokeThickness:6,
        }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(1.6);
        this.tweens.add({ targets:bt, alpha:1, scaleX:1, scaleY:1, duration:450, ease:'Back.easeOut',
          onComplete:()=>this.time.delayedCall(900, ()=>{
            this.tweens.add({ targets:bt, alpha:0, y:bt.y-18, duration:380, onComplete:()=>bt.destroy() });
          }),
        });
      }
    });
  }

  // ── Sprite drawing (local 0,0) ────────────────────────
  _drawEnemy(g, e) {
    g.clear();
    if (e.dead) return;
    const sz = e.sz || 28, col = e.color || 0x884422;
    const cy = -sz*0.85, hy = -sz*1.8, hr = sz*0.62;

    g.fillStyle(0x000000, 0.28); g.fillEllipse(0, 3, sz*2.4, sz*0.3);
    g.fillStyle(col, 1);         g.fillEllipse(0, cy, sz*2.0, sz*1.4);
    g.fillStyle(0xffffff, 0.07); g.fillEllipse(-sz*0.15, cy-sz*0.18, sz*0.9, sz*0.5);
    g.lineStyle(1, 0x000000, 0.35); g.strokeEllipse(0, cy, sz*2.0, sz*1.4);

    g.fillStyle(col, 1);         g.fillCircle(0, hy, hr);
    g.fillStyle(0xffffff, 0.06); g.fillCircle(-hr*0.3, hy-hr*0.3, hr*0.45);
    g.lineStyle(1, 0x000000, 0.35); g.strokeCircle(0, hy, hr);

    if (!e.boss) {
      g.fillStyle(0x604820, 1);
      g.fillTriangle(-sz*0.27, hy-hr*0.82, -sz*0.52, hy-hr*1.55, -sz*0.02, hy-hr*0.72);
      g.fillTriangle( sz*0.27, hy-hr*0.82,  sz*0.52, hy-hr*1.55,  sz*0.02, hy-hr*0.72);
    }

    const er = sz*0.11;
    g.fillStyle(0xff0000, 0.28); g.fillCircle(-sz*0.24, hy-sz*0.06, er*2.0); g.fillCircle(sz*0.24, hy-sz*0.06, er*2.0);
    g.fillStyle(0xff2020, 1);    g.fillCircle(-sz*0.24, hy-sz*0.06, er);     g.fillCircle(sz*0.24, hy-sz*0.06, er);
    g.fillStyle(0x080000, 1);    g.fillCircle(-sz*0.22, hy-sz*0.05, er*0.5); g.fillCircle(sz*0.26, hy-sz*0.05, er*0.5);
    g.fillStyle(0xffffff, 1);    g.fillCircle(-sz*0.28, hy-sz*0.08, er*0.28);g.fillCircle(sz*0.20, hy-sz*0.08, er*0.28);

    g.fillStyle(0x180000, 1); g.fillEllipse(0, hy+sz*0.28, sz*0.55, sz*0.2);
    g.fillStyle(0xeeeeee, 1);
    g.fillTriangle(-sz*0.16, hy+sz*0.20, -sz*0.06, hy+sz*0.38,  sz*0.04, hy+sz*0.20);
    g.fillTriangle( sz*0.05, hy+sz*0.20,  sz*0.15, hy+sz*0.38,  sz*0.25, hy+sz*0.20);

    g.fillStyle(col, 1);
    g.fillEllipse(-sz*1.1, cy+sz*0.08, sz*0.55, sz*0.75);
    g.fillEllipse( sz*1.1, cy+sz*0.08, sz*0.55, sz*0.75);
    const cly = cy + sz*0.42;
    g.fillStyle(0x604820, 1);
    g.fillTriangle(-sz*1.28, cly-sz*0.05, -sz*1.08, cly+sz*0.22, -sz*0.88, cly-sz*0.05);
    g.fillTriangle( sz*0.88, cly-sz*0.05,  sz*1.08, cly+sz*0.22,  sz*1.28, cly-sz*0.05);

    if (e.boss) {
      g.fillStyle(0xffd700, 1);
      g.fillRect(-sz*0.56, hy-hr*1.08, sz*1.12, sz*0.22);
      g.fillTriangle(-sz*0.5, hy-hr*1.08, -sz*0.3, hy-hr*1.72, -sz*0.1, hy-hr*1.08);
      g.fillTriangle(-sz*0.1, hy-hr*1.08,  sz*0.10,hy-hr*1.95,  sz*0.3, hy-hr*1.08);
      g.fillTriangle( sz*0.1, hy-hr*1.08,  sz*0.34,hy-hr*1.68,  sz*0.56,hy-hr*1.08);
      g.fillStyle(0xff4040, 1); g.fillCircle(0, hy-hr*1.2, sz*0.12);
    }
  }

  _drawHero(g, m) {
    g.clear();
    const s = 14, col = m.dead ? 0x282828 : (m.color || 0x4a9eff);
    g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 2, s*2.2, s*0.45);
    if (m.dead) {
      g.fillStyle(0x282828, 0.75); g.fillEllipse(-s*0.4, -s*0.35, s*2.6, s*0.85);
      g.lineStyle(1, 0xff4040, 0.75); g.lineBetween(-11,-8,11,8); g.lineBetween(11,-8,-11,8);
      return;
    }
    g.fillStyle(col, 0.65); g.fillRect(-s*0.5,-s*0.85,s*0.42,s*0.85); g.fillRect(s*0.08,-s*0.85,s*0.42,s*0.85);
    g.fillStyle(col, 1);
    g.fillTriangle(-s*0.65,-s*0.85, s*0.65,-s*0.85,  s*0.48,-s*2.25);
    g.fillTriangle(-s*0.65,-s*0.85,-s*0.48,-s*2.25,  s*0.48,-s*2.25);
    g.fillStyle(0xffffff, 0.1); g.fillTriangle(-s*0.22,-s*0.95, s*0.22,-s*0.95, 0,-s*2.1);
    g.lineStyle(1.5, 0xffd700, 0.4);
    g.lineBetween(-s*0.48,-s*2.25, 0,-s*2.42); g.lineBetween(s*0.48,-s*2.25, 0,-s*2.42);
    g.fillStyle(0x906030, 1); g.fillRect(-s*0.65,-s*1.05,s*1.3,s*0.2);
    g.fillStyle(col, 0.8); g.fillRect(-s*0.95,-s*2.2,s*0.33,s*0.85); g.fillRect(s*0.62,-s*2.2,s*0.33,s*0.85);
    g.fillStyle(0xd4a078, 1);
    g.fillRect(-s*0.18,-s*2.38,s*0.36,s*0.18);
    g.fillCircle(0,-s*2.82,s*0.65);
    g.lineStyle(0.8, 0xa07050, 0.4); g.strokeCircle(0,-s*2.82,s*0.65);
    g.fillStyle(0x1c0c08, 1);
    g.fillCircle(0,-s*3.15,s*0.65); g.fillRect(-s*0.66,-s*3.0,s*1.32,s*0.32);
    g.fillRect(-s*0.70,-s*2.98,s*0.19,s*0.48); g.fillRect(s*0.51,-s*2.98,s*0.19,s*0.48);
    g.fillStyle(0x0c0808, 1); g.fillCircle(-s*0.26,-s*2.80,s*0.12); g.fillCircle(s*0.26,-s*2.80,s*0.12);
    g.fillStyle(0xffffff, 1); g.fillCircle(-s*0.29,-s*2.83,s*0.05); g.fillCircle(s*0.23,-s*2.83,s*0.05);
    if (m.shape === 'sword') {
      g.lineStyle(2.5, 0xd8d8d8, 1); g.lineBetween(s*0.98,-s*3.25, s*0.98,-s*0.95);
      g.lineStyle(2, 0xffd700, 1);   g.lineBetween(s*0.64,-s*2.65, s*1.32,-s*2.65);
      g.fillStyle(0xa08030, 1);      g.fillRect(s*0.88,-s*1.08,s*0.2,s*0.2);
    } else if (m.shape === 'mage') {
      g.lineStyle(2, 0xb09050, 1); g.lineBetween(-s*1.18,0,-s*1.18,-s*3.4);
      g.fillStyle(0x7888ff, 0.85); g.fillCircle(-s*1.18,-s*3.62,s*0.38);
      g.fillStyle(0xaabbff, 0.6);  g.fillCircle(-s*1.28,-s*3.78,s*0.18);
      g.fillStyle(0x4455ff, 0.15); g.fillCircle(-s*1.18,-s*3.62,s*0.72);
    } else if (m.shape === 'archer') {
      g.lineStyle(2, 0x9a6830, 1);
      g.beginPath(); g.arc(s*1.22,-s*1.8,s*0.98,-Math.PI*0.55,Math.PI*0.55); g.strokePath();
      g.lineStyle(1, 0xd8c8a0, 0.75); g.lineBetween(s*1.22,-s*2.6,s*1.22,-s*1.0);
    }
  }

  // ── AAA Visual effects ────────────────────────────────
  _floatText(x, y, text, color='#ffffff', size=18) {
    const t = this.add.text(x, y, text, {
      fontSize: size+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color, stroke:'#000', strokeThickness:3,
    }).setOrigin(0.5,0.5).setDepth(20);
    this.tweens.add({ targets:t, y:y-65, alpha:0, scaleX:1.3, scaleY:1.3, duration:1100, ease:'Power2', onComplete:()=>t.destroy() });
  }

  _shake(intensity=0.005, duration=260) {
    this.cameras.main.shake(duration, intensity);
  }

  _spawnParticles(x, y, color, count=8, spread=40) {
    for (let i = 0; i < count; i++) {
      const p = this.add.graphics();
      p.fillStyle(color, 0.9); p.fillCircle(0, 0, 2.5 + Math.random()*3.5);
      p.setPosition(x, y).setDepth(18);
      const angle = Math.PI*2*i/count + (Math.random()-0.5)*0.8;
      const dist  = spread * (0.4 + Math.random()*0.8);
      this.tweens.add({
        targets:p, x:x+Math.cos(angle)*dist, y:y+Math.sin(angle)*dist-15,
        alpha:0, scaleX:0.1, scaleY:0.1, duration:500+Math.random()*300, ease:'Power2',
        onComplete:()=>p.destroy(),
      });
    }
  }

  _animHeroAttack(sp, targetSp, onHit, onDone) {
    if (!sp || !targetSp) { onHit&&onHit(); onDone&&onDone(); return; }
    const origX  = sp.g.x;
    const targetX = targetSp.g.x + 60;
    this.tweens.add({
      targets:sp.g, x:targetX, duration:180, ease:'Power3.easeIn',
      onComplete:() => {
        onHit && onHit();
        this.tweens.add({ targets:sp.g, x:origX, duration:280, ease:'Back.easeOut', onComplete:onDone });
      },
    });
  }

  _animEnemyAttack(sp, targetSp, onHit, onDone) {
    if (!sp || !targetSp) { onHit&&onHit(); onDone&&onDone(); return; }
    const origX   = sp.g.x;
    const targetX = targetSp.g.x - 60;
    this.tweens.add({
      targets:sp.g, x:targetX, duration:180, ease:'Power3.easeIn',
      onComplete:() => {
        onHit && onHit();
        this.tweens.add({ targets:sp.g, x:origX, duration:280, ease:'Back.easeOut', onComplete:onDone });
      },
    });
  }

  // ── Status panel ──────────────────────────────────────
  _rebuildStatus() {
    this.statusPanel.clear();
    this.statusTexts.forEach(t => t.destroy());
    this.statusTexts = [];
    const px=0, py=this.uiY, pw=this.splitX, ph=this.uiH;
    this.statusPanel.fillStyle(0x080612, 0.97); this.statusPanel.fillRect(px,py,pw,ph);
    this.statusPanel.lineStyle(1,0x7a5c1e,0.8); this.statusPanel.strokeRect(px,py,pw,ph);
    this.statusPanel.lineStyle(1,0x3a2a0c,0.5); this.statusPanel.strokeRect(px+2,py+2,pw-4,ph-4);
    const rowH=Math.floor(ph/this.party.length), fs=Math.max(11,Math.floor(rowH*0.28)), fsS=Math.max(9,fs-3);
    this.party.forEach((m, i) => {
      const ry=py+i*rowH, dead=m.dead, sel=(i===this.actorIdx)&&(this.phase==='playerTurn');
      if (sel) { this.statusPanel.fillStyle(0x9a7828,0.14); this.statusPanel.fillRect(px+2,ry,pw-4,rowH); }
      if (i>0) { this.statusPanel.lineStyle(1,0x3a2808,0.5); this.statusPanel.lineBetween(px+6,ry,px+pw-6,ry); }
      const ty=ry+rowH*0.18;
      const nameT=this.add.text(px+10,ty,(sel?'▶ ':'  ')+m.name,{
        fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:dead?'#484040':sel?'#ffd700':'#e8c060',stroke:'#000',strokeThickness:fs>13?2:1,
      }).setDepth(5);
      this.statusTexts.push(nameT);
      const barW=Math.floor(pw*0.52), bx=px+10, by1=ry+rowH*0.46, by2=ry+rowH*0.70, bh2=Math.max(5,Math.floor(rowH*0.13));
      const st=calcStats(m);
      const hpBar=mkBar(this,bx,by1,barW,bh2,m.hp,m.maxHp,0xe04040); hpBar.setDepth(5); this.statusTexts.push(hpBar);
      const mpBar=mkBar(this,bx,by2,barW,bh2,m.mp,st.maxMp,0x4060e0); mpBar.setDepth(5); this.statusTexts.push(mpBar);
      const hpT=this.add.text(bx+barW+5,by1+bh2/2,`${m.hp}`,{fontSize:fsS+'px',fontFamily:'monospace',color:'#e05050',stroke:'#000',strokeThickness:1}).setOrigin(0,0.5).setDepth(5);
      const mpT=this.add.text(bx+barW+5,by2+bh2/2,`${m.mp}`,{fontSize:fsS+'px',fontFamily:'monospace',color:'#5070e0',stroke:'#000',strokeThickness:1}).setOrigin(0,0.5).setDepth(5);
      this.statusTexts.push(hpT,mpT);
      if (m.status.length>0) {
        const stT=this.add.text(px+pw-8,ty,m.status.slice(0,2).join(' '),{fontSize:fsS+'px',fontFamily:'serif',color:'#c050e8',stroke:'#000',strokeThickness:1}).setOrigin(1,0).setDepth(5);
        this.statusTexts.push(stT);
      }
    });
  }

  // ── Menu panel ────────────────────────────────────────
  _rebuildMenu() {
    this.menuPanel.clear(); this.menuTexts.forEach(t=>t.destroy()); this.menuTexts=[];
    if (this.phase !== 'playerTurn') return;
    const px=this.splitX+2, py=this.uiY, pw=this.W-this.splitX-2, ph=this.uiH;
    this.menuPanel.fillStyle(0x080612,0.97); this.menuPanel.fillRect(px,py,pw,ph);
    this.menuPanel.lineStyle(1,0x7a5c1e,0.8); this.menuPanel.strokeRect(px,py,pw,ph);
    this.menuPanel.lineStyle(1,0x3a2a0c,0.5); this.menuPanel.strokeRect(px+2,py+2,pw-4,ph-4);
    const actor=this.party[this.actorIdx];
    if (!actor||actor.dead) return;
    const fs=Math.max(13,Math.floor(ph*0.18));
    if (!this.subMode) {
      const cmds=['攻擊','技能','道具','防禦','逃跑'], colW=Math.floor(pw/2), rowH=Math.floor(ph/3);
      cmds.forEach((cmd,i) => {
        const col=Math.floor(i/3), row=i%3, tx=px+col*colW+20, ty=py+row*rowH+rowH*0.5, sel=i===this.cursor;
        if (sel) {
          this.menuPanel.fillStyle(0x9a7828,0.25); this.menuPanel.fillRoundedRect(px+col*colW+4,py+row*rowH+4,colW-8,rowH-8,5);
          this.menuPanel.lineStyle(1,0xb09030,0.6); this.menuPanel.strokeRoundedRect(px+col*colW+4,py+row*rowH+4,colW-8,rowH-8,5);
        }
        const t=this.add.text(tx,ty,(sel?'▶ ':'')+cmd,{fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:sel?'#ffd700':'#c8a060',stroke:'#000',strokeThickness:sel?3:2}).setDepth(5);
        if (sel) t.setShadow(0,0,'#ffd700',8,true,true);
        this.menuTexts.push(t);
      });
    } else if (this.subMode==='skill') {
      const skills=actor.skills.map(sk=>SKILLS[sk]).filter(Boolean);
      const rowH=Math.max(30,Math.floor(ph/Math.max(4,skills.length)));
      skills.forEach((sk,i) => {
        const ty=py+i*rowH+rowH*0.5, sel=i===this.subCursor, mpOk=actor.mp>=sk.mp;
        if (sel) { this.menuPanel.fillStyle(0x9a7828,0.25); this.menuPanel.fillRoundedRect(px+4,py+i*rowH+4,pw-8,rowH-8,5); }
        const t=this.add.text(px+18,ty,(sel?'▶ ':'')+sk.name,{fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:mpOk?(sel?'#ffd700':'#c8a060'):'#555',stroke:'#000',strokeThickness:2}).setDepth(5);
        const mpT=this.add.text(px+pw-14,ty,`MP:${sk.mp}`,{fontSize:Math.max(10,fs-3)+'px',fontFamily:'monospace',color:'#5080e8',stroke:'#000',strokeThickness:1}).setOrigin(1,0.5).setDepth(5);
        this.menuTexts.push(t,mpT);
      });
    } else if (this.subMode==='item') {
      const items=Object.entries(GS.inventory).filter(([id,n])=>n>0&&ITEMS[id]?.cat==='use');
      if (items.length===0) {
        this.menuTexts.push(this.add.text(px+pw/2,py+ph/2,'── 無道具 ──',{fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#555',stroke:'#000',strokeThickness:1}).setOrigin(0.5,0.5).setDepth(5));
      } else {
        const rowH=Math.max(30,Math.floor(ph/Math.max(4,items.length)));
        items.forEach(([id,n],i) => {
          const ty=py+i*rowH+rowH*0.5, sel=i===this.subCursor, it=ITEMS[id];
          if (sel) { this.menuPanel.fillStyle(0x9a7828,0.25); this.menuPanel.fillRoundedRect(px+4,py+i*rowH+4,pw-8,rowH-8,5); }
          this.menuTexts.push(this.add.text(px+18,ty,(sel?'▶ ':'')+it.name+` ×${n}`,{fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:sel?'#ffd700':'#c8a060',stroke:'#000',strokeThickness:2}).setDepth(5));
        });
      }
    } else if (this.subMode==='target') {
      const rowH=Math.max(30,Math.floor(ph/Math.max(3,this.targetList.length)));
      this.targetList.forEach((tgt,i) => {
        const ty=py+i*rowH+rowH*0.5, sel=i===this.subCursor, label=tgt.isEnemy?tgt.e.name:tgt.m.name;
        if (sel) { this.menuPanel.fillStyle(0x9a7828,0.25); this.menuPanel.fillRoundedRect(px+4,py+i*rowH+4,pw-8,rowH-8,5); }
        this.menuTexts.push(this.add.text(px+18,ty,(sel?'▶ ':'')+label,{fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:sel?'#ffd700':'#c8a060',stroke:'#000',strokeThickness:2}).setDepth(5));
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
    const effDef = Math.floor(def*(1-pierce));
    return Math.max(1, Math.floor(Math.max(1,Math.floor(atk*pow-effDef*0.7))*(0.85+Math.random()*0.3)));
  }

  _flashEnemy(idx) {
    const sp=this.enemySprites[idx]; if (!sp) return;
    let c=0;
    this.time.addEvent({ delay:80, repeat:5, callback:() => {
      c++; sp.g.setAlpha(c%2===0?1:0.3);
      if (c>=6) sp.g.setAlpha(sp.e.dead?0:1);
    }});
  }

  _refreshEnemyHp(idx) {
    const sp=this.enemySprites[idx]; if (!sp) return;
    sp.hp.destroy();
    if (sp.statusTxt) { sp.statusTxt.destroy(); sp.statusTxt=null; }
    const e=sp.e, sz=e.sz||28;
    sp.hp=mkBar(this,sp.x-sz,this.groundY+6,sz*2,7,e.hp,e.maxHp,0xe04040);
    this._drawEnemy(sp.g, e);
    if (e.dead) { sp.g.setAlpha(0); sp.lbl.setAlpha(0.3); sp.g.setPosition(sp.x,sp.y); }
    const STATUS_LBL = { poison:'毒', atkUp:'強', slow:'緩', atkDown:'弱' };
    const badges = [...new Set(e.status)].filter(s=>STATUS_LBL[s]);
    if (badges.length>0 && !e.dead) {
      sp.statusTxt = this.add.text(sp.x, this.groundY+16, badges.map(s=>STATUS_LBL[s]).join(' '), {
        fontSize:'11px', fontFamily:'serif', color:'#e090ff', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5,0).setDepth(8);
    }
  }

  _heroAct(cmd, skillId=null, itemId=null, targetIdx=null) {
    const actor=this.party[this.actorIdx];
    this.waiting=true;
    const doAfter=(msg) => {
      this._addLog(msg); this._rebuildStatus(); this._rebuildMenu();
      this.time.delayedCall(480, () => { this.waiting=false; this._nextActor(); });
    };

    if (cmd==='defend') { actor.status.push('defend'); doAfter(`${actor.name} 防禦！`); return; }
    if (cmd==='flee') {
      if (Math.random()<0.5) {
        this._addLog('成功逃跑！');
        this.time.delayedCall(400, () => {
          this.cameras.main.fadeOut(400,0,0,0);
          this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('WorldScene'));
        });
      } else doAfter('逃跑失敗！');
      return;
    }

    if (cmd==='attack') {
      const tgt=this.enemies[targetIdx], st=calcStats(actor);
      const crit=Math.random()<0.08;
      let dmg=this._calcDmg(st.atk,tgt.def,1.0);
      if (crit) dmg=Math.floor(dmg*1.5);
      const heroSp=this.partySprites[this.actorIdx], enemySp=this.enemySprites[targetIdx];
      const onHit=() => {
        tgt.hp=Math.max(0,tgt.hp-dmg);
        if (tgt.hp===0) { tgt.dead=true; Sound?.play('enemyDead'); } else Sound?.play('hit');
        this._flashEnemy(targetIdx); this._refreshEnemyHp(targetIdx);
        this._shake(crit?0.010:0.005);
        const ex=enemySp?enemySp.g.x:sp.x, ey=(enemySp?enemySp.g.y:this.groundY)-(tgt.sz||28)*1.4;
        if (crit) {
          const cf=this.add.graphics(); cf.fillStyle(0xffd700,0); cf.fillRect(0,0,this.W,this.H); cf.setDepth(40);
          this.tweens.add({targets:cf,alpha:0.18,duration:75,yoyo:true,repeat:1,onComplete:()=>cf.destroy()});
          this._floatText(ex,ey,`CRIT! ${dmg}`,'#ffd700',24);
          this._spawnParticles(ex,ey+20,0xffd700,12,55);
        } else {
          this._floatText(ex,ey,String(dmg),'#ff7070',20);
          this._spawnParticles(ex,ey+20,0xff4040,6,35);
        }
        if (tgt.dead) this.time.delayedCall(350,()=>this._spawnParticles(ex,ey+20,tgt.color||0x884422,14,65));
      };
      this._animHeroAttack(heroSp, enemySp, onHit, () => doAfter(
        crit ? `${actor.name} 會心一擊！對 ${tgt.name} 造成 ${dmg} 點傷害！`
             : `${actor.name} 攻擊 ${tgt.name}，造成 ${dmg} 點傷害！`
      ));
      return;
    }

    if (cmd==='skill') {
      const sk=SKILLS[skillId];
      if (!sk) { doAfter('…'); return; }
      if (actor.mp<sk.mp) { this._addLog('靈力不足！'); this.waiting=false; return; }
      actor.mp=Math.max(0,actor.mp-sk.mp);
      const st=calcStats(actor);
      let msg='';
      if (sk.type==='atk') {
        Sound?.play('magic');
        const targets=sk.tgt==='all'?this.enemies.filter(e=>!e.dead):[this.enemies[targetIdx]];
        const dmgs=targets.map(tgt=>{
          const dmg=this._calcDmg(st.atk,tgt.def,sk.pow,sk.pierce||0);
          tgt.hp=Math.max(0,tgt.hp-dmg); if(tgt.hp===0)tgt.dead=true;
          if(sk.debuff)Object.entries(sk.debuff).forEach(([k,v])=>{for(let j=0;j<v;j++)tgt.status.push(k);});
          return dmg;
        });
        targets.forEach((tgt,ti)=>{
          const eIdx=this.enemies.indexOf(tgt), sp=this.enemySprites[eIdx];
          this._refreshEnemyHp(eIdx); this._flashEnemy(eIdx);
          if(sp){
            const ex=sp.g.x,ey=sp.g.y-(tgt.sz||28)*1.4;
            const _ec=ELEM_CLR[sk.elem||'none']||0x8888ff, _et=ELEM_TXT[sk.elem||'none']||'#aaaaff';
            this._floatText(ex,ey,String(dmgs[ti]),_et,20);
            this._spawnParticles(ex,ey+20,_ec,10,45);
          }
        });
        this._shake(0.006);
        msg=`${actor.name} 施展 ${sk.name}，造成 ${dmgs.join('/')} 點傷害！`;
      } else if (sk.type==='heal') {
        Sound?.play('heal');
        const targets=sk.tgt==='all'?this.party.filter(m=>!m.dead):[this.party[targetIdx]];
        const heals=targets.map(tgt=>{
          const s2=calcStats(tgt), h=Math.floor(s2.atk*sk.pow*(0.9+Math.random()*0.2));
          tgt.hp=Math.min(tgt.maxHp,tgt.hp+h);
          const sp=this.partySprites[this.party.indexOf(tgt)];
          if(sp){this._floatText(sp.g.x,sp.g.y-50,`+${h}`,'#88ff88',20);this._spawnParticles(sp.g.x,sp.g.y-20,0x44ff88,8,35);}
          return h;
        });
        GS.flags._healCount=(GS.flags._healCount||0)+targets.length;
        if(GS.flags._healCount>=10)Achieve?.unlock('healer');
        msg=`${actor.name} 施展 ${sk.name}，恢復 ${heals.join('/')} 點生命值！`;
      }
      this._rebuildStatus(); this._addLog(msg);
      this.time.delayedCall(480,()=>{ this.waiting=false; this._nextActor(); });
      return;
    }

    if (cmd==='item') {
      const it=ITEMS[itemId]; if (!it) { doAfter('…'); return; }
      const tgt=this.party[targetIdx]; GS.removeItem(itemId); let msg='';
      if (it.hp)    { tgt.hp=Math.min(tgt.maxHp,tgt.hp+it.hp); msg=`${tgt.name} 恢復了 ${it.hp} HP！`; }
      if (it.mp)    { const s2=calcStats(tgt); tgt.mp=Math.min(s2.maxMp,tgt.mp+it.mp); msg+=` MP+${it.mp}`; }
      if (it.revive&&tgt.dead) { tgt.dead=false; tgt.hp=Math.floor(tgt.maxHp*it.revive/100); msg=`${tgt.name} 復活了！`; }
      const sp=this.partySprites[targetIdx];
      if (sp&&it.hp) { this._floatText(sp.g.x,sp.g.y-50,`+${it.hp}`,'#88ff88',20); this._spawnParticles(sp.g.x,sp.g.y-20,0x44ff88,6,30); }
      doAfter(msg||`使用了 ${it.name}！`);
      return;
    }
  }

  _nextActor() {
    if (this.enemies.every(e=>e.dead)) { this._winBattle(); return; }
    if (this.party.every(m=>m.dead))   { this._loseBattle(); return; }
    this.actorIdx++;
    if (this.actorIdx>=this.party.length) { this._enemyPhase(); return; }
    while (this.actorIdx<this.party.length&&this.party[this.actorIdx].dead) this.actorIdx++;
    if (this.actorIdx>=this.party.length) { this._enemyPhase(); return; }
    this.cursor=0; this.subMode=null; this._rebuildStatus(); this._rebuildMenu();
  }

  _enemyPhase() {
    this.phase='enemyTurn'; this._rebuildMenu();
    const living=this.enemies.filter(e=>!e.dead); let idx=0;
    const next=()=>{
      if (this.party.every(m=>m.dead)) { this._loseBattle(); return; }
      if (idx>=living.length) {
        this.time.delayedCall(200,()=>{
          this.party.forEach(m=>{
            if (m.dead) return;
            if (m.status.includes('poison')) {
              const dmg=Math.max(1,Math.floor(m.maxHp*0.05));
              m.hp=Math.max(1,m.hp-dmg); this._addLog(`${m.name} 中毒，損失 ${dmg} HP！`);
              Sound?.play('poison');
              const sp=this.partySprites[this.party.indexOf(m)];
              if(sp){this._floatText(sp.g.x,sp.g.y-40,String(dmg),'#c050e8',16);this._spawnParticles(sp.g.x,sp.g.y-10,0x9030c0,5,25);}
            }
            const pc=m.status.filter(s=>s==='poison').length;
            m.status=m.status.filter(s=>s!=='defend'&&s!=='atkUp'&&s!=='poison');
            for(let i=0;i<pc-1;i++) m.status.push('poison');
          });
          // Enemy status tick (poison + clear buffs)
          this.enemies.forEach((e,ei)=>{
            if(e.dead)return;
            if(e.status.includes('poison')){
              const dmg=Math.max(1,Math.floor(e.maxHp*0.05));
              e.hp=Math.max(0,e.hp-dmg); if(e.hp===0)e.dead=true;
              this._addLog(`${e.name} 中毒，損失 ${dmg} HP！`);
              Sound?.play('poison');
              const sp=this.enemySprites[ei];
              if(sp){this._floatText(sp.g.x,sp.g.y-50,String(dmg),'#c050e8',16);this._spawnParticles(sp.g.x,sp.g.y-20,0x9030c0,4,22);}
              this._refreshEnemyHp(ei);
            }
            const epc=e.status.filter(s=>s==='poison').length;
            e.status=e.status.filter(s=>s!=='atkUp'&&s!=='poison');
            for(let i=0;i<epc-1;i++)e.status.push('poison');
          });
          this._rebuildStatus();
          if(this.party.every(m=>m.dead)){this._loseBattle();return;}
          this.phase='playerTurn'; this.actorIdx=0;
          while(this.actorIdx<this.party.length&&this.party[this.actorIdx].dead) this.actorIdx++;
          this.cursor=0; this.subMode=null; this._rebuildStatus(); this._rebuildMenu();
        });
        return;
      }
      this._doEnemyAct(living[idx++], next);
    };
    this.time.delayedCall(300, next);
  }

  _doEnemyAct(e, onDone) {
    const act=ENEMY_ACTS[e.acts[Math.floor(Math.random()*e.acts.length)]];
    if (!act) { this.time.delayedCall(400,onDone); return; }
    const living=this.party.filter(m=>!m.dead);
    if (!living.length) { onDone&&onDone(); return; }
    const tgt=living[Math.floor(Math.random()*living.length)];
    const pIdx=this.party.indexOf(tgt);
    const enemySp=this.enemySprites[this.enemies.indexOf(e)];
    const heroSp=this.partySprites[pIdx];

    if (act.type==='atk'||act.type==='drain') {
      this._animEnemyAttack(enemySp, heroSp, ()=>{
        let def=tgt.baseDef; if(tgt.status.includes('defend'))def=Math.floor(def*1.5);
        let eAtk=e.atk; if(e.status.includes('atkUp'))eAtk=Math.floor(eAtk*1.5);
        const dmg=this._calcDmg(eAtk,def,act.pow||1);
        tgt.hp=Math.max(0,tgt.hp-dmg); if(tgt.hp===0)tgt.dead=true;
        if(act.debuff)Object.entries(act.debuff).forEach(([k,v])=>{for(let i=0;i<v;i++)tgt.status.push(k);});
        if(act.type==='drain')e.hp=Math.min(e.maxHp,e.hp+Math.floor(dmg*0.5));
        Sound?.play('damage'); this._shake(0.004,240);
        if (heroSp) {
          const hx=heroSp.g.x, hy=heroSp.g.y-30;
          this._floatText(hx,hy,String(dmg),'#ff8888',18); this._spawnParticles(hx,hy+10,0xff4444,5,28);
          let c=0;
          this.time.addEvent({ delay:80, repeat:5, callback:()=>{
            c++; heroSp.g.setAlpha(c%2===0?1:0.3);
            if(c>=6){heroSp.g.setAlpha(1);this._drawHero(heroSp.g,tgt);heroSp.g.setPosition(heroSp.x,heroSp.y);}
          }});
        }
        this._addLog(`${e.name} 使用 ${act.name}，${tgt.name} 受到 ${dmg} 點傷害！`);
        this._rebuildStatus();
      }, ()=>this.time.delayedCall(380,onDone));
    } else if (act.type==='buff') {
      e.status.push(act.buff||'atkUp');
      this._addLog(`${e.name} 使用 ${act.name}！`);
      this.time.delayedCall(600, onDone);
    } else {
      this.time.delayedCall(400, onDone);
    }
  }

  _winBattle() {
    this.phase='win'; this.waiting=true;
    Sound?.play('victory'); Sound?.stopBgm();
    const expGain=this.enemies.reduce((s,e)=>s+(ENEMIES[e.id]?.exp||0),0);
    const goldGain=this.enemies.reduce((s,e)=>s+(ENEMIES[e.id]?.gold||0),0);
    GS.gold+=goldGain;
    const drops=[];
    this.enemies.forEach(e=>{(e.drops||[]).forEach(d=>{if(Math.random()<d.r){GS.addItem(d.id);drops.push(ITEMS[d.id]?.name||d.id);}});});
    GS.party.forEach((gm,i)=>{if(this.party[i])Object.assign(gm,this.party[i]);});
    const levelUps=[];
    GS.party.forEach((m,mi)=>{
      if(m.dead)return; m.exp+=expGain;
      while(m.exp>=expForLevel(m.lv)){
        GS.levelUp(m); levelUps.push(m.name); Sound?.play('levelUp');
        if(m.lv>=5)Achieve?.unlock('level_5'); if(m.lv>=10)Achieve?.unlock('level_10');
        const sp=this.partySprites[mi];
        if(sp){ this._floatText(sp.g.x,sp.g.y-85,`Lv.${m.lv} UP!`,'#ffd700',22); this._spawnParticles(sp.g.x,sp.g.y-45,0xffd700,14,50); }
      }
    });
    let msg=`戰鬥勝利！獲得 ${expGain} EXP、${goldGain} 靈石。`;
    if(drops.length)   msg+=` 獲得：${drops.join('、')}。`;
    if(levelUps.length)msg+=` ${levelUps.join('、')} 升級！`;
    this._addLog(msg); this._rebuildStatus();

    Achieve?.unlock('first_blood');
    if(GS.gold>=100) Achieve?.unlock('gold_100');
    if(GS.gold>=1000)Achieve?.unlock('gold_1000');
    if(this.party.some(m=>m.hp===1&&!m.dead))Achieve?.unlock('survivor');
    // Track dragon kills (unlocks final boss NPC)
    this.enemies.forEach(e=>{ if(e.id==='dragon')GS.flags.defeatedDragon=true; });
    // Boss defeat handling
    if(GS.battleData?.isBoss){
      Achieve?.unlock('boss_slayer'); this._submitLeaderboard();
      const bossEnemy=this.enemies[0];
      GS.flags[`defeated_${bossEnemy.id}`]=true;
      if(bossEnemy.id==='boss'){
        GS.flags._pendingLines=['魔君已被消滅！天下太平了！','靈兒：邪氣消散，願天下安寧。','月華：大家辛苦了，回青雲村吧！'];
        GS.flags._isFinalBoss=true;
      }
    }

    // Victory flash
    const flash=this.add.graphics(); flash.fillStyle(0xffffff,0); flash.fillRect(0,0,this.W,this.H); flash.setDepth(50);
    this.tweens.add({targets:flash,alpha:0.4,duration:110,yoyo:true,onComplete:()=>flash.destroy()});
    // Victory title
    const vtxt=this.add.text(this.W/2,this.H*0.35,'勝利！',{fontSize:Math.floor(this.H*0.08)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#ffd700',stroke:'#804000',strokeThickness:6}).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.4);
    this.tweens.add({targets:vtxt,alpha:1,scaleX:1,scaleY:1,duration:480,ease:'Back.easeOut'});
    this.time.delayedCall(380,()=>{
      this._floatText(this.W/2,this.H*0.46,`+${expGain} EXP`,'#88ffcc',18);
      this._floatText(this.W/2,this.H*0.53,`+${goldGain} 靈石`,'#ffd700',18);
    });
    this.time.delayedCall(2200,()=>{
      this.cameras.main.fadeOut(500,0,0,0);
      this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('WorldScene'));
    });
  }

  _submitLeaderboard() {
    const leader=GS.party.find(m=>!m.dead)||GS.party[0];
    const maxLv=GS.party.reduce((mx,m)=>Math.max(mx,m.lv||1),1);
    const SUPA_URL='https://wbamdjgcoezevimohlcb.supabase.co';
    const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW1kamdjb2V6ZXZpbW9obGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mzk1NDQsImV4cCI6MjA5MTExNTU0NH0.0YZUVDiCFYVDMDo20aG4sSBcON8SXoET6vEiX5NCEbs';
    fetch(`${SUPA_URL}/rest/v1/leaderboard`,{method:'POST',headers:{'apikey':SUPA_KEY,'Authorization':`Bearer ${SUPA_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({name:leader?.name||'勇者',level:maxLv,gold:GS.gold||0,kills:1})}).catch(()=>{});
  }

  _loseBattle() {
    this.phase='lose'; this.waiting=true;
    Sound?.play('dead'); Sound?.stopBgm();
    this._addLog('全員陣亡…');
    const darken=this.add.graphics(); darken.fillStyle(0x000000,0); darken.fillRect(0,0,this.W,this.H); darken.setDepth(50);
    this.tweens.add({targets:darken,alpha:0.72,duration:900});
    const ltxt=this.add.text(this.W/2,this.H*0.38,'全員陣亡',{fontSize:Math.floor(this.H*0.08)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#ff4040',stroke:'#400000',strokeThickness:6}).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.4);
    this.tweens.add({targets:ltxt,alpha:1,scaleX:1,scaleY:1,duration:580,ease:'Back.easeOut',delay:380});
    this.time.delayedCall(2800,()=>{
      this.cameras.main.fadeOut(600,0,0,0);
      this.cameras.main.once('camerafadeoutcomplete',()=>{GS.init();this.scene.start('TitleScene');});
    });
  }

  // ── Input + animations ────────────────────────────────
  update() {
    this._t++;

    // Twinkling stars
    if (this._t%3===0) {
      this._starG.clear();
      this._stars.forEach(s=>{
        const a=0.25+Math.sin(this._t*s.speed+s.phase)*0.38+0.38;
        this._starG.fillStyle(0xfff8e0,Math.max(0.05,Math.min(1,a)));
        this._starG.fillCircle(s.x,s.y,s.r);
      });
    }

    // Enemy idle bob (Y only, doesn't interfere with X tweens)
    this.enemySprites.forEach((sp,i)=>{
      if (!sp.e.dead) sp.g.y = sp.y + Math.sin(this._t*0.045+i*1.3)*2.5;
    });

    if (this.waiting||this.phase!=='playerTurn') return;
    const actor=this.party[this.actorIdx];
    if (!actor||actor.dead) { this._nextActor(); return; }

    const okPad  =!!window.PAD?.ok;   if(okPad  &&window.PAD)window.PAD.ok  =false;
    const backPad=!!window.PAD?.menu; if(backPad&&window.PAD)window.PAD.menu=false;
    const upPad  =!!window.PAD?.up;   if(upPad  &&window.PAD)window.PAD.up  =false;
    const dnPad  =!!window.PAD?.down; if(dnPad  &&window.PAD)window.PAD.down=false;
    const up  =Phaser.Input.Keyboard.JustDown(this.keys.up)  ||upPad;
    const down=Phaser.Input.Keyboard.JustDown(this.keys.down)||dnPad;
    const ok  =Phaser.Input.Keyboard.JustDown(this.keys.z)  ||Phaser.Input.Keyboard.JustDown(this.keys.enter)||okPad;
    const back=Phaser.Input.Keyboard.JustDown(this.keys.x)  ||Phaser.Input.Keyboard.JustDown(this.keys.esc) ||backPad;

    if (!this.subMode) {
      if(up)  {this.cursor=(this.cursor-1+5)%5;this._rebuildMenu();Sound?.play('menuMove');}
      if(down){this.cursor=(this.cursor+1)%5;  this._rebuildMenu();Sound?.play('menuMove');}
      if(ok){
        Sound?.play('menuSelect');
        if(this.cursor===0){
          const alive=this.enemies.filter(e=>!e.dead);
          if(alive.length===1){this._heroAct('attack',null,null,this.enemies.indexOf(alive[0]));}
          else{this.subMode='target';this.subCursor=0;this.targetList=alive.map(e=>({isEnemy:true,e}));this._rebuildMenu();}
        } else if(this.cursor===1){this.subMode='skill';this.subCursor=0;this._rebuildMenu();}
          else if(this.cursor===2){this.subMode='item'; this.subCursor=0;this._rebuildMenu();}
          else if(this.cursor===3){this._heroAct('defend');}
          else if(this.cursor===4){this._heroAct('flee');}
      }
    } else if (this.subMode==='skill') {
      const skills=actor.skills.map(sk=>SKILLS[sk]).filter(Boolean);
      if(up)  {this.subCursor=(this.subCursor-1+skills.length)%skills.length;this._rebuildMenu();Sound?.play('menuMove');}
      if(down){this.subCursor=(this.subCursor+1)%skills.length;this._rebuildMenu();Sound?.play('menuMove');}
      if(back){this.subMode=null;this._rebuildMenu();}
      if(ok){
        const sk=skills[this.subCursor], skId=actor.skills[this.subCursor];
        if(!sk||actor.mp<sk.mp){this._addLog('靈力不足！');return;}
        Sound?.play('menuSelect');
        if(sk.tgt==='all'){this._heroAct('skill',skId,null,0);this.subMode=null;}
        else if(sk.type==='heal'){this.targetList=this.party.filter(m=>!m.dead).map(m=>({isEnemy:false,m}));this.subMode='target';this.subCursor=0;this._pendingSkill=skId;this._rebuildMenu();}
        else{const alive=this.enemies.filter(e=>!e.dead);if(alive.length===1){this._heroAct('skill',skId,null,this.enemies.indexOf(alive[0]));this.subMode=null;}else{this.targetList=alive.map(e=>({isEnemy:true,e}));this.subMode='target';this.subCursor=0;this._pendingSkill=skId;this._rebuildMenu();}}
      }
    } else if (this.subMode==='item') {
      const items=Object.entries(GS.inventory).filter(([id,n])=>n>0&&ITEMS[id]?.cat==='use');
      if(up)  {this.subCursor=(this.subCursor-1+Math.max(1,items.length))%Math.max(1,items.length);this._rebuildMenu();Sound?.play('menuMove');}
      if(down){this.subCursor=(this.subCursor+1)%Math.max(1,items.length);this._rebuildMenu();Sound?.play('menuMove');}
      if(back){this.subMode=null;this._rebuildMenu();}
      if(ok&&items.length>0){Sound?.play('menuSelect');const[itemId]=items[this.subCursor];this.targetList=this.party.filter(m=>!m.dead).map(m=>({isEnemy:false,m}));this.subMode='target';this.subCursor=0;this._pendingItem=itemId;this._rebuildMenu();}
    } else if (this.subMode==='target') {
      if(up)  {this.subCursor=(this.subCursor-1+this.targetList.length)%this.targetList.length;this._rebuildMenu();Sound?.play('menuMove');}
      if(down){this.subCursor=(this.subCursor+1)%this.targetList.length;this._rebuildMenu();Sound?.play('menuMove');}
      if(back){this.subMode=this._pendingItem?'item':this._pendingSkill?'skill':null;this._rebuildMenu();}
      if(ok){
        Sound?.play('menuSelect');
        const tgt=this.targetList[this.subCursor];
        if(this._pendingSkill){const idx=tgt.isEnemy?this.enemies.indexOf(tgt.e):this.party.indexOf(tgt.m);this._heroAct('skill',this._pendingSkill,null,idx);this._pendingSkill=null;this.subMode=null;}
        else if(this._pendingItem){const idx=this.party.indexOf(tgt.m);this._heroAct('item',null,this._pendingItem,idx);this._pendingItem=null;this.subMode=null;}
        else{this._heroAct('attack',null,null,this.enemies.indexOf(tgt.e));this.subMode=null;}
      }
    }
  }
}
