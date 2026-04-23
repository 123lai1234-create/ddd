'use strict';
// ══════════════════════════════════════════════════════════
//  MenuScene — overlay over WorldScene
// ══════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  init(data) { this.caller = data?.caller || 'WorldScene'; }

  create() {
    const W=800, H=600;
    this.tab = 0; this.tabs = ['狀態','裝備','道具','存檔'];
    this.cursor = 0; this.member = 0;
    this.equipSlot = -1; this.equipList = []; this.equipCursor = 0;
    this.itemList = []; this.itemCursor = 0;
    this.saveCursor = 0; this.saveMsg = '';

    // Dim overlay
    this.add.graphics().fillStyle(0x000000, 0.6).fillRect(0,0,W,H);

    // Panel
    this.panelGfx = this.add.graphics();
    this.drawPanel();

    // Keys
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

    const W=800, H=600;
    this.panelGfx.fillStyle(0x100c1e, 0.97);
    this.panelGfx.fillRoundedRect(40, 30, 720, 540, 10);
    this.panelGfx.lineStyle(2, 0x7a5c1e, 1);
    this.panelGfx.strokeRoundedRect(40, 30, 720, 540, 10);

    // Tabs
    this.tabs.forEach((t, i) => {
      const x = 80 + i * 155;
      const sel = i === this.tab;
      if (sel) {
        this.panelGfx.fillStyle(0x7a5c1e, 0.4);
        this.panelGfx.fillRect(x-10, 40, 140, 36);
      }
      this.add.text(x+60, 58, t, {
        fontSize:'16px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: sel ? '#ffd700' : '#c8a060', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5);
    });

    this.panelGfx.lineStyle(1, 0x7a5c1e, 0.6);
    this.panelGfx.lineBetween(60, 78, 740, 78);

    switch(this.tab) {
      case 0: this._drawStatus(); break;
      case 1: this._drawEquip(); break;
      case 2: this._drawItem(); break;
      case 3: this._drawSave(); break;
    }

    this.add.text(400, 556, 'X / Esc：關閉　←→ 切換分頁', {
      fontSize:'11px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0.5);
  }

  _drawStatus() {
    GS.party.forEach((m, i) => {
      const sel = i === this.member;
      const x = 80, y = 100 + i * 130;
      if (sel) {
        this.panelGfx.fillStyle(0xe8c060, 0.08);
        this.panelGfx.fillRect(60, y-10, 680, 120);
      }
      this.add.text(x, y+10, `${m.name}　${m.title}`, {
        fontSize:'16px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color: sel ? '#ffd700' : '#e8c060', stroke:'#000', strokeThickness:2, fontStyle:'bold',
      });
      this.add.text(x, y+34, `Lv.${m.lv}　EXP ${m.exp}/${expForLevel(m.lv)}　HP ${m.hp}/${m.maxHp}　MP ${m.mp}/${m.maxMp}`, {
        fontSize:'12px', fontFamily:'monospace', color:'#c8b080', stroke:'#000', strokeThickness:1,
      });
      const st = calcStats(m);
      this.add.text(x, y+56, `ATK:${st.atk}　DEF:${st.def}　SPD:${st.spd}　LUK:${st.luk}`, {
        fontSize:'12px', fontFamily:'monospace', color:'#9a8060', stroke:'#000', strokeThickness:1,
      });
      // HP bar
      mkBar(this, x, y+76, 200, 8, m.hp, m.maxHp, 0xe05050);
      mkBar(this, x+220, y+76, 200, 8, m.mp, st.maxMp, 0x5080e8);
      // Equip icons
      const eqStr = Object.entries(m.equip).filter(([,v])=>v).map(([k,v])=>ITEMS[v]?.name||v).join('　');
      if (eqStr) this.add.text(x+460, y+34, eqStr, { fontSize:'11px', fontFamily:'"Noto Serif TC",serif', color:'#7a9090', stroke:'#000', strokeThickness:1 });
    });
    this.add.text(400, 510, '↑↓ 選擇成員', { fontSize:'12px', fontFamily:'serif', color:'#5a4a2a' }).setOrigin(0.5,0.5);
  }

  _drawEquip() {
    const m = GS.party[this.member];
    if (!m) return;
    const slots = ['wp','ar','ac'];
    const slotNames = ['武器','防具','飾品'];

    this.add.text(80, 90, `${m.name} 的裝備`, { fontSize:'16px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2 });
    this.add.text(680, 90, `←→ 切換成員`, { fontSize:'11px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1 }).setOrigin(1,0);

    if (this.equipSlot === -1) {
      slots.forEach((slot, i) => {
        const y = 140 + i * 80;
        const sel = i === this.cursor;
        if (sel) {
          this.panelGfx.fillStyle(0xe8c060, 0.1);
          this.panelGfx.fillRect(70, y-18, 660, 64);
        }
        this.add.text(90, y, (sel?'▶ ':'')+slotNames[i], { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2 });
        const eq = m.equip[slot];
        this.add.text(260, y, eq ? ITEMS[eq]?.name||eq : '── 空 ──', { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color: eq?'#80e0d0':'#444', stroke:'#000', strokeThickness:1 });
        if (eq && ITEMS[eq]) {
          const it = ITEMS[eq];
          const bonus = [it.atk&&`ATK+${it.atk}`,it.def&&`DEF+${it.def}`,it.mp&&`MP+${it.mp}`,it.luk&&`LUK+${it.luk}`].filter(Boolean).join(' ');
          this.add.text(500, y, bonus, { fontSize:'12px', fontFamily:'monospace', color:'#7a9090', stroke:'#000', strokeThickness:1 });
        }
      });
      this.add.text(400, 440, 'Z：選擇裝備欄　↑↓：移動', { fontSize:'12px', fontFamily:'serif', color:'#5a4a2a' }).setOrigin(0.5,0.5);
    } else {
      this.add.text(90, 130, `選擇 ${slotNames[this.equipSlot]} 裝備：`, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', stroke:'#000', strokeThickness:2 });
      if (this.equipList.length === 0) {
        this.add.text(200, 200, '── 無可用裝備 ──', { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:'#444' });
      } else {
        this.equipList.forEach((id, i) => {
          const y = 170 + i * 46;
          const sel = i === this.equipCursor;
          if (sel) { this.panelGfx.fillStyle(0xe8c060, 0.1); this.panelGfx.fillRect(80, y-14, 640, 42); }
          const it = id ? ITEMS[id] : null;
          const nm = it ? it.name : '── 卸除 ──';
          this.add.text(100, y, (sel?'▶ ':'') + nm, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color: sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2 });
          if (it) {
            const bonus = [it.atk&&`ATK+${it.atk}`,it.def&&`DEF+${it.def}`,it.mp&&`MP+${it.mp}`].filter(Boolean).join(' ');
            this.add.text(420, y, bonus, { fontSize:'12px', fontFamily:'monospace', color:'#7a9090' });
          }
        });
      }
      this.add.text(400, 490, 'Z：確認　X：返回', { fontSize:'12px', fontFamily:'serif', color:'#5a4a2a' }).setOrigin(0.5,0.5);
    }
  }

  _equipCandidates(slot) {
    const m = GS.party[this.member];
    return [null, ...Object.keys(GS.inventory).filter(id => {
      const it = ITEMS[id];
      if (!it || it.cat!=='eq') return false;
      if (it.slot !== slot) return false;
      if (it.who && it.who !== m.id) return false;
      return true;
    })];
  }

  _drawItem() {
    this.add.text(80, 90, '道具', { fontSize:'16px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2 });
    const items = Object.entries(GS.inventory).filter(([,n])=>n>0);
    if (items.length === 0) {
      this.add.text(400, 300, '── 空空如也 ──', { fontSize:'16px', fontFamily:'"Noto Serif TC",serif', color:'#444' }).setOrigin(0.5,0.5);
      return;
    }
    items.forEach(([id, n], i) => {
      const y = 130 + i * 44;
      const sel = i === this.itemCursor;
      if (sel) { this.panelGfx.fillStyle(0xe8c060, 0.1); this.panelGfx.fillRect(70, y-14, 660, 40); }
      const it = ITEMS[id];
      this.add.text(90, y, (sel?'▶ ':'')+`${it?.name||id}  ×${n}`, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2 });
      if (it?.desc) this.add.text(400, y, it.desc, { fontSize:'11px', fontFamily:'serif', color:'#9a8060', stroke:'#000', strokeThickness:1 });
    });
    this.add.text(400, 510, `靈石：${GS.gold}　↑↓：移動`, { fontSize:'12px', fontFamily:'serif', color:'#5a4a2a' }).setOrigin(0.5,0.5);
  }

  _drawSave() {
    this.add.text(400, 90, '存　檔', { fontSize:'20px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2 }).setOrigin(0.5,0.5);
    for (let i = 0; i < 3; i++) {
      const d = Save.read(i);
      const y = 160 + i * 110;
      const sel = i === this.saveCursor;
      if (sel) { this.panelGfx.fillStyle(0xe8c060, 0.1); this.panelGfx.fillRect(70, y-14, 660, 100); }
      this.add.text(100, y+4, (sel?'▶ ':'')+`欄位 ${i+1}`, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:sel?'#ffe080':'#c8b080', fontStyle:sel?'bold':'normal', stroke:'#000', strokeThickness:2 });
      if (d) {
        this.add.text(400, y+30, `Lv.${d.party?.[0]?.lv||'?'} · ${MAPS[d.map]?.name||d.map} · 靈石 ${d.gold||0}`, { fontSize:'12px', fontFamily:'monospace', color:'#9a8060', stroke:'#000', strokeThickness:1 }).setOrigin(0.5,0.5);
        this.add.text(400, y+52, (d.party||[]).map(m=>m.name).join(' · '), { fontSize:'11px', fontFamily:'"Noto Serif TC",serif', color:'#7a7060' }).setOrigin(0.5,0.5);
      } else {
        this.add.text(400, y+36, '── 空欄 ──', { fontSize:'13px', fontFamily:'serif', color:'#3a3030' }).setOrigin(0.5,0.5);
      }
    }
    if (this.saveMsg) this.add.text(400, 498, this.saveMsg, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:'#80e090', stroke:'#000', strokeThickness:2 }).setOrigin(0.5,0.5);
    this.add.text(400, 522, '↑↓ 選擇　Z 存檔', { fontSize:'11px', fontFamily:'serif', color:'#5a4a2a' }).setOrigin(0.5,0.5);
  }

  update() {
    const up    = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down  = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const left  = Phaser.Input.Keyboard.JustDown(this.keys.left);
    const right = Phaser.Input.Keyboard.JustDown(this.keys.right);
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const back  = Phaser.Input.Keyboard.JustDown(this.keys.x) || Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (back) {
      if (this.tab===1 && this.equipSlot!==-1) { this.equipSlot=-1; this.drawPanel(); return; }
      this.scene.resume(this.caller); this.scene.stop(); return;
    }

    if (left && this.tab > 0 && (this.tab!==1||this.equipSlot===-1)) { this.tab--; this.cursor=0; this.drawPanel(); return; }
    if (right && this.tab < 3 && (this.tab!==1||this.equipSlot===-1)) { this.tab++; this.cursor=0; this.drawPanel(); return; }

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
      case 2:
        {
          const items=Object.entries(GS.inventory).filter(([,n])=>n>0);
          if (up)   { this.itemCursor=Math.max(0,this.itemCursor-1); this.drawPanel(); }
          if (down) { this.itemCursor=Math.min(items.length-1,this.itemCursor+1); this.drawPanel(); }
        }
        break;
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
    this.stock = data?.stock || [];
    this.caller = data?.caller || 'WorldScene';
  }

  create() {
    const W=800, H=600;
    this.cursor = 0;
    this.msg = '';

    this.add.graphics().fillStyle(0x000000, 0.65).fillRect(0,0,W,H);
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

    const W=800;
    this.panelGfx.fillStyle(0x100c1e, 0.97);
    this.panelGfx.fillRoundedRect(80, 60, 640, 500, 10);
    this.panelGfx.lineStyle(2, 0x7a5c1e, 1);
    this.panelGfx.strokeRoundedRect(80, 60, 640, 500, 10);

    const t0 = this.add.text(400, 98, '商　店', { fontSize:'20px', fontFamily:'"Noto Serif TC",serif', color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2 }).setOrigin(0.5,0.5);
    const t1 = this.add.text(650, 98, `靈石：${GS.gold}`, { fontSize:'13px', fontFamily:'monospace', color:'#e8c060', stroke:'#000', strokeThickness:1 }).setOrigin(1,0.5);
    this.allTexts.push(t0, t1);

    this.stock.forEach((id, i) => {
      const it = ITEMS[id]; if (!it) return;
      const y = 148 + i * 50;
      const sel = i === this.cursor;
      if (sel) {
        this.panelGfx.fillStyle(0xe8c060, 0.1);
        this.panelGfx.fillRect(90, y-16, 620, 46);
      }
      const nm = this.add.text(110, y, (sel?'▶ ':'') + it.name, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:sel?'#ffd700':'#c8a060', stroke:'#000', strokeThickness:2 });
      const pr = this.add.text(500, y, `${it.price} 靈石`, { fontSize:'13px', fontFamily:'monospace', color:'#e8c060', stroke:'#000', strokeThickness:1 });
      const dc = this.add.text(110, y+20, it.desc, { fontSize:'10px', fontFamily:'serif', color:'#7a7060', stroke:'#000', strokeThickness:1 });
      this.allTexts.push(nm, pr, dc);
    });

    if (this.msg) {
      const mt = this.add.text(400, 510, this.msg, { fontSize:'14px', fontFamily:'"Noto Serif TC",serif', color:'#80e090', stroke:'#000', strokeThickness:2 }).setOrigin(0.5,0.5);
      this.allTexts.push(mt);
    }
    const ht = this.add.text(400, 540, '↑↓ 選擇　Z 購買　X / Esc 離開', { fontSize:'11px', fontFamily:'serif', color:'#5a4a2a' }).setOrigin(0.5,0.5);
    this.allTexts.push(ht);
  }

  update() {
    const up   = Phaser.Input.Keyboard.JustDown(this.keys.up);
    const down = Phaser.Input.Keyboard.JustDown(this.keys.down);
    const ok   = Phaser.Input.Keyboard.JustDown(this.keys.z) || Phaser.Input.Keyboard.JustDown(this.keys.enter);
    const back = Phaser.Input.Keyboard.JustDown(this.keys.x) || Phaser.Input.Keyboard.JustDown(this.keys.esc);

    if (back) { this.scene.resume(this.caller); this.scene.stop(); return; }
    if (up)   { this.cursor=Math.max(0,this.cursor-1); this._draw(); }
    if (down) { this.cursor=Math.min(this.stock.length-1,this.cursor+1); this._draw(); }
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
