'use strict';
// ══════════════════════════════════════════════════════════
class BattleScene extends Phaser.Scene {
  constructor() { super('BattleScene'); }

  create() {
    const W=800, H=600;
    this.phase = 'playerTurn'; // playerTurn | enemyTurn | win | lose
    this.actorIdx = 0;
    this.cursor = 0;
    this.subCursor = 0;
    this.subMode = null; // null | 'skill' | 'item' | 'target'
    this.targetList = [];
    this.log = [];
    this.logTimer = 0;
    this.animQueue = [];

    // Copy party & enemies
    this.party = GS.party.map(m => ({ ...m, status:[...m.status] }));
    this.enemies = GS.battleData.enemies.map(e => ({ ...e, status:[...e.status] }));

    // BG
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a0814, 0x1a0814, 0x08040e, 0x08040e, 1);
    bg.fillRect(0, 0, W, H);
    // Ground line
    bg.fillStyle(0x2a1e12, 1); bg.fillRect(0, 360, W, 40);
    bg.lineStyle(1, 0x7a5c1e, 0.5); bg.lineBetween(0, 360, W, 360);

    // Render sprites
    this.enemySprites = [];
    this.enemies.forEach((e, i) => {
      const x = 200 + i * 260;
      const g = this.add.graphics();
      this._drawEnemy(g, e, x, 300);
      const hp = mkBar(this, x - e.sz, 370, e.sz*2, 8, e.hp, e.maxHp, 0xe05050);
      const lbl = this.add.text(x, 390, e.name, {
        fontSize:'12px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5);
      this.enemySprites.push({ g, hp, lbl, x, y:300, e });
    });

    this.partySprites = [];
    this.party.forEach((m, i) => {
      const x = 520 + i * 100;
      const g = this.add.graphics();
      this._drawHero(g, m, x, 340);
      this.partySprites.push({ g, x, y:340, m });
    });

    // Status panel
    this.statusPanel = this.add.graphics();
    this.statusTexts = [];
    this._rebuildStatus();

    // Menu panel
    this.menuPanel = this.add.graphics();
    this.menuTexts = [];
    this._rebuildMenu();

    // Log
    this.logGfx = this.add.graphics();
    this.logText = this.add.text(20, 412, '', {
      fontSize:'13px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width:760 },
    }).setDepth(5);

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

    this.waiting = false;
    this._addLog(this.enemies.length > 1
      ? `遭遇了 ${this.enemies.map(e=>e.name).join('、')}！`
      : `遭遇了 ${this.enemies[0].name}！`);
  }

  // ── Drawing ────────────────────────────────────────────
  _drawEnemy(g, e, x, y) {
    g.clear();
    if (e.dead) return;
    const r = e.sz || 28;
    g.fillStyle(e.color || 0x888888, 1);
    g.lineStyle(2, 0xffffff, 0.2);
    // Simple monster blob
    g.fillEllipse(x, y+8, r*1.1*2, r*0.7*2);
    g.fillCircle(x + r*0.5, y - r*0.3, r*0.7);
    g.strokeCircle(x + r*0.5, y - r*0.3, r*0.7);
    // Eyes
    g.fillStyle(0xff0000, 1);
    g.fillCircle(x + r*0.3, y - r*0.4, r*0.12);
    g.fillCircle(x + r*0.7, y - r*0.4, r*0.12);
    g.fillStyle(0x000000, 1);
    g.fillCircle(x + r*0.32, y - r*0.41, r*0.06);
    g.fillCircle(x + r*0.72, y - r*0.41, r*0.06);
    // Boss crown
    if (e.boss) {
      g.fillStyle(0xffd700, 1);
      g.fillTriangle(x+r*0.2, y-r*1.1, x+r*0.5, y-r*1.5, x+r*0.8, y-r*1.1);
    }
  }

  _drawHero(g, m, x, y) {
    g.clear();
    const col = m.dead ? 0x444444 : (m.color || 0x4a9eff);
    const s = 14;
    g.fillStyle(col, 1);
    g.fillCircle(x, y-s*1.15, s*0.6);
    g.fillRect(x-s*0.5, y-s*0.8, s, s*1.1);
    g.fillRect(x-s*0.5, y+s*0.3, s*0.4, s*0.7);
    g.fillRect(x+s*0.1, y+s*0.3, s*0.4, s*0.7);
    if (m.shape === 'sword') {
      g.fillStyle(0xcccccc, 1);
      g.fillRect(x+s*0.5, y-s*0.8, 3, s*1.1);
      g.fillRect(x+s*0.2, y-s*0.9, s*0.6, 3);
    } else if (m.shape === 'mage') {
      g.fillStyle(0xcccccc, 1);
      g.fillCircle(x, y-s*2.3, s*0.25);
      g.fillRect(x-2, y-s*2.3, 4, s);
    } else if (m.shape === 'archer') {
      g.lineStyle(2, 0xcccccc, 1);
      g.beginPath();
      g.arc(x-s*0.8, y-s*0.3, s*0.85, Math.PI*0.3, Math.PI*1.7);
      g.strokePath();
    }
    if (m.dead) {
      g.lineStyle(2, 0xff4444, 0.8);
      g.lineBetween(x-10, y-10, x+10, y+10);
      g.lineBetween(x+10, y-10, x-10, y+10);
    }
  }

  _rebuildStatus() {
    this.statusPanel.clear();
    this.statusTexts.forEach(t => t.destroy());
    this.statusTexts = [];
    const panelX = 0, panelY = 440, panelW = 360, panelH = 160;
    this.statusPanel.fillStyle(0x100c1e, 0.92);
    this.statusPanel.fillRect(panelX, panelY, panelW, panelH);
    this.statusPanel.lineStyle(1, 0x7a5c1e, 0.8);
    this.statusPanel.strokeRect(panelX, panelY, panelW, panelH);

    this.party.forEach((m, i) => {
      const y = panelY + 20 + i * 44;
      const dead = m.dead;
      const sel = i === this.actorIdx && this.phase === 'playerTurn';
      // Name
      const nameT = this.add.text(14, y, (sel ? '▶ ' : '  ') + m.name, {
        fontSize:'13px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: dead ? '#555' : sel ? '#ffd700' : '#e8c060',
        stroke:'#000', strokeThickness:2,
      }).setDepth(5);
      this.statusTexts.push(nameT);
      // HP
      const stats = calcStats(m);
      mkBar(this, 90, y-6, 100, 8, m.hp, m.maxHp, 0xe05050).setDepth(5);
      this.statusTexts.push(this.add.text(90, y+8, `HP ${m.hp}/${m.maxHp}`, {
        fontSize:'9px', fontFamily:'monospace', color:'#e05050', stroke:'#000', strokeThickness:1,
      }).setDepth(5));
      // MP
      mkBar(this, 200, y-6, 80, 8, m.mp, stats.maxMp, 0x5080e8).setDepth(5);
      this.statusTexts.push(this.add.text(200, y+8, `MP ${m.mp}/${stats.maxMp}`, {
        fontSize:'9px', fontFamily:'monospace', color:'#5080e8', stroke:'#000', strokeThickness:1,
      }).setDepth(5));
      // Status effects
      if (m.status.length > 0) {
        this.statusTexts.push(this.add.text(290, y, m.status.join(' '), {
          fontSize:'9px', fontFamily:'serif', color:'#c050e8', stroke:'#000', strokeThickness:1,
        }).setDepth(5));
      }
    });
  }

  _rebuildMenu() {
    this.menuPanel.clear();
    this.menuTexts.forEach(t => t.destroy());
    this.menuTexts = [];
    if (this.phase !== 'playerTurn') return;

    const px = 362, py = 440, pw = 438, ph = 160;
    this.menuPanel.fillStyle(0x100c1e, 0.92);
    this.menuPanel.fillRect(px, py, pw, ph);
    this.menuPanel.lineStyle(1, 0x7a5c1e, 0.8);
    this.menuPanel.strokeRect(px, py, pw, ph);

    const actor = this.party[this.actorIdx];
    if (!actor || actor.dead) return;

    if (!this.subMode) {
      const cmds = ['攻擊','技能','道具','防禦','逃跑'];
      cmds.forEach((cmd, i) => {
        const col = Math.floor(i/3), row = i%3;
        const x = px+20 + col*150;
        const y = py+30 + row*40;
        const sel = i === this.cursor;
        if (sel) {
          this.menuPanel.fillStyle(0x7a5c1e, 0.3);
          this.menuPanel.fillRoundedRect(x-8, y-14, 130, 30, 4);
        }
        const t = this.add.text(x, y, (sel?'▶ ':'')+cmd, {
          fontSize:'15px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color: sel ? '#ffd700' : '#c8a060', stroke:'#000', strokeThickness:2,
        }).setDepth(5);
        this.menuTexts.push(t);
      });
    } else if (this.subMode === 'skill') {
      const skills = actor.skills.map(sk => SKILLS[sk]).filter(Boolean);
      skills.forEach((sk, i) => {
        const y = py+18 + i*34;
        const sel = i === this.subCursor;
        const mpOk = actor.mp >= sk.mp;
        if (sel) {
          this.menuPanel.fillStyle(0x7a5c1e, 0.3);
          this.menuPanel.fillRoundedRect(px+8, y-14, pw-16, 30, 4);
        }
        const t = this.add.text(px+20, y, (sel?'▶ ':'')+sk.name, {
          fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color: mpOk ? (sel?'#ffd700':'#c8a060') : '#555', stroke:'#000', strokeThickness:2,
        }).setDepth(5);
        this.menuTexts.push(t);
        const mpT = this.add.text(px+pw-60, y, `MP:${sk.mp}`, {
          fontSize:'12px', fontFamily:'monospace', color:'#5080e8', stroke:'#000', strokeThickness:1,
        }).setDepth(5);
        this.menuTexts.push(mpT);
      });
    } else if (this.subMode === 'item') {
      const items = Object.entries(GS.inventory).filter(([id,n]) => n>0 && ITEMS[id]?.cat==='use');
      if (items.length === 0) {
        const t = this.add.text(px+pw/2, py+ph/2, '── 無道具 ──', {
          fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#555',
          stroke:'#000', strokeThickness:1,
        }).setOrigin(0.5,0.5).setDepth(5);
        this.menuTexts.push(t);
      } else {
        items.forEach(([id, n], i) => {
          const y = py+18 + i*34;
          const sel = i === this.subCursor;
          if (sel) {
            this.menuPanel.fillStyle(0x7a5c1e, 0.3);
            this.menuPanel.fillRoundedRect(px+8, y-14, pw-16, 30, 4);
          }
          const it = ITEMS[id];
          const t = this.add.text(px+20, y, (sel?'▶ ':'')+it.name+` ×${n}`, {
            fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
            color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
          }).setDepth(5);
          this.menuTexts.push(t);
        });
      }
    } else if (this.subMode === 'target') {
      this.targetList.forEach((tgt, i) => {
        const y = py+20 + i*36;
        const sel = i === this.subCursor;
        if (sel) {
          this.menuPanel.fillStyle(0x7a5c1e, 0.3);
          this.menuPanel.fillRoundedRect(px+8, y-14, pw-16, 30, 4);
        }
        const label = tgt.isEnemy ? tgt.e.name : tgt.m.name;
        const t = this.add.text(px+20, y, (sel?'▶ ':'')+label, {
          fontSize:'15px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
        }).setDepth(5);
        this.menuTexts.push(t);
      });
    }
  }

  _addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 3) this.log.pop();
    this.logGfx.clear();
    this.logGfx.fillStyle(0x08060e, 0.7);
    this.logGfx.fillRect(0, 408, 800, 30);
    this.logText.setText(this.log[0] || '');
  }

  // ── Battle logic ───────────────────────────────────────
  _calcDmg(atk, def, pow, pierce=0, elem='none') {
    const effDef = Math.floor(def * (1 - pierce));
    let dmg = Math.max(1, Math.floor(atk * pow - effDef * 0.7));
    dmg = Math.max(1, Math.floor(dmg * (0.85 + Math.random() * 0.3)));
    return dmg;
  }

  _flashSprite(sprite, color=0xffffff, times=3) {
    let count = 0;
    const timer = this.time.addEvent({ delay:80, repeat:times*2-1, callback:() => {
      count++;
      sprite.setAlpha(count%2===0 ? 1 : 0.3);
      if (count >= times*2) sprite.setAlpha(1);
    }});
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

    if (cmd === 'defend') {
      actor.status.push('defend');
      doAfter(`${actor.name} 防禦！`);
      return;
    }
    if (cmd === 'flee') {
      if (Math.random() < 0.5) {
        this.time.delayedCall(500, () => { this.scene.start('WorldScene'); });
        this._addLog('成功逃跑！');
      } else {
        doAfter('逃跑失敗！');
      }
      return;
    }
    if (cmd === 'attack') {
      const tgt = this.enemies[targetIdx];
      const st = calcStats(actor);
      const dmg = this._calcDmg(st.atk, tgt.def, 1.0);
      tgt.hp = Math.max(0, tgt.hp - dmg);
      if (tgt.hp === 0) tgt.dead = true;
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
        const targets = sk.tgt==='all' ? this.enemies.filter(e=>!e.dead) : [this.enemies[targetIdx]];
        const dmgs = targets.map(tgt => {
          const dmg = this._calcDmg(st.atk, tgt.def, sk.pow, sk.pierce||0, sk.elem||'none');
          tgt.hp = Math.max(0, tgt.hp - dmg);
          if (tgt.hp === 0) tgt.dead = true;
          if (sk.debuff) Object.entries(sk.debuff).forEach(([k,v]) => { if (!tgt.status.includes(k)) { for(let i=0;i<v;i++) tgt.status.push(k); } });
          return dmg;
        });
        targets.forEach((_,i) => { this._refreshEnemyHp(this.enemies.indexOf(targets[i])); });
        this.enemies.forEach((_,i) => this._flashEnemy(i));
        msg = `${actor.name} 施展 ${sk.name}，造成 ${dmgs.map(d=>d+'').join('/')} 點傷害！`;
      } else if (sk.type === 'heal') {
        const targets = sk.tgt==='all' ? this.party.filter(m=>!m.dead) : [this.party[targetIdx]];
        const heals = targets.map(tgt => {
          const s = calcStats(tgt);
          const h = Math.floor(s.atk * sk.pow * (0.9 + Math.random()*0.2));
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + h);
          return h;
        });
        msg = `${actor.name} 施展 ${sk.name}，恢復 ${heals.map(h=>h+'').join('/')} 點生命值！`;
      }
      this._rebuildStatus();
      this._addLog(msg);
      this.time.delayedCall(600, () => { this.waiting = false; this._nextActor(); });
      return;
    }
    if (cmd === 'item') {
      const it = ITEMS[itemId];
      if (!it) { doAfter('…'); return; }
      const tgt = this.party[targetIdx];
      GS.removeItem(itemId);
      let msg = '';
      if (it.hp) { tgt.hp = Math.min(tgt.maxHp, tgt.hp + it.hp); msg = `${tgt.name} 恢復了 ${it.hp} HP！`; }
      if (it.mp) { const s=calcStats(tgt); tgt.mp = Math.min(s.maxMp, tgt.mp + it.mp); msg += ` MP +${it.mp}`; }
      if (it.revive && tgt.dead) { tgt.dead = false; tgt.hp = Math.floor(tgt.maxHp * it.revive/100); msg = `${tgt.name} 復活了！`; }
      doAfter(msg || `使用了 ${it.name}！`);
      return;
    }
  }

  _flashEnemy(idx) {
    const sp = this.enemySprites[idx];
    if (!sp) return;
    let count = 0;
    const t = this.time.addEvent({ delay:80, repeat:5, callback:() => {
      count++;
      sp.g.setAlpha(count%2===0?1:0.3);
      if (count>=6) sp.g.setAlpha(sp.e.dead?0:1);
    }});
  }

  _refreshEnemyHp(idx) {
    const sp = this.enemySprites[idx];
    if (!sp) return;
    sp.hp.destroy();
    const e = sp.e;
    sp.hp = mkBar(this, sp.x - (e.sz||28), 370, (e.sz||28)*2, 8, e.hp, e.maxHp, 0xe05050);
    if (e.dead) {
      sp.g.setAlpha(0);
      sp.lbl.setAlpha(0.3);
    }
    this._drawEnemy(sp.g, e, sp.x, sp.y);
  }

  _nextActor() {
    // Check win/lose
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
      // Tick status effects on party
      this.party.forEach(m => {
        if (m.dead) return;
        if (m.status.includes('poison')) {
          const dmg = Math.max(1, Math.floor(m.maxHp * 0.05));
          m.hp = Math.max(1, m.hp - dmg);
          this._addLog(`${m.name} 中毒，損失 ${dmg} HP！`);
        }
        m.status = m.status.filter(s => s !== 'defend' && s !== 'atkUp');
        // Reduce countdown statuses
        const poison = m.status.filter(s => s==='poison').length;
        if (poison > 0) {
          m.status = m.status.filter(s=>s!=='poison');
          for (let i=0;i<poison-1;i++) m.status.push('poison');
        }
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
    const tgt = living[Math.floor(Math.random()*living.length)];
    const pIdx = this.party.indexOf(tgt);

    if (act.type === 'atk' || act.type === 'drain') {
      let def = tgt.baseDef;
      if (tgt.status.includes('defend')) def = Math.floor(def * 1.5);
      const dmg = this._calcDmg(e.atk, def, act.pow||1);
      tgt.hp = Math.max(0, tgt.hp - dmg);
      if (tgt.hp === 0) { tgt.dead = true; }
      if (act.debuff) Object.entries(act.debuff).forEach(([k,v]) => { for(let i=0;i<v;i++) tgt.status.push(k); });
      if (act.type === 'drain') e.hp = Math.min(e.maxHp, e.hp + Math.floor(dmg*0.5));
      this._addLog(`${e.name} 使用 ${act.name}，${tgt.name} 受到 ${dmg} 點傷害！`);
      // Flash hero
      const sp = this.partySprites[pIdx];
      if (sp) {
        let c=0;
        this.time.addEvent({ delay:80, repeat:5, callback:() => {
          c++; sp.g.setAlpha(c%2===0?1:0.3); if(c>=6){sp.g.setAlpha(1);this._drawHero(sp.g,tgt,sp.x,sp.y);}
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
    let expGain = this.enemies.reduce((s,e) => s + (ENEMIES[e.id]?.exp||0), 0);
    let goldGain = this.enemies.reduce((s,e) => s + (ENEMIES[e.id]?.gold||0), 0);
    GS.gold += goldGain;
    // Drops
    const drops = [];
    this.enemies.forEach(e => {
      (e.drops||[]).forEach(drop => {
        if (Math.random() < drop.r) { GS.addItem(drop.id); drops.push(ITEMS[drop.id]?.name||drop.id); }
      });
    });
    // Level up
    const levelUps = [];
    GS.party.forEach(m => {
      if (m.dead) return;
      m.exp += expGain;
      while (m.exp >= expForLevel(m.lv)) { GS.levelUp(m); levelUps.push(m.name); }
    });
    // Sync back
    GS.party.forEach((gm, i) => { if (this.party[i]) Object.assign(gm, this.party[i]); });

    let msg = `戰鬥勝利！獲得 ${expGain} EXP、${goldGain} 靈石。`;
    if (drops.length) msg += ` 獲得：${drops.join('、')}。`;
    if (levelUps.length) msg += ` ${levelUps.join('、')} 升級！`;
    this._addLog(msg);
    this._rebuildStatus();
    this.time.delayedCall(2000, () => { this.scene.start('WorldScene'); });
  }

  _loseBattle() {
    this.phase = 'lose';
    this._addLog('全員陣亡…');
    this.time.delayedCall(2000, () => {
      GS.init();
      this.scene.start('TitleScene');
    });
  }

  // ── Input handling ─────────────────────────────────────
  update() {
    if (this.waiting || this.phase !== 'playerTurn') return;
    const actor = this.party[this.actorIdx];
    if (!actor || actor.dead) { this._nextActor(); return; }

    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const back = Phaser.Input.Keyboard.JustDown(this.keys.x) || Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (!this.subMode) {
      const cmdCount = 5;
      if (up)   { this.cursor = (this.cursor - 1 + cmdCount) % cmdCount; this._rebuildMenu(); }
      if (down) { this.cursor = (this.cursor + 1) % cmdCount; this._rebuildMenu(); }
      if (ok) {
        if (this.cursor === 0) { // Attack
          const alive = this.enemies.filter(e=>!e.dead);
          if (alive.length === 1) { this._heroAct('attack',null,null,this.enemies.indexOf(alive[0])); }
          else { this.subMode='target'; this.subCursor=0; this.targetList=alive.map(e=>({isEnemy:true,e})); this._rebuildMenu(); }
        } else if (this.cursor === 1) { // Skill
          this.subMode='skill'; this.subCursor=0; this._rebuildMenu();
        } else if (this.cursor === 2) { // Item
          this.subMode='item'; this.subCursor=0; this._rebuildMenu();
        } else if (this.cursor === 3) { // Defend
          this._heroAct('defend');
        } else if (this.cursor === 4) { // Flee
          this._heroAct('flee');
        }
      }
    } else if (this.subMode === 'skill') {
      const skills = actor.skills.map(sk=>SKILLS[sk]).filter(Boolean);
      if (up)   { this.subCursor=(this.subCursor-1+skills.length)%skills.length; this._rebuildMenu(); }
      if (down) { this.subCursor=(this.subCursor+1)%skills.length; this._rebuildMenu(); }
      if (back) { this.subMode=null; this._rebuildMenu(); }
      if (ok) {
        const sk = skills[this.subCursor];
        if (!sk || actor.mp < sk.mp) { this._addLog('靈力不足！'); return; }
        const skId = actor.skills[this.subCursor];
        if (sk.tgt === 'all') { this._heroAct('skill',skId,null,0); this.subMode=null; }
        else if (sk.type === 'heal') {
          this.targetList = this.party.filter(m=>!m.dead).map(m=>({isEnemy:false,m}));
          this.subMode='target'; this.subCursor=0; this._pendingSkill=skId; this._rebuildMenu();
        } else {
          const alive = this.enemies.filter(e=>!e.dead);
          if (alive.length===1) { this._heroAct('skill',skId,null,this.enemies.indexOf(alive[0])); this.subMode=null; }
          else { this.targetList=alive.map(e=>({isEnemy:true,e})); this.subMode='target'; this.subCursor=0; this._pendingSkill=skId; this._rebuildMenu(); }
        }
      }
    } else if (this.subMode === 'item') {
      const items = Object.entries(GS.inventory).filter(([id,n])=>n>0&&ITEMS[id]?.cat==='use');
      if (up)   { this.subCursor=(this.subCursor-1+Math.max(1,items.length))%Math.max(1,items.length); this._rebuildMenu(); }
      if (down) { this.subCursor=(this.subCursor+1)%Math.max(1,items.length); this._rebuildMenu(); }
      if (back) { this.subMode=null; this._rebuildMenu(); }
      if (ok && items.length > 0) {
        const [itemId] = items[this.subCursor];
        this.targetList = this.party.filter(m=>!m.dead).map(m=>({isEnemy:false,m}));
        this.subMode='target'; this.subCursor=0; this._pendingItem=itemId; this._rebuildMenu();
      }
    } else if (this.subMode === 'target') {
      if (up)   { this.subCursor=(this.subCursor-1+this.targetList.length)%this.targetList.length; this._rebuildMenu(); }
      if (down) { this.subCursor=(this.subCursor+1)%this.targetList.length; this._rebuildMenu(); }
      if (back) { this.subMode=this._pendingItem?'item':this._pendingSkill?'skill':null; this._rebuildMenu(); }
      if (ok) {
        const tgt = this.targetList[this.subCursor];
        if (this._pendingSkill) {
          const idx = tgt.isEnemy ? this.enemies.indexOf(tgt.e) : this.party.indexOf(tgt.m);
          this._heroAct('skill',this._pendingSkill,null,idx);
          this._pendingSkill=null; this.subMode=null;
        } else if (this._pendingItem) {
          const idx = this.party.indexOf(tgt.m);
          this._heroAct('item',null,this._pendingItem,idx);
          this._pendingItem=null; this.subMode=null;
        } else {
          const idx = this.enemies.indexOf(tgt.e);
          this._heroAct('attack',null,null,idx);
          this.subMode=null;
        }
      }
    }
  }
}
