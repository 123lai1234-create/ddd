// ═══════════════════════════════════════════════════════
//  Part 4: Dialogue, Shop, Inn Scenes
// ═══════════════════════════════════════════════════════

class DialogueScene {
  constructor(dlgId, onDone){
    this.lines = DLGS[dlgId]||[{sp:'?',t:'...'}];
    this.idx   = 0;
    this.chars = 0;
    this.onDone= onDone;
    this.speed = 2; // chars per frame
    this.done  = false;
  }
  update(){
    const line = this.lines[this.idx];
    if(!line){ this._finish(); return; }
    if(this.chars < line.t.length){
      this.chars = Math.min(line.t.length, this.chars + this.speed);
    } else {
      this.done = true;
    }
    if((Input.confirm||Input.cancel) && this.done){
      this.idx++;
      this.chars = 0;
      this.done  = false;
      if(this.idx >= this.lines.length){ this._finish(); }
    } else if((Input.confirm||Input.cancel) && !this.done){
      // skip typewriter
      this.chars = line.t.length;
    }
  }
  _finish(){
    if(this.onDone) this.onDone();
  }
  draw(ctx){
    const line = this.lines[Math.min(this.idx, this.lines.length-1)];
    if(!line) return;
    // dim overlay
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,800,600);
    // box
    panel(ctx, 40, 430, 720, 140);
    // speaker name tag
    if(line.sp){
      panel(ctx, 52, 414, line.sp.length*14+20, 28);
      txt(ctx, line.sp, 62, 428, {size:13, color:'#e8c060', bold:true});
    }
    // text with word wrap
    const shown = line.t.slice(0, this.chars);
    this._drawWrapped(ctx, shown, 60, 460, 700, 18);
    // prompt
    if(this.done){
      const blink = Math.floor(Date.now()/400)%2;
      if(blink) txt(ctx,'▼',740,550,{size:14,color:'#e8c060'});
    }
  }
  _drawWrapped(ctx, str, x, y, maxW, lineH){
    ctx.save();
    ctx.font='14px "Noto Serif TC","SimSun",serif';
    ctx.textBaseline='middle'; ctx.fillStyle='#f0e6c8';
    const words=str.split('');
    let line=''; let cy=y;
    for(const ch of words){
      const test=line+ch;
      if(ctx.measureText(test).width>maxW){ ctx.fillText(line,x,cy); line=ch; cy+=lineH; }
      else { line=test; }
    }
    if(line) ctx.fillText(line,x,cy);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────
class ShopScene {
  constructor(stock, onDone){
    this.stock  = stock; // array of item ids
    this.cursor = 0;
    this.tab    = 'buy'; // 'buy' | 'sell'
    this.msg    = '';
    this.msgT   = 0;
    this.onDone = onDone;
  }
  update(){
    if(this.msgT>0){ this.msgT--; }
    if(Input.cancel){ this.onDone&&this.onDone(); return; }
    // tab switch
    if(Input.left&&this.tab==='sell'){ this.tab='buy'; this.cursor=0; }
    if(Input.right&&this.tab==='buy'){ this.tab='sell'; this.cursor=0; }

    const list = this._list();
    if(Input.up)  this.cursor=Math.max(0,this.cursor-1);
    if(Input.down)this.cursor=Math.min(list.length-1,this.cursor+1);
    if(Input.confirm){
      if(this.tab==='buy') this._buy(list[this.cursor]);
      else                 this._sell(list[this.cursor]);
    }
  }
  _list(){
    if(this.tab==='buy') return this.stock;
    // sellable: consumables in inventory
    return Object.keys(GS.inventory).filter(id=>ITEMS[id]&&GS.inventory[id]>0);
  }
  _buy(id){
    const it=ITEMS[id]; if(!it) return;
    if(GS.gold<it.price){ this._msg('靈石不足'); return; }
    GS.gold-=it.price; GS.addItem(id);
    this._msg(`購入 ${it.name}`);
  }
  _sell(id){
    const it=ITEMS[id]; if(!it) return;
    const price=Math.floor((it.price||0)*0.5);
    GS.removeItem(id); GS.gold+=price;
    this._msg(`賣出 ${it.name} +${price}靈石`);
    // adjust cursor
    const list=this._list();
    if(this.cursor>=list.length) this.cursor=Math.max(0,list.length-1);
  }
  _msg(s){ this.msg=s; this.msgT=90; }

  draw(ctx){
    ctx.fillStyle='#0a0614'; ctx.fillRect(0,0,800,600);
    // title
    txt(ctx,'商　店',400,40,{size:22,color:'#e8c060',align:'center',bold:true,shadow:true});
    txt(ctx,`靈石: ${GS.gold}`,700,40,{size:14,color:'#ffe080',align:'right'});

    // tabs
    const tabs=[{k:'buy',l:'購買'},{k:'sell',l:'賣出'}];
    tabs.forEach((t,i)=>{
      const active=this.tab===t.k;
      panel(ctx,100+i*150,65,130,30);
      txt(ctx,t.l,165+i*150,80,{size:14,color:active?'#e8c060':'#9a8060',align:'center'});
      if(active){ ctx.strokeStyle='#e8c060';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(105+i*150,95);ctx.lineTo(225+i*150,95);ctx.stroke(); }
    });

    const list=this._list();
    panel(ctx,40,105,440,440);
    list.forEach((id,i)=>{
      const it=ITEMS[id]; if(!it) return;
      const y=130+i*46; const sel=i===this.cursor;
      if(sel){ ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(48,y-14,424,42); }
      const price=this.tab==='buy'?it.price:Math.floor((it.price||0)*0.5);
      txt(ctx,(sel?'▶ ':'')+it.name,60,y,{size:14,color:sel?'#ffe080':'#f0e6c8'});
      txt(ctx,`${price}靈石`,440,y,{size:13,color:'#c8a060',align:'right'});
      if(this.tab==='buy'&&GS.inventory[id]){
        txt(ctx,`持有:${GS.inventory[id]}`,330,y,{size:12,color:'#80b090'});
      }
      if(this.tab==='sell'&&GS.inventory[id]){
        txt(ctx,`x${GS.inventory[id]}`,330,y,{size:12,color:'#80b090'});
      }
      // desc
      if(sel) txt(ctx,it.desc||'',60,y+18,{size:11,color:'#7a9490'});
    });
    if(list.length===0) txt(ctx,'─ 無 ─',260,300,{size:14,color:'#5a6060',align:'center'});

    // right info panel
    panel(ctx,510,105,250,440);
    txt(ctx,'說　明',635,130,{size:15,color:'#e8c060',align:'center',bold:true});
    const sel=list[this.cursor];
    if(sel){
      const it=ITEMS[sel];
      txt(ctx,it.name,635,165,{size:14,color:'#ffe080',align:'center'});
      const lines=[it.desc||''];
      if(it.hp)   lines.push(`HP +${it.hp}`);
      if(it.mp)   lines.push(`MP +${it.mp}`);
      if(it.atk)  lines.push(`攻擊 +${it.atk}`);
      if(it.def)  lines.push(`防禦 +${it.def}`);
      if(it.spd)  lines.push(`速度 +${it.spd}`);
      if(it.luk)  lines.push(`幸運 +${it.luk}`);
      lines.forEach((l,i)=>txt(ctx,l,635,195+i*22,{size:12,color:'#c8c0a8',align:'center'}));
    }

    // msg
    if(this.msgT>0) txt(ctx,this.msg,400,570,{size:14,color:'#ffe080',align:'center'});
    txt(ctx,'X/Esc 離開  ←→ 切換頁籤',400,585,{size:11,color:'#5a6060',align:'center'});
  }
}

// ─────────────────────────────────────────────────────
class InnScene {
  constructor(cost, onDone){
    this.cost   = cost||50;
    this.cursor = 0; // 0=rest, 1=leave
    this.onDone = onDone;
    this.phase  = 'menu'; // 'menu' | 'rest' | 'nosave'
    this.timer  = 0;
    this.saveSlot = -1;
    this.savePhase= false;
  }
  update(){
    if(this.phase==='rest'){
      this.timer++;
      if(this.timer>120){ this.onDone&&this.onDone(); }
      return;
    }
    if(this.savePhase){
      if(Input.up)   this.saveSlot=Math.max(0,this.saveSlot-1);
      if(Input.down) this.saveSlot=Math.min(2,this.saveSlot+1);
      if(this.saveSlot===-1) this.saveSlot=0;
      if(Input.confirm){ GS.save(this.saveSlot); this._doRest(); }
      if(Input.cancel) { this.savePhase=false; }
      return;
    }
    if(Input.up)   this.cursor=Math.max(0,this.cursor-1);
    if(Input.down) this.cursor=Math.min(1,this.cursor+1);
    if(Input.confirm){
      if(this.cursor===0){
        if(GS.gold<this.cost){ this.phase='nosave'; this.timer=90; return; }
        GS.gold-=this.cost;
        // heal all
        GS.party.forEach(m=>{ m.hp=m.maxHp; m.mp=m.maxMp; m.dead=false; m.status=[]; });
        this.savePhase=true; this.saveSlot=0;
      } else {
        this.onDone&&this.onDone();
      }
    }
    if(Input.cancel) this.onDone&&this.onDone();
  }
  _doRest(){ this.phase='rest'; this.timer=0; this.savePhase=false; }

  draw(ctx){
    ctx.fillStyle='#0a0614'; ctx.fillRect(0,0,800,600);
    txt(ctx,'客　棧',400,60,{size:22,color:'#e8c060',align:'center',bold:true,shadow:true});
    txt(ctx,`靈石: ${GS.gold}`,700,60,{size:14,color:'#ffe080',align:'right'});

    if(this.phase==='rest'){
      const a=Math.min(1,this.timer/30);
      ctx.fillStyle=`rgba(0,0,0,${a*0.8})`; ctx.fillRect(0,0,800,600);
      txt(ctx,'一夜好眠，精力充沛！',400,300,{size:20,color:'#ffe080',align:'center',shadow:true});
      return;
    }
    if(this.phase==='nosave'){
      if(this.timer>0){ this.timer--; txt(ctx,'靈石不足…',400,320,{size:18,color:'#e05050',align:'center'}); }
      return;
    }

    panel(ctx,250,120,300,200);
    txt(ctx,'住　宿',400,155,{size:16,color:'#e8c060',align:'center',bold:true});
    txt(ctx,`費用: ${this.cost} 靈石`,400,185,{size:14,color:'#c8b080',align:'center'});
    txt(ctx,'全員HP/MP回滿',400,210,{size:13,color:'#80b090',align:'center'});

    if(this.savePhase){
      panel(ctx,200,340,400,200);
      txt(ctx,'選擇存檔欄位',400,370,{size:15,color:'#e8c060',align:'center',bold:true});
      for(let i=0;i<3;i++){
        const d=Save.read(i);
        const y=400+i*42; const sel=i===this.saveSlot;
        if(sel){ ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(210,y-14,380,38); }
        const label=d?`欄位 ${i+1}: Lv${d.party?.[0]?.lv||1} · ${d.map||'?'}`:`欄位 ${i+1}: ─ 空 ─`;
        txt(ctx,(sel?'▶ ':'')+label,400,y,{size:13,color:sel?'#ffe080':'#c8b080',align:'center'});
      }
      txt(ctx,'Z確認存檔  X略過',400,550,{size:12,color:'#5a6060',align:'center'});
      return;
    }

    const opts=['住宿一晚','離開'];
    opts.forEach((o,i)=>{
      const y=310+i*50; const sel=i===this.cursor;
      if(sel){ ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(270,y-16,260,38); }
      txt(ctx,(sel?'▶ ':'')+o,400,y,{size:15,color:sel?'#ffe080':'#c8b080',align:'center'});
    });
    txt(ctx,'X/Esc 離開',400,570,{size:11,color:'#5a6060',align:'center'});
  }
}
