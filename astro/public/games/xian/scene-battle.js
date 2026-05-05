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

    this.party   = GS.party.map(m => ({ ...m, status:[...m.status], limitUsed:false, limitGauge:m.limitGauge||0 }));
    this.enemies = GS.battleData.enemies.map(e => ({ ...e, status:[...e.status] }));
    this.groundY = Math.floor(H * 0.56);

    // ── Background ──────────────────────────────────────
    const BG_MAP = {
      forest: { sky:[0x041a04,0x040e02,0x020802,0x030a02], moon:0x0a1c08, mtn1:0x0c2008, mtn2:0x102a0c, gnd:[0x0c1808,0x0c1808,0x040804,0x040804], gndLine:0x508030, gndSub:0x142c0a, arena:0x103020 },
      castle: { sky:[0x1a1002,0x160e02,0x080602,0x0c0a02], moon:0x1a1404, mtn1:0x2a1a04, mtn2:0x342008, gnd:[0x1e1402,0x1e1402,0x0c0a02,0x0c0a02], gndLine:0xb09020, gndSub:0x2e1e04, arena:0x302008 },
      cave:   { sky:[0x0e0420,0x0a0218,0x04020e,0x06021a], moon:0x120630, mtn1:0x14063a, mtn2:0x1a0840, gnd:[0x0c0418,0x0c0418,0x060210,0x060210], gndLine:0x6040b0, gndSub:0x180630, arena:0x200840 },
      shrine: { sky:[0x181208,0x140e04,0x080604,0x0c0a04], moon:0x1c1606, mtn1:0x241a04, mtn2:0x2e200a, gnd:[0x201608,0x201608,0x100c04,0x100c04], gndLine:0xc09020, gndSub:0x301e06, arena:0x302010 },
      dragonPalace: { sky:[0x040820,0x030616,0x020410,0x04061a], moon:0x0a1c3c, mtn1:0x0a1e4a, mtn2:0x103262, gnd:[0x080e22,0x080e22,0x040810,0x040810], gndLine:0x2870e0, gndSub:0x1040a0, arena:0x082090 },
      lingxiao:     { sky:[0x1a1408,0x160e02,0x0c0a04,0x121008], moon:0xffd060, mtn1:0xd09010, mtn2:0xe0b020, gnd:[0x281e08,0x281e08,0x140e02,0x140e02], gndLine:0xffd060, gndSub:0xb09020, arena:0xffcc20 },
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

    // ── Boss aura ─────────────────────────────────────────
    this._bossAuraG = null;
    if (GS.battleData?.isBoss && this.enemies.length > 0) {
      this._bossAuraG = this.add.graphics().setDepth(0);
    }

    // ── Ambient battle particles ──────────────────────────
    this._ambients=[]; this._ambientG=this.add.graphics().setDepth(1);
    const ABCFG={
      forest:{count:18,clr:0x60d840,minR:1.5,maxR:3.5,vy:-0.40,vxS:0.3,a:0.50},
      cave:  {count:14,clr:0xa060f0,minR:1.5,maxR:3.0,vy:-0.20,vxS:0.1,a:0.40},
      castle:{count:22,clr:0xd4a040,minR:0.8,maxR:2.5,vy:-0.55,vxS:0.5,a:0.35},
      shrine:{count:12,clr:0xffd060,minR:2.0,maxR:4.0,vy:-0.30,vxS:0.2,a:0.45},
      dragonPalace:{count:22,clr:0x40c0ff,minR:1.2,maxR:3.0,vy:-0.30,vxS:0.10,a:0.40},
      lingxiao:    {count:28,clr:0xffd050,minR:1.0,maxR:2.8,vy:-0.22,vxS:0.18,a:0.45},
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

    // ── Weather particles ─────────────────────────────────
    const WCFG = {
      forest:      { type:'rain',   count:38, clr:0x80d8a0, a:0.18 },
      castle:      { type:'sand',   count:28, clr:0xd4a840, a:0.22 },
      cave:        { type:'drip',   count:16, clr:0x8090c0, a:0.32 },
      shrine:      { type:'mote',   count:20, clr:0xffd060, a:0.36 },
      dragonPalace:{ type:'bubble', count:20, clr:0x40c8ff, a:0.28 },
      lingxiao:    { type:'mote',   count:32, clr:0xffd040, a:0.42 },
    };
    this._weatherCfg = WCFG[GS.map] || null;
    this._weatherG = this.add.graphics().setDepth(2);
    this._weatherPts = [];
    if (this._weatherCfg) {
      const wc = this._weatherCfg;
      for (let i = 0; i < wc.count; i++) {
        this._weatherPts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: wc.type==='sand' ? -(0.9+Math.random()*1.4) : (Math.random()-0.5)*0.4,
          vy: wc.type==='rain'   ? (3.8+Math.random()*2.5) :
              wc.type==='drip'   ? (1.0+Math.random()*0.9) :
              wc.type==='bubble' ? -(0.4+Math.random()*0.7) : (Math.random()-0.5)*0.5,
          r:  wc.type==='bubble' ? (2.5+Math.random()*3.5) : (0.9+Math.random()*1.3),
          len:wc.type==='rain'   ? (6+Math.random()*9)     :
              wc.type==='drip'   ? (3+Math.random()*5)     : 0,
          phase: Math.random()*Math.PI*2,
        });
      }
    }
    this._statusAuraG = this.add.graphics().setDepth(3);

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
      this._addLog(this.enemies.length > 1
        ? `遭遇了 ${this.enemies.map(e=>e.name).join('、')}！`
        : `遭遇了 ${this.enemies[0].name}！`);
      if (GS.battleData?.isBoss) {
        const boss=this.enemies[0];
        Sound?.play('bossIntro');
        this._shake(0.018, 700);
        // Dark overlay
        const darken=this.add.graphics().setDepth(48);
        darken.fillStyle(0x000000,0); darken.fillRect(0,0,this.W,this.H);
        this.tweens.add({targets:darken,alpha:0.72,duration:350,
          onComplete:()=>this.tweens.add({targets:darken,alpha:0,duration:600,delay:1700,onComplete:()=>darken.destroy()})
        });
        // Horizontal red shocklines
        for(let i=0;i<5;i++){
          const fl=this.add.graphics().setDepth(49);
          fl.fillStyle(0xff1010, 0.35-i*0.05);
          fl.fillRect(0, this.H*0.34+i*this.H*0.03, this.W, this.H*0.024);
          this.tweens.add({targets:fl,alpha:0,x:fl.x-50,duration:520,delay:i*35,onComplete:()=>fl.destroy()});
        }
        // Boss name
        const BOSS_TITLES={
          boss:      '天命之敵　— 　小西天惡僧',
          silverKing:'銀山妖王　— 　混元大魔君',
          dragonKing:'東海龍主　— 　敖廣天龍王',
          dragon:    '黃風嶺霸主　— 　虎先鋒',
          jadeKing:  '三界之主　— 　靈霄殿玉帝',
        };
        const bn=this.add.text(this.W/2,this.H*0.31,boss.name,{
          fontSize:Math.floor(this.H*0.09)+'px',
          fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#ff3020',stroke:'#800000',strokeThickness:9,
          shadow:{offsetX:0,offsetY:0,color:'#ff4020',blur:36,fill:true},
        }).setOrigin(0.5).setDepth(51).setAlpha(0).setScale(1.9);
        this.tweens.add({targets:bn,alpha:1,scaleX:1,scaleY:1,duration:500,ease:'Back.easeOut'});
        // Decorative lines
        const hl=this.add.graphics().setDepth(51).setAlpha(0);
        hl.lineStyle(1,0xb09030,0.85);
        hl.lineBetween(this.W*0.08,this.H*0.40,this.W*0.92,this.H*0.40);
        hl.lineBetween(this.W*0.08,this.H*0.43,this.W*0.92,this.H*0.43);
        this.tweens.add({targets:hl,alpha:1,duration:280,delay:280});
        // Boss subtitle
        const subTitle=BOSS_TITLES[boss.id]||'';
        if(subTitle){
          const bs=this.add.text(this.W/2,this.H*0.455,subTitle,{
            fontSize:Math.floor(this.H*0.028)+'px',
            fontFamily:'"Noto Serif TC","SimSun",serif',
            color:'#d0b060',stroke:'#000',strokeThickness:3,
          }).setOrigin(0.5).setDepth(51).setAlpha(0);
          this.tweens.add({targets:bs,alpha:1,duration:380,delay:340});
          this.time.delayedCall(2300,()=>this.tweens.add({targets:[bn,bs,hl],alpha:0,y:'-=22',duration:380,onComplete:()=>{bn.destroy();bs.destroy();hl.destroy();this.phase='playerTurn';this._rebuildMenu();}}));
        } else {
          this.time.delayedCall(2200,()=>this.tweens.add({targets:[bn,hl],alpha:0,y:'-=22',duration:380,onComplete:()=>{bn.destroy();hl.destroy();this.phase='playerTurn';this._rebuildMenu();}}));
        }
      } else {
        this.phase = 'playerTurn';
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
    } else if (id === 'fireSpirit') {
      // 火靈精 — fire spirit (floating flame being)
      const fc = 0xff4010, fl = 0xff8030, fw = 0xffe060;
      // flame wisp trails
      g.fillStyle(fc, 0.35); g.fillEllipse(-sz*0.55, sz*0.12, sz*0.45, sz*0.65);
      g.fillEllipse(sz*0.6, sz*0.08, sz*0.4, sz*0.58);
      g.fillEllipse(sz*0.05, sz*0.2, sz*0.35, sz*0.5);
      // main flame body (teardrop)
      g.fillStyle(fc, 0.85); g.fillEllipse(0, -sz*0.78, sz*1.55, sz*2.0);
      g.fillStyle(fl, 0.7);  g.fillEllipse(0, -sz*0.95, sz*1.0,  sz*1.45);
      g.fillStyle(fw, 0.55); g.fillEllipse(0, -sz*1.15, sz*0.55, sz*0.9);
      // inner bright core
      g.fillStyle(0xfffff0, 0.9); g.fillEllipse(0, -sz*1.25, sz*0.22, sz*0.35);
      // flame tips (top)
      g.fillStyle(fc, 0.7);
      g.fillTriangle(-sz*0.38, -sz*1.62, sz*0.0, -sz*2.42, sz*0.15, -sz*1.55);
      g.fillTriangle(sz*0.32, -sz*1.55, sz*0.0, -sz*2.28, -sz*0.1, -sz*1.48);
      g.fillStyle(fl, 0.5); g.fillTriangle(-sz*0.1, -sz*1.72, sz*0.0, -sz*2.35, sz*0.1, -sz*1.65);
      // glowing ember eyes
      g.fillStyle(0xffffff, 0.9); g.fillEllipse(-sz*0.22, -sz*1.08, sz*0.28, sz*0.2);
      g.fillEllipse(sz*0.22, -sz*1.08, sz*0.28, sz*0.2);
      g.fillStyle(0xff2000, 1); g.fillCircle(-sz*0.22, -sz*1.08, sz*0.1); g.fillCircle(sz*0.22, -sz*1.08, sz*0.1);
      // outer heat shimmer
      g.fillStyle(fc, 0.12); g.fillEllipse(0, -sz*0.88, sz*2.1, sz*2.6);
    } else if (id === 'iceScorp') {
      // 冰蠍 — ice scorpion
      const ic = 0x40b0e0, il = 0x80d8f8, id2 = 0x1a4860;
      // segmented tail (arching up and over)
      g.fillStyle(ic, 1);
      g.fillEllipse(-sz*0.3, -sz*0.48, sz*0.42, sz*0.35);
      g.fillEllipse(-sz*0.58, -sz*0.72, sz*0.38, sz*0.32);
      g.fillEllipse(-sz*0.78, -sz*1.02, sz*0.35, sz*0.30);
      g.fillEllipse(-sz*0.88, -sz*1.35, sz*0.30, sz*0.28);
      // stinger tip
      g.fillStyle(il, 1); g.fillTriangle(-sz*1.08, -sz*1.65, -sz*0.68, -sz*1.65, -sz*0.88, -sz*1.18);
      g.fillStyle(0x80f8ff, 0.7); g.fillCircle(-sz*0.88, -sz*1.65, sz*0.15);
      // main carapace body
      g.fillStyle(ic, 1); g.fillEllipse(sz*0.15, -sz*0.35, sz*2.1, sz*0.88);
      g.fillStyle(il, 0.5); g.fillEllipse(sz*0.0, -sz*0.45, sz*1.4, sz*0.45); // ice sheen
      // segmented lines on body
      g.lineStyle(1, id2, 0.8);
      g.lineBetween(-sz*0.3, -sz*0.1, -sz*0.3, -sz*0.72);
      g.lineBetween(sz*0.15, -sz*0.06, sz*0.15, -sz*0.68);
      g.lineBetween(sz*0.6, -sz*0.1, sz*0.6, -sz*0.65);
      // 6 legs (3 per side)
      g.lineStyle(2, id2, 1);
      g.lineBetween(sz*0.0, -sz*0.15, -sz*0.6, sz*0.38); g.lineBetween(sz*0.38, -sz*0.12, sz*0.2, sz*0.45);
      g.lineBetween(sz*0.72, -sz*0.15, sz*1.25, sz*0.42); g.lineBetween(-sz*0.55, -sz*0.1, -sz*1.12, sz*0.38);
      g.lineBetween(sz*0.95, -sz*0.08, sz*1.55, sz*0.18); g.lineBetween(-sz*0.85, -sz*0.08, -sz*1.45, sz*0.18);
      // head (forward, small)
      g.fillStyle(ic, 1); g.fillEllipse(sz*1.08, -sz*0.35, sz*0.65, sz*0.52);
      g.fillStyle(il, 0.6); g.fillEllipse(sz*1.02, -sz*0.42, sz*0.38, sz*0.28);
      // pincers
      g.fillStyle(ic, 1); g.fillEllipse(sz*1.38, -sz*0.58, sz*0.45, sz*0.22); g.fillEllipse(sz*1.38, -sz*0.18, sz*0.45, sz*0.22);
      g.fillStyle(il, 1); g.fillTriangle(sz*1.55, -sz*0.65, sz*1.75, -sz*0.52, sz*1.55, -sz*0.38);
      g.fillTriangle(sz*1.55, -sz*0.28, sz*1.75, -sz*0.14, sz*1.55, sz*0.0);
      // blue glowing eyes
      g.fillStyle(0x40e0ff, 1); g.fillCircle(sz*1.12, -sz*0.45, sz*0.1); g.fillCircle(sz*1.22, -sz*0.28, sz*0.08);
    } else if (id === 'dragonGuard') {
      // 龍族守衛 — dragon palace guard (armored, draconic)
      const gc = 0x1e6888, gl = 0x2890b8, skin = 0x204858;
      // scaled torso armor
      g.fillStyle(gc, 1); g.fillEllipse(0, -sz*0.78, sz*1.75, sz*1.55);
      // scale pattern
      g.lineStyle(0.7, 0x0e3848, 0.7);
      for (let rs = 0; rs < 3; rs++) {
        for (let cs = -2; cs <= 2; cs++) {
          g.strokeEllipse(cs*sz*0.32+(rs%2)*sz*0.16, -sz*0.45-rs*sz*0.32, sz*0.36, sz*0.2);
        }
      }
      // chest highlight
      g.fillStyle(gl, 0.45); g.fillEllipse(-sz*0.18, -sz*0.92, sz*0.88, sz*0.62);
      // shoulder fins (draconic)
      g.fillStyle(gc, 1); g.fillEllipse(-sz*1.05, -sz*1.15, sz*0.55, sz*0.75);
      g.fillEllipse(sz*1.05, -sz*1.15, sz*0.55, sz*0.75);
      g.fillStyle(0x0a3850, 0.8);
      g.fillTriangle(-sz*1.28, -sz*0.88, -sz*0.82, -sz*0.88, -sz*1.05, -sz*1.52);
      g.fillTriangle(sz*0.82, -sz*0.88, sz*1.28, -sz*0.88, sz*1.05, -sz*1.52);
      // arms
      g.fillStyle(gc, 1); g.fillEllipse(-sz*1.12, -sz*0.62, sz*0.52, sz*0.95); g.fillEllipse(sz*1.12, -sz*0.62, sz*0.52, sz*0.95);
      // dragon helm head
      g.fillStyle(gc, 1); g.fillCircle(0, -sz*1.95, sz*0.68);
      g.fillStyle(gl, 0.4); g.fillCircle(-sz*0.15, -sz*2.15, sz*0.38);
      // helm crest (dragon fin)
      g.fillStyle(0x0a3850, 1); g.fillTriangle(-sz*0.35, -sz*2.52, sz*0.35, -sz*2.52, 0, -sz*3.12);
      g.fillStyle(gc, 0.6); g.fillTriangle(-sz*0.22, -sz*2.52, sz*0.22, -sz*2.52, 0, -sz*2.95);
      // face visor
      g.fillStyle(0x082030, 1); g.fillRect(-sz*0.52, -sz*2.28, sz*1.04, sz*0.4);
      g.fillStyle(0x40d0ff, 0.75); g.fillEllipse(-sz*0.26, -sz*2.1, sz*0.28, sz*0.16); g.fillEllipse(sz*0.26, -sz*2.1, sz*0.28, sz*0.16);
      // trident weapon
      g.lineStyle(3, 0x4090b8, 1); g.lineBetween(sz*0.92, -sz*1.75, sz*0.92, sz*0.25);
      g.fillStyle(0x80d0f0, 1);
      g.fillTriangle(sz*0.76, -sz*2.2, sz*0.92, -sz*1.75, sz*1.08, -sz*2.2);
      g.fillTriangle(sz*0.62, -sz*2.08, sz*0.72, -sz*1.75, sz*0.82, -sz*2.08);
      g.fillTriangle(sz*1.02, -sz*2.08, sz*1.12, -sz*1.75, sz*1.22, -sz*2.08);
    } else if (id === 'spider') {
      // 蜘蛛精 — spider demon
      const sc = 0x1a0828, sh = 0x6020a0;
      // abdomen (large rear bulb)
      g.fillStyle(sc, 1); g.fillEllipse(sz*0.1, sz*0.1, sz*2.4, sz*1.6);
      // web pattern on abdomen
      g.lineStyle(0.8, 0x9040e0, 0.45);
      g.lineBetween(-sz*0.8, sz*0.1, sz*1.0, sz*0.1); g.lineBetween(sz*0.1, -sz*0.7, sz*0.1, sz*0.9);
      g.strokeEllipse(sz*0.1, sz*0.1, sz*1.2, sz*0.8);
      // cephalothorax (front body)
      g.fillStyle(sh, 1); g.fillEllipse(-sz*0.55, -sz*1.05, sz*1.35, sz*1.0);
      // 8 legs (4 per side)
      g.lineStyle(2, 0x280840, 1);
      const legY = -sz*0.85;
      g.lineBetween(-sz*0.82, legY, -sz*1.9, -sz*1.6); g.lineBetween(-sz*0.82, legY, -sz*2.1, -sz*0.55);
      g.lineBetween(-sz*0.55, legY+sz*0.25, -sz*1.8, sz*0.3); g.lineBetween(-sz*0.55, legY+sz*0.25, -sz*1.5, sz*0.85);
      g.lineBetween(sz*0.28, legY, sz*1.35, -sz*1.6); g.lineBetween(sz*0.28, legY, sz*1.55, -sz*0.55);
      g.lineBetween(sz*0.05, legY+sz*0.25, sz*1.25, sz*0.3); g.lineBetween(sz*0.05, legY+sz*0.25, sz*0.95, sz*0.85);
      // head
      g.fillStyle(sh, 1); g.fillCircle(-sz*0.58, -sz*1.72, sz*0.55);
      // 6 red eyes (2 rows of 3)
      g.fillStyle(0xff2020, 1);
      for (let ei = -1; ei <= 1; ei++) {
        g.fillCircle(-sz*0.58+ei*sz*0.28, -sz*1.82, sz*0.1);
        g.fillCircle(-sz*0.58+ei*sz*0.22, -sz*1.62, sz*0.08);
      }
      // chelicerae (fangs)
      g.fillStyle(0x0c0018, 1); g.fillEllipse(-sz*0.78, -sz*1.28, sz*0.28, sz*0.5); g.fillEllipse(-sz*0.38, -sz*1.28, sz*0.28, sz*0.5);
      g.fillStyle(0xc040ff, 0.8); g.fillCircle(-sz*0.78, -sz*1.06, sz*0.1); g.fillCircle(-sz*0.38, -sz*1.06, sz*0.1);
    } else if (id === 'yasha') {
      // 夜叉 — aquatic demon warrior
      const yc = 0x1a4878, ys = 0x2870c0, skin = 0x204060;
      // fish-scale body armor
      g.fillStyle(ys, 1); g.fillEllipse(0, -sz*0.75, sz*1.85, sz*1.55);
      // scale texture
      g.lineStyle(0.7, 0x102848, 0.6);
      for (let row = 0; row < 3; row++) {
        for (let col = -2; col <= 2; col++) {
          g.strokeEllipse(col*sz*0.35 + (row%2)*sz*0.17, -sz*0.5 - row*sz*0.35, sz*0.38, sz*0.22);
        }
      }
      // belly (lighter)
      g.fillStyle(0x90c8e8, 0.35); g.fillEllipse(0, -sz*0.72, sz*0.95, sz*0.9);
      // webbed arms
      g.fillStyle(yc, 1); g.fillEllipse(-sz*1.12, -sz*0.62, sz*0.55, sz*1.0); g.fillEllipse(sz*1.12, -sz*0.62, sz*0.55, sz*1.0);
      g.fillStyle(0x204870, 0.8);
      g.fillTriangle(-sz*1.38, -sz*0.28, -sz*0.88, -sz*0.28, -sz*1.12, sz*0.15);
      g.fillTriangle(sz*0.88, -sz*0.28, sz*1.38, -sz*0.28, sz*1.12, sz*0.15);
      // head (amphibian)
      g.fillStyle(ys, 1); g.fillEllipse(0, -sz*1.92, sz*1.1, sz*0.82);
      // gill slits
      g.lineStyle(1.5, 0x102848, 0.8); g.lineBetween(-sz*0.5, -sz*1.78, -sz*0.62, -sz*1.58); g.lineBetween(-sz*0.38, -sz*1.75, -sz*0.48, -sz*1.55);
      g.lineBetween(sz*0.5, -sz*1.78, sz*0.62, -sz*1.58); g.lineBetween(sz*0.38, -sz*1.75, sz*0.48, -sz*1.55);
      // eyes (predator)
      g.fillStyle(0xffe020, 1); g.fillEllipse(-sz*0.3, -sz*1.98, sz*0.28, sz*0.2); g.fillEllipse(sz*0.3, -sz*1.98, sz*0.28, sz*0.2);
      g.fillStyle(0x080000, 1); g.fillRect(-sz*0.32, -sz*2.02, sz*0.06, sz*0.16); g.fillRect(sz*0.26, -sz*2.02, sz*0.06, sz*0.16);
      // trident
      g.lineStyle(3, 0x4080b0, 1); g.lineBetween(sz*0.92, -sz*1.65, sz*0.92, sz*0.22);
      g.fillStyle(0x80c8e8, 1);
      g.fillTriangle(sz*0.76, -sz*2.1, sz*0.92, -sz*1.65, sz*1.08, -sz*2.1);
      g.fillTriangle(sz*0.62, -sz*1.98, sz*0.72, -sz*1.65, sz*0.82, -sz*1.98);
      g.fillTriangle(sz*1.02, -sz*1.98, sz*1.12, -sz*1.65, sz*1.22, -sz*1.98);
    } else if (id === 'goldenEagle') {
      // 金翅大鵬 — giant golden eagle demon
      const gc = 0xd4a010, gd = 0x8a6808, beak = 0xe8b820;
      // wings spread
      g.fillStyle(gc, 1); g.fillEllipse(-sz*1.6, -sz*1.15, sz*2.0, sz*0.8);
      g.fillEllipse(sz*1.6, -sz*1.15, sz*2.0, sz*0.8);
      // wing feather tips (dark)
      g.fillStyle(gd, 1); g.fillEllipse(-sz*2.3, -sz*1.18, sz*0.9, sz*0.45);
      g.fillEllipse(sz*2.3, -sz*1.18, sz*0.9, sz*0.45);
      // primary feathers
      g.fillStyle(0xffd700, 0.5);
      for (let fi = -3; fi <= 3; fi++) {
        if (fi === 0) continue;
        const fx = fi * sz * 0.48;
        g.fillTriangle(fx - sz*0.12, -sz*0.65, fx + sz*0.12, -sz*0.65, fx, -sz*1.55);
      }
      // body (raptor chest)
      g.fillStyle(gc, 1); g.fillEllipse(0, -sz*0.72, sz*1.55, sz*1.45);
      g.fillStyle(0xfff8d0, 0.6); g.fillEllipse(0, -sz*0.65, sz*0.75, sz*0.85); // white breast
      // head
      g.fillStyle(0xfff0c0, 1); g.fillCircle(0, -sz*1.85, sz*0.65);
      // fierce yellow eyes
      g.fillStyle(0xffd020, 1); g.fillCircle(-sz*0.26, -sz*1.95, sz*0.18); g.fillCircle(sz*0.26, -sz*1.95, sz*0.18);
      g.fillStyle(0x080000, 1); g.fillCircle(-sz*0.24, -sz*1.94, sz*0.1); g.fillCircle(sz*0.28, -sz*1.94, sz*0.1);
      g.fillStyle(0xffffff, 1); g.fillCircle(-sz*0.22, -sz*1.97, sz*0.04); g.fillCircle(sz*0.30, -sz*1.97, sz*0.04);
      // hooked beak
      g.fillStyle(beak, 1); g.fillTriangle(-sz*0.2, -sz*1.68, sz*0.2, -sz*1.68, 0, -sz*1.38);
      g.fillStyle(0xc8a010, 1); g.fillTriangle(-sz*0.12, -sz*1.52, sz*0.12, -sz*1.52, 0, -sz*1.38);
      // talons
      g.fillStyle(gd, 1); g.fillEllipse(-sz*0.45, sz*0.08, sz*0.38, sz*0.28); g.fillEllipse(sz*0.45, sz*0.08, sz*0.38, sz*0.28);
      g.fillStyle(0xd0c080, 1);
      for (let ti = -1; ti <= 1; ti++) {
        g.fillTriangle(-sz*0.45+ti*sz*0.15, sz*0.22, -sz*0.45+ti*sz*0.15+sz*0.1, sz*0.22, -sz*0.45+ti*sz*0.08, sz*0.42);
        g.fillTriangle(sz*0.45+ti*sz*0.15, sz*0.22, sz*0.45+ti*sz*0.15+sz*0.1, sz*0.22, sz*0.45+ti*sz*0.08, sz*0.42);
      }
    } else if (id === 'silverKing') {
      // 銀角大王 — silver horn demon king
      const sc = 0xc8d8e8, sa = 0xe8f0f8, sd = 0x506070;
      // armored body (heavy silver plate)
      g.fillStyle(sc, 1); g.fillEllipse(0, -sz*0.72, sz*2.1, sz*1.65);
      g.fillStyle(sa, 0.5); g.fillEllipse(-sz*0.22, -sz*0.9, sz*1.1, sz*0.7); // armor sheen
      // waist skirt plates
      g.fillStyle(sd, 1); g.fillRect(-sz*0.95, -sz*0.18, sz*1.9, sz*0.28);
      g.fillStyle(sc, 1);
      for (let pl = -2; pl <= 2; pl++) g.fillRect(pl*sz*0.38-sz*0.16, sz*0.08, sz*0.3, sz*0.38);
      // arms (gauntlets)
      g.fillStyle(sc, 1); g.fillEllipse(-sz*1.2, -sz*0.65, sz*0.58, sz*1.0); g.fillEllipse(sz*1.2, -sz*0.65, sz*0.58, sz*1.0);
      g.fillStyle(sa, 0.5); g.fillRect(-sz*1.38, -sz*0.28, sz*0.36, sz*0.16); g.fillRect(sz*1.02, -sz*0.28, sz*0.36, sz*0.16);
      // head (demon-king face)
      g.fillStyle(sc, 1); g.fillCircle(0, -sz*2.0, sz*0.72);
      g.fillStyle(sa, 0.35); g.fillCircle(-sz*0.18, -sz*2.22, sz*0.42);
      // silver helmet
      g.fillStyle(sd, 1); g.fillRect(-sz*0.75, -sz*2.68, sz*1.5, sz*0.58);
      // twin silver horns (signature)
      g.fillStyle(sc, 1);
      g.fillTriangle(-sz*0.48, -sz*2.62, -sz*0.72, -sz*3.38, -sz*0.22, -sz*2.62);
      g.fillTriangle(sz*0.22, -sz*2.62, sz*0.72, -sz*3.38, sz*0.48, -sz*2.62);
      g.fillStyle(sa, 0.7);
      g.fillTriangle(-sz*0.48, -sz*2.62, -sz*0.62, -sz*3.18, -sz*0.3, -sz*2.62);
      g.fillTriangle(sz*0.3, -sz*2.62, sz*0.62, -sz*3.18, sz*0.48, -sz*2.62);
      // piercing blue eyes
      g.fillStyle(0x40a0ff, 1); g.fillCircle(-sz*0.28, -sz*2.06, sz*0.14); g.fillCircle(sz*0.28, -sz*2.06, sz*0.14);
      g.fillStyle(0x100820, 1); g.fillCircle(-sz*0.26, -sz*2.05, sz*0.07); g.fillCircle(sz*0.30, -sz*2.05, sz*0.07);
      // sneer mouth
      g.fillStyle(0x201010, 1); g.fillEllipse(0, -sz*1.82, sz*0.48, sz*0.18);
      g.fillStyle(0xf0e8d8, 1); g.fillRect(-sz*0.14, -sz*1.88, sz*0.1, sz*0.1); g.fillRect(sz*0.04, -sz*1.88, sz*0.1, sz*0.1);
      // silver sword (massive)
      g.lineStyle(4, sd, 1); g.lineBetween(sz*1.18, -sz*1.72, sz*1.18, sz*0.28);
      g.fillStyle(sc, 1); g.fillRect(sz*0.96, -sz*2.22, sz*0.44, sz*0.55);
      g.fillStyle(sa, 0.7); g.fillRect(sz*1.04, -sz*2.18, sz*0.28, sz*0.42);
      g.fillStyle(0x8090a0, 1); g.fillRect(sz*0.78, -sz*1.72, sz*0.78, sz*0.18);
    } else if (id === 'dragonKing') {
      // 東海龍王 — Dragon King of the East Sea (boss)
      const dc = 0x104888, ds = 0x1868b8, dg = 0x20d080, dsc = 0x0080a0;
      // serpentine tail base
      g.fillStyle(dc, 1); g.fillEllipse(sz*0.4, sz*0.2, sz*2.5, sz*0.75);
      g.fillEllipse(-sz*0.3, -sz*0.12, sz*1.8, sz*0.6);
      // scale texture on tail
      g.lineStyle(0.8, 0x082848, 0.5);
      for (let sc2 = 0; sc2 < 5; sc2++) {
        g.strokeEllipse(-sz*0.5+sc2*sz*0.45, sz*0.15, sz*0.55, sz*0.3);
      }
      // main body (rearing up)
      g.fillStyle(dc, 1); g.fillEllipse(0, -sz*1.0, sz*1.65, sz*2.1);
      // belly (lighter plates)
      g.fillStyle(0x40b8d0, 0.55); g.fillEllipse(0, -sz*1.0, sz*0.85, sz*1.55);
      // horizontal belly lines
      g.lineStyle(0.8, 0x106880, 0.6);
      for (let bi = 0; bi < 6; bi++) g.lineBetween(-sz*0.38, -sz*0.25 - bi*sz*0.32, sz*0.38, -sz*0.25 - bi*sz*0.32);
      // arms (clawed)
      g.fillStyle(dc, 1); g.fillEllipse(-sz*1.12, -sz*0.65, sz*0.65, sz*1.05); g.fillEllipse(sz*1.12, -sz*0.65, sz*0.65, sz*1.05);
      // webbing
      g.fillStyle(dsc, 0.6);
      g.fillTriangle(-sz*1.38, -sz*0.35, -sz*0.88, -sz*0.35, -sz*1.12, sz*0.08);
      g.fillTriangle(sz*0.88, -sz*0.35, sz*1.38, -sz*0.35, sz*1.12, sz*0.08);
      // dragon claws
      g.fillStyle(0xe0e8c0, 1);
      for (let ci = -1; ci <= 1; ci++) {
        g.fillTriangle(-sz*1.12+ci*sz*0.18, sz*0.12, -sz*1.12+ci*sz*0.18+sz*0.12, sz*0.12, -sz*1.12+ci*sz*0.1, sz*0.38);
        g.fillTriangle(sz*1.12+ci*sz*0.18, sz*0.12, sz*1.12+ci*sz*0.18+sz*0.12, sz*0.12, sz*1.12+ci*sz*0.1, sz*0.38);
      }
      // dragon head (imposing)
      g.fillStyle(dc, 1); g.fillEllipse(0, -sz*2.28, sz*1.4, sz*1.0);
      // dragon snout (elongated)
      g.fillStyle(ds, 1); g.fillEllipse(sz*0.1, -sz*1.95, sz*1.1, sz*0.52);
      g.fillStyle(0xe0f0ff, 0.3); g.fillEllipse(sz*0.0, -sz*2.0, sz*0.65, sz*0.28);
      // nostrils (wisps of smoke)
      g.fillStyle(dc, 1); g.fillCircle(sz*0.42, -sz*1.82, sz*0.1); g.fillCircle(sz*0.62, -sz*1.82, sz*0.1);
      // teeth
      g.fillStyle(0xf0eed0, 1);
      for (let ti = -2; ti <= 2; ti++) {
        g.fillTriangle(ti*sz*0.15+sz*0.15, -sz*1.72, ti*sz*0.15+sz*0.25, -sz*1.72, ti*sz*0.15+sz*0.2, -sz*1.52);
        g.fillTriangle(ti*sz*0.15+sz*0.15, -sz*2.12, ti*sz*0.15+sz*0.25, -sz*2.12, ti*sz*0.15+sz*0.2, -sz*2.28);
      }
      // glowing water eyes
      g.fillStyle(dg, 1); g.fillEllipse(-sz*0.38, -sz*2.42, sz*0.35, sz*0.25); g.fillEllipse(sz*0.22, -sz*2.42, sz*0.35, sz*0.25);
      g.fillStyle(0x000000, 1); g.fillRect(-sz*0.4, -sz*2.46, sz*0.06, sz*0.18); g.fillRect(sz*0.2, -sz*2.46, sz*0.06, sz*0.18);
      g.fillStyle(dg, 0.6); g.fillEllipse(-sz*0.38, -sz*2.42, sz*0.42, sz*0.32); g.fillEllipse(sz*0.22, -sz*2.42, sz*0.42, sz*0.32);
      // antler horns (dragon style)
      g.fillStyle(dg, 1);
      g.lineStyle(3, dg, 1);
      g.lineBetween(-sz*0.35, -sz*2.82, -sz*0.65, -sz*3.42); g.lineBetween(-sz*0.65, -sz*3.42, -sz*0.88, -sz*3.0); g.lineBetween(-sz*0.65, -sz*3.42, -sz*0.35, -sz*3.15);
      g.lineBetween(sz*0.35, -sz*2.82, sz*0.65, -sz*3.42); g.lineBetween(sz*0.65, -sz*3.42, sz*0.88, -sz*3.0); g.lineBetween(sz*0.65, -sz*3.42, sz*0.35, -sz*3.15);
      // dragon pearl (floating between horns)
      g.fillStyle(0x80f0ff, 0.85); g.fillCircle(0, -sz*3.35, sz*0.28);
      g.fillStyle(0xffffff, 0.6); g.fillCircle(-sz*0.1, -sz*3.45, sz*0.12);
      g.fillStyle(dg, 0.25); g.fillCircle(0, -sz*3.35, sz*0.45);
      // flowing whiskers
      g.lineStyle(1.8, dg, 0.7);
      g.lineBetween(-sz*0.55, -sz*1.95, -sz*1.35, -sz*2.4); g.lineBetween(-sz*0.55, -sz*1.95, -sz*1.1, -sz*1.62);
      g.lineBetween(sz*0.75, -sz*1.95, sz*1.55, -sz*2.4); g.lineBetween(sz*0.75, -sz*1.95, sz*1.3, -sz*1.62);
    } else if (id === 'celestial') {
      // 天兵衛 — golden heavenly soldier
      const cc=0xd0a030, cs=0xffe060, cskin=0xd4b87a;
      g.fillStyle(cc,1); g.fillRect(-sz*0.76,-sz*1.55,sz*1.52,sz*1.6);
      g.fillStyle(0xb08020,1); g.fillRect(-sz*0.88,-sz*0.88,sz*1.76,sz*0.2);
      g.fillStyle(cc,1); g.fillRect(-sz*1.12,-sz*1.45,sz*0.44,sz*1.12); g.fillRect(sz*0.68,-sz*1.45,sz*0.44,sz*1.12);
      g.fillStyle(0x3a2c10,1); g.fillRect(-sz*0.62,-sz*0.18,sz*0.54,sz*0.5); g.fillRect(sz*0.08,-sz*0.18,sz*0.54,sz*0.5);
      g.fillStyle(cskin,1); g.fillCircle(0,-sz*1.98,sz*0.58);
      g.fillStyle(cc,1); g.fillRect(-sz*0.65,-sz*2.55,sz*1.3,sz*0.62);
      g.fillStyle(cs,1); g.fillRect(-sz*0.7,-sz*2.58,sz*1.4,sz*0.12);
      // divine halo
      g.lineStyle(2,cs,0.7); g.strokeCircle(0,-sz*2.2,sz*0.9);
      g.lineStyle(1,cs,0.35); g.strokeCircle(0,-sz*2.2,sz*1.1);
      g.fillStyle(0xff3020,0.9); g.fillCircle(-sz*0.22,-sz*2.02,sz*0.1); g.fillCircle(sz*0.22,-sz*2.02,sz*0.1);
      g.lineStyle(3,cs,1); g.lineBetween(sz*0.9,-sz*1.55,sz*0.9,sz*0.28);
      g.fillStyle(cs,1); g.fillTriangle(sz*0.9,-sz*2.0,sz*0.76,-sz*1.55,sz*1.04,-sz*1.55);
      g.fillStyle(0xb08820,1); g.fillRect(sz*0.82,sz*0.16,sz*0.2,sz*0.22);
    } else if (id === 'phoenix') {
      // 鳳凰精 — fire phoenix spirit
      const pc=0xff4010, ps=0xff8020, pf=0xffd040;
      // tail feathers fanning down
      g.fillStyle(pc,0.55); g.fillTriangle(-sz*1.1,sz*0.4,-sz*0.3,sz*0.0,-sz*0.6,sz*0.6);
      g.fillTriangle(-sz*0.6,sz*0.5, sz*0.1,sz*0.05,sz*0.0,sz*0.7);
      g.fillTriangle( sz*0.0,sz*0.5, sz*0.8,sz*0.0,sz*0.5,sz*0.7);
      g.fillTriangle( sz*0.6,sz*0.4, sz*1.1,sz*0.1,sz*0.9,sz*0.65);
      // body (bird shape)
      g.fillStyle(pc,1); g.fillEllipse(0,-sz*0.85,sz*1.6,sz*1.55);
      g.fillStyle(ps,0.5); g.fillEllipse(-sz*0.2,-sz*1.0,sz*0.8,sz*0.8);
      // wings outstretched
      g.fillStyle(pc,0.85); g.fillTriangle(-sz*1.5,-sz*0.55,-sz*0.75,-sz*0.85,sz*0.0,-sz*0.4);
      g.fillTriangle(sz*1.5,-sz*0.55,sz*0.75,-sz*0.85,sz*0.0,-sz*0.4);
      g.fillStyle(pf,0.4); g.fillTriangle(-sz*1.3,-sz*0.55,-sz*0.6,-sz*0.8,sz*0.0,-sz*0.4);
      g.fillTriangle(sz*1.3,-sz*0.55,sz*0.6,-sz*0.8,sz*0.0,-sz*0.4);
      // flame tips on wings
      for(let fi=0;fi<3;fi++){
        g.fillStyle(pf,0.75);
        g.fillTriangle(-sz*(1.5-fi*0.35),-sz*0.55,-sz*(1.4-fi*0.35),-sz*0.8,-sz*(1.25-fi*0.35),-sz*0.55);
        g.fillTriangle(sz*(1.5-fi*0.35),-sz*0.55,sz*(1.4-fi*0.35),-sz*0.8,sz*(1.25-fi*0.35),-sz*0.55);
      }
      // neck + head
      g.fillStyle(pc,1); g.fillEllipse(0,-sz*1.65,sz*0.65,sz*0.9);
      g.fillStyle(pc,1); g.fillEllipse(sz*0.1,-sz*2.18,sz*0.72,sz*0.62);
      // crest feathers
      g.fillStyle(pf,1);
      g.fillTriangle(-sz*0.12,-sz*2.48,sz*0.0,-sz*2.78,sz*0.12,-sz*2.48);
      g.fillTriangle(sz*0.08,-sz*2.44,sz*0.25,-sz*2.72,sz*0.38,-sz*2.44);
      g.fillTriangle(-sz*0.08,-sz*2.44,-sz*0.25,-sz*2.72,-sz*0.38,-sz*2.44);
      // beak
      g.fillStyle(pf,1); g.fillTriangle(sz*0.38,-sz*2.28,sz*0.65,-sz*2.12,sz*0.38,-sz*2.04);
      // eyes — golden
      g.fillStyle(pf,1); g.fillCircle(-sz*0.08,-sz*2.22,sz*0.1); g.fillCircle(sz*0.24,-sz*2.22,sz*0.1);
      g.fillStyle(0x100000,1); g.fillCircle(-sz*0.07,-sz*2.22,sz*0.06); g.fillCircle(sz*0.25,-sz*2.22,sz*0.06);
    } else if (id === 'jadeKing') {
      // 玉皇大帝 — Jade Emperor (ultimate boss)
      const jc=0xd4a010, jg=0xffd700, jw=0xfffce0, jsk=0xe8d0a8;
      // divine robes (wide, majestic)
      g.fillStyle(jc,1); g.fillEllipse(0,-sz*0.75,sz*3.0,sz*2.2);
      g.fillStyle(0xb08808,1); g.fillEllipse(0,-sz*0.65,sz*2.2,sz*1.3);
      // celestial emblem on robe
      g.fillStyle(jg,0.8); g.fillCircle(0,-sz*0.8,sz*0.4);
      g.fillStyle(0xd4a010,1); g.fillCircle(0,-sz*0.8,sz*0.28);
      g.lineStyle(1.5,jg,0.8);
      for(let ri=0;ri<8;ri++){
        const ra=ri*Math.PI/4;
        g.lineBetween(Math.cos(ra)*sz*0.3,-sz*0.8+Math.sin(ra)*sz*0.3,Math.cos(ra)*sz*0.5,-sz*0.8+Math.sin(ra)*sz*0.5);
      }
      // belt (wide ornate)
      g.fillStyle(0xa00020,1); g.fillRect(-sz*1.28,-sz*0.28,sz*2.56,sz*0.3);
      g.fillStyle(jg,0.9); g.fillRect(-sz*1.28,-sz*0.28,sz*2.56,sz*0.08);
      // arms (long sleeves)
      g.fillStyle(jc,1); g.fillEllipse(-sz*1.55,-sz*0.85,sz*0.75,sz*1.2); g.fillEllipse(sz*1.55,-sz*0.85,sz*0.75,sz*1.2);
      g.fillStyle(jg,0.8); g.fillEllipse(-sz*1.55,-sz*0.25,sz*0.6,sz*0.35); g.fillEllipse(sz*1.55,-sz*0.25,sz*0.6,sz*0.35);
      g.fillStyle(jsk,1); g.fillCircle(-sz*1.58,-sz*0.12,sz*0.25); g.fillCircle(sz*1.58,-sz*0.12,sz*0.25);
      // scepter (ruyi)
      g.lineStyle(3.5,jg,1); g.lineBetween(sz*1.72,-sz*1.62,sz*1.72,sz*0.32);
      g.fillStyle(jg,1); g.fillEllipse(sz*1.72,-sz*1.82,sz*0.5,sz*0.35);
      g.fillStyle(jw,0.6); g.fillEllipse(sz*1.72,-sz*1.82,sz*0.32,sz*0.22);
      g.lineStyle(1.5,jg,0.7); g.lineBetween(sz*1.52,-sz*1.72,sz*1.92,-sz*1.72); g.lineBetween(sz*1.52,-sz*1.92,sz*1.92,-sz*1.92);
      // imperial face (dignified)
      g.fillStyle(jsk,1); g.fillCircle(0,-sz*2.12,sz*0.82);
      // majestic beard
      g.fillStyle(jw,1); g.fillEllipse(0,-sz*1.65,sz*0.95,sz*0.65);
      g.lineStyle(1,0xd0c890,0.5);
      for(let bi=0;bi<7;bi++) g.lineBetween(-sz*0.36+bi*sz*0.12,-sz*1.42,-sz*0.36+bi*sz*0.12,-sz*1.22);
      // eyes — wise and powerful
      g.fillStyle(0x301808,1); g.fillEllipse(-sz*0.28,-sz*2.25,sz*0.28,sz*0.16); g.fillEllipse(sz*0.28,-sz*2.25,sz*0.28,sz*0.16);
      g.fillStyle(0xffd040,0.9); g.fillCircle(-sz*0.28,-sz*2.25,sz*0.07); g.fillCircle(sz*0.28,-sz*2.25,sz*0.07);
      // eyebrows (thick, authoritative)
      g.fillStyle(0x201008,1); g.fillRect(-sz*0.48,-sz*2.42,sz*0.42,sz*0.1); g.fillRect(sz*0.06,-sz*2.42,sz*0.42,sz*0.1);
      // imperial crown (九龍冠 — nine dragon crown)
      g.fillStyle(jg,1); g.fillRect(-sz*0.95,-sz*2.92,sz*1.9,sz*0.35);
      g.fillStyle(0xa08008,1); g.fillRect(-sz*0.88,-sz*2.92,sz*1.76,sz*0.12);
      // crown spires
      g.fillStyle(jg,1);
      g.fillTriangle(-sz*0.78,-sz*2.92,-sz*0.55,-sz*3.55,-sz*0.32,-sz*2.92);
      g.fillTriangle(-sz*0.2,-sz*2.92,sz*0.0,-sz*3.78,sz*0.2,-sz*2.92);
      g.fillTriangle(sz*0.32,-sz*2.92,sz*0.55,-sz*3.55,sz*0.78,-sz*2.92);
      // crown gems
      g.fillStyle(0xff2020,1); g.fillCircle(-sz*0.55,-sz*3.18,sz*0.13);
      g.fillStyle(0x40c8ff,1); g.fillCircle(0,-sz*3.38,sz*0.15);
      g.fillStyle(0xff2020,1); g.fillCircle(sz*0.55,-sz*3.18,sz*0.13);
      g.fillStyle(jg,0.4); g.fillCircle(0,-sz*2.12,sz*1.15);
      // divine aura streaks
      g.lineStyle(1.2,jg,0.25);
      for(let ai=0;ai<8;ai++){const aa=ai*Math.PI/4; g.lineBetween(Math.cos(aa)*sz*1.2,-sz*1.2+Math.sin(aa)*sz*1.0,Math.cos(aa)*sz*2.0,-sz*1.2+Math.sin(aa)*sz*1.8);}
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
    const s = 22;
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
      fontSize: (size+5)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color, stroke:'#000', strokeThickness:4,
    }).setOrigin(0.5,0.5).setDepth(20).setScale(0.25);
    this.tweens.add({targets:t, scaleX:1.35, scaleY:1.35, duration:130, ease:'Back.easeOut',
      onComplete:()=>this.tweens.add({targets:t,y:y-90,alpha:0,scaleX:0.85,scaleY:0.85,duration:1050,ease:'Power2',onComplete:()=>t.destroy()})});
  }

  _shake(intensity=0.005, duration=260) {
    this.cameras.main.shake(duration, intensity);
  }

  _hitImpact(x, y, col=0xffffff, strong=false) {
    const dep=22;
    const ring=this.add.graphics().setDepth(dep);
    ring.lineStyle(strong?5:3, col, 0.95); ring.strokeCircle(0,0,7); ring.setPosition(x,y);
    this.tweens.add({targets:ring, scaleX:strong?7:4.5, scaleY:strong?7:4.5, alpha:0, duration:strong?400:270, ease:'Power2',
      onComplete:()=>ring.destroy()});
    const flash=this.add.graphics().setDepth(dep);
    flash.fillStyle(col, 0.85); flash.fillCircle(0,0,strong?28:18);
    flash.fillStyle(0xffffff,0.55); flash.fillCircle(0,0,strong?15:10); flash.setPosition(x,y);
    this.tweens.add({targets:flash,alpha:0,scaleX:strong?2.4:1.9,scaleY:strong?2.4:1.9,duration:strong?280:190,ease:'Power3',
      onComplete:()=>flash.destroy()});
    const sc=strong?10:6;
    for(let i=0;i<sc;i++){
      const sl=this.add.graphics().setDepth(dep-1);
      const ang=Math.PI*2*i/sc;
      const len=(strong?46:26)*(0.55+Math.random()*0.55);
      sl.lineStyle(strong?2.5:1.5, col, 0.78);
      sl.lineBetween(0,0,Math.cos(ang)*len,Math.sin(ang)*len); sl.setPosition(x,y);
      this.tweens.add({targets:sl, scaleX:2.2, scaleY:2.2, alpha:0, duration:220+Math.random()*100, ease:'Power2',
        onComplete:()=>sl.destroy()});
    }
  }

  _enemyDeathFX(sp) {
    const x=sp.g.x, y=sp.g.y-30, col=sp.e.color||0x884422;
    const cloud=this.add.graphics().setDepth(24);
    cloud.fillStyle(col,0.48); cloud.fillCircle(0,0,32); cloud.setPosition(x,y);
    this.tweens.add({targets:cloud,alpha:0,scaleX:2.9,scaleY:2.9,duration:520,ease:'Power2',onComplete:()=>cloud.destroy()});
    for(let i=0;i<20;i++){
      const p=this.add.graphics().setDepth(25);
      const r=2+Math.random()*6;
      p.fillStyle(col,0.9); p.fillCircle(0,0,r);
      p.setPosition(x+(Math.random()-0.5)*52,y+(Math.random()-0.5)*52);
      const ang=Math.random()*Math.PI*2, spd=38+Math.random()*58;
      this.tweens.add({targets:p,x:p.x+Math.cos(ang)*spd,y:p.y+Math.sin(ang)*spd-28,
        alpha:0,scaleX:0.1,scaleY:0.1,duration:580+Math.random()*480,ease:'Power2',onComplete:()=>p.destroy()});
    }
    this._hitImpact(x, y+26, 0xffffff, false);
  }

  _spawnParticles(x, y, color, count=8, spread=40) {
    for (let i = 0; i < count; i++) {
      const p = this.add.graphics();
      const r = 2 + Math.random()*5;
      p.fillStyle(color, 0.92); p.fillCircle(0, 0, r);
      p.fillStyle(0xffffff, 0.38); p.fillCircle(-r*0.3,-r*0.3,r*0.42);
      p.setPosition(x, y).setDepth(18);
      const angle = Math.PI*2*i/count + (Math.random()-0.5)*0.9;
      const dist  = spread * (0.35 + Math.random()*0.9);
      this.tweens.add({
        targets:p, x:x+Math.cos(angle)*dist, y:y+Math.sin(angle)*dist-20,
        alpha:0, scaleX:0.1, scaleY:0.1, duration:460+Math.random()*360, ease:'Power2',
        onComplete:()=>p.destroy(),
      });
    }
    if (spread >= 36) {
      const sc = Math.min(6, Math.floor(count/2));
      for(let i=0;i<sc;i++){
        const sl=this.add.graphics().setDepth(17);
        const ang=Math.PI*2*i/sc+Math.random()*0.6;
        const len=(spread*0.42)*(0.5+Math.random()*0.7);
        sl.lineStyle(1.5, color, 0.72); sl.lineBetween(0,0,Math.cos(ang)*len,Math.sin(ang)*len);
        sl.setPosition(x,y);
        this.tweens.add({targets:sl,alpha:0,scaleX:1.6,scaleY:1.6,duration:220+Math.random()*120,ease:'Power2',
          onComplete:()=>sl.destroy()});
      }
    }
  }

  _animHeroAttack(sp, targetSp, onHit, onDone, actorId) {
    if (!sp || !targetSp) { onHit&&onHit(); onDone&&onDone(); return; }
    const origX = sp.g.x;
    const targetX = targetSp.g.x + 55;
    // charge-up flash
    const chargeG=this.add.graphics().setDepth(15);
    chargeG.fillStyle(0xffffff,0.32); chargeG.fillEllipse(origX,sp.g.y-34,36,72);
    this.tweens.add({targets:chargeG,alpha:0,scaleX:1.6,scaleY:1.6,duration:170,onComplete:()=>chargeG.destroy()});
    // windup squash
    this.tweens.add({targets:sp.g, scaleX:0.80, scaleY:1.18, duration:110, ease:'Power2',
      onComplete:()=>{
        // afterimage
        const after=this.add.graphics().setDepth(sp.g.depth);
        after.fillStyle(0xffffff,0.16); after.fillEllipse(sp.g.x,sp.g.y-32,32,70);
        this.tweens.add({targets:after,alpha:0,duration:240,onComplete:()=>after.destroy()});
        // dash
        this.tweens.add({targets:sp.g, scaleX:1, scaleY:1, x:targetX, duration:145, ease:'Power3.easeIn',
          onComplete:()=>{
            const tx=targetSp.g.x, ty=targetSp.g.y;
            if (actorId==='yunyi') {
              this._hitImpact(tx, ty-44, 0xffd700, true);
              this._shake(0.010, 300);
              const staffG=this.add.graphics().setDepth(22);
              staffG.lineStyle(8,0xf0c020,1); staffG.lineBetween(-42,0,42,0);
              staffG.lineStyle(3,0xffffa0,0.7); staffG.lineBetween(-42,0,42,0);
              staffG.fillStyle(0xffd700,1); staffG.fillCircle(-42,0,7); staffG.fillCircle(42,0,7);
              staffG.setPosition(tx,ty-44);
              this.tweens.add({targets:staffG,angle:1620,alpha:0,duration:520,ease:'Power2',onComplete:()=>staffG.destroy()});
              const sw=this.add.graphics().setDepth(21);
              sw.lineStyle(4,0xffd700,0.85); sw.strokeCircle(0,0,10); sw.setPosition(tx,ty-44);
              this.tweens.add({targets:sw,scaleX:6.5,scaleY:6.5,alpha:0,duration:400,ease:'Power2',onComplete:()=>sw.destroy()});
              this._spawnParticles(tx,ty-44,0xffd700,18,68);
            } else if (actorId==='linger') {
              this._hitImpact(tx, ty-36, 0x60ff40, false);
              this._shake(0.006, 230);
              for(let i=0;i<9;i++){
                const lf=this.add.graphics().setDepth(22);
                lf.fillStyle(0x40c020,0.9); lf.fillEllipse(0,0,12,6);
                const ang=i*Math.PI*2/9; const r=36;
                lf.setPosition(tx+Math.cos(ang)*r, ty-36+Math.sin(ang)*r);
                this.tweens.add({targets:lf,x:tx,y:ty-36,alpha:0,scaleX:0.15,scaleY:0.15,duration:330,ease:'Power2',onComplete:()=>lf.destroy()});
              }
              const gf=this.add.graphics().setDepth(21);
              gf.lineStyle(3.5,0x80ff40,0.85); gf.strokeCircle(0,0,26); gf.setPosition(tx,ty-36);
              this.tweens.add({targets:gf,scaleX:2.8,scaleY:2.8,alpha:0,duration:400,onComplete:()=>gf.destroy()});
              this._spawnParticles(tx,ty-36,0x60d840,18,56);
            } else if (actorId==='yuehua') {
              const ax=sp.g.x, ay=sp.g.y-38;
              const arr=this.add.graphics().setDepth(22);
              arr.fillStyle(0x90d8ff,1); arr.fillTriangle(0,-7,-5,7,5,7);
              arr.lineStyle(2,0x60c8ff,0.9); arr.lineBetween(0,7,0,26);
              arr.setPosition(ax,ay);
              const dx=tx-ax, dy=(ty-36)-ay;
              arr.setAngle(Math.atan2(dy,dx)*180/Math.PI+90);
              const dur=Math.max(75, Math.sqrt(dx*dx+dy*dy)*0.65);
              this.tweens.add({targets:arr,x:tx,y:ty-36,duration:dur,ease:'Power3.easeIn',
                onComplete:()=>this.tweens.add({targets:arr,alpha:0,duration:140,onComplete:()=>arr.destroy()})});
              const trail=this.add.graphics().setDepth(21);
              trail.lineStyle(2.5,0x90d8ff,0.5); trail.lineBetween(ax,ay,tx,ty-36); trail.setPosition(0,0);
              this.tweens.add({targets:trail,alpha:0,duration:280,onComplete:()=>trail.destroy()});
              this.time.delayedCall(dur,()=>{
                this._hitImpact(tx,ty-36,0x60c8ff,false);
                this._spawnParticles(tx,ty-36,0x60c8ff,14,52);
                this._shake(0.005,200);
              });
            }
            onHit && onHit();
            this.tweens.add({targets:sp.g,x:origX,scaleX:1,scaleY:1,duration:310,ease:'Back.easeOut',onComplete:onDone});
          },
        });
      },
    });
  }

  _animEnemyAttack(sp, targetSp, onHit, onDone) {
    if (!sp || !targetSp) { onHit&&onHit(); onDone&&onDone(); return; }
    const origX = sp.g.x;
    const targetX = targetSp.g.x - 55;
    this.tweens.add({targets:sp.g, scaleX:1.18, scaleY:0.85, duration:95, ease:'Power2',
      onComplete:()=>this.tweens.add({targets:sp.g, scaleX:1, scaleY:1, x:targetX, duration:150, ease:'Power3.easeIn',
        onComplete:()=>{
          this._hitImpact(targetSp.g.x, targetSp.g.y-32, 0xff2020, false);
          onHit && onHit();
          this.tweens.add({targets:sp.g, x:origX, duration:280, ease:'Back.easeOut', onComplete:onDone});
        },
      }),
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
      const barW=Math.floor(pw*0.52), bx=px+10;
      const by1=ry+rowH*0.43, by2=ry+rowH*0.63, bh2=Math.max(4,Math.floor(rowH*0.12));
      const st=calcStats(m);
      const hpBar=mkBar(this,bx,by1,barW,bh2,m.hp,m.maxHp,0xe04040); hpBar.setDepth(5); this.statusTexts.push(hpBar);
      const mpBar=mkBar(this,bx,by2,barW,bh2,m.mp,st.maxMp,0x4060e0); mpBar.setDepth(5); this.statusTexts.push(mpBar);
      const hpT=this.add.text(bx+barW+5,by1+bh2/2,`${m.hp}`,{fontSize:fsS+'px',fontFamily:'monospace',color:'#e05050',stroke:'#000',strokeThickness:1}).setOrigin(0,0.5).setDepth(5);
      const mpT=this.add.text(bx+barW+5,by2+bh2/2,`${m.mp}`,{fontSize:fsS+'px',fontFamily:'monospace',color:'#5070e0',stroke:'#000',strokeThickness:1}).setOrigin(0,0.5).setDepth(5);
      this.statusTexts.push(hpT,mpT);
      // Limit gauge (tiny gold bar, fills from damage taken)
      const lgGauge=m.limitGauge||0, lgW=Math.floor(barW*0.55), lgY=ry+rowH*0.80;
      const lgBar=mkBar(this,bx,lgY,lgW,2,lgGauge,100,0xffe040); lgBar.setDepth(5); this.statusTexts.push(lgBar);
      const lgLbl=this.add.text(bx+lgW+3,lgY+1,'必',{fontSize:Math.max(7,fsS-3)+'px',fontFamily:'monospace',color:lgGauge>=100?'#ffd700':'#5a4a10',stroke:'#000',strokeThickness:1}).setOrigin(0,0.5).setDepth(5);
      this.statusTexts.push(lgLbl);
      // EXP bar
      const expBar=mkBar(this,bx,ry+rowH*0.92,barW,2,m.exp,expForLevel(m.lv),0x50c878); expBar.setDepth(5); this.statusTexts.push(expBar);
      // Status labels (Chinese icons)
      const STATUS_LBL={poison:'毒',burn:'燒',slow:'緩',stun:'昏',atkUp:'攻↑',defUp:'守↑',defend:'防'};
      const STATUS_CLR={poison:'#c050e8',burn:'#ff8040',slow:'#80a0ff',stun:'#ffcc00',atkUp:'#ffe060',defUp:'#80e8ff',defend:'#80c0ff'};
      const uniqueSt=[...new Set(m.status)].filter(s=>STATUS_LBL[s]);
      if (uniqueSt.length>0) {
        const stLabel=uniqueSt.map(s=>STATUS_LBL[s]).join(' ');
        const stClr=STATUS_CLR[uniqueSt[0]]||'#c050e8';
        const stT=this.add.text(px+pw-8,ty,stLabel,{fontSize:fsS+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:stClr,stroke:'#000',strokeThickness:1}).setOrigin(1,0).setDepth(5);
        this.statusTexts.push(stT);
      }
      if (!dead && lgGauge>=100) {
        const stOff=uniqueSt.length>0?Math.floor(fsS*1.35):0;
        const lt=this.add.text(px+pw-8,ty+stOff,'◆必殺',{fontSize:fsS+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#ff5010',stroke:'#000',strokeThickness:1}).setOrigin(1,0).setDepth(5);
        this.statusTexts.push(lt);
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
      if ((actor.limitGauge||0)>=100) cmds.push('必殺');
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
    this._hitImpact(sp.g.x, sp.g.y-(sp.e.sz||28)*0.88, sp.e.color||0xff8080, false);
    let c=0;
    this.time.addEvent({ delay:68, repeat:7, callback:() => {
      c++; sp.g.setAlpha(c%2===0?1:0.16);
      if (c>=8) sp.g.setAlpha(sp.e.dead?0:1);
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
      // Status icons above HP bar
      const STATUS_EICL={poison:0xc050e8,burn:0xff5020,slow:0x4080ff,stun:0xffcc00,atkUp:0xffe060,defUp:0x80e8ff};
      const uniqSt=[...new Set(e.status)].filter(s=>STATUS_EICL[s]);
      if(uniqSt.length>0){
        const iSz=8, iGap=2;
        const startIX=sp.x-(uniqSt.length*(iSz+iGap))/2;
        const iY=this.groundY+14;
        const stG=this.add.graphics().setDepth(9);
        uniqSt.forEach((s,ii)=>{
          stG.fillStyle(STATUS_EICL[s],0.9);
          stG.fillRect(startIX+ii*(iSz+iGap),iY,iSz,iSz);
          stG.lineStyle(1,0x000000,0.4);
          stG.strokeRect(startIX+ii*(iSz+iGap),iY,iSz,iSz);
        });
        sp.statusTxt=stG;
      }
    }
    this._drawEnemy(sp.g, e);
    if (e.dead && !e._deathFXDone) {
      e._deathFXDone = true;
      this._enemyDeathFX(sp);
      this.time.delayedCall(290, ()=>{ sp.g.setAlpha(0); sp.lbl.setAlpha(0.3); sp.g.setPosition(sp.x,sp.y); });
    } else if (e.dead) { sp.g.setAlpha(0); sp.lbl.setAlpha(0.3); sp.g.setPosition(sp.x,sp.y); }
    // Boss HP bar refresh + rage mode
    if (GS.battleData?.isBoss && idx===0 && this._bossBar) {
      this._bossBar.destroy();
      const bclr=e.hp<e.maxHp*0.3?0xff2020:e.hp<e.maxHp*0.6?0xff6020:0xd02020;
      this._bossBar=mkBar(this,this._bossBarX,this._bossBarY+12,this._bossBarW,this._bossBarH,e.hp,e.maxHp,bclr);
      this._bossBar.setDepth(23);
      if(this._bossBarText) this._bossBarText.setText(`${e.name}　${e.hp} / ${e.maxHp}`);
      if (e.hp<=e.maxHp*0.5&&!e._raged&&!e.dead) {
        e._raged=true; e.atk=Math.floor(e.atk*1.35);
        if (e.acts2) e.acts=[...e.acts2];
        Sound?.play('rage');
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
        // Boss bar rage pulse + Phase 2 label
        if (this._bossBg) { this.tweens.add({targets:this._bossBg,alpha:0.5,duration:130,yoyo:true,repeat:4}); }
        if (this._bossBarText) this._bossBarText.setColor('#ff6060');
        const p2lbl=this.add.text(this._bossBarX+(this._bossBarW||0)+6, this._bossBarY+4, '【第二形態】', {
          fontSize:'10px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#ff6040',stroke:'#000',strokeThickness:2,
        }).setDepth(24).setAlpha(0);
        this.tweens.add({targets:p2lbl,alpha:1,duration:350,delay:400});
      }
    }
    // Non-boss enemy enrage at <30% HP
    if (!e.boss && !e.dead && !e._enraged && e.hp>0 && e.hp<=e.maxHp*0.3) {
      e._enraged=true; e.status.push('atkUp');
      Sound?.play('rage');
      this._addLog(`${e.name} 瀕死狂怒！攻擊力大幅提升！`);
      if (sp) {
        this._floatText(sp.g.x, sp.g.y-(e.sz||28)*2.2, '發狂！', '#ff4020', 18);
        this._spawnParticles(sp.g.x, sp.g.y-32, 0xff3010, 14, 55);
        this._shake(0.008, 350);
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
        GS.flags._escapes = (GS.flags._escapes||0)+1;
        if(GS.flags._escapes>=5) Achieve?.unlock('pacifist');
        this.time.delayedCall(400, () => {
          this.cameras.main.fadeOut(400,0,0,0);
          this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('WorldScene'));
        });
      } else doAfter('逃跑失敗！');
      return;
    }

    if (cmd==='limit') {
      actor.limitGauge=0;
      const alive=this.enemies.filter(e=>!e.dead);
      if (!alive.length) { doAfter('…'); return; }
      const tgt=alive[0], tgtIdx=this.enemies.indexOf(tgt), st=calcStats(actor);
      const dmg=this._calcDmg(st.atk, tgt.def, 4.0);
      const heroSp=this.partySprites[this.actorIdx], enemySp=this.enemySprites[tgtIdx];

      // Per-character limit break colors + titles
      const LIMIT_CFG={
        yunyi:  {clr:0xffc020,txt:'#ffe040',title:'天命金棍　必殺！',sfx:'thunderSkill'},
        linger: {clr:0x60c040,txt:'#88ff60',title:'山神法力　必殺！',sfx:'magic'},
        yuehua: {clr:0x60c8ff,txt:'#a0e8ff',title:'月雨千矢　必殺！',sfx:'thunderSkill'},
      };
      const lcfg=LIMIT_CFG[actor.id]||{clr:0xff8020,txt:'#ffaa40',title:'必 殺！',sfx:'hit'};

      // Screen flash
      const flash=this.add.graphics().setDepth(45);
      flash.fillStyle(lcfg.clr,0); flash.fillRect(0,0,this.W,this.H);
      this.tweens.add({targets:flash,alpha:0.42,duration:75,yoyo:true,repeat:2,onComplete:()=>flash.destroy()});

      // Character-specific intro effects
      if (actor.id==='yunyi' && heroSp) {
        for (let i=0;i<6;i++) {
          this.time.delayedCall(i*40, ()=>{
            const lg=this.add.graphics().setDepth(46);
            const lx=heroSp.g.x+(Math.random()-0.5)*60, ly=this.groundY-this.H*0.6*Math.random();
            lg.lineStyle(2+Math.random()*2,0xffc020,0.85); lg.lineBetween(lx,ly,lx+(Math.random()-0.5)*20,ly+this.H*0.5);
            this.tweens.add({targets:lg,alpha:0,duration:220+Math.random()*120,onComplete:()=>lg.destroy()});
          });
        }
      } else if (actor.id==='linger' && heroSp) {
        for (let i=0;i<4;i++) {
          const rg=this.add.graphics().setDepth(46);
          rg.lineStyle(2,0x60e040,0.7); rg.strokeCircle(heroSp.g.x,heroSp.g.y-20,12+i*16);
          rg.setAlpha(0);
          this.tweens.add({targets:rg,alpha:1,scaleX:1.8,scaleY:1.8,duration:350,delay:i*60,ease:'Power2',onComplete:()=>this.tweens.add({targets:rg,alpha:0,duration:220,onComplete:()=>rg.destroy()})});
        }
      } else if (actor.id==='yuehua' && heroSp) {
        for (let i=0;i<8;i++) {
          this.time.delayedCall(i*35, ()=>{
            const ag=this.add.graphics().setDepth(46);
            ag.fillStyle(0x80d8ff,0.9); ag.fillTriangle(0,-7,-4,7,4,7);
            ag.lineStyle(1.5,0x40a8ff,0.7); ag.lineBetween(0,7,0,24);
            const ax=enemySp?enemySp.g.x+(Math.random()-0.5)*55:this.W*0.25+Math.random()*60;
            ag.setPosition(ax,-20); ag.setAngle(180);
            this.tweens.add({targets:ag,y:this.groundY,duration:280,ease:'Power3.easeIn',onComplete:()=>{this._spawnParticles(ax,this.groundY-10,0x60c8ff,4,20);ag.destroy();}});
          });
        }
      }

      // "必殺！" title text
      const bt=this.add.text(this.W/2,this.H*0.32,lcfg.title,{
        fontSize:Math.floor(this.H*0.075)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:lcfg.txt,stroke:'#000000',strokeThickness:7,
        shadow:{offsetX:0,offsetY:0,color:lcfg.txt,blur:32,fill:true},
      }).setOrigin(0.5).setDepth(52).setAlpha(0).setScale(1.7);
      this.tweens.add({targets:bt,alpha:1,scaleX:1,scaleY:1,duration:280,ease:'Back.easeOut',
        onComplete:()=>this.time.delayedCall(480,()=>this.tweens.add({targets:bt,alpha:0,y:bt.y-22,duration:260,onComplete:()=>bt.destroy()}))
      });
      Sound?.play(lcfg.sfx);

      GS.flags._limitCount=(GS.flags._limitCount||0)+1;
      if(GS.flags._limitCount>=3)Achieve?.unlock('limit_breaker');
      this._animHeroAttack(heroSp, enemySp, ()=>{
        tgt.hp=Math.max(0,tgt.hp-dmg); if(tgt.hp===0){tgt.dead=true;Sound?.play('enemyDead');}else Sound?.play('hit');
        this._flashEnemy(tgtIdx); this._refreshEnemyHp(tgtIdx); this._shake(0.020,520);
        const ex=enemySp?enemySp.g.x:0, ey=(enemySp?enemySp.g.y:this.groundY)-(tgt.sz||28)*1.4;
        this._floatText(ex,ey,String(dmg),lcfg.txt,34);
        this._spawnParticles(ex,ey,lcfg.clr,28,80); this._spawnParticles(ex,ey+20,0xffffff,10,50);
        if(tgt.dead)this.time.delayedCall(350,()=>this._spawnParticles(ex,ey+20,tgt.color||0x884422,18,72));
      }, ()=>doAfter(`${actor.name} 發動必殺技！對 ${tgt.name} 造成 ${dmg} 點傷害！`), actor.id);
      return;
    }

    if (cmd==='attack') {
      const tgt=this.enemies[targetIdx], st=calcStats(actor);
      // Passive: yuehua has 15% crit; yunyi gets +20% ATK at near-full HP (勇者本色)
      const critRate=actor.id==='yuehua'?0.15:0.08;
      const crit=Math.random()<critRate;
      const yunyiPassive=(actor.id==='yunyi'&&actor.hp>=Math.floor(actor.maxHp*0.9));
      const passiveAtk=yunyiPassive?Math.floor(st.atk*1.2):st.atk;
      if(yunyiPassive){const _hSp=this.partySprites[this.actorIdx];if(_hSp)this._floatText(_hSp.g.x,_hSp.g.y-82,'勇者本色','#ffd060',11);}
      let dmg=this._calcDmg(passiveAtk,tgt.def,1.0);
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
        Sound?.play(sk.elem==='thunder' ? 'thunderSkill' : 'magic');
        const targets=sk.tgt==='all'?this.enemies.filter(e=>!e.dead):[this.enemies[targetIdx]];
        const hitCount=sk.hits||1;
        const elemEffects=[];
        // Elemental chain reaction table
        const ELEM_CHAINS={
          ice:    {status:'burn',   name:'凍炎爆裂！',clr:'#80e8ff',mult:0.65},
          fire:   {status:'poison', name:'毒焰爆炎！',clr:'#ff7020',mult:0.70},
          thunder:{status:'slow',   name:'雷電穿刺！',clr:'#ffe040',mult:0.55},
          wind:   {status:'stun',   name:'疾風破甲！',clr:'#80ee80',mult:0.50},
        };
        const chainResults=[];
        const dmgs=targets.map(tgt=>{
          const isWeak=sk.elem&&sk.elem!=='none'&&tgt.weak?.includes(sk.elem);
          const isResist=sk.elem&&sk.elem!=='none'&&tgt.resist?.includes(sk.elem);
          const elemMult=isWeak?1.5:isResist?0.5:1.0;
          elemEffects.push(isWeak?'weak':isResist?'resist':'none');
          let total=0;
          for(let h=0;h<hitCount;h++){const d=Math.floor(this._calcDmg(st.atk,tgt.def,sk.pow,sk.pierce||0)*elemMult);tgt.hp=Math.max(0,tgt.hp-d);if(tgt.hp===0)tgt.dead=true;total+=d;}
          // Chain reaction bonus
          const chain=sk.elem&&ELEM_CHAINS[sk.elem];
          let chainInfo=null;
          if(chain&&tgt.status.includes(chain.status)){
            const si=tgt.status.indexOf(chain.status); tgt.status.splice(si,1);
            const bonus=Math.floor(total*chain.mult);
            tgt.hp=Math.max(0,tgt.hp-bonus); if(tgt.hp===0)tgt.dead=true;
            total+=bonus; chainInfo={name:chain.name,clr:chain.clr,bonus};
          }
          chainResults.push(chainInfo);
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
            this._floatText(ex,ey,String(dmgs[ti])+hitSuffix,_et,22);
            if(elemEffects[ti]==='weak'){
              this._floatText(ex,ey-28,'弱點！','#ffee20',16);
              this._spawnParticles(ex,ey+20,_ec,24,68);
            } else if(elemEffects[ti]==='resist'){
              this._floatText(ex,ey-28,'耐性…','#aaaaaa',14);
              this._spawnParticles(ex,ey+20,_ec,6,28);
            } else {
              this._spawnParticles(ex,ey+20,_ec,16,58);
            }
            this._hitImpact(ex,ey+20,_ec,elemEffects[ti]==='weak');
            if(chainResults[ti]){
              const cr=chainResults[ti];
              this._floatText(ex,ey-42,cr.name,cr.clr,17);
              this._floatText(ex,ey-60,`+${cr.bonus}`,cr.clr,14);
              this._spawnParticles(ex,ey,parseInt(cr.clr.replace('#',''),16),20,65);
              this._shake(0.013,400);
              GS.flags._chainCount=(GS.flags._chainCount||0)+1;
              if(GS.flags._chainCount>=3)Achieve?.unlock('chain_master');
            }
          }
        });
        this._shake(0.009, 300);
        const _elemC = ELEM_CLR[sk.elem||'none']||0x8888ff;
        const _ef = this.add.graphics().setDepth(45);
        _ef.fillStyle(_elemC, 0); _ef.fillRect(0, 0, this.W, this.H);
        this.tweens.add({ targets:_ef, alpha:0.22, duration:65, yoyo:true, repeat:2, onComplete:()=>_ef.destroy() });
        // Expanding skill shockwave
        const _sw = this.add.graphics().setDepth(44);
        _sw.lineStyle(3, _elemC, 0.8); _sw.strokeCircle(this.W*0.22, this.groundY-20, 10);
        this.tweens.add({targets:_sw, scaleX:12, scaleY:12, alpha:0, duration:550, ease:'Power2', onComplete:()=>_sw.destroy()});
        const _efx=elemEffects[0];
        const _efxSuf=_efx==='weak'?' 弱點！':_efx==='resist'?' 耐性…':'';
        const _chainSuf=chainResults[0]?` ${chainResults[0].name}`:'';
        msg=`${actor.name} 施展 ${sk.name}，造成 ${dmgs.join('/')} 點傷害！${_efxSuf}${_chainSuf}`;
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
      } else if (sk.type==='cleanse') {
        Sound?.play('cleanse');
        const CLEANSE_ST=['poison','burn','slow','stun','atkDown'];
        const ctargets=this.party.filter(m=>!m.dead);
        let totalRemoved=0;
        ctargets.forEach(tgt=>{
          const before=tgt.status.length;
          tgt.status=tgt.status.filter(s=>!CLEANSE_ST.includes(s));
          totalRemoved+=before-tgt.status.length;
          const csp=this.partySprites[this.party.indexOf(tgt)];
          if(csp){
            this._floatText(csp.g.x,csp.g.y-50,'淨化！','#aaffcc',18);
            this._spawnParticles(csp.g.x,csp.g.y-20,0x88ffcc,8,30);
            const cgl=this.add.graphics().setDepth(12);
            cgl.fillStyle(0x80ffcc,0.18); cgl.fillCircle(csp.g.x,csp.g.y-18,36);
            this.tweens.add({targets:cgl,alpha:0,scaleX:1.8,scaleY:1.8,duration:700,onComplete:()=>cgl.destroy()});
          }
        });
        if(totalRemoved>0){GS.flags._purifyCount=(GS.flags._purifyCount||0)+1;Achieve?.unlock('purifier');}
        msg=totalRemoved>0?`${actor.name} 施展 ${sk.name}！全體異常狀態解除！`:`${actor.name} 施展 ${sk.name}！`;
      } else if (sk.type==='buff') {
        const turns=sk.turns||3;
        for(let i=0;i<turns;i++) actor.status.push(sk.buff||'atkUp');
        const sp2=this.partySprites[this.actorIdx];
        const BUFF_LABELS={atkUp:'攻擊↑',defUp:'防禦↑'};
        const bn=BUFF_LABELS[sk.buff]||'BUFF↑';
        if(sp2){
          this._floatText(sp2.g.x,sp2.g.y-62,bn,'#ffe060',22);
          this._spawnParticles(sp2.g.x,sp2.g.y-20,0xffe060,8,35);
          const gl=this.add.graphics().setDepth(12);
          gl.fillStyle(0xffd700,0.22); gl.fillCircle(sp2.g.x,sp2.g.y-18,32);
          this.tweens.add({targets:gl,alpha:0,duration:700,onComplete:()=>gl.destroy()});
        }
        Sound?.play('buff');
        msg=`${actor.name} 施展 ${sk.name}！${bn}`;
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
    const _stunActor=this.party[this.actorIdx];
    if (_stunActor.status.includes('stun')) {
      const _si=_stunActor.status.indexOf('stun'); _stunActor.status.splice(_si,1);
      this._addLog(`${_stunActor.name} 昏迷，跳過行動！`);
      this._rebuildStatus();
      this.time.delayedCall(500,()=>this._nextActor()); return;
    }
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
            const _pmi=this.party.indexOf(m);
            const _sp=this.partySprites[_pmi];
            if (m.status.includes('burn')) {
              const dmg=Math.max(1,Math.floor(m.maxHp*0.06));
              m.hp=Math.max(1,m.hp-dmg); this._addLog(`${m.name} 灼傷，損失 ${dmg} HP！`);
              Sound?.play('burn');
              if(_sp){this._floatText(_sp.g.x,_sp.g.y-40,String(dmg),'#ff8040',16);this._spawnParticles(_sp.g.x,_sp.g.y-10,0xff4020,5,22);}
            }
            if (m.status.includes('poison')) {
              const dmg=Math.max(1,Math.floor(m.maxHp*0.05));
              m.hp=Math.max(1,m.hp-dmg); this._addLog(`${m.name} 中毒，損失 ${dmg} HP！`);
              Sound?.play('poison');
              if(_sp){this._floatText(_sp.g.x,_sp.g.y-54,String(dmg),'#c050e8',16);this._spawnParticles(_sp.g.x,_sp.g.y-10,0x9030c0,5,25);}
            }
            // Passive: linger (土地) regens 5% maxMP per turn (山神補氣)
            if (m.id==='linger' && !m.dead) {
              const regen=Math.max(1,Math.floor(m.maxMp*0.05));
              const stL=calcStats(m);
              m.mp=Math.min(stL.maxMp, m.mp+regen);
              if(_sp) this._floatText(_sp.g.x,_sp.g.y-68,`MP+${regen}`,'#60c0ff',13);
            }
            const pc=m.status.filter(s=>s==='poison').length;
            const bc=m.status.filter(s=>s==='burn').length;
            const ac=m.status.filter(s=>s==='atkUp').length;
            const dc=m.status.filter(s=>s==='defUp').length;
            m.status=m.status.filter(s=>!['defend','poison','burn','atkUp','defUp'].includes(s));
            for(let i=0;i<pc-1;i++) m.status.push('poison');
            for(let i=0;i<bc-1;i++) m.status.push('burn');
            for(let i=0;i<ac-1;i++) m.status.push('atkUp');
            for(let i=0;i<dc-1;i++) m.status.push('defUp');
          });
          // Enemy status tick (burn + poison + clear buffs)
          this.enemies.forEach((e,ei)=>{
            if(e.dead)return;
            const _esp=this.enemySprites[ei];
            if(e.status.includes('burn')){
              const dmg=Math.max(1,Math.floor(e.maxHp*0.06));
              e.hp=Math.max(0,e.hp-dmg); if(e.hp===0){e.dead=true;}
              this._addLog(`${e.name} 灼傷，損失 ${dmg} HP！`);
              Sound?.play('burn');
              if(_esp){this._floatText(_esp.g.x,_esp.g.y-50,String(dmg),'#ff8040',16);this._spawnParticles(_esp.g.x,_esp.g.y-20,0xff4020,4,22);}
              this._refreshEnemyHp(ei);
            }
            if(e.status.includes('poison')){
              const dmg=Math.max(1,Math.floor(e.maxHp*0.05));
              e.hp=Math.max(0,e.hp-dmg); if(e.hp===0){ e.dead=true; Achieve?.unlock('poisoner'); }
              this._addLog(`${e.name} 中毒，損失 ${dmg} HP！`);
              Sound?.play('poison');
              if(_esp){this._floatText(_esp.g.x,_esp.g.y-64,String(dmg),'#c050e8',16);this._spawnParticles(_esp.g.x,_esp.g.y-20,0x9030c0,4,22);}
              this._refreshEnemyHp(ei);
            }
            const epc=e.status.filter(s=>s==='poison').length;
            const ebc=e.status.filter(s=>s==='burn').length;
            e.status=e.status.filter(s=>!['atkUp','atkDown','slow','poison','burn'].includes(s));
            for(let i=0;i<epc-1;i++)e.status.push('poison');
            for(let i=0;i<ebc-1;i++)e.status.push('burn');
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
      if (e.status.includes('stun')) {
        const _si=e.status.indexOf('stun'); e.status.splice(_si,1);
        Sound?.play('stun');
        this._addLog(`${e.name} 被震暈，無法行動！`);
        this.time.delayedCall(500, onDone); return;
      }
      if (e.status.includes('slow') && Math.random()<0.4) {
        this._addLog(`${e.name} 動作遲緩，無法行動！`);
        this.time.delayedCall(600, onDone); return;
      }
      const isStrong=['slam','aoe','fireBreath','tail','waterBlast','tideCall','scaleDash','thunderStomp','dragonStrike','enrageSlam','sacredBlast','soulScream','tideSurge','dragonErupt','divineStrike','celestialEdict','heavenlyPunish','divineWrath'].includes(actId);
      const isAoe = act.tgt==='all';
      const doAtk=()=>{
        if (enemySp && !e.dead) {
          const exStr=isStrong?'！！':'！';
          const exc=this.add.text(enemySp.g.x,enemySp.g.y-(e.sz||28)*2-8,exStr,{
            fontSize:isStrong?'30px':'22px',fontFamily:'serif',color:isStrong?'#ff2020':'#ffee20',stroke:'#000',strokeThickness:isStrong?4:3,
          }).setOrigin(0.5,1).setDepth(15);
          this.tweens.add({targets:exc,y:exc.y-14,alpha:0,duration:480,onComplete:()=>exc.destroy()});
        }
        const targets=isAoe?living:[tgt];
        this._animEnemyAttack(enemySp, heroSp, ()=>{
          let eAtk=e.atk;
          if(e.status.includes('atkUp'))   eAtk=Math.floor(eAtk*1.5);
          if(e.status.includes('atkDown')) eAtk=Math.floor(eAtk*0.6);
          let logParts=[];
          targets.forEach(t=>{
            const tSp=this.partySprites[this.party.indexOf(t)];
            let def=t.baseDef; if(t.status.includes('defend'))def=Math.floor(def*1.5);
            const dmg=this._calcDmg(eAtk,def,act.pow||1);
            t.hp=Math.max(0,t.hp-dmg); if(t.hp===0)t.dead=true;
            if(!t.dead){
              const prevGauge=t.limitGauge||0;
              t.limitGauge=Math.min(100,prevGauge+Math.max(4,Math.floor(dmg/t.maxHp*65)));
              if(prevGauge<100&&t.limitGauge>=100){
                Sound?.play('limitReady');
                const _tSp=this.partySprites[this.party.indexOf(t)];
                if(_tSp) this._floatText(_tSp.g.x,_tSp.g.y-72,'◆ 必殺就緒！','#ffd700',16);
              }
            }
            if(act.debuff)Object.entries(act.debuff).forEach(([k,v])=>{for(let i=0;i<v;i++)t.status.push(k);});
            if(act.type==='drain'){
              const heal=Math.floor(dmg*0.5); e.hp=Math.min(e.maxHp,e.hp+heal);
              const ei=this.enemies.indexOf(e); this._refreshEnemyHp(ei);
              if(enemySp) this._floatText(enemySp.g.x,enemySp.g.y-50,`+${heal}`,'#88ff88',16);
            }
            if(tSp){
              const hx=tSp.g.x, hy=tSp.g.y-32;
              this._floatText(hx,hy,String(dmg),'#ff5050',isStrong?24:20);
              this._hitImpact(hx,hy,0xff2020,isStrong);
              this._spawnParticles(hx,hy+10,0xff4444,isStrong?8:5,isStrong?40:26);
              let c=0;
              this.time.addEvent({ delay:72, repeat:7, callback:()=>{
                c++; tSp.g.setAlpha(c%2===0?1:0.18);
                if(c>=8){tSp.g.setAlpha(1);this._drawHero(tSp.g,t);tSp.g.setPosition(tSp.x,tSp.y);}
              }});
            }
            logParts.push(`${t.name} ${dmg}`);
          });
          if(act.type==='drain') Sound?.play('drain');
          else if(['sacredBlast','soulScream','dragonErupt','divineStrike','celestialEdict','divineWrath'].includes(actId)) Sound?.play('thunderSkill');
          else if(['enrageSlam','tideSurge','heavenlyPunish'].includes(actId)) Sound?.play('damage');
          else Sound?.play('damage');
          this._shake(isStrong?0.010:0.005, isStrong?320:240);
          const logMsg=isAoe
            ?`${e.name} 使用 ${act.name}！全體受到傷害：${logParts.join('、')}！`
            :`${e.name} 使用 ${act.name}，${targets[0].name} 受到 ${logParts[0]} 點傷害！`;
          this._addLog(logMsg);
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
      const _bsi=this.enemies.indexOf(e), _bsp=this.enemySprites[_bsi];
      if (_bsp) { this._floatText(_bsp.g.x,_bsp.g.y-(e.sz||28)*2.2,'強化！','#ffaa20',18); this._spawnParticles(_bsp.g.x,_bsp.g.y-40,0xff8020,8,42); }
      this._addLog(`${e.name} 使用 ${act.name}！攻擊力大幅提升！`);
      this.time.delayedCall(600, onDone);
    } else if (act.type==='debuff') {
      const _dt=living[Math.floor(Math.random()*living.length)], _di=this.party.indexOf(_dt), _ds=this.partySprites[_di];
      if (act.debuff) Object.entries(act.debuff).forEach(([k,v])=>{for(let i=0;i<v;i++)_dt.status.push(k);});
      if (_ds) { this._floatText(_ds.g.x,_ds.g.y-46,'緩！','#80b0ff',20); this._spawnParticles(_ds.g.x,_ds.g.y-18,0x5080ff,6,32); }
      this._addLog(`${e.name} 使用 ${act.name}！${_dt.name} 行動遲緩！`);
      this._rebuildStatus(); this.time.delayedCall(600, onDone);
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
        const g=(typeof GROWTH!=='undefined'&&GROWTH[m.id])||{hp:8,mp:4,atk:2,def:1,spd:1};
        GS.levelUp(m); levelUps.push(m.name); Sound?.play('levelUp');
        if(m.lv>=5)Achieve?.unlock('level_5'); if(m.lv>=10)Achieve?.unlock('level_10'); if(m.lv>=15)Achieve?.unlock('level_max');
        const sp=this.partySprites[mi];
        if(sp){
          this._floatText(sp.g.x,sp.g.y-85,`Lv.${m.lv} UP!`,'#ffd700',22);
          this.time.delayedCall(260,()=>this._floatText(sp.g.x,sp.g.y-108,`HP+${g.hp} MP+${g.mp} ATK+${g.atk}`,'#aaffcc',13));
          this._spawnParticles(sp.g.x,sp.g.y-45,0xffd700,14,50);
        }
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
    // no_damage achievement
    if(this.party.every(m=>!m.dead&&m.hp===m.maxHp)) Achieve?.unlock('no_damage');

    // Boss defeat handling
    if(GS.battleData?.isBoss){
      Achieve?.unlock('boss_slayer'); this._submitLeaderboard();
      const bossEnemy=this.enemies[0];
      GS.flags[`defeated_${bossEnemy.id}`]=true;
      if(bossEnemy.id==='silverKing') {
        Achieve?.unlock('silver_king');
        GS.flags._pendingLines=['銀角大王已伏誅！妖氣消散！','土地：銀角大王的妖法已被破除。','楊嬋：前方東海龍宮，天命之路繼續！'];
      }
      if(bossEnemy.id==='dragonKing') {
        Achieve?.unlock('dragon_king');
        GS.flags._pendingLines=['東海龍王已伏誅！龍珠現於眼前…','土地：龍氣歸位，東海重歸平靜。','楊嬋：龍王已敗！前往小西天，天命即將完成！'];
        const allBossIds=['dragon','silverKing','dragonKing','boss'];
        if(allBossIds.every(bid=>GS.flags[`defeated_${bid}`]||bid===bossEnemy.id)) Achieve?.unlock('completionist');
      }
      if(bossEnemy.id==='jadeKing') {
        Achieve?.unlock('jade_king');
        const allIds=['dragon','silverKing','dragonKing','boss','jadeKing'];
        if(allIds.every(bid=>GS.flags[`defeated_${bid}`]||bid===bossEnemy.id)) Achieve?.unlock('all_realms');
        GS.flags._pendingLines=['玉皇大帝！天帝竟然敗於人手！','土地：三界震動！天命之人問鼎天庭！','楊嬋：你做到了——成為了三界無敵的天命人！','此後天地長安，萬古無憂！'];
      }
      if(bossEnemy.id==='boss'){
        GS.flags._pendingLines=['黃眉大王已伏誅！天命得成！','土地：妖氣盡散，山河安寧。','楊嬋：天命之人，你做到了，回黑山村吧！'];
        GS.flags._isFinalBoss=true;
        if((GS.flags?.playtime||0)<1800) Achieve?.unlock('speed_run');
      }
    }

    // Victory flash
    const flash=this.add.graphics(); flash.fillStyle(0xffffff,0); flash.fillRect(0,0,this.W,this.H); flash.setDepth(50);
    this.tweens.add({targets:flash,alpha:0.4,duration:110,yoyo:true,onComplete:()=>flash.destroy()});

    // Hero victory jump poses
    this.partySprites.forEach((sp,i)=>{
      if (this.party[i]?.dead) return;
      const origY=sp.y;
      this.time.delayedCall(120+i*80, ()=>{
        this.tweens.add({targets:sp.g, y:origY-26, duration:180, ease:'Power2',
          onComplete:()=>this.tweens.add({targets:sp.g, y:origY, duration:260, ease:'Bounce.easeOut'})
        });
        this._spawnParticles(sp.g.x, sp.g.y-18, 0xffd700, 6, 28);
      });
    });

    // Victory reward panel (appears after short delay)
    this.time.delayedCall(480, () => {
      const pw=Math.min(330,this.W*0.82), ph=Math.min(260,this.H*0.60);
      const px=(this.W-pw)/2, py=(this.H-ph)/2-16;
      const panelG=this.add.graphics().setDepth(52).setAlpha(0);
      panelG.fillStyle(0x060410,0.96); panelG.fillRoundedRect(px,py,pw,ph,10);
      panelG.lineStyle(2,0xb09030,0.9); panelG.strokeRoundedRect(px,py,pw,ph,10);
      panelG.lineStyle(1,0x604818,0.5); panelG.strokeRoundedRect(px+3,py+3,pw-6,ph-6,8);
      this.tweens.add({targets:panelG,alpha:1,duration:320});

      const vtxt=this.add.text(this.W/2,py+28,'勝　利！',{
        fontSize:Math.floor(this.H*0.065)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#ffd700',stroke:'#804000',strokeThickness:5,
        shadow:{offsetX:0,offsetY:0,color:'#ffaa00',blur:22,fill:true},
      }).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.4);
      this.tweens.add({targets:vtxt,alpha:1,scaleX:1,scaleY:1,duration:420,ease:'Back.easeOut'});

      const sepG=this.add.graphics().setDepth(53).setAlpha(0);
      sepG.lineStyle(1,0x806020,0.8); sepG.lineBetween(px+18,py+56,px+pw-18,py+56);
      this.tweens.add({targets:sepG,alpha:1,duration:280,delay:200});

      // Reward rows
      const rows=[
        { lbl:'獲得 EXP：', val:`＋${expGain}`, clr:'#88ffcc' },
        { lbl:'獲得靈石：', val:`＋${goldGain}`, clr:'#ffd700' },
      ];
      if (drops.length) rows.push({ lbl:'獲得道具：', val:drops.map(d=>d.name).join('、'), clr:'#ff9840' });
      if (levelUps.length) rows.push({ lbl:'升　　級：', val:levelUps.join('、')+' Lv UP！', clr:'#ffe060' });

      const rowH=34, rowY0=py+68, _winTexts=[];
      rows.forEach((r,ri)=>{
        const t1=this.add.text(px+22,rowY0+ri*rowH,r.lbl,{
          fontSize:'14px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#c8a060',stroke:'#000',strokeThickness:1,
        }).setOrigin(0,0.5).setDepth(55).setAlpha(0);
        const t2=this.add.text(px+pw-22,rowY0+ri*rowH,r.val,{
          fontSize:'14px',fontFamily:'"Noto Serif TC","SimSun",serif',color:r.clr,stroke:'#000',strokeThickness:1,
        }).setOrigin(1,0.5).setDepth(55).setAlpha(0);
        this.tweens.add({targets:[t1,t2],alpha:1,duration:240,delay:300+ri*110});
        _winTexts.push(t1,t2);
      });

      // Continue prompt (flashing)
      const prompt=this.add.text(this.W/2,py+ph-20,'按任意鍵繼續…',{
        fontSize:'12px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#9a7840',stroke:'#000',strokeThickness:1,
      }).setOrigin(0.5).setDepth(55).setAlpha(0);
      this.tweens.add({targets:prompt,alpha:1,duration:280,delay:1100});
      this.tweens.add({targets:prompt,alpha:0.3,duration:560,yoyo:true,loop:-1,delay:1400});

      this.phase='winPanel';
      this.waiting=false;
      this._winLeave=()=>{
        this.waiting=true; this.phase='win';
        this.cameras.main.fadeOut(500,0,0,0);
        this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('WorldScene'));
      };
      // Auto-exit after 6 seconds if no input
      this.time.delayedCall(6000, ()=>{ if(this.phase==='winPanel') this._winLeave(); });
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
    this._loseCursor=0;
    Sound?.play('dead'); Sound?.stopBgm();
    this._addLog('全員陣亡…');
    const darken=this.add.graphics(); darken.fillStyle(0x000000,0); darken.fillRect(0,0,this.W,this.H); darken.setDepth(50);
    this.tweens.add({targets:darken,alpha:0.75,duration:900});
    const ltxt=this.add.text(this.W/2,this.H*0.30,'全員陣亡',{fontSize:Math.floor(this.H*0.08)+'px',fontFamily:'"Noto Serif TC","SimSun",serif',color:'#ff4040',stroke:'#400000',strokeThickness:6}).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.4);
    this.tweens.add({targets:ltxt,alpha:1,scaleX:1,scaleY:1,duration:580,ease:'Back.easeOut',delay:380});

    // Retry options
    const hasSave=[0,1,2].some(i=>!!Save?.read(i));
    const opts=hasSave?['從存檔繼續','放棄（回到標題）']:['回到標題'];
    this._loseOptBgs=[]; this._loseOptTxts=[];
    opts.forEach((o,i)=>{
      const oy=this.H*0.52+i*54;
      const bg2=this.add.graphics().setDepth(56).setAlpha(0);
      const t=this.add.text(this.W/2,oy,o,{fontSize:Math.min(20,Math.floor(this.H*0.032))+'px',
        fontFamily:'"Noto Serif TC","SimSun",serif',color:'#c8a060',stroke:'#000',strokeThickness:3,
      }).setOrigin(0.5,0.5).setDepth(57).setAlpha(0);
      this._loseOptBgs.push({g:bg2,y:oy}); this._loseOptTxts.push(t);
      this.tweens.add({targets:[bg2,t],alpha:1,duration:400,delay:1800+i*150});
    });
    this._loseOpts=opts;
    this.time.delayedCall(1600,()=>{ this.waiting=false; this._loseUpdateOpts(); });
  }

  _loseUpdateOpts() {
    const bw=Math.min(300,this.W*0.65);
    this._loseOptBgs.forEach(({g,y},i)=>{
      g.clear();
      const sel=i===this._loseCursor;
      if(sel){g.fillStyle(0x9a2020,0.22);g.fillRoundedRect(this.W/2-bw/2,y-24,bw,48,6);g.lineStyle(1,0xff4040,0.7);g.strokeRoundedRect(this.W/2-bw/2,y-24,bw,48,6);}
      this._loseOptTxts[i].setColor(sel?'#ff8060':'#c8a060');
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

    // Weather particles
    if (this._weatherCfg && this._t%2===0) {
      this._weatherG.clear();
      const wc=this._weatherCfg;
      this._weatherPts.forEach(p=>{
        p.x += p.vx + Math.sin(this._t*0.04+p.phase)*0.18;
        p.y += p.vy;
        if (p.y>this.H+14) { p.y=-8; p.x=Math.random()*this.W; }
        if (p.y<-24)        { p.y=this.H+8; p.x=Math.random()*this.W; }
        if (p.x<-24)  p.x=this.W+8;
        if (p.x>this.W+24) p.x=-8;
        const a=wc.a*(0.55+0.45*Math.sin(this._t*0.05+p.phase));
        this._weatherG.fillStyle(wc.clr,a);
        if (wc.type==='rain')   { this._weatherG.fillRect(p.x,p.y,1,p.len); }
        else if (wc.type==='drip') {
          this._weatherG.fillEllipse(p.x,p.y,p.r*1.5,p.len);
        } else if (wc.type==='bubble') {
          this._weatherG.fillCircle(p.x,p.y,p.r);
          this._weatherG.lineStyle(1,wc.clr,a*0.6); this._weatherG.strokeCircle(p.x,p.y,p.r);
        } else { this._weatherG.fillCircle(p.x,p.y,p.r); }
      });
    }

    // Enemy status effect auras
    if (this._t%3===0) {
      this._statusAuraG.clear();
      const ST_CLR={burn:0xff4010,poison:0x9030c0,slow:0x4080c0,stun:0xffee20,atkDown:0x4060e0,atkUp:0xff8020};
      this.enemySprites.forEach((sp,ei)=>{
        const e=sp.e; if(e.dead||!e.status.length) return;
        const sz=e.sz||28, cx=sp.g.x, cy=sp.g.y-sz*0.85;
        const uniq=[...new Set(e.status)].filter(s=>ST_CLR[s]);
        uniq.forEach((s,si)=>{
          const clr=ST_CLR[s], r=sz*1.05+si*5;
          const pulse=0.07+0.10*Math.abs(Math.sin(this._t*0.055+si*1.6+ei*0.9));
          this._statusAuraG.lineStyle(2,clr,Math.min(0.85,pulse*2.8));
          this._statusAuraG.strokeCircle(cx,cy,r);
          this._statusAuraG.fillStyle(clr,pulse*0.45);
          this._statusAuraG.fillCircle(cx,cy,r);
          const oc=s==='burn'?4:s==='stun'?5:s==='poison'?3:0;
          for(let d=0;d<oc;d++){
            const ang=(this._t*(s==='stun'?0.10:0.06)+d*Math.PI*2/oc);
            const dx=cx+Math.cos(ang)*r*1.12, dy=cy+Math.sin(ang)*r*1.12;
            const pc=s==='burn'?0xff8020:s==='stun'?0xffee40:0xc060ff;
            this._statusAuraG.fillStyle(pc,0.95);
            if(s==='stun') this._statusAuraG.fillTriangle(dx,dy-3,dx-2.5,dy+2,dx+2.5,dy+2);
            else this._statusAuraG.fillCircle(dx,dy,2.5);
          }
        });
      });
    }

    // Enemy idle bob (Y only, doesn't interfere with X tweens)
    this.enemySprites.forEach((sp,i)=>{
      if (!sp.e.dead) sp.g.y = sp.y + Math.sin(this._t*0.045+i*1.3)*2.5;
    });

    // Hero idle breathing
    this.partySprites.forEach((sp,i)=>{
      if (!sp.m.dead) {
        const bs=1+Math.sin(this._t*0.032+i*2.2)*0.022;
        sp.g.setScale(bs);
      }
    });

    // Boss aura pulse
    if (this._bossAuraG && this.enemySprites.length>0) {
      const bsp=this.enemySprites[0];
      if (bsp && !bsp.e.dead) {
        const raged = !!bsp.e._raged;
        const pulseBase = raged ? 0.14 : 0.07;
        const pulse = pulseBase + Math.abs(Math.sin(this._t*(raged?0.06:0.038)))*(raged?0.22:0.16);
        const sz=bsp.e.sz||28;
        const auraClr = raged ? 0xff2020 : (bsp.e.color || 0xff2020);
        const auraClr2 = raged ? 0xff6010 : (bsp.e.id==='dragonKing' ? 0x20d0ff : (bsp.e.id==='silverKing' ? 0xa0c0ff : 0xff8020));
        this._bossAuraG.clear();
        this._bossAuraG.fillStyle(auraClr, pulse);
        this._bossAuraG.fillCircle(bsp.g.x, bsp.g.y-sz*0.82, sz*1.65);
        this._bossAuraG.fillStyle(auraClr2, pulse*0.45);
        this._bossAuraG.fillCircle(bsp.g.x, bsp.g.y-sz*0.82, sz*2.3);
      }
    }

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

    // Win panel — any key to continue
    if (this.phase==='winPanel' && !this.waiting) {
      const anyOk=Phaser.Input.Keyboard.JustDown(this.keys.z)||Phaser.Input.Keyboard.JustDown(this.keys.enter)||Phaser.Input.Keyboard.JustDown(this.keys.x)||Phaser.Input.Keyboard.JustDown(this.keys.esc)||!!window.PAD?.ok;
      if(anyOk&&window.PAD)window.PAD.ok=false;
      if(anyOk&&this._winLeave)this._winLeave();
      return;
    }

    // Game over menu handling
    if (this.phase==='lose' && !this.waiting && this._loseOpts) {
      const ok2=Phaser.Input.Keyboard.JustDown(this.keys.z)||Phaser.Input.Keyboard.JustDown(this.keys.enter)||okPad;
      const up2=Phaser.Input.Keyboard.JustDown(this.keys.up)||upPad;
      const dn2=Phaser.Input.Keyboard.JustDown(this.keys.down)||dnPad;
      if(up2){this._loseCursor=Math.max(0,this._loseCursor-1);Sound?.play('menuMove');this._loseUpdateOpts();}
      if(dn2){this._loseCursor=Math.min(this._loseOpts.length-1,this._loseCursor+1);Sound?.play('menuMove');this._loseUpdateOpts();}
      if(ok2){
        Sound?.play('menuSelect');
        this.cameras.main.fadeOut(500,0,0,0);
        this.cameras.main.once('camerafadeoutcomplete',()=>{
          const hasSave=[0,1,2].some(i=>!!Save?.read(i));
          if(hasSave&&this._loseCursor===0){
            // Load most recent save
            const slot=[0,1,2].find(i=>!!Save?.read(i))??0;
            GS.load(slot); this.scene.start('WorldScene');
          } else {
            GS.init(); this.scene.start('TitleScene');
          }
        });
      }
      return;
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
    const left =Phaser.Input.Keyboard.JustDown(this.keys.left);
    const right=Phaser.Input.Keyboard.JustDown(this.keys.right);

    if (!this.subMode) {
      const actor0=this.party[this.actorIdx];
      const mSz=(actor0&&!actor0.dead&&(actor0.limitGauge||0)>=100)?6:5;
      if(up)  {this.cursor=(this.cursor-1+mSz)%mSz;this._rebuildMenu();Sound?.play('menuMove');}
      if(down){this.cursor=(this.cursor+1)%mSz;     this._rebuildMenu();Sound?.play('menuMove');}
      if(right&&this.cursor<3){const nc=this.cursor+3;if(nc<mSz){this.cursor=nc;this._rebuildMenu();Sound?.play('menuMove');}}
      if(left &&this.cursor>=3){this.cursor-=3;this._rebuildMenu();Sound?.play('menuMove');}
      if(ok){
        Sound?.play('menuSelect');
        if(this.cursor===0){
          const alive=this.enemies.filter(e=>!e.dead);
          if(alive.length===1){this._heroAct('attack',null,null,this.enemies.indexOf(alive[0]));}
          else{this.subMode='target';this.subCursor=0;this.targetList=alive.map(e=>({isEnemy:true,e}));this._rebuildMenu();}
        } else if(this.cursor===1){this.subMode='skill';this.subCursor=0;this._rebuildMenu();const _sk0=SKILLS[actor.skills?.[0]];if(this.logText2&&_sk0)this.logText2.setText(_sk0.desc||'');}
          else if(this.cursor===2){this.subMode='item'; this.subCursor=0;this._rebuildMenu();}
          else if(this.cursor===3){this._heroAct('defend');}
          else if(this.cursor===4){this._heroAct('flee');}
          else if(this.cursor===5){this._heroAct('limit');}
      }
    } else if (this.subMode==='skill') {
      const skills=actor.skills.map(sk=>SKILLS[sk]).filter(Boolean);
      if(up)  {this.subCursor=(this.subCursor-1+skills.length)%skills.length;this._rebuildMenu();Sound?.play('menuMove');if(this.logText2)this.logText2.setText(skills[this.subCursor]?.desc||'');}
      if(down){this.subCursor=(this.subCursor+1)%skills.length;this._rebuildMenu();Sound?.play('menuMove');if(this.logText2)this.logText2.setText(skills[this.subCursor]?.desc||'');}
      if(back){this.subMode=null;this._rebuildMenu();if(this.logText2)this.logText2.setText('');}
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
