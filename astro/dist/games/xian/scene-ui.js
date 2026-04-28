'use strict';
// ══════════════════════════════════════════════════════════
//  MenuScene — overlay over WorldScene
// ══════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  init(data) { this.caller = data?.caller || 'WorldScene'; }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this.tab = 0; this.tabs = ['狀態','裝備','道具','存檔'];
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
      case 0: this._drawStatus(); break;
      case 1: this._drawEquip();  break;
      case 2: this._drawItem();   break;
      case 3: this._drawSave();   break;
    }
  }

  _drawStatus() {
    const { _px:px, _py:py, _pw:pw, _ph:ph, _cx:cx, _cy:cy, _cw:cw, _ch:ch } = this;
    const rowH = Math.floor(ch / GS.party.length);
    const fs   = Math.max(13, Math.floor(rowH * 0.18));
    const fsS  = Math.max(10, fs - 3);

    GS.party.forEach((m, i) => {
      const sel = i === this.member;
      const ry  = cy + i * rowH;

      if (sel) {
        this.panelGfx.fillStyle(0xe8c060, 0.08);
        this.panelGfx.fillRoundedRect(cx-4, ry-4, cw+8, rowH-2, 6);
        this.panelGfx.lineStyle(1, 0x9a7a28, 0.4);
        this.panelGfx.strokeRoundedRect(cx-4, ry-4, cw+8, rowH-2, 6);
      } else if (i > 0) {
        this.panelGfx.lineStyle(1, 0x3a2a08, 0.4);
        this.panelGfx.lineBetween(cx, ry-2, cx+cw, ry-2);
      }

      // Name + title
      this.add.text(cx+8, ry+8, `${m.name}　${m.title}`, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: sel ? '#ffd700' : '#e8c060', stroke:'#000', strokeThickness:2, fontStyle:'bold',
      });

      // Level / EXP
      const st = calcStats(m);
      this.add.text(cx+8, ry+8+fs+4, `Lv.${m.lv}　EXP ${m.exp}/${expForLevel(m.lv)}`, {
        fontSize: fsS+'px', fontFamily:'monospace', color:'#c8b080', stroke:'#000', strokeThickness:1,
      });

      // Stats
      this.add.text(cx+8, ry+8+fs*2+8, `ATK:${st.atk}　DEF:${st.def}　SPD:${st.spd}　LUK:${st.luk}`, {
        fontSize: fsS+'px', fontFamily:'monospace', color:'#9a8060', stroke:'#000', strokeThickness:1,
      });

      // Bars
      const barW = Math.floor(cw * 0.28);
      const barY = ry + rowH - Math.floor(rowH * 0.30);
      const barH2 = Math.max(6, Math.floor(rowH * 0.10));
      mkBar(this, cx+8, barY, barW, barH2, m.hp, m.maxHp, 0xe04040);
      this.add.text(cx+8+barW+6, barY+barH2/2, `HP ${m.hp}/${m.maxHp}`, {
        fontSize: Math.max(9,fsS-1)+'px', fontFamily:'monospace', color:'#e05050', stroke:'#000', strokeThickness:1,
      }).setOrigin(0, 0.5);

      mkBar(this, cx+8+barW*1.12+30, barY, barW, barH2, m.mp, st.maxMp, 0x4060e0);
      this.add.text(cx+8+barW*1.12+30+barW+6, barY+barH2/2, `MP ${m.mp}/${st.maxMp}`, {
        fontSize: Math.max(9,fsS-1)+'px', fontFamily:'monospace', color:'#5070e0', stroke:'#000', strokeThickness:1,
      }).setOrigin(0, 0.5);

      // Equipped items (right side)
      const eqStr = Object.entries(m.equip).filter(([,v])=>v).map(([,v])=>ITEMS[v]?.name||v).join('　');
      if (eqStr) {
        this.add.text(cx+cw-8, ry+8+fs+4, eqStr, {
          fontSize: Math.max(10,fsS-1)+'px', fontFamily:'"Noto Serif TC",serif', color:'#7a9090', stroke:'#000', strokeThickness:1,
        }).setOrigin(1, 0);
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
        this.equipList.forEach((id, i) => {
          const ry  = cy + 68 + i * rowH;
          const sel = i === this.equipCursor;
          if (sel) {
            this.panelGfx.fillStyle(0xe8c060, 0.1);
            this.panelGfx.fillRoundedRect(cx-4, ry-8, cw+8, rowH-4, 5);
          }
          const it = id ? ITEMS[id] : null;
          const nm = it ? it.name : '── 卸除 ──';
          this.add.text(cx+14, ry+4, (sel?'▶ ':'') + nm, {
            fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
            color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
          });
          if (it) {
            const bonus = [it.atk&&`ATK+${it.atk}`,it.def&&`DEF+${it.def}`,it.mp&&`MP+${it.mp}`].filter(Boolean).join(' ');
            this.add.text(cx+cw*0.6, ry+4, bonus, { fontSize: fsS+'px', fontFamily:'monospace', color:'#7a9090' });
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
    this.add.text(cx+cw/2, cy+ch+14, `靈石：${GS.gold}　↑↓ 移動`, {
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
        this.add.text(cx+cw/2, ry+6+fs+4, `Lv.${d.party?.[0]?.lv||'?'} · ${MAPS[d.map]?.name||d.map} · 靈石 ${d.gold||0}`, {
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

  update() {
    const up    = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down  = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const left  = Phaser.Input.Keyboard.JustDown(this.keys.left);
    const right = Phaser.Input.Keyboard.JustDown(this.keys.right);
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const back  = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (back) {
      if (this.tab===1 && this.equipSlot!==-1) { this.equipSlot=-1; this.drawPanel(); return; }
      this.scene.resume(this.caller); this.scene.stop(); return;
    }
    if (left  && this.tab>0 && (this.tab!==1||this.equipSlot===-1)) { this.tab--; this.cursor=0; this.drawPanel(); return; }
    if (right && this.tab<3 && (this.tab!==1||this.equipSlot===-1)) { this.tab++; this.cursor=0; this.drawPanel(); return; }

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
        if (down) { this.itemCursor=Math.min(items.length-1,this.itemCursor+1); this.drawPanel(); }
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
    this.msg    = '';

    this.add.graphics().fillStyle(0x000000, 0.65).fillRect(0, 0, W, H);
    this.panelGfx = this.add.graphics();
    this.allTexts = [];
    this._draw();

    this.keys = this.input.keyboard.addKeys({
      up:   Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
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
    const px = Math.floor(W*0.10), py = Math.floor(H*0.08);
    const pw = Math.floor(W*0.80), ph = Math.floor(H*0.84);
    const fs  = Math.max(13, Math.floor(pw * 0.025));
    const fsS = Math.max(10, fs - 3);

    // Panel
    this.panelGfx.fillStyle(0x0c0818, 0.98);
    this.panelGfx.fillRoundedRect(px, py, pw, ph, 10);
    this.panelGfx.lineStyle(2, 0x9a7a28, 1);
    this.panelGfx.strokeRoundedRect(px, py, pw, ph, 10);
    this.panelGfx.lineStyle(1, 0x4a3a10, 0.7);
    this.panelGfx.strokeRoundedRect(px+3, py+3, pw-6, ph-6, 8);

    // Header
    const titleT = this.add.text(px+pw/2, py+28, '商　店', {
      fontSize: Math.floor(fs*1.3)+'px', fontFamily:'"Noto Serif TC",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0.5);
    const goldT = this.add.text(px+pw-16, py+28, `靈石：${GS.gold}`, {
      fontSize: fs+'px', fontFamily:'monospace', color:'#e8c060', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5);
    this.allTexts.push(titleT, goldT);

    this.panelGfx.lineStyle(1, 0x7a5c1e, 0.5);
    this.panelGfx.lineBetween(px+12, py+50, px+pw-12, py+50);

    const rowH = Math.max(48, Math.floor((ph - 80) / Math.max(1, this.stock.length)));
    this.stock.forEach((id, i) => {
      const it = ITEMS[id]; if (!it) return;
      const ry  = py + 58 + i * rowH;
      const sel = i === this.cursor;
      if (sel) {
        this.panelGfx.fillStyle(0xe8c060, 0.1);
        this.panelGfx.fillRoundedRect(px+8, ry-10, pw-16, rowH-4, 5);
        this.panelGfx.lineStyle(1, 0x9a7a28, 0.5);
        this.panelGfx.strokeRoundedRect(px+8, ry-10, pw-16, rowH-4, 5);
      }
      const nmT = this.add.text(px+24, ry+4, (sel?'▶ ':'')+it.name, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif',
        color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2,
      });
      const prT = this.add.text(px+pw*0.65, ry+4, `${it.price} 靈石`, {
        fontSize: fs+'px', fontFamily:'monospace', color:'#e8c060', stroke:'#000', strokeThickness:1,
      });
      const dcT = this.add.text(px+24, ry+4+fs+2, it.desc||'', {
        fontSize: fsS+'px', fontFamily:'serif', color:'#7a7060', stroke:'#000', strokeThickness:1,
      });
      this.allTexts.push(nmT, prT, dcT);
    });

    if (this.msg) {
      const mt = this.add.text(px+pw/2, py+ph-38, this.msg, {
        fontSize: fs+'px', fontFamily:'"Noto Serif TC",serif', color:'#80e090', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5);
      this.allTexts.push(mt);
    }
    const ht = this.add.text(px+pw/2, py+ph-16, '↑↓ 選擇　Z 購買　X / Esc 離開', {
      fontSize: fsS+'px', fontFamily:'serif', color:'#5a4a2a',
    }).setOrigin(0.5, 0.5);
    this.allTexts.push(ht);
  }

  update() {
    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const back = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (back)  { this.scene.resume(this.caller); this.scene.stop(); return; }
    if (up)    { this.cursor=Math.max(0,this.cursor-1); this._draw(); }
    if (down)  { this.cursor=Math.min(this.stock.length-1,this.cursor+1); this._draw(); }
    if (ok) {
      const id = this.stock[this.cursor];
      const it = ITEMS[id];
      if (!it) return;
      if (GS.gold < it.price) { this.msg='靈石不足！'; }
      else { GS.gold -= it.price; GS.addItem(id); this.msg=`購得 ${it.name}！`; }
      this._draw();
      this.time.delayedCall(1200, () => { this.msg=''; this._draw(); });
    }
  }
}
