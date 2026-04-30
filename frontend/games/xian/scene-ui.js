'use strict';
// ══════════════════════════════════════════════════════════
//  MenuScene — overlay over WorldScene
// ══════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  init(data) { this.caller = data?.caller || 'WorldScene'; }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this.tab = 0; this.tabs = ['狀態','裝備','道具','存檔','成就','任務','圖鑑'];
    this.cursor = 0; this.member = 0;
    this.equipSlot = -1; this.equipList = []; this.equipCursor = 0;
    this.itemList = []; this.itemCursor = 0;
    this.saveCursor = 0; this.saveMsg = '';

    // Dim overlay
    this.add.graphics().fillStyle(0x000000, 0.65).fillRect(0, 0, W, H);

    this.panelGfx = this.add.graphics();
    this.drawPanel();

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
  }

  drawPanel() {
    this.panelGfx.clear();
    this.children.list.filter(c => c !== this.panelGfx && c.type !== 'Graphics').forEach(c => c.destroy());

    const W = this.scale.width, H = this.scale.height;
    const px = Math.floor(W*0.04), py = Math.floor(H*0.04);
    const pw = Math.floor(W*0.92), ph = Math.floor(H*0.92);

    // Panel background
    this.panelGfx.fillStyle(0x0c0818, 0.98);
    this.panelGfx.fillRoundedRect(px, py, pw, ph, 10);
    this.panelGfx.lineStyle(2, 0x9a7a28, 1);
    this.panelGfx.strokeRoundedRect(px, py, pw, ph, 10);
    this.panelGfx.lineStyle(1, 0x4a3a10, 0.7);
    this.panelGfx.strokeRoundedRect(px+3, py+3, pw-6, ph-6, 8);

    // Tabs
    const tabW = Math.floor(pw / this.tabs.length);
    this.tabs.forEach((t, i) => {
      const tx = px + i * tabW;
      const sel = i === this.tab;
      if (sel) {
        this.panelGfx.fillStyle(0x7a5c1e, 0.45);
        this.panelGfx.fillRoundedRect(tx+4, py+6, tabW-8, 40, 6);
        this.panelGfx.lineStyle(1, 0x9a7a28, 0.7);
        this.panelGfx.strokeRoundedRect(tx+4, py+6, tabW-8, 40, 6);
      }
      this.add.text(tx + tabW/2, py+26, t, {
        fontSize: Math.max(14, Math.floor(pw*0.022))+'px',
        fontFamily:'"Noto Serif TC","SimSun",serif',
        color: sel ? '#ffd700' : '#c8a060',
        stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5);
    });

    // Tab divider
    this.panelGfx.lineStyle(1, 0x7a5c1e, 0.6);
    this.panelGfx.lineBetween(px+8, py+50, px+pw-8, py+50);

    // Footer
    this.add.text(px+pw/2, py+ph-18, 'X / Esc：關閉　←→ 切換分頁', {
      fontSize: Math.max(11, Math.floor(W*0.012))+'px',
      fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0.5);

    // Content area bounds stored for sub-draw methods
    this._px = px; this._py = py; this._pw = pw; this._ph = ph;
    this._cx = px + 14;
    this._cy = py + 60;
    this._cw = pw - 28;
    this._ch = ph - 80;

    switch(this.tab) {
      case 0: this._drawStatus();  break;
      case 1: this._drawEquip();   break;
      case 2: this._drawItem();    break;
      case 3: this._drawSave();    break;
      case 4: this._drawAchieve(); break;
      case 5: this._drawQuests();   break;
      case 6: this._drawBestiary(); break;
    }
  }

  _drawStatus() {
    const { _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const n = GS.party.length;
    if (!n) return;

    // Passive ability descriptions per character
    const PASSIVES = {
      yunyi:  { name:'勇者本色', desc:'HP ≥ 90% 時攻擊+20%', clr:'#ffd060' },
      linger: { name:'山神補氣', desc:'每回合自動回復 5% MP', clr:'#80e880' },
      yuehua: { name:'月神之眼', desc:'暴擊率提升至 15%',   clr:'#80d8ff' },
    };
    const ELEM_CLR2 = { fire:'#ff6020', ice:'#40c0ff', thunder:'#ffd020', wind:'#40e080', light:'#ffd0a0', none:'#707090' };
    const TYPE_LBL  = { atk:'攻', heal:'回', buff:'強', cleanse:'淨' };
    const CHAR_CLR  = { yunyi:0xf0a010, linger:0x508840, yuehua:0x60c8ff };
    const CHAR_CLR_S= { yunyi:'#f0a010', linger:'#70c050', yuehua:'#60c8ff' };

    // Compact member selector tabs at top
    const tabH = 36, tabW = Math.floor(cw / n);
    GS.party.forEach((m, i) => {
      const sel = i === this.member;
      const tx = cx + i * tabW, ty = cy;
      const clr = CHAR_CLR[m.id] || 0x888888;
      this.panelGfx.fillStyle(clr, sel ? 0.35 : 0.12);
      this.panelGfx.fillRoundedRect(tx, ty, tabW-3, tabH, 5);
      if (sel) {
        this.panelGfx.lineStyle(1, clr, 0.8);
        this.panelGfx.strokeRoundedRect(tx, ty, tabW-3, tabH, 5);
      }
      // Color dot
      this.panelGfx.fillStyle(clr, 0.9);
      this.panelGfx.fillCircle(tx+14, ty+tabH/2, 7);
      this.add.text(tx+26, ty+tabH/2, `${m.name}　Lv.${m.lv}`, {
        fontSize: Math.max(11, Math.floor(cw*0.018))+'px',
        fontFamily:'"Noto Serif TC","SimSun",serif',
        color: sel ? CHAR_CLR_S[m.id]||'#ffd700' : '#806840',
        fontStyle: sel ? 'bold' : 'normal', stroke:'#000', strokeThickness:sel?2:1,
      }).setOrigin(0, 0.5);
    });

    // Detail area for selected member
    const m = GS.party[this.member]; if (!m) return;
    const st = calcStats(m);
    const dy = cy + tabH + 8;
    const dh = ch - tabH - 8;
    const halfW = Math.floor(cw / 2);
    const fs = Math.max(13, Math.floor(dh * 0.055));
    const fsS = Math.max(10, fs - 2);
    const fsXS = Math.max(9, fs - 4);

    // ── Left column ─────────────────────────────────────
    // Name + title
    this.add.text(cx+8, dy, m.name, {
      fontSize: Math.floor(fs*1.4)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color: CHAR_CLR_S[m.id]||'#ffd700', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    });
    this.add.text(cx+8, dy+Math.floor(fs*1.5)+2, m.title, {
      fontSize: fsS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#9a8060', stroke:'#000', strokeThickness:1,
    });

    // EXP bar + level
    const expY = dy + Math.floor(fs*1.5) + fsS + 8;
    const barW = Math.floor(halfW * 0.85);
    const expMax = expForLevel(m.lv);
    mkBar(this, cx+8, expY, barW, 5, m.exp, expMax, 0x50c878);
    this.add.text(cx+8, expY+7, `Lv.${m.lv}　EXP ${m.exp}/${expMax}`, {
      fontSize: fsXS+'px', fontFamily:'monospace', color:'#50c878', stroke:'#000', strokeThickness:1,
    });

    // HP / MP bars
    const barY2 = expY + 22;
    const barH2 = Math.max(7, Math.floor(dh * 0.038));
    mkBar(this, cx+8, barY2,        barW, barH2, m.hp,  m.maxHp,  0xe04040);
    mkBar(this, cx+8, barY2+barH2+5,barW, barH2, m.mp,  st.maxMp, 0x4060e0);
    this.add.text(cx+8+barW+5, barY2+barH2/2,        `HP ${m.hp}/${m.maxHp}`,  { fontSize:fsXS+'px', fontFamily:'monospace', color:'#e05050', stroke:'#000', strokeThickness:1 }).setOrigin(0,0.5);
    this.add.text(cx+8+barW+5, barY2+barH2+5+barH2/2,`MP ${m.mp}/${st.maxMp}`, { fontSize:fsXS+'px', fontFamily:'monospace', color:'#5070e0', stroke:'#000', strokeThickness:1 }).setOrigin(0,0.5);

    // Stats 2-col grid
    const statY = barY2 + barH2*2 + 16;
    const statPairs = [['ATK', st.atk, '#ff9060'], ['DEF', st.def, '#60c0ff'], ['SPD', st.spd, '#80e080'], ['LUK', st.luk, '#ffd080']];
    statPairs.forEach(([lbl, val, clr], si) => {
      const sx = cx + 8 + Math.floor(si/2) * Math.floor(halfW*0.55), sy = statY + (si%2) * (fsS+5);
      this.add.text(sx, sy, lbl+':', { fontSize:fsS+'px', fontFamily:'monospace', color:'#7a6a4a', stroke:'#000', strokeThickness:1 });
      this.add.text(sx+38, sy, String(val), { fontSize:fsS+'px', fontFamily:'monospace', color:clr, fontStyle:'bold', stroke:'#000', strokeThickness:1 });
    });

    // Equipment row
    const eqY = statY + fsS*2 + 14;
    const eqEntries = Object.entries(m.equip).filter(([,v])=>v);
    if (eqEntries.length) {
      this.add.text(cx+8, eqY, '裝備　', { fontSize:fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#6a5a3a' });
      const eqStr = eqEntries.map(([,v])=>ITEMS[v]?.name||v).join('・');
      this.add.text(cx+8+32, eqY, eqStr, { fontSize:fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#80c0b8', stroke:'#000', strokeThickness:1 });
    }

    // Status effects
    const stEffects = [...new Set(m.status||[])];
    if (stEffects.length) {
      const ST_C = { poison:'#c050e8', burn:'#ff8040', slow:'#80a0ff', stun:'#ffcc00', atkUp:'#ffe060', defUp:'#80e8ff', defend:'#80c0ff' };
      const ST_L = { poison:'中毒', burn:'灼燒', slow:'遲緩', stun:'昏迷', atkUp:'攻↑', defUp:'守↑', defend:'防禦' };
      const seY = eqY + fsXS + 6;
      let seX = cx + 8;
      stEffects.forEach(s => {
        const lbl = ST_L[s]||s, clr = ST_C[s]||'#fff';
        const tt = this.add.text(seX, seY, lbl, { fontSize:Math.max(9,fsXS-1)+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:clr, stroke:'#000', strokeThickness:1 });
        seX += tt.width + 8;
      });
    }

    // ── Right column: Passive + Skills ───────────────────
    const rx = cx + halfW + 8;

    // Passive ability box
    const passive = PASSIVES[m.id];
    const _h2c = s => parseInt(String(s).replace('#',''), 16);
    if (passive) {
      this.panelGfx.fillStyle(0x181020, 0.8);
      this.panelGfx.fillRoundedRect(rx, dy, halfW-16, Math.floor(dh*0.18), 6);
      this.panelGfx.lineStyle(1, _h2c(passive.clr), 0.6);
      this.panelGfx.strokeRoundedRect(rx, dy, halfW-16, Math.floor(dh*0.18), 6);
      this.add.text(rx+10, dy+5, '【被動】' + passive.name, {
        fontSize: fsS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: passive.clr, fontStyle:'bold', stroke:'#000', strokeThickness:2,
      });
      this.add.text(rx+10, dy+7+fsS, passive.desc, {
        fontSize: fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#9a8860', stroke:'#000', strokeThickness:1,
      });
    }

    // Skill list
    const skillTitleY = dy + Math.floor(dh*0.21);
    this.add.text(rx+10, skillTitleY, '技能', {
      fontSize: fsS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#c8a060', fontStyle:'bold', stroke:'#000', strokeThickness:1,
    });
    this.panelGfx.lineStyle(1, 0x5a4a1a, 0.5);
    this.panelGfx.lineBetween(rx+10, skillTitleY+fsS+2, rx+halfW-18, skillTitleY+fsS+2);

    const ELEM_SYM = { fire:'火', ice:'冰', thunder:'雷', wind:'風', light:'光', none:'無' };
    const skills = m.skills || [];
    const skRowH = Math.max(24, Math.floor((dh - Math.floor(dh*0.24)) / Math.max(skills.length, 1)));
    const showDesc = skRowH >= 32;
    skills.forEach((sid, si) => {
      const sk = SKILLS[sid]; if (!sk) return;
      const sy = skillTitleY + fsS + 6 + si * skRowH;
      const elemClr = ELEM_CLR2[sk.elem||'none'] || '#707090';
      const typeStr = TYPE_LBL[sk.type] || '技';
      // Type badge (wider to fit element symbol)
      this.panelGfx.fillStyle(_h2c(elemClr), 0.82);
      this.panelGfx.fillRoundedRect(rx+10, sy+1, 22, skRowH-4, 3);
      this.add.text(rx+21, sy+skRowH/2-1, typeStr, { fontSize:Math.max(8,fsXS-1)+'px', fontFamily:'monospace', color:'#000', fontStyle:'bold' }).setOrigin(0.5,0.5);
      // Element symbol below badge (if space)
      if (sk.elem && sk.elem !== 'none') {
        const symTxt = this.add.text(rx+21, sy+skRowH-5, ELEM_SYM[sk.elem]||'', {
          fontSize:Math.max(7,fsXS-3)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#000', fontStyle:'bold',
        }).setOrigin(0.5,1).setAlpha(0.85);
      }
      // Target indicator
      const tgtClr = sk.tgt==='all' ? '#ff8840' : '#88c8ff';
      const tgtSym = sk.tgt==='all' ? '◎' : '●';
      this.add.text(rx+34, sy+2, tgtSym, { fontSize:Math.max(8,fsXS-2)+'px', fontFamily:'monospace', color:tgtClr, stroke:'#000', strokeThickness:1 });
      // Skill name
      this.add.text(rx+44, sy+2, sk.name, {
        fontSize: fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#d0c090', stroke:'#000', strokeThickness:1,
      });
      // Description (if space available)
      if (showDesc && sk.desc) {
        this.add.text(rx+44, sy+fsXS+4, sk.desc, {
          fontSize: Math.max(7,fsXS-3)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#7a6a4a', stroke:'#000', strokeThickness:1,
          wordWrap:{ width: halfW-70 },
        });
      }
      // MP cost
      const mpY = sy + (showDesc ? 2 : skRowH/2-fsXS/2);
      if (sk.mp > 0) {
        this.add.text(rx+halfW-18, sy+2, `MP ${sk.mp}`, {
          fontSize: Math.max(8,fsXS-1)+'px', fontFamily:'monospace', color:'#5070e0', stroke:'#000', strokeThickness:1,
        }).setOrigin(1,0);
      } else {
        this.add.text(rx+halfW-18, sy+2, '無消耗', {
          fontSize: Math.max(8,fsXS-1)+'px', fontFamily:'monospace', color:'#4a5a3a', stroke:'#000', strokeThickness:1,
        }).setOrigin(1,0);
      }
      // Debuff indicator
      if (sk.debuff) {
        const dKeys=Object.keys(sk.debuff);
        const DB_L={burn:'灼',poison:'毒',slow:'緩',stun:'眩',atkDown:'弱'};
        const dbStr=dKeys.map(d=>DB_L[d]||d).join('');
        this.add.text(rx+halfW-18, sy+fsXS+3, dbStr, {
          fontSize:Math.max(7,fsXS-3)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#e080c0', stroke:'#000', strokeThickness:1,
        }).setOrigin(1,0);
      }
    });

    this.add.text(cx+cw/2, cy+ch+14, '↑↓ 選擇成員', {
      fontSize: Math.max(11, Math.floor(cw*0.014))+'px', fontFamily:'serif', color:'#5a4a2a',
    }).setOrigin(0.5, 0);
  }

  _drawEquip() {
    const { _px:px, _py:py, _pw:pw, _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const m = GS.party[this.member];
    if (!m) return;
    const fs  = Math.max(13, Math.floor(cw * 0.022));
    const fsS = Math.max(10, fs - 3);
    const slots     = ['wp','ar','ac'];
    const slotNames = ['武器','防具','飾品'];

    this.add.text(cx+8, cy+4, `${m.name} 的裝備`, {
      fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    });
    this.add.text(cx+cw-8, cy+4, '←→ 切換成員', {
      fontSize: fsS+'px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0);

    if (this.equipSlot === -1) {
      const rowH = Math.floor((ch - 40) / 3);
      slots.forEach((slot, i) => {
        const ry  = cy + 40 + i * rowH;
        const sel = i === this.cursor;
        if (sel) {
          this.panelGfx.fillStyle(0xe8c060, 0.1);
          this.panelGfx.fillRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
          this.panelGfx.lineStyle(1, 0x9a7a28, 0.5);
          this.panelGfx.strokeRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
        }
        this.add.text(cx+14, ry+4, (sel?'▶ ':'')+slotNames[i], {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
        });
        const eq = m.equip[slot];
        this.add.text(cx+cw*0.35, ry+4, eq ? ITEMS[eq]?.name||eq : '── 空 ──', {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color: eq?'#80e0d0':'#444', stroke:'#000', strokeThickness:1,
        });
        if (eq && ITEMS[eq]) {
          const it = ITEMS[eq];
          const bonus = [it.atk&&`ATK+${it.atk}`,it.def&&`DEF+${it.def}`,it.mp&&`MP+${it.mp}`,it.luk&&`LUK+${it.luk}`].filter(Boolean).join(' ');
          this.add.text(cx+cw*0.72, ry+4, bonus, { fontSize: fsS+'px', fontFamily:'monospace', color:'#7a9090', stroke:'#000', strokeThickness:1 });
        }
      });
      this.add.text(cx+cw/2, cy+ch+14, 'Z：選擇欄位　↑↓ 移動', {
        fontSize: fsS+'px', fontFamily:'serif', color:'#5a4a2a',
      }).setOrigin(0.5, 0);
    } else {
      this.add.text(cx+14, cy+42, `選擇 ${slotNames[this.equipSlot]} 裝備：`, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', stroke:'#000', strokeThickness:2,
      });
      if (this.equipList.length === 0) {
        this.add.text(cx+cw/2, cy+ch/2, '── 無可用裝備 ──', {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color:'#444',
        }).setOrigin(0.5, 0.5);
      } else {
        const rowH = Math.max(36, Math.floor((ch - 60) / this.equipList.length));
        const slot = ['wp','ar','ac'][this.equipSlot];
        const curEqId = m.equip[slot];
        const curIt = curEqId ? ITEMS[curEqId] : null;
        this.equipList.forEach((id, i) => {
          const ry  = cy + 68 + i * rowH;
          const sel = i === this.equipCursor;
          if (sel) {
            this.panelGfx.fillStyle(0xe8c060, 0.1);
            this.panelGfx.fillRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
            this.panelGfx.lineStyle(1, 0x9a7a28, 0.4);
            this.panelGfx.strokeRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
          }
          const it = id ? ITEMS[id] : null;
          const nm = it ? it.name : '── 卸除 ──';
          this.add.text(cx+14, ry+4, (sel?'▶ ':'') + nm, {
            fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
            color: sel?'#ffd700': it?'#c8a060':'#666', stroke:'#000', strokeThickness:2,
          });
          if (it) {
            // Stat comparison: show delta vs current equip
            const STAT_KEYS = ['atk','def','mp','luk'];
            const deltas = STAT_KEYS.map(k => {
              const nv = it[k]||0, ov = curIt?.[k]||0, d = nv - ov;
              if (!nv && !ov) return null;
              if (d > 0) return { t:`↑${k.toUpperCase()}+${d}`, c:'#80ff80' };
              if (d < 0) return { t:`↓${k.toUpperCase()}${d}`, c:'#ff8080' };
              return { t:`${k.toUpperCase()}+${nv}`, c:'#888' };
            }).filter(Boolean);
            let dx = cx + Math.floor(cw*0.48);
            deltas.forEach(({t, c}) => {
              const dt = this.add.text(dx, ry+4, t, { fontSize:Math.max(9,fsS-1)+'px', fontFamily:'monospace', color:c, stroke:'#000', strokeThickness:1 });
              dx += dt.width + 7;
            });
          }
        });
      }
      this.add.text(cx+cw/2, cy+ch+14, 'Z：確認　X：返回', {
        fontSize: fsS+'px', fontFamily:'serif', color:'#5a4a2a',
      }).setOrigin(0.5, 0);
    }
  }

  _equipCandidates(slot) {
    const m = GS.party[this.member];
    return [null, ...Object.keys(GS.inventory).filter(id => {
      const it = ITEMS[id];
      if (!it || it.cat !== 'eq') return false;
      if (it.slot !== slot) return false;
      if (it.who && it.who !== m.id) return false;
      return true;
    })];
  }

  _drawItem() {
    const { _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const fs  = Math.max(13, Math.floor(cw * 0.022));
    const fsS = Math.max(10, fs - 3);

    this.add.text(cx+8, cy+4, '道　具', {
      fontSize: Math.floor(fs*1.2)+'px', fontFamily:'"Noto Serif TC",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    });

    const items = Object.entries(GS.inventory).filter(([,n]) => n > 0);
    if (items.length === 0) {
      this.add.text(cx+cw/2, cy+ch/2, '── 空空如也 ──', {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color:'#444',
      }).setOrigin(0.5, 0.5);
    } else {
      const rowH = Math.max(36, Math.floor((ch - 40) / Math.max(1, items.length)));
      items.forEach(([id, n], i) => {
        const ry  = cy + 40 + i * rowH;
        const sel = i === this.itemCursor;
        if (sel) {
          this.panelGfx.fillStyle(0xe8c060, 0.1);
          this.panelGfx.fillRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
          this.panelGfx.lineStyle(1, 0x9a7a28, 0.4);
          this.panelGfx.strokeRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
        }
        const it = ITEMS[id];
        this.add.text(cx+14, ry+4, (sel?'▶ ':'')+`${it?.name||id}  ×${n}`, {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
          color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
        });
        if (it?.desc) {
          this.add.text(cx+cw*0.55, ry+4, it.desc, {
            fontSize: fsS+'px', fontFamily:'serif', color:'#9a8060', stroke:'#000', strokeThickness:1,
          });
        }
      });
    }
    const selId = items.length>0 ? items[this.itemCursor]?.[0] : null;
    const selIt = selId ? ITEMS[selId] : null;
    const useHint = (selIt && (selIt.hp||selIt.mp||selIt.revive)) ? '　Z：使用' : '';
    this.add.text(cx+cw/2, cy+ch+14, `靈石：${GS.gold}　↑↓ 移動${useHint}`, {
      fontSize: fsS+'px', fontFamily:'serif', color:'#5a4a2a',
    }).setOrigin(0.5, 0);
  }

  _drawSave() {
    const { _px:px, _py:py, _pw:pw, _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const fs  = Math.max(13, Math.floor(cw * 0.022));
    const fsS = Math.max(10, fs - 3);

    this.add.text(cx+cw/2, cy+6, '存　檔', {
      fontSize: Math.floor(fs*1.3)+'px', fontFamily:'"Noto Serif TC",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0);

    const rowH = Math.floor((ch - 50) / 3);
    for (let i = 0; i < 3; i++) {
      const d   = Save.read(i);
      const ry  = cy + 50 + i * rowH;
      const sel = i === this.saveCursor;
      if (sel) {
        this.panelGfx.fillStyle(0xe8c060, 0.1);
        this.panelGfx.fillRoundedRect(cx-4, ry-8, cw+8, rowH-4, 6);
        this.panelGfx.lineStyle(1, 0x9a7a28, 0.5);
        this.panelGfx.strokeRoundedRect(cx-4, ry-8, cw+8, rowH-4, 6);
      }
      this.add.text(cx+14, ry+6, (sel?'▶ ':'')+`欄位 ${i+1}`, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
        color: sel?'#ffe080':'#c8b080', fontStyle: sel?'bold':'normal', stroke:'#000', strokeThickness:2,
      });
      if (d) {
        const _pt = d.flags?.playtime || 0;
        const _ptStr = _pt > 0 ? `  ${Math.floor(_pt/3600)}h${String(Math.floor((_pt%3600)/60)).padStart(2,'0')}m` : '';
        this.add.text(cx+cw/2, ry+6+fs+4, `Lv.${d.party?.[0]?.lv||'?'} · ${MAPS[d.map]?.name||d.map} · 靈石 ${d.gold||0}${_ptStr}`, {
          fontSize: fsS+'px', fontFamily:'monospace', color:'#9a8060', stroke:'#000', strokeThickness:1,
        }).setOrigin(0.5, 0);
        this.add.text(cx+cw/2, ry+6+fs+4+fsS+4, (d.party||[]).map(m=>m.name).join(' · '), {
          fontSize: fsS+'px', fontFamily:'"Noto Serif TC",serif', color:'#7a7060',
        }).setOrigin(0.5, 0);
      } else {
        this.add.text(cx+cw/2, ry+rowH/2, '── 空欄 ──', {
          fontSize: fsS+'px', fontFamily:'serif', color:'#3a3030',
        }).setOrigin(0.5, 0.5);
      }
    }

    if (this.saveMsg) {
      this.add.text(cx+cw/2, cy+ch+14, this.saveMsg, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color:'#80e090', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0);
    } else {
      this.add.text(cx+cw/2, cy+ch+14, '↑↓ 選擇　Z 存檔', {
        fontSize: fsS+'px', fontFamily:'serif', color:'#5a4a2a',
      }).setOrigin(0.5, 0);
    }
  }

  _drawAchieve() {
    const { _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const fs  = Math.max(13, Math.floor(cw * 0.022));
    const fsS = Math.max(10, fs - 3);
    const list = Achieve?.getAll() || [];
    const unlocked = list.filter(a => a.unlocked).length;
    if (!this._achPage) this._achPage = 0;

    const cols = 2, PAGE = 8;
    const totalPages = Math.ceil(list.length / PAGE);
    this._achPage = Math.min(this._achPage, totalPages - 1);
    const page = list.slice(this._achPage * PAGE, (this._achPage + 1) * PAGE);
    const rows = Math.ceil(page.length / cols);
    const colW = Math.floor(cw / cols);
    const rowH = Math.floor((ch - 52) / Math.min(PAGE / cols, rows));

    const pageLabel = totalPages > 1 ? `  ${this._achPage+1}/${totalPages}` : '';
    this.add.text(cx+cw/2, cy+6, `成　就　（${unlocked}/${list.length}）${pageLabel}`, {
      fontSize: Math.floor(fs*1.2)+'px', fontFamily:'"Noto Serif TC",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0);
    if (totalPages > 1) {
      this.add.text(cx+cw/2, cy+ch-8, '↑↓ 翻頁', {
        fontSize: (fsS-1)+'px', fontFamily:'"Noto Serif TC",serif', color:'#5a4a2a',
      }).setOrigin(0.5, 1);
    }

    page.forEach((a, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ax = cx + col * colW + 8, ay = cy + 48 + row * rowH;
      const done = a.unlocked;
      this.panelGfx.fillStyle(done ? 0x1a2a10 : 0x1a1010, 0.7);
      this.panelGfx.fillRoundedRect(ax-4, ay, colW-12, rowH-6, 5);
      if (done) {
        this.panelGfx.lineStyle(1, 0x507030, 0.7);
        this.panelGfx.strokeRoundedRect(ax-4, ay, colW-12, rowH-6, 5);
      }
      this.add.text(ax+4, ay+6, done ? `${a.icon} ${a.name}` : '？？？', {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
        color: done ? '#a0e060' : '#3a3030', stroke:'#000', strokeThickness: done?2:1,
      });
      this.add.text(ax+4, ay+6+fs+2, done ? a.desc : '尚未解鎖', {
        fontSize: fsS+'px', fontFamily:'"Noto Serif TC",serif',
        color: done ? '#708060' : '#2a2020', stroke:'#000', strokeThickness:1,
      });
    });
  }

  _drawQuests() {
    const { _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const fs  = Math.max(13, Math.floor(cw * 0.022));
    const fsS = Math.max(10, fs - 3);
    const list = (typeof QUESTS !== 'undefined') ? QUESTS : [];
    const doneCount = list.filter(q => q.done()).length;

    this.add.text(cx+cw/2, cy+6, `任務進度　（${doneCount} / ${list.length}）`, {
      fontSize: Math.floor(fs*1.2)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0);

    if (list.length === 0) {
      this.add.text(cx+cw/2, cy+ch/2, '── 無任務 ──', {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#444',
      }).setOrigin(0.5, 0.5);
      return;
    }

    const rowH = Math.max(52, Math.floor((ch - 48) / list.length));
    list.forEach((q, i) => {
      const ry = cy + 48 + i * rowH;
      const isDone = q.done();
      this.panelGfx.fillStyle(isDone ? 0x0a2010 : 0x100c1a, 0.7);
      this.panelGfx.fillRoundedRect(cx-4, ry, cw+8, rowH-6, 5);
      if (isDone) {
        this.panelGfx.lineStyle(1, 0x407030, 0.6);
        this.panelGfx.strokeRoundedRect(cx-4, ry, cw+8, rowH-6, 5);
      }
      this.add.text(cx+12, ry+8, `${isDone ? '✓' : '○'}  ${q.name}`, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: isDone ? '#80e060' : '#e8c060', fontStyle:'bold',
        stroke:'#000', strokeThickness:2,
      });
      this.add.text(cx+12, ry+10+fs, q.desc, {
        fontSize: fsS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: isDone ? '#607050' : '#9a8060', stroke:'#000', strokeThickness:1,
      });
      if (isDone) {
        this.add.text(cx+cw-6, ry+8, '已完成', {
          fontSize: fsS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#60c040', stroke:'#000', strokeThickness:1,
        }).setOrigin(1, 0);
      }
    });
  }

  _drawBestiary() {
    const { _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const fs  = Math.max(12, Math.floor(cw * 0.020));
    const fsS = Math.max(10, fs - 2);
    const entries = Object.entries(typeof ENEMIES !== 'undefined' ? ENEMIES : {});
    const seenCount = entries.filter(([id]) => !!(GS.flags?._enemySeen?.[id])).length;

    this.add.text(cx+cw/2, cy+6, `妖怪圖鑑　（${seenCount} / ${entries.length}）`, {
      fontSize: Math.floor(fs*1.2)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0);

    const cols = 2;
    const colW = Math.floor(cw / cols);
    const rowH = Math.max(46, Math.floor((ch - 44) / Math.ceil(entries.length / cols)));

    entries.forEach(([id, e], i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ax = cx + col * colW, ay = cy + 44 + row * rowH;
      const seen = !!(GS.flags?._enemySeen?.[id]);

      this.panelGfx.fillStyle(seen ? 0x1a1008 : 0x0e0c18, 0.75);
      this.panelGfx.fillRoundedRect(ax+2, ay, colW-10, rowH-6, 5);
      if (seen) {
        this.panelGfx.lineStyle(1, 0x7a5c1e, 0.5);
        this.panelGfx.strokeRoundedRect(ax+2, ay, colW-10, rowH-6, 5);
      }

      if (seen) {
        // Color swatch (drawn into panelGfx to avoid accumulation)
        this.panelGfx.fillStyle(e.color, 0.85);
        this.panelGfx.fillCircle(ax+14, ay+rowH/2-2, 8);
        this.add.text(ax+26, ay+4, e.name, {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#f0c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
        });
        this.add.text(ax+26, ay+6+fs, `HP:${e.hp} ATK:${e.atk} DEF:${e.def} SPD:${e.spd}`, {
          fontSize: (fsS-1)+'px', fontFamily:'monospace', color:'#9a8060', stroke:'#000', strokeThickness:1,
        });
        this.add.text(ax+colW-14, ay+4, `EXP:${e.exp}`, {
          fontSize: (fsS-1)+'px', fontFamily:'monospace', color:'#70a050', stroke:'#000', strokeThickness:1,
        }).setOrigin(1, 0);
        // Elemental tags
        const ELEM_ZH = { fire:'火', ice:'冰', thunder:'雷', wind:'風', light:'光' };
        const ELEM_C  = { fire:'#ff7040', ice:'#50ccff', thunder:'#ffee40', wind:'#60ee60', light:'#aaffcc' };
        const weakTags   = (e.weak   || []).map(el => ({ t:`弱:${ELEM_ZH[el]||el}`, c:ELEM_C[el]||'#fff' }));
        const resistTags = (e.resist || []).map(el => ({ t:`耐:${ELEM_ZH[el]||el}`, c:'#888' }));
        const allTags = [...weakTags, ...resistTags];
        if (allTags.length > 0) {
          const tagY = ay + 6 + fs + (fsS-1) + 2;
          let tagX = ax + 26;
          allTags.forEach(tag => {
            const tt = this.add.text(tagX, tagY, tag.t, {
              fontSize: Math.max(8, fsS-2)+'px', fontFamily:'monospace', color:tag.c,
              stroke:'#000', strokeThickness:1,
            });
            tagX += tt.width + 4;
          });
        }
        // Drop items
        const dropParts = (e.drops||[]).map(d => {
          const nm = (typeof ITEMS!=='undefined'&&ITEMS[d.id]?.name) || d.id;
          return `${d.r>=0.4?'●':'◆'}${nm}`;
        });
        if (dropParts.length > 0) {
          const dropY = ay + 6 + fs + (fsS-1)*2 + 4;
          this.add.text(ax+26, dropY, dropParts.join(' '), {
            fontSize: Math.max(7, fsS-3)+'px', fontFamily:'monospace', color:'#c0a040',
            stroke:'#000', strokeThickness:1,
          });
        }
        // Boss indicator
        if (e.boss) {
          this.panelGfx.fillStyle(0xff2020, 0.15); this.panelGfx.fillRoundedRect(ax+colW-56, ay+1, 48, 16, 4);
          this.add.text(ax+colW-32, ay+9, 'BOSS', {
            fontSize: Math.max(7,fsS-3)+'px', fontFamily:'monospace', color:'#ff8060', fontStyle:'bold',
            stroke:'#000', strokeThickness:1,
          }).setOrigin(0.5);
        }
      } else {
        this.add.text(ax+14, ay+rowH/2-fs/2, '？？？　未知妖怪', {
          fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
          color:'#3a3030', stroke:'#000', strokeThickness:1,
        });
      }
    });
  }

  update() {
    const padUp   = !!window.PAD?.up;    if (padUp    && window.PAD) window.PAD.up    = false;
    const padDown = !!window.PAD?.down;  if (padDown  && window.PAD) window.PAD.down  = false;
    const padLeft = !!window.PAD?.left;  if (padLeft  && window.PAD) window.PAD.left  = false;
    const padRight= !!window.PAD?.right; if (padRight && window.PAD) window.PAD.right = false;
    const padOk   = !!window.PAD?.ok;    if (padOk    && window.PAD) window.PAD.ok    = false;
    const padBack = !!window.PAD?.menu;  if (padBack  && window.PAD) window.PAD.menu  = false;

    const up    = Phaser.Input.Keyboard.JustDown(this.keys.up)    || padUp;
    const down  = Phaser.Input.Keyboard.JustDown(this.keys.down)  || padDown;
    const left  = Phaser.Input.Keyboard.JustDown(this.keys.left)  || padLeft;
    const right = Phaser.Input.Keyboard.JustDown(this.keys.right) || padRight;
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter) || padOk;
    const back  = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc)  || padBack;

    if (back) {
      if (this.tab===1 && this.equipSlot!==-1) { this.equipSlot=-1; this.drawPanel(); return; }
      this.scene.resume(this.caller); this.scene.stop(); return;
    }
    if (left  && this.tab>0 && (this.tab!==1||this.equipSlot===-1)) { this.tab--; this.cursor=0; this._achPage=0; this.drawPanel(); return; }
    if (right && this.tab<this.tabs.length-1 && (this.tab!==1||this.equipSlot===-1)) { this.tab++; this.cursor=0; this._achPage=0; this.drawPanel(); return; }

    switch(this.tab) {
      case 0:
        if (up)   { this.member=Math.max(0,this.member-1); this.drawPanel(); }
        if (down) { this.member=Math.min(GS.party.length-1,this.member+1); this.drawPanel(); }
        break;
      case 1:
        if (this.equipSlot===-1) {
          if (up)    { this.cursor=Math.max(0,this.cursor-1); this.drawPanel(); }
          if (down)  { this.cursor=Math.min(2,this.cursor+1); this.drawPanel(); }
          if (left)  { this.member=Math.max(0,this.member-1); this.drawPanel(); }
          if (right) { this.member=Math.min(GS.party.length-1,this.member+1); this.drawPanel(); }
          if (ok) {
            const slots=['wp','ar','ac'];
            this.equipSlot=this.cursor;
            this.equipList=this._equipCandidates(slots[this.equipSlot]);
            this.equipCursor=0;
            this.drawPanel();
          }
        } else {
          if (up)   { this.equipCursor=Math.max(0,this.equipCursor-1); this.drawPanel(); }
          if (down) { this.equipCursor=Math.min(this.equipList.length-1,this.equipCursor+1); this.drawPanel(); }
          if (ok) {
            const slots=['wp','ar','ac'];
            const m=GS.party[this.member];
            m.equip[slots[this.equipSlot]]=this.equipList[this.equipCursor]||null;
            this.equipSlot=-1;
            this.drawPanel();
          }
        }
        break;
      case 2: {
        const items=Object.entries(GS.inventory).filter(([,n])=>n>0);
        if (up)   { this.itemCursor=Math.max(0,this.itemCursor-1); this.drawPanel(); }
        if (down) { this.itemCursor=Math.min(Math.max(0,items.length-1),this.itemCursor+1); this.drawPanel(); }
        if (ok && items.length>0) {
          const [id]=items[this.itemCursor]; const it=ITEMS[id];
          if (it && (it.hp||it.mp||it.revive)) {
            const target = it.revive
              ? (GS.party.find(m=>m.dead) || GS.party[0])
              : GS.party.filter(m=>!m.dead).sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
            if (target) {
              if (it.revive && target.dead) { target.dead=false; target.hp=Math.floor(target.maxHp*0.3); }
              else if (!target.dead) {
                if (it.hp) target.hp=Math.min(target.maxHp,target.hp+it.hp);
                if (it.mp) { const st=calcStats(target); target.mp=Math.min(st.maxMp,target.mp+it.mp); }
              }
              GS.removeItem(id); Sound?.play('heal');
              this.drawPanel();
            }
          }
        }
        break;
      }
      case 3:
        if (up)   { this.saveCursor=Math.max(0,this.saveCursor-1); this.drawPanel(); }
        if (down) { this.saveCursor=Math.min(2,this.saveCursor+1); this.drawPanel(); }
        if (ok) {
          GS.save(this.saveCursor);
          this.saveMsg='存檔成功！';
          this.drawPanel();
          this.time.delayedCall(1500, () => { this.saveMsg=''; this.drawPanel(); });
        }
        break;
      case 4: {
        const list4 = Achieve?.getAll() || [];
        const totalPages4 = Math.ceil(list4.length / 8);
        if (up)   { if(!this._achPage)this._achPage=0; this._achPage=Math.max(0,this._achPage-1); Sound?.play('menuMove'); this.drawPanel(); }
        if (down) { if(!this._achPage)this._achPage=0; this._achPage=Math.min(totalPages4-1,this._achPage+1); Sound?.play('menuMove'); this.drawPanel(); }
        break;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
//  ShopScene — overlay
// ══════════════════════════════════════════════════════════
class ShopScene extends Phaser.Scene {
  constructor() { super('ShopScene'); }

  init(data) {
    this.stock  = data?.stock  || [];
    this.caller = data?.caller || 'WorldScene';
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this.cursor = 0;
    this.mode   = 'buy';
    this.msg    = '';

    this.add.graphics().fillStyle(0x000000, 0.65).fillRect(0, 0, W, H);
    this.panelGfx = this.add.graphics();
    this.allTexts = [];
    this._draw();

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
  }

  _draw() {
    this.panelGfx.clear();
    this.allTexts.forEach(t => t.destroy());
    this.allTexts = [];

    const W = this.scale.width, H = this.scale.height;
    const px = Math.floor(W*0.05), py = Math.floor(H*0.06);
    const pw = Math.floor(W*0.90), ph = Math.floor(H*0.88);
    const fs  = Math.max(12, Math.floor(pw * 0.022));
    const fsS = Math.max(10, fs - 2);
    const fsXS= Math.max(9,  fs - 4);

    // Panel
    this.panelGfx.fillStyle(0x0c0818, 0.98);
    this.panelGfx.fillRoundedRect(px, py, pw, ph, 10);
    this.panelGfx.lineStyle(2, 0x9a7a28, 1);
    this.panelGfx.strokeRoundedRect(px, py, pw, ph, 10);
    this.panelGfx.lineStyle(1, 0x4a3a10, 0.7);
    this.panelGfx.strokeRoundedRect(px+3, py+3, pw-6, ph-6, 8);

    // Header: mode tabs + gold
    const tabW = Math.floor(pw * 0.22);
    ['購買', '賣出'].forEach((label, i) => {
      const sel = (this.mode === 'buy') === (i === 0);
      const tx = px + 8 + i*(tabW+6);
      if (sel) {
        this.panelGfx.fillStyle(0x9a7828, 0.28);
        this.panelGfx.fillRoundedRect(tx, py+6, tabW, 38, 6);
        this.panelGfx.lineStyle(1, 0xc8a040, 0.8);
        this.panelGfx.strokeRoundedRect(tx, py+6, tabW, 38, 6);
      }
      this.allTexts.push(this.add.text(tx+tabW/2, py+26, label, {
        fontSize: Math.floor(fs*1.1)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: sel?'#ffd700':'#7a6030', fontStyle:sel?'bold':'normal', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5));
    });
    // Shop title
    this.allTexts.push(this.add.text(px+pw/2, py+26, '✦ 行商 ✦', {
      fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#c8a060', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0.5));
    // Gold
    this.allTexts.push(this.add.text(px+pw-14, py+26, `靈石 ◆ ${GS.gold}`, {
      fontSize: fs+'px', fontFamily:'monospace', color:'#ffe060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(1, 0.5));
    this.panelGfx.lineStyle(1, 0x7a5c1e, 0.6);
    this.panelGfx.lineBetween(px+12, py+50, px+pw-12, py+50);

    // ── Two-column layout: list (left 52%) + detail (right 46%) ──
    const listW = Math.floor(pw * 0.52);
    const detX  = px + listW + 14;
    const detW  = pw - listW - 22;
    const listY = py + 56;
    const listH = ph - 70;

    // Vertical divider
    this.panelGfx.lineStyle(1, 0x4a3a10, 0.6);
    this.panelGfx.lineBetween(px+listW+6, listY, px+listW+6, py+ph-14);

    const items = this.mode === 'buy'
      ? this.stock.map(id => ({ id, n: GS.inventory[id]||0, sell: false }))
      : Object.entries(GS.inventory).filter(([,n])=>n>0&&ITEMS[id_=>id_]?.price).map(([id,n])=>({id,n,sell:true}));
    // fix: proper sell list
    const sellable = Object.entries(GS.inventory).filter(([id,n]) => n>0 && ITEMS[id]?.price);
    const listItems = this.mode === 'buy'
      ? this.stock.map(id => ({ id, n: GS.inventory[id]||0 }))
      : sellable.map(([id, n]) => ({ id, n }));

    const rowH = Math.max(40, Math.floor(listH / Math.max(1, listItems.length)));
    const clampCursor = Math.min(this.cursor, Math.max(0, listItems.length-1));
    if (this.cursor !== clampCursor) this.cursor = clampCursor;

    listItems.forEach(({ id, n }, i) => {
      const it = ITEMS[id]; if (!it) return;
      const ry  = listY + i * rowH;
      const sel = i === this.cursor;
      const canAfford = this.mode==='buy' ? GS.gold >= it.price : true;
      const sellPrice = Math.floor((it.price||0) * 0.5);

      // Row bg
      if (sel) {
        this.panelGfx.fillStyle(0xe8c060, 0.12);
        this.panelGfx.fillRoundedRect(px+6, ry-4, listW-4, rowH-3, 5);
        this.panelGfx.lineStyle(1, 0xc8a040, 0.6);
        this.panelGfx.strokeRoundedRect(px+6, ry-4, listW-4, rowH-3, 5);
      }

      // Category color dot
      const catClr = it.cat==='eq' ? 0x60b0ff : 0x80e060;
      this.panelGfx.fillStyle(catClr, 0.7);
      this.panelGfx.fillCircle(px+20, ry+rowH/2-4, 4);

      // Name
      const nameClr = !canAfford ? '#664444' : sel ? '#ffd700' : '#c8a060';
      this.allTexts.push(this.add.text(px+30, ry+rowH/2-8, (sel?'▶ ':'')+it.name, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
        color: nameClr, stroke:'#000', strokeThickness:2,
      }));

      // Price / sell price (right side of list)
      const priceStr = this.mode==='buy' ? `${it.price}◆` : `售${sellPrice}◆`;
      const priceClr = this.mode==='buy' ? (canAfford?'#e8c060':'#884444') : '#80e0d0';
      this.allTexts.push(this.add.text(px+listW-4, ry+rowH/2-8, priceStr, {
        fontSize: fsS+'px', fontFamily:'monospace', color:priceClr, stroke:'#000', strokeThickness:1,
      }).setOrigin(1, 0));

      // Bag count tag
      if (n > 0) {
        this.allTexts.push(this.add.text(px+30, ry+rowH/2+4, `持有 ×${n}`, {
          fontSize: fsXS+'px', fontFamily:'monospace', color:'#607050', stroke:'#000', strokeThickness:1,
        }));
      }
      // Already equipped tag
      const equippedBy = GS.party.filter(m=>Object.values(m.equip).includes(id)).map(m=>m.name);
      if (equippedBy.length) {
        this.allTexts.push(this.add.text(px+listW*0.55, ry+rowH/2+4, `裝備中:${equippedBy.join('/')}`, {
          fontSize: fsXS+'px', fontFamily:'"Noto Serif TC",serif', color:'#4a8888', stroke:'#000', strokeThickness:1,
        }));
      }
    });

    // ── Right: Detail panel ──────────────────────────────
    const selItem = listItems[this.cursor];
    const selIt = selItem ? ITEMS[selItem.id] : null;
    if (selIt) {
      const diy = listY;
      // Item name + category
      const catLabel = selIt.cat==='eq' ? '裝備' : '消耗';
      const catClrS  = selIt.cat==='eq' ? '#60b0ff' : '#80e060';
      this.panelGfx.fillStyle(selIt.cat==='eq' ? 0x0a1828 : 0x081408, 0.85);
      this.panelGfx.fillRoundedRect(detX, diy, detW, Math.floor(listH*0.28), 6);
      this.panelGfx.lineStyle(1, selIt.cat==='eq' ? 0x2060a0 : 0x206020, 0.5);
      this.panelGfx.strokeRoundedRect(detX, diy, detW, Math.floor(listH*0.28), 6);
      this.allTexts.push(this.add.text(detX+10, diy+8, selIt.name, {
        fontSize: Math.floor(fs*1.15)+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#e8d080', fontStyle:'bold', stroke:'#000', strokeThickness:2,
      }));
      this.allTexts.push(this.add.text(detX+detW-10, diy+8, catLabel, {
        fontSize: fsS+'px', fontFamily:'monospace', color:catClrS, stroke:'#000', strokeThickness:1,
      }).setOrigin(1, 0));
      // Description
      this.allTexts.push(this.add.text(detX+10, diy+10+fs, selIt.desc||'', {
        fontSize: fsS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#9a8860', stroke:'#000', strokeThickness:1,
        wordWrap:{ width: detW-20 },
      }));

      // Stats for this item
      const statY = diy + Math.floor(listH*0.30);
      this.panelGfx.lineStyle(1, 0x4a3a10, 0.5);
      this.panelGfx.lineBetween(detX+6, statY, detX+detW-6, statY);
      const STAT_PAIRS = [['atk','ATK','#ff9060'],['def','DEF','#60c0ff'],['mp','MP','#5080e0'],['luk','LUK','#ffd080']];
      let sIdx = 0;
      STAT_PAIRS.forEach(([k,lbl,clr]) => {
        if (!selIt[k]) return;
        const sx = detX+10 + Math.floor(sIdx/2) * Math.floor(detW/2);
        const sy = statY+8 + (sIdx%2) * (fsS+5);
        this.allTexts.push(this.add.text(sx, sy, `${lbl} +${selIt[k]}`, {
          fontSize: fsS+'px', fontFamily:'monospace', color:clr, fontStyle:'bold', stroke:'#000', strokeThickness:1,
        }));
        sIdx++;
      });
      if (selIt.hp)  { this.allTexts.push(this.add.text(detX+10, statY+8, `HP 回 +${selIt.hp}`, { fontSize:fsS+'px', fontFamily:'monospace', color:'#e06060', stroke:'#000', strokeThickness:1 })); }
      if (selIt.revive) { this.allTexts.push(this.add.text(detX+10, statY+8, `復活 ${selIt.revive}% HP`, { fontSize:fsS+'px', fontFamily:'monospace', color:'#ffaa40', stroke:'#000', strokeThickness:1 })); }

      // Who can equip
      if (selIt.cat === 'eq') {
        const whoY = statY + Math.floor(listH * 0.18);
        this.panelGfx.lineStyle(1, 0x4a3a10, 0.4);
        this.panelGfx.lineBetween(detX+6, whoY, detX+detW-6, whoY);
        this.allTexts.push(this.add.text(detX+10, whoY+4, '可裝備', {
          fontSize: fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#7a6a4a',
        }));
        const CHAR_NAMES = { yunyi:'天命人', linger:'土地', yuehua:'楊嬋' };
        const whoList = selIt.who ? [selIt.who] : ['yunyi','linger','yuehua'];
        let wx = detX+10+32;
        whoList.forEach(cid => {
          const CHAR_CLR_S = { yunyi:'#f0a010', linger:'#70c050', yuehua:'#60c8ff' };
          const ct = this.add.text(wx, whoY+4, CHAR_NAMES[cid]||cid, {
            fontSize: fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
            color: CHAR_CLR_S[cid]||'#c8a060', stroke:'#000', strokeThickness:1,
          });
          this.allTexts.push(ct);
          wx += ct.width + 8;
        });
        // Stat comparison for equippable items
        const slotMap = { wp:'武器', ar:'防具', ac:'飾品' };
        if (slotMap[selIt.slot]) {
          const compY = whoY + fsXS + 12;
          this.allTexts.push(this.add.text(detX+10, compY, `(${slotMap[selIt.slot]}) vs 當前裝備`, {
            fontSize: fsXS+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#5a4a2a',
          }));
          // Find best current eq from equippable chars
          const chars = whoList.map(id => GS.party.find(m=>m.id===id)).filter(Boolean);
          chars.forEach((ch, ci) => {
            const curId = ch.equip[selIt.slot];
            const curIt2 = curId ? ITEMS[curId] : null;
            const statKeys = ['atk','def','mp'];
            const diffs = statKeys.map(k=>{const d=(selIt[k]||0)-(curIt2?.[k]||0); return d!==0?{k,d}:null;}).filter(Boolean);
            if (diffs.length) {
              const CHAR_CLR_S = { yunyi:'#f0a010', linger:'#70c050', yuehua:'#60c8ff' };
              let tx2 = detX+10, ty2 = compY+fsXS+4+ci*(fsXS+2);
              this.allTexts.push(this.add.text(tx2, ty2, `${ch.name}：`, { fontSize:fsXS+'px', fontFamily:'monospace', color:CHAR_CLR_S[ch.id]||'#888', stroke:'#000', strokeThickness:1 }));
              tx2 += 36;
              diffs.forEach(({k,d}) => {
                const dc = d>0?'#80ff80':'#ff8080', ds = d>0?`+${d}`:String(d);
                const dt2 = this.add.text(tx2, ty2, `${k.toUpperCase()}${ds}`, { fontSize:fsXS+'px', fontFamily:'monospace', color:dc, stroke:'#000', strokeThickness:1 });
                this.allTexts.push(dt2); tx2 += dt2.width + 6;
              });
            }
          });
        }
      }
    } else if (listItems.length === 0) {
      this.allTexts.push(this.add.text(px+listW/2+px, listY+listH/2, this.mode==='buy'?'── 無商品 ──':'── 無可出售道具 ──', {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif', color:'#444',
      }).setOrigin(0.5, 0.5));
    }

    // Message bar
    if (this.msg) {
      const isErr = this.msg.includes('不足') || this.msg.includes('失敗');
      this.allTexts.push(this.add.text(px+pw/2, py+ph-36, this.msg, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
        color: isErr?'#ff8080':'#80e090', fontStyle:'bold', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5));
    }
    const footerHint = this.mode==='buy' ? '↑↓ 選擇　Z 購買　←→ 賣出' : '↑↓ 選擇　Z 賣出　←→ 購買';
    this.allTexts.push(this.add.text(px+pw/2, py+ph-16, footerHint+'　X 離開', {
      fontSize: fsXS+'px', fontFamily:'serif', color:'#5a4a2a',
    }).setOrigin(0.5, 0.5));
  }

  update() {
    const padUp   = !!window.PAD?.up;   if (padUp   && window.PAD) window.PAD.up   = false;
    const padDown = !!window.PAD?.down; if (padDown && window.PAD) window.PAD.down = false;
    const padOk   = !!window.PAD?.ok;   if (padOk   && window.PAD) window.PAD.ok   = false;
    const padBack = !!window.PAD?.menu; if (padBack && window.PAD) window.PAD.menu = false;

    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up)   || padUp;
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down) || padDown;
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter) || padOk;
    const back = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc)  || padBack;

    const left  = Phaser.Input.Keyboard.JustDown(this.keys.left);
    const right = Phaser.Input.Keyboard.JustDown(this.keys.right);

    if (back) { this.scene.resume(this.caller); this.scene.stop(); return; }
    if (left || right) { this.mode = this.mode==='buy'?'sell':'buy'; this.cursor=0; this._draw(); return; }

    if (this.mode === 'buy') {
      if (up)   { this.cursor=Math.max(0,this.cursor-1); this._draw(); }
      if (down) { this.cursor=Math.min(this.stock.length-1,this.cursor+1); this._draw(); }
      if (ok) {
        const id = this.stock[this.cursor];
        const it = ITEMS[id]; if (!it) return;
        if (GS.gold < it.price) { this.msg='靈石不足！'; }
        else {
          GS.gold -= it.price; GS.addItem(id); this.msg=`購得 ${it.name}！`;
          GS.flags._shopBuys = (GS.flags._shopBuys||0) + 1;
          GS.flags._totalSpend = (GS.flags._totalSpend||0) + it.price;
          if (GS.flags._shopBuys >= 5) Achieve?.unlock('shop_addict');
          if (GS.flags._totalSpend >= 1000) Achieve?.unlock('big_spender');
          Sound?.play('shopBuy');
        }
        this._draw();
        this.time.delayedCall(1200, () => { this.msg=''; this._draw(); });
      }
    } else {
      const sellable = Object.entries(GS.inventory).filter(([id,n]) => n>0 && ITEMS[id]?.price);
      if (up)   { this.cursor=Math.max(0,this.cursor-1); this._draw(); }
      if (down) { this.cursor=Math.min(Math.max(0,sellable.length-1),this.cursor+1); this._draw(); }
      if (ok && sellable.length > 0) {
        const [id] = sellable[this.cursor];
        const it = ITEMS[id]; if (!it) return;
        const sellPrice = Math.floor(it.price * 0.5);
        GS.gold += sellPrice; GS.removeItem(id);
        this.msg = `售出 ${it.name}，獲得 ${sellPrice} 靈石！`;
        Sound?.play('shopBuy');
        if (this.cursor >= sellable.length - 1) this.cursor = Math.max(0, sellable.length - 2);
        this._draw();
        this.time.delayedCall(1200, () => { this.msg=''; this._draw(); });
      }
    }
  }
}
