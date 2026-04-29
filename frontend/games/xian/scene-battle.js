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

    this.party   = GS.party.map(m => ({ ...m, status:[...m.status], limitUsed:false }));
    this.enemies = GS.battleData.enemies.map(e => ({ ...e, status:[...e.status] }));
    this.groundY = Math.floor(H * 0.56);

    // ── Background ──────────────────────────────────────
    const BG_MAP = {
      forest: { sky:[0x041a04,0x040e02,0x020802,0x030a02], moon:0x0a1c08, mtn1:0x0c2008, mtn2:0x102a0c, gnd:[0x0c1808,0x0c1808,0x040804,0x040804], gndLine:0x508030, gndSub:0x142c0a, arena:0x103020 },
      castle: { sky:[0x1a1002,0x160e02,0x080602,0x0c0a02], moon:0x1a1404, mtn1:0x2a1a04, mtn2:0x342008, gnd:[0x1e1402,0x1e1402,0x0c0a02,0x0c0a02], gndLine:0xb09020, gndSub:0x2e1e04, arena:0x302008 },
      cave:   { sky:[0x0e0420,0x0a0218,0x04020e,0x06021a], moon:0x120630, mtn1:0x14063a, mtn2:0x1a0840, gnd:[0x0c0418,0x0c0418,0x060210,0x060210], gndLine:0x6040b0, gndSub:0x180630, arena:0x200840 },
      shrine: { sky:[0x181208,0x140e04,0x080604,0x0c0a04], moon:0x1c1606, mtn1:0x241a04, mtn2:0x2e200a, gnd:[0x201608,0x201608,0x100c04,0x100c04], gndLine:0xc09020, gndSub:0x301e06, arena:0x302010 },
    };
    const bgc = BG_MAP[GS.map] || { sky:[0x180808,0x120410,0x060202,0x0a0208], moon:0x0c0418, mtn1:0x180c2a, mtn2:0x1e1030, gnd:[0x1c1008,0x1c1008,0x080604,0x080604], gndLine:0xb07828, gndSub:0x3a2606, arena:0x280840 };
    const bg = this.add.graphics();
    bg.fillGradientStyle(bgc.sky[0], bgc.sky[1], bgc.sky[2], bgc.sky[3], 1);
    bg.fillRect(0, 0, W, H);

    // Moon + glow
    const moonG = this.add.graphics();
    moonG.fillStyle(0xfff4d0, 0.06); moonG.fillCircle(W*0.82, H*0.13, H*0.14);
    moonG.fillStyle(0xfff4d0, 1);    moonG.fillCircle(W*0.82, H*0.13, H*0.048);
    moonG.fillStyle(0xffffff, 0.2);  moonG.fillCircle(W*0.808, H*0.118, H*0.02);
    moonG.fillStyle(bgc.moon, 1);    moonG.fillCircle(W*0.836, H*0.12, H*0.042);

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
    mtn1.fillStyle(bgc.mtn1, 1);
    const pts1 = [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38]];
    mtn1.beginPath();
    pts1.forEach(([rx,ry],i) => { const px=rx*W,py=ry*this.groundY; i===0?mtn1.moveTo(px,py):mtn1.lineTo(px,py); });
    mtn1.lineTo(W,this.groundY); mtn1.lineTo(0,this.groundY); mtn1.closePath(); mtn1.fillPath();

    // Mountains front
    const mtn2 = this.add.graphics();
    mtn2.fillStyle(bgc.mtn2, 1);
    const pts2 = [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52]];
    mtn2.beginPath();
    pts2.forEach(([rx,ry],i) => { const px=rx*W,py=ry*this.groundY; i===0?mtn2.moveTo(px,py):mtn2.lineTo(px,py); });
    mtn2.lineTo(W,this.groundY); mtn2.lineTo(0,this.groundY); mtn2.closePath(); mtn2.fillPath();

    // Ground
    const gndG = this.add.graphics();
    gndG.fillGradientStyle(bgc.gnd[0], bgc.gnd[1], bgc.gnd[2], bgc.gnd[3], 1);
    gndG.fillRect(0, this.groundY, W, H - this.groundY);
    gndG.lineStyle(2, bgc.gndLine, 0.65); gndG.lineBetween(0, this.groundY, W, this.groundY);
    gndG.lineStyle(1, bgc.gndSub, 0.4);
    for (let i = 1; i < 6; i++) gndG.lineBetween(0, this.groundY+i*7, W, this.groundY+i*7);

    // Arena glow
    const arenaG = this.add.graphics();
    arenaG.fillStyle(bgc.arena, 0.25);
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
      this.enemySprites.push({ g, hp, lbl, x:ex, y:this.groundY, e, statusTxt:null, hpText:null });
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

    // ── Log strip (2-line) ────────────────────────────────
    const logY = this.groundY + 34;
    const logH = Math.max(52, Math.floor(H*0.1));
    const logBg = this.add.graphics();
    logBg.fillStyle(0x050410, 0.93); logBg.fillRect(0, logY, W, logH);
    logBg.lineStyle(1, 0x5a3e10, 0.8);
    logBg.lineBetween(0, logY, W, logY); logBg.lineBetween(0, logY+logH, W, logY+logH);
    const logFs = Math.max(11,Math.floor(H*0.020));
    this.logText = this.add.text(14, logY+5, '', {
      fontSize: logFs+'px',
      fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width: W-28 },
    }).setOrigin(0,0).setDepth(5);
    this.logText2 = this.add.text(14, logY+6+logFs, '', {
      fontSize: Math.max(10,logFs-2)+'px',
      fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#a09080', stroke:'#000', strokeThickness:1,
      wordWrap:{ width: W-28 },
    }).setOrigin(0,0).setDepth(5);

    // ── UI panels ────────────────────────────────────────
    this.uiY    = logY + logH + 2;
    this.uiH    = H - this.uiY;
    this.splitX = Math.floor(W*0.44);
    this.statusPanel = this.add.graphics(); this.statusTexts = []; this._rebuildStatus();
    this.menuPanel   = this.add.graphics(); this.menuTexts   = []; this._rebuildMenu();
    this._tgtCursorG = this.add.graphics().setDepth(9);

    // ── Boss HP bar ───────────────────────────────────────
    this._bossBar=null; this._bossBg=null; this._bossBarText=null;
    if (GS.battleData?.isBoss && this.enemies.length>0) {
      const boss=this.enemies[0];
      const bw=Math.floor(W*0.62), bh=13, bx=Math.floor((W-bw)/2), by=10;
      this._bossBg=this.add.graphics().setDepth(22);
      this._bossBg.fillStyle(0x0a0010,0.93); this._bossBg.fillRoundedRect(bx-10,by-4,bw+20,bh+22,6);
      this._bossBg.lineStyle(1,0xb04040,0.9); this._bossBg.strokeRoundedRect(bx-10,by-4,bw+20,bh+22,6);
      this._bossBarX=bx; this._bossBarY=by; this._bossBarW=bw; this._bossBarH=bh;
      this._bossBar=mkBar(this,bx,by+12,bw,bh,boss.hp,boss.maxHp,0xd02020); this._bossBar.setDepth(23);
      this._bossBarText=this.add.text(W/2,by+4,`${boss.name}　${boss.hp} / ${boss.maxHp}`,{
        fontSize:'11px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#ff8888',stroke:'#000',strokeThickness:2,
      }).setOrigin(0.5,0).setDepth(23);
    }

    // ── Ambient battle particles ──────────────────────────
    this._ambients=[]; this._ambientG=this.add.graphics().setDepth(1);
    const ABCFG={
      forest:{count:18,clr:0x60d840,minR:1.5,maxR:3.5,vy:-0.40,vxS:0.3,a:0.50},
      cave:  {count:14,clr:0xa060f0,minR:1.5,maxR:3.0,vy:-0.20,vxS:0.1,a:0.40},
      castle:{count:22,clr:0xd4a040,minR:0.8,maxR:2.5,vy:-0.55,vxS:0.5,a:0.35},
      shrine:{count:12,clr:0xffd060,minR:2.0,maxR:4.0,vy:-0.30,vxS:0.2,a:0.45},
    };
    this._ambientCfg=ABCFG[GS.map]||null;
    if (this._ambientCfg) {
      const ac=this._ambientCfg;
      for (let i=0;i<ac.count;i++) this._ambients.push({
        x:Math.random()*W, y:Math.random()*this.groundY,
        vx:(Math.random()-0.5)*ac.vxS*2, vy:ac.vy*(0.5+Math.random()*0.5),
        r:ac.minR+Math.random()*(ac.maxR-ac.minR),
        alpha:ac.a*(0.5+Math.random()*0.5), phase:Math.random()*Math.PI*2,
      });
    }

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
    const sz = e.sz || 28;
    // shadow
    g.fillStyle(0x000000, 0.28); g.fillEllipse(0, 4, sz*2.2, sz*0.28);
    const id = e.id;
    if (id === 'wolf') {
      // 黑熊精 — stocky dark bear
      const c = 0x1e1208;
      g.fillStyle(c, 1); g.fillEllipse(0, -sz*0.7, sz*2.1, sz*1.55);
      g.fillStyle(0x3a2010, 1); g.fillEllipse(0, -sz*0.55, sz*1.4, sz*0.7); // belly
      g.fillStyle(c, 1); g.fillCircle(0, -sz*1.82, sz*0.68);
      // round ears
      g.fillStyle(c, 1); g.fillCircle(-sz*0.52, -sz*2.28, sz*0.32); g.fillCircle(sz*0.52, -sz*2.28, sz*0.32);
      g.fillStyle(0x7a3828, 1); g.fillCircle(-sz*0.52, -sz*2.28, sz*0.16); g.fillCircle(sz*0.52, -sz*2.28, sz*0.16);
      // snout
      g.fillStyle(0x3a2010, 1); g.fillEllipse(0, -sz*1.58, sz*0.7, sz*0.38);
      g.fillStyle(0x080000, 1); g.fillCircle(-sz*0.12, -sz*1.62, sz*0.1); g.fillCircle(sz*0.12, -sz*1.62, sz*0.1);
      // red eyes
      g.fillStyle(0xff2020, 1); g.fillCircle(-sz*0.28, -sz*1.92, sz*0.13); g.fillCircle(sz*0.28, -sz*1.92, sz*0.13);
      g.fillStyle(0x100000, 1); g.fillCircle(-sz*0.26, -sz*1.90, sz*0.07); g.fillCircle(sz*0.30, -sz*1.90, sz*0.07);
      // claws
      g.fillStyle(c, 1); g.fillEllipse(-sz*1.15, -sz*0.55, sz*0.52, sz*0.8);
      g.fillEllipse( sz*1.15, -sz*0.55, sz*0.52, sz*0.8);
      g.fillStyle(0xe8e0c0, 1);
      for (let i=-1;i<=1;i++) {
        g.fillTriangle((-sz*1.15)+i*sz*0.14, -sz*0.12, (-sz*1.15)+i*sz*0.14+sz*0.09, -sz*0.12, (-sz*1.15)+i*sz*0.07, sz*0.08);
        g.fillTriangle((sz*1.15)+i*sz*0.14, -sz*0.12, (sz*1.15)+i*sz*0.14+sz*0.09, -sz*0.12, (sz*1.15)+i*sz*0.07, sz*0.08);
      }
    } else if (id === 'bandit') {
      // 山賊頭 — armored human with helmet
      const skin = 0xc8906c, armor = 0x4a3820;
      g.fillStyle(armor, 1); g.fillRect(-sz*0.75, -sz*1.55, sz*1.5, sz*1.6); // torso armor
      g.fillStyle(0x6a5030, 1); g.fillRect(-sz*0.85, -sz*0.85, sz*1.7, sz*0.18); // belt
      // arms
      g.fillStyle(armor, 1); g.fillRect(-sz*1.12, -sz*1.45, sz*0.42, sz*1.1);
      g.fillRect(sz*0.7, -sz*1.45, sz*0.42, sz*1.1);
      // legs
      g.fillStyle(0x2a1e10, 1); g.fillRect(-sz*0.62, -sz*0.15, sz*0.54, sz*0.5);
      g.fillRect(sz*0.08, -sz*0.15, sz*0.54, sz*0.5);
      // head + helmet
      g.fillStyle(skin, 1); g.fillCircle(0, -sz*1.98, sz*0.58);
      g.fillStyle(armor, 1);
      g.fillRect(-sz*0.62, -sz*2.52, sz*1.24, sz*0.6); // helmet top
      g.fillRect(-sz*0.68, -sz*2.52, sz*0.22, sz*0.72); // left cheek guard
      g.fillRect(sz*0.46, -sz*2.52, sz*0.22, sz*0.72); // right cheek guard
      g.fillRect(-sz*0.18, -sz*2.06, sz*0.36, sz*0.52); // nose guard
      // eyes visible through visor gap
      g.fillStyle(0xff3030, 0.9); g.fillCircle(-sz*0.25, -sz*2.0, sz*0.1); g.fillCircle(sz*0.25, -sz*2.0, sz*0.1);
      // sword held forward
      g.lineStyle(3, 0xc8c0a0, 1); g.lineBetween(sz*0.92, -sz*1.55, sz*0.92, sz*0.28);
      g.lineStyle(2, 0xffd700, 1); g.lineBetween(sz*0.58, -sz*1.2, sz*1.28, -sz*1.2);
      g.fillStyle(0x8a6020, 1); g.fillRect(sz*0.82, sz*0.18, sz*0.2, sz*0.2);
    } else if (id === 'skeleton') {
      // 冥兵 — skeleton warrior
      const bone = 0xd8d0b8, dark = 0x101018;
      // pelvis + spine
      g.fillStyle(bone, 1); g.fillEllipse(0, -sz*0.4, sz*1.1, sz*0.6);
      g.fillRect(-sz*0.12, -sz*1.55, sz*0.24, sz*1.2);
      // ribcage
      g.fillStyle(bone, 1); g.fillEllipse(0, -sz*1.12, sz*1.2, sz*0.95);
      g.fillStyle(dark, 1); // rib gaps
      for (let i=0;i<3;i++) { const ry=-sz*0.82-i*sz*0.22; g.fillRect(-sz*0.42, ry, sz*0.84, sz*0.1); }
      // arms (thin bones)
      g.fillStyle(bone, 1); g.fillRect(-sz*1.1, -sz*1.52, sz*0.28, sz*0.95);
      g.fillRect(sz*0.82, -sz*1.52, sz*0.28, sz*0.95);
      // skull
      g.fillStyle(bone, 1); g.fillCircle(0, -sz*1.98, sz*0.62);
      g.fillStyle(bone, 1); g.fillEllipse(0, -sz*1.62, sz*0.72, sz*0.34); // jaw
      // hollow eye sockets
      g.fillStyle(dark, 1); g.fillEllipse(-sz*0.25, -sz*2.05, sz*0.28, sz*0.22);
      g.fillEllipse(sz*0.25, -sz*2.05, sz*0.28, sz*0.22);
      g.fillStyle(0x4040ff, 0.7); g.fillCircle(-sz*0.25, -sz*2.05, sz*0.1); g.fillCircle(sz*0.25, -sz*2.05, sz*0.1); // blue glow
      // nose cavity
      g.fillStyle(dark, 1); g.fillTriangle(-sz*0.08, -sz*1.84, sz*0.08, -sz*1.84, 0, -sz*1.72);
      // teeth
      g.fillStyle(bone, 1); g.fillEllipse(0, -sz*1.58, sz*0.52, sz*0.2);
      for (let i=-2;i<=2;i++) g.fillRect(i*sz*0.1-sz*0.04, -sz*1.68, sz*0.07, sz*0.12);
      // spear
      g.lineStyle(2.5, 0x8a6820, 1); g.lineBetween(-sz*1.08, -sz*1.52, -sz*1.08, sz*0.3);
      g.fillStyle(0xc0c8d8, 1); g.fillTriangle(-sz*1.2, -sz*2.18, -sz*0.96, -sz*2.18, -sz*1.08, -sz*1.52);
    } else if (id === 'snake') {
      // 蛇蟒精 — serpent demon
      const sc = 0x205010, sc2 = 0x408028, belly = 0xc8d890;
      // coiled tail body
      g.fillStyle(sc, 1); g.fillEllipse(sz*0.3, sz*0.1, sz*2.2, sz*0.55);
      g.fillEllipse(-sz*0.5, -sz*0.28, sz*1.6, sz*0.48);
      g.fillStyle(sc2, 1); g.fillEllipse(sz*0.2, sz*0.05, sz*1.8, sz*0.35);
      // torso (humanoid upper)
      g.fillStyle(sc, 1); g.fillEllipse(0, -sz*1.0, sz*1.3, sz*1.1);
      g.fillStyle(belly, 1); g.fillEllipse(0, -sz*0.98, sz*0.7, sz*0.75);
      // cobra hood
      g.fillStyle(sc, 1); g.fillEllipse(0, -sz*1.82, sz*1.8, sz*1.0);
      g.fillStyle(0x102008, 1); g.fillEllipse(0, -sz*1.78, sz*0.2, sz*0.82); // hood spine
      // head
      g.fillStyle(sc, 1); g.fillEllipse(0, -sz*2.12, sz*0.88, sz*0.68);
      // slit pupils
      g.fillStyle(0xffe840, 1); g.fillEllipse(-sz*0.22, -sz*2.18, sz*0.22, sz*0.16);
      g.fillEllipse(sz*0.22, -sz*2.18, sz*0.22, sz*0.16);
      g.fillStyle(0x080000, 1); g.fillRect(-sz*0.24, -sz*2.22, sz*0.04, sz*0.12);
      g.fillRect(sz*0.20, -sz*2.22, sz*0.04, sz*0.12);
      // forked tongue
      g.lineStyle(1.5, 0xff2020, 1); g.lineBetween(0, -sz*1.82, 0, -sz*1.65);
      g.lineBetween(0, -sz*1.65, -sz*0.1, -sz*1.52);
      g.lineBetween(0, -sz*1.65, sz*0.1, -sz*1.52);
      // scale pattern
      g.lineStyle(0.8, 0x102008, 0.5);
      g.strokeEllipse(sz*0.3, sz*0.1, sz*2.2, sz*0.55);
      g.strokeEllipse(-sz*0.5, -sz*0.28, sz*1.6, sz*0.48);
    } else if (id === 'ghost') {
      // 怨靈 — wispy ghost
      const gc = 0x7040c0, gl = 0xa070f0;
      // wispy tail
      g.fillStyle(gc, 0.55); g.fillEllipse(sz*0.2, sz*0.18, sz*0.9, sz*0.62);
      g.fillEllipse(-sz*0.4, sz*0.06, sz*0.7, sz*0.45);
      g.fillEllipse(sz*0.55, -sz*0.05, sz*0.55, sz*0.38);
      // body (translucent bell)
      g.fillStyle(gc, 0.72); g.fillEllipse(0, -sz*1.0, sz*1.55, sz*1.65);
      g.fillStyle(gl, 0.22); g.fillEllipse(-sz*0.28, -sz*1.35, sz*0.7, sz*0.55);
      // head
      g.fillStyle(gc, 0.88); g.fillCircle(0, -sz*2.0, sz*0.68);
      g.fillStyle(gl, 0.18); g.fillCircle(-sz*0.22, -sz*2.22, sz*0.3);
      // hollow glowing eyes
      g.fillStyle(0x000000, 0.9); g.fillEllipse(-sz*0.26, -sz*2.05, sz*0.32, sz*0.22);
      g.fillEllipse(sz*0.26, -sz*2.05, sz*0.32, sz*0.22);
      g.fillStyle(0xe0c0ff, 0.9); g.fillEllipse(-sz*0.26, -sz*2.05, sz*0.18, sz*0.13);
      g.fillEllipse(sz*0.26, -sz*2.05, sz*0.18, sz*0.13);
      // chains
      g.lineStyle(1.5, 0x8060a0, 0.8);
      g.lineBetween(-sz*0.55, -sz*0.5, -sz*0.82, sz*0.22);
      g.lineBetween(sz*0.55, -sz*0.5, sz*0.82, sz*0.22);
      g.lineStyle(1, 0x8060a0, 0.5);
      g.lineBetween(-sz*0.68, -sz*0.18, -sz*0.42, sz*0.04);
      g.lineBetween(sz*0.42, -sz*0.18, sz*0.68, sz*0.04);
      // open mouth wail
      g.fillStyle(0x1a0030, 0.9); g.fillEllipse(0, -sz*1.78, sz*0.38, sz*0.28);
    } else if (id === 'demon') {
      // 妖兵 — horned armored demon
      const dc = 0x8a0808, da = 0x2a1010, skin = 0x802828;
      g.fillStyle(da, 1); g.fillRect(-sz*0.75, -sz*1.55, sz*1.5, sz*1.6);
      g.fillStyle(0x4a1818, 1); g.fillRect(-sz*0.9, -sz*0.82, sz*1.8, sz*0.2); // waist plate
      // arms
      g.fillStyle(da, 1); g.fillRect(-sz*1.1, -sz*1.45, sz*0.42, sz*1.1);
      g.fillRect(sz*0.68, -sz*1.45, sz*0.42, sz*1.1);
      // legs
      g.fillStyle(da, 1); g.fillRect(-sz*0.62, -sz*0.12, sz*0.54, sz*0.5);
      g.fillRect(sz*0.08, -sz*0.12, sz*0.54, sz*0.5);
      // head
      g.fillStyle(skin, 1); g.fillCircle(0, -sz*2.0, sz*0.62);
      g.fillStyle(da, 1); g.fillRect(-sz*0.65, -sz*2.55, sz*1.3, sz*0.6);
      // horns
      g.fillStyle(0x1a0808, 1);
      g.fillTriangle(-sz*0.42, -sz*2.52, -sz*0.6, -sz*3.08, -sz*0.18, -sz*2.52);
      g.fillTriangle(sz*0.42, -sz*2.52, sz*0.6, -sz*3.08, sz*0.18, -sz*2.52);
      g.fillStyle(dc, 0.5);
      g.fillTriangle(-sz*0.42, -sz*2.52, -sz*0.52, -sz*2.92, -sz*0.28, -sz*2.52);
      g.fillTriangle(sz*0.28, -sz*2.52, sz*0.52, -sz*2.92, sz*0.42, -sz*2.52);
      // glowing eyes
      g.fillStyle(0xff6020, 1); g.fillCircle(-sz*0.26, -sz*2.05, sz*0.14); g.fillCircle(sz*0.26, -sz*2.05, sz*0.14);
      g.fillStyle(0x100000, 1); g.fillCircle(-sz*0.24, -sz*2.04, sz*0.07); g.fillCircle(sz*0.28, -sz*2.04, sz*0.07);
      // battle axe
      g.lineStyle(3, 0x5a3010, 1); g.lineBetween(sz*0.92, -sz*1.55, sz*0.92, sz*0.18);
      g.fillStyle(0x9ab0c0, 1);
      g.fillTriangle(sz*0.62, -sz*1.98, sz*1.32, -sz*1.72, sz*0.62, -sz*1.45);
      g.fillTriangle(sz*0.62, -sz*1.85, sz*0.32, -sz*1.72, sz*0.62, -sz*1.58);
      g.lineStyle(1, 0xc8d8e0, 0.6); g.strokeCircle(sz*0.62, -sz*1.72, sz*0.52);
    } else if (id === 'dragon') {
      // 虎先鋒 — tiger spirit
      const tc = 0xe06010, ts = 0xf8a030;
      g.fillStyle(tc, 1); g.fillEllipse(0, -sz*0.75, sz*2.0, sz*1.55);
      g.fillStyle(ts, 1); g.fillEllipse(0, -sz*0.7, sz*1.4, sz*0.85); // lighter belly
      // stripes
      g.fillStyle(0x180800, 0.65);
      g.fillRect(-sz*0.8, -sz*1.42, sz*0.18, sz*1.05);
      g.fillRect(-sz*0.38, -sz*1.48, sz*0.15, sz*1.12);
      g.fillRect(sz*0.2, -sz*1.48, sz*0.15, sz*1.12);
      g.fillRect(sz*0.6, -sz*1.42, sz*0.18, sz*1.05);
      // arms with claws
      g.fillStyle(tc, 1); g.fillEllipse(-sz*1.15, -sz*0.55, sz*0.52, sz*0.88);
      g.fillEllipse(sz*1.15, -sz*0.55, sz*0.52, sz*0.88);
      g.fillStyle(0xe8e0c0, 1);
      for (let i=-1;i<=1;i++) {
        g.fillTriangle((-sz*1.15)+i*sz*0.13, -sz*0.1, (-sz*1.15)+i*sz*0.13+sz*0.1, -sz*0.1, (-sz*1.15)+i*sz*0.06, sz*0.1);
        g.fillTriangle((sz*1.15)+i*sz*0.13, -sz*0.1, (sz*1.15)+i*sz*0.13+sz*0.1, -sz*0.1, (sz*1.15)+i*sz*0.06, sz*0.1);
      }
      // tiger head
      g.fillStyle(tc, 1); g.fillCircle(0, -sz*1.88, sz*0.72);
      g.fillStyle(ts, 1); g.fillEllipse(0, -sz*1.72, sz*0.7, sz*0.4); // muzzle
      // ears
      g.fillStyle(tc, 1); g.fillTriangle(-sz*0.45, -sz*2.42, -sz*0.7, -sz*2.95, -sz*0.1, -sz*2.42);
      g.fillTriangle(sz*0.45, -sz*2.42, sz*0.7, -sz*2.95, sz*0.1, -sz*2.42);
      g.fillStyle(0xff8080, 0.7); g.fillTriangle(-sz*0.45, -sz*2.42, -sz*0.62, -sz*2.78, -sz*0.2, -sz*2.42);
      g.fillTriangle(sz*0.2, -sz*2.42, sz*0.62, -sz*2.78, sz*0.45, -sz*2.42);
      // face stripes
      g.fillStyle(0x180800, 0.6);
      g.fillRect(-sz*0.55, -sz*2.1, sz*0.16, sz*0.45);
      g.fillRect(sz*0.38, -sz*2.1, sz*0.16, sz*0.45);
      g.fillRect(-sz*0.18, -sz*1.62, sz*0.36, sz*0.1);
      // fierce eyes
      g.fillStyle(0xffe040, 1); g.fillCircle(-sz*0.28, -sz*1.95, sz*0.15); g.fillCircle(sz*0.28, -sz*1.95, sz*0.15);
      g.fillStyle(0x080000, 1); g.fillCircle(-sz*0.26, -sz*1.94, sz*0.08); g.fillCircle(sz*0.30, -sz*1.94, sz*0.08);
      // fangs
      g.fillStyle(0xf0e8d0, 1);
      g.fillTriangle(-sz*0.22, -sz*1.58, -sz*0.1, -sz*1.58, -sz*0.16, -sz*1.42);
      g.fillTriangle(sz*0.1, -sz*1.58, sz*0.22, -sz*1.58, sz*0.16, -sz*1.42);
    } else {
      // boss — 黃眉大王 fat corrupt monk
      const bc = 0xc09010, br = 0xe8a820, bskin = 0xd4b87a;
      // robes (wide fat body)
      g.fillStyle(bc, 1); g.fillEllipse(0, -sz*0.65, sz*2.8, sz*2.0);
      g.fillStyle(0xa07808, 1); g.fillEllipse(0, -sz*0.58, sz*2.0, sz*1.1); // belly highlight
      // belt sash
      g.fillStyle(0xc03010, 1); g.fillRect(-sz*1.18, -sz*0.28, sz*2.36, sz*0.28);
      // arms
      g.fillStyle(bc, 1); g.fillEllipse(-sz*1.42, -sz*0.85, sz*0.7, sz*1.1);
      g.fillEllipse(sz*1.42, -sz*0.85, sz*0.7, sz*1.1);
      g.fillStyle(bskin, 1); g.fillCircle(-sz*1.5, -sz*0.28, sz*0.28);
      g.fillCircle(sz*1.5, -sz*0.28, sz*0.28);
      // fat head
      g.fillStyle(bskin, 1); g.fillCircle(0, -sz*2.08, sz*0.88);
      // huge yellow eyebrows (signature feature)
      g.fillStyle(0xf8d040, 1); g.fillEllipse(-sz*0.32, -sz*2.38, sz*0.72, sz*0.22);
      g.fillEllipse(sz*0.32, -sz*2.38, sz*0.72, sz*0.22);
      g.fillStyle(0xd4a000, 0.5); g.fillRect(-sz*0.66, -sz*2.48, sz*0.62, sz*0.1);
      g.fillRect(sz*0.04, -sz*2.48, sz*0.62, sz*0.1);
      // eyes — squinting corrupt look
      g.fillStyle(0x200800, 1); g.fillRect(-sz*0.42, -sz*2.18, sz*0.28, sz*0.12);
      g.fillRect(sz*0.14, -sz*2.18, sz*0.28, sz*0.12);
      g.fillStyle(0xff4020, 0.9); g.fillCircle(-sz*0.28, -sz*2.15, sz*0.08); g.fillCircle(sz*0.28, -sz*2.15, sz*0.08);
      // smug grin
      g.fillStyle(0x201000, 1); g.fillEllipse(0, -sz*1.88, sz*0.52, sz*0.18);
      g.fillStyle(0xf8f0e0, 1); g.fillRect(-sz*0.18, -sz*1.94, sz*0.12, sz*0.1); g.fillRect(sz*0.06, -sz*1.94, sz*0.12, sz*0.1);
      // bald head shine
      g.fillStyle(0xffffff, 0.12); g.fillEllipse(-sz*0.3, -sz*2.38, sz*0.55, sz*0.28);
      // golden crown / headdress
      g.fillStyle(0xffd700, 1);
      g.fillRect(-sz*0.88, -sz*2.88, sz*1.76, sz*0.3);
      g.fillTriangle(-sz*0.78, -sz*2.88, -sz*0.6, -sz*3.42, -sz*0.42, -sz*2.88);
      g.fillTriangle(-sz*0.35, -sz*2.88, -sz*0.12, -sz*3.68, sz*0.12, -sz*2.88);
      g.fillTriangle(sz*0.42, -sz*2.88, sz*0.6, -sz*3.42, sz*0.78, -sz*2.88);
      g.fillStyle(0xff4040, 1); g.fillCircle(-sz*0.6, -sz*3.08, sz*0.14);
      g.fillStyle(0x40ff80, 1); g.fillCircle(0, -sz*3.28, sz*0.16);
      g.fillStyle(0xff4040, 1); g.fillCircle(sz*0.6, -sz*3.08, sz*0.14);
      // ornate staff
      g.lineStyle(3, 0x8a6820, 1); g.lineBetween(-sz*1.62, -sz*1.42, -sz*1.62, sz*0.22);
      g.fillStyle(0xffd700, 1); g.fillCircle(-sz*1.62, -sz*1.72, sz*0.32);
      g.fillStyle(0xff8020, 1); g.fillCircle(-sz*1.62, -sz*1.72, sz*0.2);
      g.lineStyle(1.5, 0xffd700, 0.8);
      g.lineBetween(-sz*1.82, -sz*1.72, -sz*1.42, -sz*1.72);
      g.lineBetween(-sz*1.62, -sz*1.92, -sz*1.62, -sz*1.52);
    }
  }

  _drawHero(g, m) {
    g.clear();
    const s = 14;
    g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 2, s*2.2, s*0.45);
    if (m.dead) {
      g.fillStyle(0x282828, 0.75); g.fillEllipse(-s*0.4, -s*0.35, s*2.6, s*0.85);
      g.lineStyle(1, 0xff4040, 0.75); g.lineBetween(-11,-8,11,8); g.lineBetween(11,-8,-11,8);
      return;
    }
    const id = m.id;
    if (id === 'yunyi') {
      // 雲逸 — golden monkey warrior, 金箍棒 staff
      const gc = 0xf0a010, ga = 0xe8c050, skin = 0xd4a060;
      // legs
      g.fillStyle(0x8a5020, 1); g.fillRect(-s*0.5,-s*0.85,s*0.42,s*0.88); g.fillRect(s*0.08,-s*0.85,s*0.42,s*0.88);
      // golden armor body
      g.fillStyle(gc, 1);
      g.fillTriangle(-s*0.68,-s*0.85, s*0.68,-s*0.85, s*0.52,-s*2.3);
      g.fillTriangle(-s*0.68,-s*0.85,-s*0.52,-s*2.3, s*0.52,-s*2.3);
      // armor highlight
      g.fillStyle(ga, 0.55); g.fillTriangle(-s*0.2,-s*1.0, s*0.2,-s*1.0, 0,-s*2.1);
      // armor trim
      g.lineStyle(1.5, 0xffd700, 0.8); g.lineBetween(-s*0.52,-s*2.3, 0,-s*2.48); g.lineBetween(s*0.52,-s*2.3, 0,-s*2.48);
      // waist belt
      g.fillStyle(0xc84010, 1); g.fillRect(-s*0.68,-s*1.05,s*1.36,s*0.22);
      // arms (wide sleeves)
      g.fillStyle(gc, 0.9); g.fillRect(-s*1.0,-s*2.25,s*0.36,s*0.88); g.fillRect(s*0.64,-s*2.25,s*0.36,s*0.88);
      // hands
      g.fillStyle(skin, 1); g.fillCircle(-s*0.82,-s*1.38,s*0.25); g.fillCircle(s*0.82,-s*1.38,s*0.25);
      // face
      g.fillStyle(skin, 1); g.fillRect(-s*0.18,-s*2.45,s*0.36,s*0.18);
      g.fillCircle(0,-s*2.88,s*0.66);
      // 金箍 headband (signature)
      g.fillStyle(0xffd700, 1); g.fillRect(-s*0.75,-s*2.88,s*1.5,s*0.18);
      g.lineStyle(1, 0xffa020, 0.8); g.strokeRect(-s*0.75,-s*2.88,s*1.5,s*0.18);
      // hair topknot
      g.fillStyle(0x201000, 1); g.fillCircle(0,-s*3.25,s*0.58); g.fillRect(-s*0.6,-s*3.15,s*1.2,s*0.3);
      g.fillRect(-s*0.62,-s*3.08,s*0.18,s*0.45); g.fillRect(s*0.44,-s*3.08,s*0.18,s*0.45);
      // monkey face features (slightly broader nose, alert eyes)
      g.fillStyle(0x0c0808, 1); g.fillCircle(-s*0.28,-s*2.86,s*0.13); g.fillCircle(s*0.28,-s*2.86,s*0.13);
      g.fillStyle(0xffffff, 1); g.fillCircle(-s*0.31,-s*2.89,s*0.05); g.fillCircle(s*0.25,-s*2.89,s*0.05);
      // 金箍棒 — extending staff with golden rings
      g.lineStyle(3, 0xc84010, 1); g.lineBetween(s*1.08,-s*3.5, s*1.08,-s*0.88);
      g.fillStyle(0xffd700, 1);
      g.fillRect(s*0.88,-s*3.5,s*0.4,s*0.22); g.fillRect(s*0.88,-s*2.2,s*0.4,s*0.22); g.fillRect(s*0.88,-s*0.98,s*0.4,s*0.22);
    } else if (id === 'linger') {
      // 靈兒 — elder mage, white beard, nature staff
      const rc = 0x508840, skin = 0xd4b888;
      // legs (long green robe)
      g.fillStyle(rc, 0.7); g.fillRect(-s*0.5,-s*0.85,s*0.42,s*0.88); g.fillRect(s*0.08,-s*0.85,s*0.42,s*0.88);
      // robe body
      g.fillStyle(rc, 1);
      g.fillTriangle(-s*0.7,-s*0.85, s*0.7,-s*0.85, s*0.55,-s*2.35);
      g.fillTriangle(-s*0.7,-s*0.85,-s*0.55,-s*2.35, s*0.55,-s*2.35);
      // robe pattern (lighter center stripe)
      g.fillStyle(0x80c860, 0.35); g.fillTriangle(-s*0.18,-s*1.0, s*0.18,-s*1.0, 0,-s*2.2);
      // wide sleeves
      g.fillStyle(rc, 1); g.fillRect(-s*1.1,-s*2.28,s*0.42,s*1.0); g.fillRect(s*0.68,-s*2.28,s*0.42,s*1.0);
      // belt
      g.fillStyle(0x2a6040, 1); g.fillRect(-s*0.7,-s*1.05,s*1.4,s*0.22);
      // hands
      g.fillStyle(skin, 1); g.fillCircle(-s*0.88,-s*1.42,s*0.22); g.fillCircle(s*0.88,-s*1.42,s*0.22);
      // face (elderly)
      g.fillStyle(skin, 1); g.fillRect(-s*0.18,-s*2.45,s*0.36,s*0.18);
      g.fillCircle(0,-s*2.88,s*0.64);
      // long white beard
      g.fillStyle(0xf0ece8, 0.95); g.fillTriangle(-s*0.38,-s*2.38, s*0.38,-s*2.38, 0,-s*1.62);
      g.fillStyle(0xe8e4e0, 0.7); g.fillTriangle(-s*0.2,-s*2.38, s*0.2,-s*2.38, 0,-s*1.72);
      // white hair + topknot (elder)
      g.fillStyle(0xf0ece8, 1); g.fillCircle(0,-s*3.2,s*0.6); g.fillRect(-s*0.62,-s*3.1,s*1.24,s*0.3);
      g.fillRect(-s*0.64,-s*3.05,s*0.18,s*0.42); g.fillRect(s*0.46,-s*3.05,s*0.18,s*0.42);
      // eyes (wise, slightly squinting)
      g.fillStyle(0x0c0c0c, 1); g.fillRect(-s*0.38,-s*2.85,s*0.24,s*0.1); g.fillRect(s*0.14,-s*2.85,s*0.24,s*0.1);
      g.fillStyle(0xffffff, 1); g.fillCircle(-s*0.29,-s*2.88,s*0.05); g.fillCircle(s*0.23,-s*2.88,s*0.05);
      // nature staff (gnarled wood + green orb)
      g.lineStyle(2.5, 0x5a3810, 1); g.lineBetween(-s*1.18,0,-s*1.18,-s*3.45);
      g.lineStyle(1.5, 0x7a5020, 0.7); g.lineBetween(-s*1.28,-s*1.8,-s*1.08,-s*2.2); g.lineBetween(-s*1.08,-s*2.6,-s*1.28,-s*2.9);
      g.fillStyle(0x40a030, 1); g.fillCircle(-s*1.18,-s*3.68,s*0.4);
      g.fillStyle(0x80e060, 0.6); g.fillCircle(-s*1.28,-s*3.82,s*0.2);
      g.fillStyle(0x40a030, 0.2); g.fillCircle(-s*1.18,-s*3.68,s*0.72);
      // leaf accents
      g.fillStyle(0x60c040, 0.7); g.fillEllipse(-s*1.52,-s*3.68,s*0.38,s*0.18); g.fillEllipse(-s*0.84,-s*3.72,s*0.35,s*0.16);
    } else {
      // yuehua — 月華, celestial archer
      const cc = 0x60c8ff, cl = 0x90d8ff, skin = 0xd4c0a8;
      // legs (flowing celestial robe)
      g.fillStyle(cc, 0.65); g.fillRect(-s*0.5,-s*0.85,s*0.42,s*0.88); g.fillRect(s*0.08,-s*0.85,s*0.42,s*0.88);
      // robe body
      g.fillStyle(cc, 1);
      g.fillTriangle(-s*0.65,-s*0.85, s*0.65,-s*0.85, s*0.5,-s*2.32);
      g.fillTriangle(-s*0.65,-s*0.85,-s*0.5,-s*2.32, s*0.5,-s*2.32);
      // light celestial shimmer
      g.fillStyle(0xffffff, 0.12); g.fillTriangle(-s*0.2,-s*1.0, s*0.2,-s*1.0, 0,-s*2.15);
      g.lineStyle(1, 0xffffff, 0.35); g.lineBetween(-s*0.5,-s*2.32, 0,-s*2.46); g.lineBetween(s*0.5,-s*2.32, 0,-s*2.46);
      // jade belt
      g.fillStyle(0x48c890, 1); g.fillRect(-s*0.65,-s*1.02,s*1.3,s*0.22);
      // arms
      g.fillStyle(cc, 0.9); g.fillRect(-s*0.98,-s*2.22,s*0.36,s*0.9); g.fillRect(s*0.62,-s*2.22,s*0.36,s*0.9);
      // hands
      g.fillStyle(skin, 1); g.fillCircle(-s*0.8,-s*1.38,s*0.22); g.fillCircle(s*0.8,-s*1.38,s*0.22);
      // face
      g.fillStyle(skin, 1); g.fillRect(-s*0.18,-s*2.45,s*0.36,s*0.18);
      g.fillCircle(0,-s*2.88,s*0.64);
      // hair ornament (hairpin + flower)
      g.fillStyle(0x1c1000, 1); g.fillCircle(0,-s*3.22,s*0.6); g.fillRect(-s*0.62,-s*3.12,s*1.24,s*0.3);
      g.fillRect(-s*0.64,-s*3.07,s*0.18,s*0.44); g.fillRect(s*0.46,-s*3.07,s*0.18,s*0.44);
      g.fillStyle(0xffd700, 1); g.fillCircle(s*0.55,-s*3.22,s*0.28); // hair pin orb
      g.fillStyle(0xff80c0, 0.9); // flower petals
      for (let a=0;a<5;a++) { const r=a*Math.PI*2/5; g.fillCircle(s*0.55+Math.cos(r)*s*0.22,-s*3.22+Math.sin(r)*s*0.22,s*0.14); }
      // eyes (delicate)
      g.fillStyle(0x0c0808, 1); g.fillCircle(-s*0.28,-s*2.86,s*0.12); g.fillCircle(s*0.28,-s*2.86,s*0.12);
      g.fillStyle(0xffffff, 1); g.fillCircle(-s*0.31,-s*2.89,s*0.05); g.fillCircle(s*0.25,-s*2.89,s*0.05);
      // celestial bow (crescent shape) with arrow nocked
      g.lineStyle(2.5, 0x9a6830, 1);
      g.beginPath(); g.arc(s*1.22,-s*1.85,s*1.05,-Math.PI*0.52,Math.PI*0.52); g.strokePath();
      g.lineStyle(1, 0xd8c8a0, 0.8); g.lineBetween(s*1.22,-s*2.68,s*1.22,-s*1.02);
      // nocked arrow
      g.lineStyle(1.5, 0x9a7030, 1); g.lineBetween(s*0.52,-s*2.1, s*1.5,-s*2.1);
      g.fillStyle(0xc0c8d8, 1); g.fillTriangle(s*1.5,-s*2.18, s*1.72,-s*2.1, s*1.5,-s*2.02);
      g.fillStyle(0xd8c890, 0.8); g.fillTriangle(s*0.52,-s*2.18, s*0.38,-s*2.1, s*0.52,-s*2.02);
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

  _animHeroAttack(sp, targetSp, onHit, onDone, actorId) {
    if (!sp || !targetSp) { onHit&&onHit(); onDone&&onDone(); return; }
    const origX  = sp.g.x;
    const targetX = targetSp.g.x + 60;
    this.tweens.add({
      targets:sp.g, x:targetX, duration:180, ease:'Power3.easeIn',
      onComplete:() => {
        if (actorId === 'yunyi') {
          const sx = targetSp.g.x, sy = targetSp.g.y - 30;
          const staffG = this.add.graphics().setDepth(8);
          staffG.lineStyle(5, 0xf0c020, 1); staffG.lineBetween(-30, 0, 30, 0);
          staffG.lineStyle(2, 0xffffa0, 0.7); staffG.lineBetween(-30, 0, 30, 0);
          staffG.fillStyle(0xffd700, 1); staffG.fillCircle(-30,0,4); staffG.fillCircle(30,0,4);
          staffG.setPosition(sx, sy);
          this.tweens.add({ targets:staffG, angle:1080, alpha:0, duration:400, ease:'Linear', onComplete:()=>staffG.destroy() });
          this._spawnParticles(sx, sy, 0xf0c020, 12, 48);
        } else if (actorId === 'linger') {
          const sx=targetSp.g.x, sy=targetSp.g.y-20;
          this._spawnParticles(sx, sy, 0x60d840, 14, 44);
          const gf=this.add.graphics().setDepth(8);
          gf.lineStyle(2, 0x80ff40, 0.7); gf.strokeCircle(sx, sy, 22);
          this.tweens.add({targets:gf, alpha:0, scaleX:1.8, scaleY:1.8, duration:340, onComplete:()=>gf.destroy()});
        } else if (actorId === 'yuehua') {
          const ax=sp.g.x, ay=sp.g.y-28, bx=targetSp.g.x, by=targetSp.g.y-28;
          const arr=this.add.graphics().setDepth(8);
          arr.lineStyle(3, 0x60c8ff, 0.9); arr.lineBetween(ax, ay, ax, ay);
          arr.fillStyle(0x60c8ff, 1); arr.fillTriangle(bx,by-6,bx-4,by+5,bx+4,by+5);
          arr.setPosition(0, 0);
          this.tweens.add({targets:arr, x:bx-ax, duration:160, ease:'Power3.easeIn',
            onComplete:()=>this.tweens.add({targets:arr,alpha:0,duration:200,onComplete:()=>arr.destroy()})});
          this._spawnParticles(bx, by, 0x60c8ff, 8, 36);
        }
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
      const expBar=mkBar(this,bx,ry+rowH*0.88,barW,3,m.exp,expForLevel(m.lv),0x50c878); expBar.setDepth(5); this.statusTexts.push(expBar);
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
      const cmds=['攻擊','技能','道具','防禦','逃跑'];
      if (actor.hp<=Math.floor(actor.maxHp*0.2)&&!actor.limitUsed) cmds.push('必殺');
      const colW=Math.floor(pw/2), rowH=Math.floor(ph/3);
      cmds.forEach((cmd,i) => {
        const col=Math.floor(i/3), row=i%3, tx=px+col*colW+20, ty=py+row*rowH+rowH*0.5, sel=i===this.cursor;
        const isLimit=cmd==='必殺';
        if (sel) {
          this.menuPanel.fillStyle(isLimit?0xa02020:0x9a7828,0.25); this.menuPanel.fillRoundedRect(px+col*colW+4,py+row*rowH+4,colW-8,rowH-8,5);
          this.menuPanel.lineStyle(1,isLimit?0xff4040:0xb09030,0.6); this.menuPanel.strokeRoundedRect(px+col*colW+4,py+row*rowH+4,colW-8,rowH-8,5);
        }
        const t=this.add.text(tx,ty,(sel?'▶ ':'')+cmd,{fontSize:fs+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:isLimit?(sel?'#ff8040':'#cc3020'):(sel?'#ffd700':'#c8a060'),stroke:'#000',strokeThickness:sel?3:2}).setDepth(5);
        if (sel) t.setShadow(0,0,isLimit?'#ff4020':'#ffd700',8,true,true);
        else if(isLimit) t.setShadow(0,0,'#ff2020',5,true,true);
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
    if (this.log.length > 3) this.log.pop();
    this.logText.setText(this.log[0] || '');
    if (this.logText2) this.logText2.setText(this.log[1] || '');
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
    if (sp.hpText) { sp.hpText.destroy(); sp.hpText=null; }
    const e=sp.e, sz=e.sz||28;
    sp.hp=mkBar(this,sp.x-sz,this.groundY+6,sz*2,7,e.hp,e.maxHp,0xe04040);
    if (!e.dead) {
      sp.hpText=this.add.text(sp.x,this.groundY+4,`${e.hp}/${e.maxHp}`,{
        fontSize:'10px',fontFamily:'monospace',color:'#ff9090',stroke:'#000',strokeThickness:1,
      }).setOrigin(0.5,1).setDepth(8);
    }
    this._drawEnemy(sp.g, e);
    if (e.dead) { sp.g.setAlpha(0); sp.lbl.setAlpha(0.3); sp.g.setPosition(sp.x,sp.y); }
    // Boss HP bar refresh + rage mode
    if (GS.battleData?.isBoss && idx===0 && this._bossBar) {
      this._bossBar.destroy();
      const bclr=e.hp<e.maxHp*0.3?0xff2020:e.hp<e.maxHp*0.6?0xff6020:0xd02020;
      this._bossBar=mkBar(this,this._bossBarX,this._bossBarY+12,this._bossBarW,this._bossBarH,e.hp,e.maxHp,bclr);
      this._bossBar.setDepth(23);
      if(this._bossBarText) this._bossBarText.setText(`${e.name}　${e.hp} / ${e.maxHp}`);
      if (e.hp<=e.maxHp*0.5&&!e._raged&&!e.dead) {
        e._raged=true; e.atk=Math.floor(e.atk*1.35);
        const rt=this.add.text(this.W/2,this.H*0.3,'狂　怒！',{
          fontSize:Math.floor(this.H*0.08)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#ff2010',stroke:'#400000',strokeThickness:6,
          shadow:{offsetX:0,offsetY:0,color:'#ff4020',blur:30,fill:true},
        }).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(2);
        this.tweens.add({targets:rt,alpha:1,scaleX:1,scaleY:1,duration:300,ease:'Back.easeOut',
          onComplete:()=>this.time.delayedCall(700,()=>this.tweens.add({targets:rt,alpha:0,duration:300,onComplete:()=>rt.destroy()}))
        });
        this._addLog(`${e.name} 進入狂怒！攻擊大幅提升！`);
        this._spawnParticles(sp.g.x,sp.g.y-40,0xff2020,22,75); this._shake(0.014,700);
      }
    }
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

    if (cmd==='defend') {
      actor.status.push('defend');
      const hsp=this.partySprites[this.actorIdx];
      if (hsp) {
        const sh=this.add.graphics().setDepth(12);
        sh.fillStyle(0x4080ff,0.45); sh.fillCircle(hsp.g.x, hsp.g.y-20, 24);
        sh.lineStyle(2,0x80c0ff,0.8); sh.strokeCircle(hsp.g.x, hsp.g.y-20, 24);
        this.tweens.add({targets:sh, alpha:0, duration:700, onComplete:()=>sh.destroy()});
      }
      doAfter(`${actor.name} 防禦！`); return;
    }
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

    if (cmd==='limit') {
      actor.limitUsed=true;
      const alive=this.enemies.filter(e=>!e.dead);
      if (!alive.length) { doAfter('…'); return; }
      const tgt=alive[0], tgtIdx=this.enemies.indexOf(tgt), st=calcStats(actor);
      const dmg=this._calcDmg(st.atk, tgt.def, 4.0);
      const heroSp=this.partySprites[this.actorIdx], enemySp=this.enemySprites[tgtIdx];
      const flash=this.add.graphics().setDepth(45);
      flash.fillStyle(0xff2020,0); flash.fillRect(0,0,this.W,this.H);
      this.tweens.add({targets:flash,alpha:0.4,duration:80,yoyo:true,repeat:1,
        onComplete:()=>{flash.clear();flash.fillStyle(0xffc020,0);flash.fillRect(0,0,this.W,this.H);
          this.tweens.add({targets:flash,alpha:0.25,duration:200,yoyo:true,onComplete:()=>flash.destroy()});}
      });
      const bt=this.add.text(this.W/2,this.H*0.34,'必 殺！',{
        fontSize:Math.floor(this.H*0.08)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#ff4020',stroke:'#300000',strokeThickness:6,
        shadow:{offsetX:0,offsetY:0,color:'#ff6020',blur:28,fill:true},
      }).setOrigin(0.5).setDepth(50).setAlpha(0).setScale(1.8);
      this.tweens.add({targets:bt,alpha:1,scaleX:1,scaleY:1,duration:260,ease:'Back.easeOut',
        onComplete:()=>this.time.delayedCall(500,()=>this.tweens.add({targets:bt,alpha:0,y:bt.y-20,duration:280,onComplete:()=>bt.destroy()}))
      });
      this._animHeroAttack(heroSp, enemySp, ()=>{
        tgt.hp=Math.max(0,tgt.hp-dmg); if(tgt.hp===0){tgt.dead=true;Sound?.play('enemyDead');}else Sound?.play('hit');
        this._flashEnemy(tgtIdx); this._refreshEnemyHp(tgtIdx); this._shake(0.016,450);
        const ex=enemySp?enemySp.g.x:0, ey=(enemySp?enemySp.g.y:this.groundY)-(tgt.sz||28)*1.4;
        this._floatText(ex,ey,`必殺！${dmg}`,'#ff8020',30);
        this._spawnParticles(ex,ey,0xffc020,20,70); this._spawnParticles(ex,ey,0xff4020,12,55);
        if(tgt.dead)this.time.delayedCall(350,()=>this._spawnParticles(ex,ey+20,tgt.color||0x884422,14,65));
      }, ()=>doAfter(`${actor.name} 發動必殺技！對 ${tgt.name} 造成 ${dmg} 點傷害！`), actor.id);
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
      ), actor.id);
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
        const hitCount=sk.hits||1;
        const dmgs=targets.map(tgt=>{
          let total=0;
          for(let h=0;h<hitCount;h++){const d=this._calcDmg(st.atk,tgt.def,sk.pow,sk.pierce||0);tgt.hp=Math.max(0,tgt.hp-d);if(tgt.hp===0)tgt.dead=true;total+=d;}
          if(sk.debuff)Object.entries(sk.debuff).forEach(([k,v])=>{for(let j=0;j<v;j++)tgt.status.push(k);});
          return total;
        });
        targets.forEach((tgt,ti)=>{
          const eIdx=this.enemies.indexOf(tgt), sp=this.enemySprites[eIdx];
          this._refreshEnemyHp(eIdx); this._flashEnemy(eIdx);
          if(sp){
            const ex=sp.g.x,ey=sp.g.y-(tgt.sz||28)*1.4;
            const _ec=ELEM_CLR[sk.elem||'none']||0x8888ff, _et=ELEM_TXT[sk.elem||'none']||'#aaaaff';
            const hitSuffix=hitCount>1?` ×${hitCount}`:'';
            this._floatText(ex,ey,String(dmgs[ti])+hitSuffix,_et,20);
            this._spawnParticles(ex,ey+20,_ec,10,45);
          }
        });
        this._shake(0.006);
        const _elemC = ELEM_CLR[sk.elem||'none']||0x8888ff;
        const _ef = this.add.graphics().setDepth(45);
        _ef.fillStyle(_elemC, 0); _ef.fillRect(0, 0, this.W, this.H);
        this.tweens.add({ targets:_ef, alpha:0.14, duration:75, yoyo:true, repeat:1, onComplete:()=>_ef.destroy() });
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
            e.status=e.status.filter(s=>s!=='atkUp'&&s!=='atkDown'&&s!=='slow'&&s!=='poison');
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
    const actId=e.acts[Math.floor(Math.random()*e.acts.length)];
    const act=ENEMY_ACTS[actId];
    if (!act) { this.time.delayedCall(400,onDone); return; }
    const living=this.party.filter(m=>!m.dead);
    if (!living.length) { onDone&&onDone(); return; }
    const tgt=living[Math.floor(Math.random()*living.length)];
    const pIdx=this.party.indexOf(tgt);
    const enemySp=this.enemySprites[this.enemies.indexOf(e)];
    const heroSp=this.partySprites[pIdx];

    if (act.type==='atk'||act.type==='drain') {
      if (e.status.includes('slow') && Math.random()<0.4) {
        this._addLog(`${e.name} 動作遲緩，無法行動！`);
        this.time.delayedCall(600, onDone); return;
      }
      const isStrong=['slam','aoe','fireBreath','tail'].includes(actId);
      const doAtk=()=>{
        if (enemySp && !e.dead) {
          const exStr=isStrong?'！！':'！';
          const exc=this.add.text(enemySp.g.x,enemySp.g.y-(e.sz||28)*2-8,exStr,{
            fontSize:isStrong?'30px':'22px',fontFamily:'serif',color:isStrong?'#ff2020':'#ffee20',stroke:'#000',strokeThickness:isStrong?4:3,
          }).setOrigin(0.5,1).setDepth(15);
          this.tweens.add({targets:exc,y:exc.y-14,alpha:0,duration:480,onComplete:()=>exc.destroy()});
        }
        this._animEnemyAttack(enemySp, heroSp, ()=>{
          let def=tgt.baseDef; if(tgt.status.includes('defend'))def=Math.floor(def*1.5);
          let eAtk=e.atk;
          if(e.status.includes('atkUp'))   eAtk=Math.floor(eAtk*1.5);
          if(e.status.includes('atkDown')) eAtk=Math.floor(eAtk*0.6);
          const dmg=this._calcDmg(eAtk,def,act.pow||1);
          tgt.hp=Math.max(0,tgt.hp-dmg); if(tgt.hp===0)tgt.dead=true;
          if(act.debuff)Object.entries(act.debuff).forEach(([k,v])=>{for(let i=0;i<v;i++)tgt.status.push(k);});
          if(act.type==='drain'){
            const heal=Math.floor(dmg*0.5); e.hp=Math.min(e.maxHp,e.hp+heal);
            const ei=this.enemies.indexOf(e); this._refreshEnemyHp(ei);
            if(enemySp) this._floatText(enemySp.g.x,enemySp.g.y-50,`+${heal}`,'#88ff88',16);
          }
          Sound?.play('damage'); this._shake(isStrong?0.008:0.004,240);
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
      };
      if (isStrong && enemySp && !e.dead) {
        const wt=this.add.text(enemySp.g.x,enemySp.g.y-(e.sz||28)*2-14,'！！',{
          fontSize:'36px',fontFamily:'serif',color:'#ff1010',stroke:'#000',strokeThickness:5,
          shadow:{offsetX:0,offsetY:0,color:'#ff4020',blur:16,fill:true},
        }).setOrigin(0.5,1).setDepth(16).setAlpha(0).setScale(0.5);
        this.tweens.add({targets:wt,alpha:1,scaleX:1.4,scaleY:1.4,duration:220,ease:'Back.easeOut',
          onComplete:()=>this.time.delayedCall(320,()=>{
            this.tweens.add({targets:wt,alpha:0,scaleX:2,scaleY:2,duration:180,onComplete:()=>wt.destroy()});
            doAtk();
          })
        });
      } else { doAtk(); }
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
    this.enemies.forEach(e=>{(e.drops||[]).forEach(d=>{if(Math.random()<d.r){GS.addItem(d.id);drops.push({name:ITEMS[d.id]?.name||d.id,eid:this.enemies.indexOf(e)});}});});
    drops.forEach(({name,eid},i)=>{
      const sp=this.enemySprites[Math.min(eid,this.enemySprites.length-1)];
      const fx=sp?sp.x:this.W/2, fy=sp?(sp.y-(sp.e?.sz||28)*2.6):this.groundY*0.4;
      this.time.delayedCall(i*220,()=>{
        this._floatText(fx,fy,`✦ ${name}`,'#ffc840',17);
        this._spawnParticles(fx,fy+12,0xffd060,6,28);
      });
    });
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
    if(drops.length)   msg+=` 獲得：${drops.map(d=>d.name).join('、')}。`;
    if(levelUps.length)msg+=` ${levelUps.join('、')} 升級！`;
    this._addLog(msg); this._rebuildStatus();

    Achieve?.unlock('first_blood');
    if(GS.gold>=100) Achieve?.unlock('gold_100');
    if(GS.gold>=1000)Achieve?.unlock('gold_1000');
    if(this.party.some(m=>m.hp===1&&!m.dead))Achieve?.unlock('survivor');
    // Track encountered enemies for bestiary
    if (!GS.flags._enemySeen) GS.flags._enemySeen = {};
    this.enemies.forEach(e => { GS.flags._enemySeen[e.id] = true; });
    // Track dragon kills (unlocks final boss NPC)
    this.enemies.forEach(e=>{ if(e.id==='dragon')GS.flags.defeatedDragon=true; });
    // Boss defeat handling
    if(GS.battleData?.isBoss){
      Achieve?.unlock('boss_slayer'); this._submitLeaderboard();
      const bossEnemy=this.enemies[0];
      GS.flags[`defeated_${bossEnemy.id}`]=true;
      if(bossEnemy.id==='boss'){
        GS.flags._pendingLines=['黃眉大王已伏誅！天命得成！','土地：妖氣盡散，山河安寧。','楊嬋：天命之人，你做到了，回黑山村吧！'];
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

    // Ambient particles
    if (this._ambientCfg && this._ambients.length>0 && this._t%2===0) {
      this._ambientG.clear();
      const ac=this._ambientCfg;
      this._ambients.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy;
        if (p.y<-10||p.x<-20||p.x>this.W+20) { p.x=Math.random()*this.W; p.y=this.groundY+Math.random()*8; }
        const a=p.alpha*(0.55+0.45*Math.sin(this._t*0.07+p.phase));
        this._ambientG.fillStyle(ac.clr,a); this._ambientG.fillCircle(p.x,p.y,p.r);
      });
    }

    // Enemy idle bob (Y only, doesn't interfere with X tweens)
    this.enemySprites.forEach((sp,i)=>{
      if (!sp.e.dead) sp.g.y = sp.y + Math.sin(this._t*0.045+i*1.3)*2.5;
    });

    // Target cursor (pulsing ring + arrow)
    this._tgtCursorG.clear();
    if (this.phase==='playerTurn' && this.subMode==='target' && !this.waiting && this.targetList.length>0) {
      const tgt=this.targetList[this.subCursor];
      const pulse=0.55+Math.sin(this._t*0.18)*0.45;
      if (tgt?.isEnemy) {
        const sp=this.enemySprites[this.enemies.indexOf(tgt.e)];
        if (sp) {
          const sz=tgt.e.sz||28;
          this._tgtCursorG.lineStyle(2,0xffd700,pulse);
          this._tgtCursorG.strokeCircle(sp.g.x, sp.g.y-sz*0.85, sz*1.15);
          const ay=sp.g.y-sz*2.4+Math.sin(this._t*0.14)*5;
          this._tgtCursorG.fillStyle(0xffd700,pulse);
          this._tgtCursorG.fillTriangle(sp.g.x,ay+9,sp.g.x-7,ay-5,sp.g.x+7,ay-5);
        }
      } else if (tgt && !tgt.isEnemy) {
        const mi=this.party.indexOf(tgt.m);
        const sp=this.partySprites[mi];
        if (sp) {
          this._tgtCursorG.lineStyle(2,0x88ff88,pulse);
          this._tgtCursorG.strokeCircle(sp.g.x, sp.g.y-20, 20);
          const ay=sp.g.y-55+Math.sin(this._t*0.14)*4;
          this._tgtCursorG.fillStyle(0x88ff88,pulse);
          this._tgtCursorG.fillTriangle(sp.g.x,ay+8,sp.g.x-6,ay-4,sp.g.x+6,ay-4);
        }
      }
    }

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
      const actor0=this.party[this.actorIdx];
      const mSz=(actor0&&!actor0.dead&&actor0.hp<=Math.floor(actor0.maxHp*0.2)&&!actor0.limitUsed)?6:5;
      if(up)  {this.cursor=(this.cursor-1+mSz)%mSz;this._rebuildMenu();Sound?.play('menuMove');}
      if(down){this.cursor=(this.cursor+1)%mSz;     this._rebuildMenu();Sound?.play('menuMove');}
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
          else if(this.cursor===5){this._heroAct('limit');}
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
