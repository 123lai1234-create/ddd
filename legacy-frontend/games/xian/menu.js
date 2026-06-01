// ═══════════════════════════════════════════════════════
//  Part 5: Main Menu, GameOver, Victory
// ═══════════════════════════════════════════════════════

class MenuScene {
  constructor(onClose){
    this.onClose = onClose;
    this.tab     = 0;  // 0=狀態 1=裝備 2=道具 3=存檔
    this.TABS    = ['狀態','裝備','道具','存檔'];
    this.member  = 0;  // selected party member
    this.cursor  = 0;
    // equip sub
    this.equipSlot  = -1; // -1=slot select, 0=wp,1=ar,2=ac
    this.equipList  = [];
    this.equipCursor= 0;
    // item sub
    this.itemList   = [];
    this.itemCursor = 0;
    this.itemUseTarget= -1;
    // save sub
    this.saveCursor = 0;
    this.saveMsg    = '';
    this.saveMsgT   = 0;
  }

  update(){
    if(Input.cancel&&this.equipSlot===-1&&this.itemUseTarget===-1){
      this.onClose&&this.onClose(); return;
    }
    // tab switch
    if(Input.left&&this.equipSlot===-1&&this.itemUseTarget===-1)  this.tab=Math.max(0,this.tab-1);
    if(Input.right&&this.equipSlot===-1&&this.itemUseTarget===-1) this.tab=Math.min(this.TABS.length-1,this.tab+1);

    switch(this.tab){
      case 0: this._updateStatus(); break;
      case 1: this._updateEquip();  break;
      case 2: this._updateItem();   break;
      case 3: this._updateSave();   break;
    }
    if(this.saveMsgT>0) this.saveMsgT--;
  }

  // ── Status tab ──────────────────────────────────────
  _updateStatus(){
    if(Input.up)   this.member=Math.max(0,this.member-1);
    if(Input.down) this.member=Math.min(GS.party.length-1,this.member+1);
  }

  // ── Equip tab ───────────────────────────────────────
  _updateEquip(){
    if(this.equipSlot===-1){
      const slots=['wp','ar','ac'];
      if(Input.up)   this.cursor=Math.max(0,this.cursor-1);
      if(Input.down) this.cursor=Math.min(slots.length-1,this.cursor+1);
      if(Input.left) this.member=Math.max(0,this.member-1);
      if(Input.right)this.member=Math.min(GS.party.length-1,this.member+1);
      if(Input.confirm){
        this.equipSlot=this.cursor;
        this.equipList=this._equipCandidates(slots[this.equipSlot]);
        this.equipCursor=0;
      }
      if(Input.cancel){ this.equipSlot=-1; }
    } else {
      if(Input.up)   this.equipCursor=Math.max(0,this.equipCursor-1);
      if(Input.down) this.equipCursor=Math.min(this.equipList.length-1,this.equipCursor+1);
      if(Input.confirm){
        const m=GS.party[this.member];
        const slots=['wp','ar','ac'];
        const chosen=this.equipList[this.equipCursor];
        if(chosen===null){
          m.equip[slots[this.equipSlot]]=null;
        } else {
          m.equip[slots[this.equipSlot]]=chosen;
        }
        this.equipSlot=-1;
      }
      if(Input.cancel){ this.equipSlot=-1; }
    }
  }
  _equipCandidates(slot){
    const list=[null]; // null = unequip
    for(const id of Object.keys(ITEMS)){
      const it=ITEMS[id];
      if(it.cat==='eq'&&it.slot===slot) list.push(id);
    }
    return list;
  }

  // ── Item tab ────────────────────────────────────────
  _updateItem(){
    this.itemList=Object.keys(GS.inventory).filter(id=>GS.inventory[id]>0&&ITEMS[id]&&ITEMS[id].hp!==undefined||ITEMS[id]&&ITEMS[id].revive);
    // actually rebuild full list
    this.itemList=Object.keys(GS.inventory).filter(id=>ITEMS[id]&&GS.inventory[id]>0);
    if(this.itemUseTarget===-1){
      if(Input.up)   this.itemCursor=Math.max(0,this.itemCursor-1);
      if(Input.down) this.itemCursor=Math.min(this.itemList.length-1,this.itemCursor+1);
      if(Input.confirm){
        const id=this.itemList[this.itemCursor];
        const it=ITEMS[id];
        if(it&&(it.hp||it.mp||it.revive)){
          this.itemUseTarget=0;
        }
      }
      if(Input.cancel){ /* stay */ }
    } else {
      if(Input.up)   this.itemUseTarget=Math.max(0,this.itemUseTarget-1);
      if(Input.down) this.itemUseTarget=Math.min(GS.party.length-1,this.itemUseTarget+1);
      if(Input.confirm){
        const id=this.itemList[this.itemCursor];
        const it=ITEMS[id];
        const m=GS.party[this.itemUseTarget];
        if(it.revive&&m.dead){ m.dead=false; m.hp=Math.floor(m.maxHp*0.3); GS.removeItem(id); }
        else if(!m.dead){
          if(it.hp) m.hp=Math.min(m.maxHp,m.hp+(it.hp||0));
          if(it.mp) m.mp=Math.min(m.maxMp,m.mp+(it.mp||0));
          GS.removeItem(id);
        }
        this.itemUseTarget=-1;
        this.itemCursor=Math.min(this.itemCursor,this.itemList.length-1);
      }
      if(Input.cancel){ this.itemUseTarget=-1; }
    }
  }

  // ── Save tab ────────────────────────────────────────
  _updateSave(){
    if(Input.up)   this.saveCursor=Math.max(0,this.saveCursor-1);
    if(Input.down) this.saveCursor=Math.min(2,this.saveCursor+1);
    if(Input.confirm){
      GS.save(this.saveCursor);
      this.saveMsg='存檔成功！'; this.saveMsgT=90;
    }
  }

  // ── Draw ────────────────────────────────────────────
  draw(ctx){
    ctx.fillStyle='rgba(5,2,14,0.96)'; ctx.fillRect(0,0,800,600);
    txt(ctx,'選　單',400,28,{size:20,color:'#e8c060',align:'center',bold:true,shadow:true});

    // Tabs
    this.TABS.forEach((t,i)=>{
      const x=140+i*130; const active=i===this.tab;
      panel(ctx,x-50,48,120,30);
      txt(ctx,t,x,63,{size:14,color:active?'#ffe080':'#7a6040',align:'center',bold:active});
      if(active){ ctx.strokeStyle='#e8c060';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-48,78);ctx.lineTo(x+48,78);ctx.stroke(); }
    });

    switch(this.tab){
      case 0: this._drawStatus(ctx); break;
      case 1: this._drawEquip(ctx);  break;
      case 2: this._drawItem(ctx);   break;
      case 3: this._drawSave(ctx);   break;
    }
    txt(ctx,'←→ 切換頁籤  X 關閉',400,588,{size:11,color:'#3a3030',align:'center'});
  }

  _drawStatus(ctx){
    // member list left
    panel(ctx,20,90,160,490);
    GS.party.forEach((m,i)=>{
      const y=120+i*80; const sel=i===this.member;
      if(sel){ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(28,y-14,144,68);}
      drawSprite(ctx,m.shape,95,y+12,14,m.color);
      txt(ctx,m.name,95,y-2,{size:12,color:sel?'#ffe080':'#c8b080',align:'center',bold:sel});
      bar(ctx,30,y+26,140,7,m.hp,m.maxHp,'#50c870');
      bar(ctx,30,y+38,140,7,m.mp,m.maxMp,'#5090e0');
      txt(ctx,`${m.hp}/${m.maxHp}`,100,y+32,{size:9,color:'#b0ffb0',align:'center'});
    });
    if(Input.up||Input.down) this.member=Math.max(0,Math.min(GS.party.length-1,this.member+(Input.down?1:-1)));

    // detail right
    const m=GS.party[this.member]; if(!m) return;
    panel(ctx,195,90,590,490);
    const st=calcStats(m);
    txt(ctx,`${m.name}　${m.title}`,480,120,{size:18,color:'#ffe080',align:'center',bold:true});
    txt(ctx,`Lv. ${m.lv}`,480,148,{size:13,color:'#c8a060',align:'center'});
    // exp bar
    const expNeed=expForLevel(m.lv);
    bar(ctx,280,160,390,10,m.exp,expNeed,'#c060e0');
    txt(ctx,`EXP ${m.exp}/${expNeed}`,480,176,{size:11,color:'#a070c0',align:'center'});
    // stats grid
    const stats=[
      ['HP',`${m.hp} / ${m.maxHp}`],['MP',`${m.mp} / ${st.maxMp}`],
      ['攻擊',st.atk],['防禦',st.def],['速度',st.spd],['幸運',st.luk],
    ];
    stats.forEach(([k,v],i)=>{
      const col=i%2; const row=Math.floor(i/2);
      const x=230+col*200; const y=210+row*44;
      txt(ctx,k,x,y,{size:13,color:'#9a8060'});
      txt(ctx,String(v),x+140,y,{size:14,color:'#f0e6c8',align:'right',bold:true});
    });
    // equipment
    txt(ctx,'裝備',480,340,{size:14,color:'#e8c060',align:'center',bold:true});
    const slots=[['武器','wp'],['防具','ar'],['配件','ac']];
    slots.forEach(([label,slot],i)=>{
      const it=m.equip[slot]?ITEMS[m.equip[slot]]:null;
      txt(ctx,label,230,375+i*36,{size:12,color:'#7a6040'});
      txt(ctx,it?it.name:'── 無 ──',390,375+i*36,{size:13,color:'#c8b080'});
    });
    // status effects
    if(m.status.length){
      txt(ctx,'異常: '+m.status.join(', '),480,490,{size:12,color:'#e05050',align:'center'});
    }
    drawSprite(ctx,m.shape,700,280,28,m.color);
  }

  _drawEquip(ctx){
    // member tabs
    GS.party.forEach((m,i)=>{
      const x=130+i*180; const sel=i===this.member;
      panel(ctx,x-70,90,140,30);
      txt(ctx,m.name,x,105,{size:13,color:sel?'#ffe080':'#7a6040',align:'center',bold:sel});
    });
    const m=GS.party[this.member]; if(!m) return;
    const slots=[['武器','wp'],['防具','ar'],['配件','ac']];
    panel(ctx,20,130,280,440);
    slots.forEach(([label,slot],i)=>{
      const y=165+i*90; const sel=this.equipSlot===-1&&i===this.cursor;
      if(sel){ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(28,y-14,264,80);}
      txt(ctx,(sel?'▶ ':'')+label,40,y,{size:13,color:sel?'#ffe080':'#9a8060',bold:sel});
      const it=m.equip[slot]?ITEMS[m.equip[slot]]:null;
      txt(ctx,it?it.name:'── 無 ──',40,y+24,{size:14,color:'#f0e6c8'});
      if(it){
        const bonuses=[];
        if(it.atk) bonuses.push(`攻+${it.atk}`);
        if(it.def) bonuses.push(`防+${it.def}`);
        if(it.spd) bonuses.push(`速+${it.spd}`);
        txt(ctx,bonuses.join(' '),40,y+46,{size:11,color:'#80b090'});
      }
    });

    if(this.equipSlot>=0){
      // item picker
      panel(ctx,320,130,460,440);
      txt(ctx,'選擇裝備',548,158,{size:15,color:'#e8c060',align:'center',bold:true});
      this.equipList.forEach((id,i)=>{
        const y=185+i*40; const sel=i===this.equipCursor;
        if(sel){ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(328,y-14,444,36);}
        if(id===null){
          txt(ctx,(sel?'▶ ':'')+`── 卸除 ──`,340,y,{size:13,color:sel?'#ffe080':'#7a6040'});
        } else {
          const it=ITEMS[id];
          txt(ctx,(sel?'▶ ':'')+it.name,340,y,{size:13,color:sel?'#ffe080':'#c8b080'});
          const bonuses=[];
          if(it.atk) bonuses.push(`攻+${it.atk}`);
          if(it.def) bonuses.push(`防+${it.def}`);
          if(it.spd) bonuses.push(`速+${it.spd}`);
          if(it.luk) bonuses.push(`幸+${it.luk}`);
          txt(ctx,bonuses.join(' '),740,y,{size:11,color:'#80b090',align:'right'});
        }
      });
      txt(ctx,'Z確認  X取消',548,560,{size:12,color:'#5a6060',align:'center'});
    } else {
      txt(ctx,'← → 切換人物  Z確認  X返回',400,570,{size:11,color:'#5a6060',align:'center'});
    }
  }

  _drawItem(ctx){
    panel(ctx,20,90,380,490);
    txt(ctx,'道　具',208,118,{size:15,color:'#e8c060',align:'center',bold:true});
    // rebuild list
    const list=Object.keys(GS.inventory).filter(id=>ITEMS[id]&&GS.inventory[id]>0);
    if(list.length===0){
      txt(ctx,'── 空 ──',208,300,{size:14,color:'#4a4040',align:'center'});
    }
    list.forEach((id,i)=>{
      const it=ITEMS[id]; const cnt=GS.inventory[id];
      const y=148+i*44; const sel=i===this.itemCursor;
      if(sel){ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(28,y-14,364,40);}
      txt(ctx,(sel?'▶ ':'')+it.name,40,y,{size:13,color:sel?'#ffe080':'#c8b080'});
      txt(ctx,`x${cnt}`,360,y,{size:13,color:'#c8a060',align:'right'});
      if(sel) txt(ctx,it.desc||'',40,y+18,{size:11,color:'#7a9490'});
    });

    // target or detail panel
    panel(ctx,420,90,360,490);
    if(this.itemUseTarget>=0){
      txt(ctx,'選擇對象',598,120,{size:15,color:'#e8c060',align:'center',bold:true});
      GS.party.forEach((m,i)=>{
        const y=165+i*95; const sel=i===this.itemUseTarget;
        if(sel){ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(428,y-14,344,85);}
        drawSprite(ctx,m.shape,460,y+24,14,m.dead?'#606060':m.color);
        txt(ctx,(sel?'▶ ':'')+m.name,488,y,{size:13,color:sel?'#ffe080':m.dead?'#606060':'#c8b080',bold:sel});
        bar(ctx,488,y+16,270,8,m.hp,m.maxHp,'#50c870');
        bar(ctx,488,y+30,270,8,m.mp,m.maxMp,'#5090e0');
        txt(ctx,`${m.hp}/${m.maxHp}`,758,y+22,{size:9,color:'#b0ffb0',align:'right'});
        if(m.dead) txt(ctx,'[戰鬥不能]',598,y+48,{size:11,color:'#e05050',align:'center'});
      });
      txt(ctx,'Z使用  X取消',598,560,{size:12,color:'#5a6060',align:'center'});
    } else {
      const id=list[this.itemCursor]; const it=id?ITEMS[id]:null;
      if(it){
        txt(ctx,it.name,598,130,{size:16,color:'#ffe080',align:'center',bold:true});
        txt(ctx,it.desc||'',598,165,{size:13,color:'#c8c0a8',align:'center'});
        const bonuses=[];
        if(it.hp)    bonuses.push(`HP +${it.hp}`);
        if(it.mp)    bonuses.push(`MP +${it.mp}`);
        if(it.revive)bonuses.push('復活 HP30%');
        bonuses.forEach((b,i)=>txt(ctx,b,598,200+i*28,{size:14,color:'#80e090',align:'center'}));
        if(it.hp||it.mp||it.revive) txt(ctx,'Z 使用',598,380,{size:14,color:'#c8a060',align:'center'});
      }
    }
  }

  _drawSave(ctx){
    panel(ctx,150,100,500,420);
    txt(ctx,'儲　存',400,135,{size:18,color:'#e8c060',align:'center',bold:true});
    for(let i=0;i<3;i++){
      const d=Save.read(i); const y=185+i*100; const sel=i===this.saveCursor;
      if(sel){ctx.fillStyle='rgba(232,192,96,0.12)';ctx.fillRect(160,y-14,480,90);}
      txt(ctx,(sel?'▶ ':`   `)+`欄位 ${i+1}`,175,y,{size:14,color:sel?'#ffe080':'#c8b080',bold:sel});
      if(d){
        txt(ctx,`Lv.${d.party?.[0]?.lv||'?'} · ${d.map||'?'} · 靈石${d.gold||0}`,400,y+26,{size:12,color:'#9a8060',align:'center'});
        const members=(d.party||[]).map(m=>m.name).join('・');
        txt(ctx,members,400,y+48,{size:11,color:'#7a7060',align:'center'});
      } else {
        txt(ctx,'── 空欄 ──',400,y+30,{size:13,color:'#3a3030',align:'center'});
      }
    }
    if(this.saveMsgT>0) txt(ctx,this.saveMsg,400,555,{size:15,color:'#80e090',align:'center'});
    txt(ctx,'Z 存檔  ↑↓ 選擇欄位',400,580,{size:11,color:'#5a6060',align:'center'});
  }
}

// ─────────────────────────────────────────────────────
class GameOverScene {
  constructor(){
    this.timer=0; this.cursor=0;
  }
  update(){
    this.timer++;
    if(this.timer<90) return;
    if(Input.up)   this.cursor=Math.max(0,this.cursor-1);
    if(Input.down) this.cursor=Math.min(1,this.cursor+1);
    if(Input.confirm){
      if(this.cursor===0){
        // load last save
        for(let i=2;i>=0;i--){ if(GS.load(i)){ Game.goScene('world'); return; } }
        GS.init(); Game.goScene('title');
      } else {
        GS.init(); Game.goScene('title');
      }
    }
  }
  draw(ctx){
    ctx.fillStyle='#000'; ctx.fillRect(0,0,800,600);
    const a=Math.min(1,this.timer/60);
    ctx.fillStyle=`rgba(100,0,0,${a*0.4})`; ctx.fillRect(0,0,800,600);
    ctx.save();
    ctx.globalAlpha=a;
    txt(ctx,'全員陣亡',400,200,{size:48,color:'#cc2020',align:'center',bold:true,shadow:true});
    txt(ctx,'仙途已斷，魂歸虛空…',400,280,{size:16,color:'#804040',align:'center'});
    if(this.timer>90){
      const opts=['讀取存檔','返回標題'];
      opts.forEach((o,i)=>{
        const sel=i===this.cursor;
        txt(ctx,(sel?'▶ ':'')+o,400,380+i*55,{size:18,color:sel?'#ffe080':'#c8b080',align:'center',bold:sel});
      });
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────
class VictoryScene {
  constructor(){
    this.timer=0; this.particles=[];
    for(let i=0;i<60;i++){
      this.particles.push({
        x:Math.random()*800, y:Math.random()*600+600,
        vx:(Math.random()-0.5)*2, vy:-(2+Math.random()*4),
        life:1, color:`hsl(${40+Math.random()*40},90%,70%)`
      });
    }
  }
  update(){
    this.timer++;
    this.particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      p.life=Math.max(0,p.life-0.003);
      if(p.y<-20){ p.y=620; p.life=1; }
    });
    if(this.timer>180&&(Input.confirm||Input.cancel)){
      Game.goScene('title');
    }
  }
  draw(ctx){
    ctx.fillStyle='#05020e'; ctx.fillRect(0,0,800,600);
    // particles
    this.particles.forEach(p=>{
      ctx.save(); ctx.globalAlpha=p.life*0.8;
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    const a=Math.min(1,this.timer/80);
    ctx.save(); ctx.globalAlpha=a;
    txt(ctx,'魔君已滅',400,160,{size:52,color:'#ffe080',align:'center',bold:true,shadow:true});
    txt(ctx,'仙俠傳　· 通關 ·',400,240,{size:20,color:'#e8c060',align:'center'});
    txt(ctx,'感謝遊玩！',400,300,{size:16,color:'#c8b080',align:'center'});
    // party
    GS.party.forEach((m,i)=>{
      const x=220+i*180;
      drawSprite(ctx,m.shape,x,420,24,m.color);
      txt(ctx,m.name,x,460,{size:13,color:'#ffe080',align:'center'});
      txt(ctx,`Lv.${m.lv}`,x,480,{size:12,color:'#c8a060',align:'center'});
    });
    if(this.timer>180) txt(ctx,'按Z繼續',400,555,{size:13,color:'#7a6040',align:'center'});
    ctx.restore();
  }
}
