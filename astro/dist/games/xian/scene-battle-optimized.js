// ══════════════════════════════════════════════════════════
// 優化版本：BattleScene - 效能與 UX 改進
// ══════════════════════════════════════════════════════════

class BattleSceneOptimized extends Phaser.Scene {
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
    this._lastUpdateFrame = -1; // 用於追蹤最後一次 UI 更新

    this.party   = GS.party.map(m => ({ ...m, status:[...m.status], limitUsed:false, limitGauge:m.limitGauge||0 }));
    this.enemies = GS.battleData.enemies.map(e => ({ ...e, status:[...e.status] }));
    this.groundY = Math.floor(H * 0.56);

    // ── 使用 Container 進行分層管理 ──
    this.bgLayer = this.add.container(0, 0);
    this.effectLayer = this.add.container(0, 0);
    this.spriteLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0);

    // ── Background (只繪製一次) ──
    this._createBackground();

    // ── 使用 Sprite 而非 Graphics ──
    this._createEnemySprites();
    this._createPartySprites();

    // ── UI 面板 (延遲重建) ──
    this.uiY    = this.groundY + 100;
    this.uiH    = H - this.uiY;
    this.splitX = Math.floor(W*0.44);
    this.statusPanel = this.add.graphics(); 
    this.menuPanel   = this.add.graphics(); 
    this.statusTexts = []; 
    this.menuTexts   = [];
    this._rebuildStatus();
    this._rebuildMenu();

    // ── Boss HP bar ───────────────────────────────────────
    this._bossBar=null; this._bossBg=null; this._bossBarText=null;
    if (GS.battleData?.isBoss && this.enemies.length>0) {
      const boss=this.enemies[0];
      const bx=W*0.5, by=H*0.08;
      this._bossBg=this.add.graphics();
      this._bossBg.fillStyle(0x050410,0.8); this._bossBg.fillRect(bx-120,by-20,240,40);
      this._bossBg.lineStyle(2,0xc83030,0.8); this._bossBg.strokeRect(bx-120,by-20,240,40);
      this._bossBar=mkBar(this,bx-110,by-8,220,16,boss.hp,boss.maxHp,0xc83030);
      this._bossBarText=this.add.text(bx,by,`${boss.name} HP: ${boss.hp}/${boss.maxHp}`,{
        fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#e8c060',
        stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5,0.5);
    }

    // ── 輸入系統 ──
    this.input.keyboard.on('keydown', (e) => this._onKeyDown(e));
    this.input.on('pointerdown', (p) => this._onPointerDown(p));

    // ── 開場動畫 ──
    this._playIntro();
  }

  _createBackground() {
    // 只繪製一次背景，不在每幀重複繪製
    const W = this.W, H = this.H;
    const BG_MAP = {
      forest: { sky:[0x041a04,0x040e02,0x020802,0x030a02], moon:0x0a1c08, mtn1:0x0c2008, mtn2:0x102a0c, gnd:[0x0c1808,0x0c1808,0x040804,0x040804], gndLine:0x508030, gndSub:0x142c0a, arena:0x103020 },
      castle: { sky:[0x1a1002,0x160e02,0x080602,0x0c0a02], moon:0x1a1404, mtn1:0x2a1a04, mtn2:0x342008, gnd:[0x1e1402,0x1e1402,0x0c0a02,0x0c0a02], gndLine:0xb09020, gndSub:0x2e1e04, arena:0x302008 },
    };
    const bgc = BG_MAP[GS.map] || { sky:[0x180808,0x120410,0x060202,0x0a0208], moon:0x0c0418, mtn1:0x180c2a, mtn2:0x1e1030, gnd:[0x1c1008,0x1c1008,0x080604,0x080604], gndLine:0xb07828, gndSub:0x3a2606, arena:0x280840 };
    
    const bg = this.add.graphics();
    bg.fillGradientStyle(bgc.sky[0], bgc.sky[1], bgc.sky[2], bgc.sky[3], 1);
    bg.fillRect(0, 0, W, H);

    // 月亮
    const moonG = this.add.graphics();
    moonG.fillStyle(0xfff4d0, 0.06); moonG.fillCircle(W*0.82, H*0.13, H*0.14);
    moonG.fillStyle(0xfff4d0, 1);    moonG.fillCircle(W*0.82, H*0.13, H*0.048);
    moonG.fillStyle(0xffffff, 0.2);  moonG.fillCircle(W*0.808, H*0.118, H*0.02);
    moonG.fillStyle(bgc.moon, 1);    moonG.fillCircle(W*0.836, H*0.12, H*0.042);

    // 山脈
    const mtn1 = this.add.graphics();
    mtn1.fillStyle(bgc.mtn1, 1);
    const pts1 = [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38]];
    mtn1.beginPath();
    pts1.forEach(([rx,ry],i) => { const px=rx*W,py=ry*this.groundY; i===0?mtn1.moveTo(px,py):mtn1.lineTo(px,py); });
    mtn1.lineTo(W,this.groundY); mtn1.lineTo(0,this.groundY); mtn1.closePath(); mtn1.fillPath();

    const mtn2 = this.add.graphics();
    mtn2.fillStyle(bgc.mtn2, 1);
    const pts2 = [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52]];
    mtn2.beginPath();
    pts2.forEach(([rx,ry],i) => { const px=rx*W,py=ry*this.groundY; i===0?mtn2.moveTo(px,py):mtn2.lineTo(px,py); });
    mtn2.lineTo(W,this.groundY); mtn2.lineTo(0,this.groundY); mtn2.closePath(); mtn2.fillPath();

    // 地面
    const gndG = this.add.graphics();
    gndG.fillGradientStyle(bgc.gnd[0], bgc.gnd[1], bgc.gnd[2], bgc.gnd[3], 1);
    gndG.fillRect(0, this.groundY, W, H - this.groundY);
    gndG.lineStyle(2, bgc.gndLine, 0.65); gndG.lineBetween(0, this.groundY, W, this.groundY);
    gndG.lineStyle(1, bgc.gndSub, 0.4);
    for (let i = 1; i < 6; i++) gndG.lineBetween(0, this.groundY+i*7, W, this.groundY+i*7);

    // 競技場光暈
    const arenaG = this.add.graphics();
    arenaG.fillStyle(bgc.arena, 0.25);
    arenaG.fillEllipse(W*0.38, this.groundY+3, W*0.65, 28);

    this.bgLayer.add([bg, moonG, mtn1, mtn2, gndG, arenaG]);
  }

  _createEnemySprites() {
    this.enemySprites = [];
    const W = this.W, H = this.H;
    const eCount = this.enemies.length;
    
    this.enemies.forEach((e, i) => {
      const ex = eCount === 1 ? W*0.22 : W*(0.13 + i*0.18);
      const sz = e.sz || 28;
      
      // 使用 Sprite 而非 Graphics
      const sprite = this.add.sprite(ex, this.groundY, null);
      sprite.setData('enemy', e);
      
      const hp  = mkBar(this, ex-sz, this.groundY+6, sz*2, 7, e.hp, e.maxHp, 0xe04040);
      const lbl = this.add.text(ex, this.groundY+20, e.name, {
        fontSize: Math.max(11,Math.floor(H*0.02))+'px',
        fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5,0.5);
      
      this.enemySprites.push({ sprite, hp, lbl, x:ex, y:this.groundY, e, statusTxt:null, hpText:null });
    });
  }

  _createPartySprites() {
    this.partySprites = [];
    const W = this.W;
    
    this.party.forEach((m, i) => {
      const hx = W*(0.62 + i*0.13);
      const sprite = this.add.sprite(hx, this.groundY, null);
      sprite.setData('member', m);
      
      this.partySprites.push({ sprite, x:hx, y:this.groundY, m });
    });
  }

  _rebuildStatus() {
    // 只在必要時重建，而非每幀重建
    this.statusTexts.forEach(t => t.destroy());
    this.statusTexts = [];
    
    const W = this.W, H = this.H;
    const panelY = this.uiY;
    const panelH = this.uiH;
    
    this.statusPanel.clear();
    this.statusPanel.fillStyle(0x050410, 0.93);
    this.statusPanel.fillRect(0, panelY, this.splitX, panelH);
    this.statusPanel.lineStyle(1, 0x5a3e10, 0.8);
    this.statusPanel.strokeRect(0, panelY, this.splitX, panelH);
    
    // 簡化狀態顯示
    const fs = 12;
    let y = panelY + 10;
    this.party.forEach((m, i) => {
      const txt = this.add.text(10, y, `${m.name} HP:${m.hp}/${m.maxHp} MP:${m.mp}/${m.maxMp}`, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#f0e6c8'
      });
      this.statusTexts.push(txt);
      y += fs + 8;
    });
  }

  _rebuildMenu() {
    // 只在必要時重建
    this.menuTexts.forEach(t => t.destroy());
    this.menuTexts = [];
    
    const W = this.W, H = this.H;
    const panelX = this.splitX;
    const panelY = this.uiY;
    const panelW = W - panelX;
    const panelH = this.uiH;
    
    this.menuPanel.clear();
    this.menuPanel.fillStyle(0x050410, 0.93);
    this.menuPanel.fillRect(panelX, panelY, panelW, panelH);
    this.menuPanel.lineStyle(1, 0x5a3e10, 0.8);
    this.menuPanel.strokeRect(panelX, panelY, panelW, panelH);
    
    // 簡化菜單選項
    const options = ['攻擊', '技能', '道具', '防禦'];
    const fs = 12;
    let y = panelY + 10;
    options.forEach((opt, i) => {
      const color = i === this.cursor ? '#ffd700' : '#f0e6c8';
      const txt = this.add.text(panelX + 10, y, `> ${opt}`, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color
      });
      this.menuTexts.push(txt);
      y += fs + 8;
    });
  }

  _playIntro() {
    // 簡化開場動畫
    this.tweens.add({
      targets: this.partySprites.map(p => p.sprite),
      x: (target, key, value, targetIndex) => this.partySprites[targetIndex].x,
      duration: 600,
      ease: 'Power2.out'
    });
    
    this.tweens.add({
      targets: this.enemySprites.map(e => e.sprite),
      x: (target, key, value, targetIndex) => this.enemySprites[targetIndex].x,
      duration: 600,
      ease: 'Power2.out',
      onComplete: () => {
        this.phase = 'turn';
        this._nextTurn();
      }
    });
  }

  _nextTurn() {
    // 簡化回合邏輯
    this.phase = 'turn';
    // ... 其他回合邏輯
  }

  _onKeyDown(e) {
    if (this.phase === 'menu') {
      if (e.key === 'ArrowUp') this.cursor = Math.max(0, this.cursor - 1);
      if (e.key === 'ArrowDown') this.cursor = Math.min(3, this.cursor + 1);
      if (e.key === 'Enter') this._selectAction();
      this._rebuildMenu(); // 只在必要時重建
    }
  }

  _onPointerDown(p) {
    // 改進觸控支援
    if (this.phase === 'menu') {
      // 檢測點擊區域
      const menuY = this.uiY;
      const itemH = 20;
      const idx = Math.floor((p.y - menuY) / itemH);
      if (idx >= 0 && idx < 4) {
        this.cursor = idx;
        this._selectAction();
      }
    }
  }

  _selectAction() {
    // 執行選擇的行動
    const actions = ['attack', 'skill', 'item', 'defend'];
    const action = actions[this.cursor];
    // ... 處理行動邏輯
  }

  update() {
    // 只在必要時更新 UI
    if (this.phase === 'menu' && this.game.loop.frame % 10 === 0) {
      // 每 10 幀更新一次 UI，而非每幀
      this._rebuildStatus();
    }
  }
}
