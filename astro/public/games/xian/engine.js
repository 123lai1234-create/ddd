// ═══════════════════════════════════════════════════════
//  Part 2: Core Engine (Input, Save, Draw, State)
// ═══════════════════════════════════════════════════════

const Input = {
  keys:{}, prev:{},
  init(){
    window.addEventListener('keydown',e=>{ this.keys[e.code]=true; e.preventDefault(); },{passive:false});
    window.addEventListener('keyup',e=>{ this.keys[e.code]=false; });
  },
  pressed(code){ return this.keys[code]&&!this.prev[code]; },
  held(code){ return !!this.keys[code]; },
  tick(){ this.prev={...this.keys}; },
  get confirm(){ return this.pressed('KeyZ')||this.pressed('Enter'); },
  get cancel() { return this.pressed('KeyX')||this.pressed('Escape'); },
  get up()    { return this.pressed('ArrowUp')   ||this.pressed('KeyW'); },
  get down()  { return this.pressed('ArrowDown') ||this.pressed('KeyS'); },
  get left()  { return this.pressed('ArrowLeft') ||this.pressed('KeyA'); },
  get right() { return this.pressed('ArrowRight')||this.pressed('KeyD'); },
  get upH()   { return this.held('ArrowUp')   ||this.held('KeyW'); },
  get downH() { return this.held('ArrowDown') ||this.held('KeyS'); },
  get leftH() { return this.held('ArrowLeft') ||this.held('KeyA'); },
  get rightH(){ return this.held('ArrowRight')||this.held('KeyD'); },
};

const Save = {
  KEY:'xianxia_rpg_v1',
  slots(){ try{ return JSON.parse(localStorage.getItem(this.KEY))||[null,null,null]; }catch(e){ return [null,null,null]; } },
  write(slot,data){ const s=this.slots(); s[slot]=data; localStorage.setItem(this.KEY,JSON.stringify(s)); },
  read(slot){ return this.slots()[slot]; },
};

function panel(ctx,x,y,w,h){
  ctx.save();
  ctx.fillStyle='rgba(8,4,18,0.97)';
  ctx.beginPath(); ctx.roundRect(x,y,w,h,6); ctx.fill();
  ctx.strokeStyle='#7a5c1e'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(x,y,w,h,6); ctx.stroke();
  ctx.strokeStyle='rgba(232,192,96,0.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+2,y+2,w-4,h-4,5); ctx.stroke();
  ctx.restore();
}

function txt(ctx,str,x,y,opts={}){
  const {size=14,color='#f0e6c8',align='left',bold=false,shadow=false}=opts;
  ctx.save();
  ctx.font=`${bold?'bold ':''}${size}px "Noto Serif TC","SimSun",serif`;
  ctx.textAlign=align; ctx.textBaseline='middle';
  if(shadow){ ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.fillText(str,x+1,y+1); }
  ctx.fillStyle=color; ctx.fillText(str,x,y);
  ctx.restore();
}

function bar(ctx,x,y,w,h,val,max,color){
  ctx.fillStyle='#111'; ctx.fillRect(x,y,w,h);
  const pct=Math.max(0,Math.min(1,val/max));
  ctx.fillStyle=color; ctx.fillRect(x,y,Math.floor(w*pct),h);
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
}

function drawSprite(ctx,shape,x,y,sz,color){
  ctx.save(); ctx.translate(x,y);
  const s=sz;
  ctx.fillStyle=color;
  ctx.beginPath(); ctx.arc(0,-s*1.15,s*0.55,0,Math.PI*2); ctx.fill();
  ctx.fillRect(-s*0.45,-s*0.9,s*0.9,s*1.1);
  ctx.fillRect(-s*0.45,s*0.2,s*0.4,s*0.7);
  ctx.fillRect(s*0.05,s*0.2,s*0.4,s*0.7);
  ctx.fillStyle='rgba(255,255,255,0.75)';
  if(shape==='sword'){
    ctx.fillRect(s*0.48,-s*0.75,s*0.12,s*1.1);
    ctx.fillRect(s*0.32,-s*0.8,s*0.44,s*0.1);
  } else if(shape==='mage'){
    ctx.beginPath(); ctx.arc(0,-s*2.1,s*0.28,0,Math.PI*2); ctx.fill();
    ctx.fillRect(-s*0.04,-s*2.1,s*0.08,s*0.95);
  } else if(shape==='archer'){
    ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=s*0.1;
    ctx.beginPath(); ctx.arc(-s*0.7,-s*0.4,s*0.85,Math.PI*0.3,Math.PI*1.7); ctx.stroke();
    ctx.fillRect(-s*0.76,-s*0.46,s*0.08,s*1.0);
  }
  ctx.restore();
}

function drawEnemy(ctx,enemyId,x,y,hp,maxHp,flash){
  const e=ENEMIES[enemyId];
  if(!e) return;
  const col=flash?'#ffffff':e.color;
  const r=(e.sz||1)*28;
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle=col; ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1.5;
  if((e.sz||1)>=2){
    // Boss
    ctx.beginPath(); ctx.ellipse(0,10,r*1.1,r*0.7,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(r*0.7,-r*0.3,r*0.55,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle=flash?'#fff':'#ff0';
    ctx.beginPath(); ctx.arc(r*0.82,-r*0.45,r*0.12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(r*0.84,-r*0.46,r*0.05,0,Math.PI*2); ctx.fill();
  } else if(e.id==='ghostFire'){
    ctx.globalAlpha=0.85;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=0.4; ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(0,-r*0.4,r*1.2,0,Math.PI); ctx.fill();
    ctx.globalAlpha=1;
    ctx.fillStyle=flash?'#f88':'#fff';
    ctx.beginPath(); ctx.arc(-r*0.3,-r*0.2,r*0.18,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(r*0.3,-r*0.2,r*0.18,0,Math.PI*2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(0,r*0.2,r*0.55,r*0.38,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-r*0.28,r*0.65,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle=flash?'#faa':'#f00';
    ctx.beginPath(); ctx.arc(-r*0.25,-r*0.38,r*0.14,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(r*0.25,-r*0.38,r*0.14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=flash?'#ff0':'#ff0';
    ctx.beginPath(); ctx.arc(-r*0.25,-r*0.38,r*0.06,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(r*0.25,-r*0.38,r*0.06,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  // HP bar
  bar(ctx,x-r,y+r+4,r*2,6,hp,maxHp,'#e05050');
  txt(ctx,ENEMIES[enemyId].name,x,y+r+18,{size:11,align:'center',color:'#c8a060'});
}

function makePartyMember(id){
  const b=CHAR_BASE[id];
  return {
    id,name:b.name,title:b.title,color:b.color,shape:b.shape,
    lv:1,exp:0,
    maxHp:b.hp,hp:b.hp,maxMp:b.mp,mp:b.mp,
    baseAtk:b.atk,baseDef:b.def,baseSpd:b.spd,baseLuk:b.luk,
    skills:[...b.skills],
    equip:{wp:null,ar:null,ac:null},
    status:[],
    dead:false,
  };
}

function calcStats(m){
  let atk=m.baseAtk,def=m.baseDef,spd=m.baseSpd,luk=m.baseLuk,maxMp=m.maxMp;
  for(const slot of ['wp','ar','ac']){
    if(!m.equip[slot]) continue;
    const it=ITEMS[m.equip[slot]]; if(!it) continue;
    atk+=it.atk||0; def+=it.def||0; spd+=it.spd||0;
    luk+=it.luk||0; maxMp+=it.mp||0;
  }
  if(m.status.includes('atkDown')) atk=Math.max(1,atk-8);
  if(m.status.includes('slow'))    spd=Math.max(1,Math.floor(spd*0.6));
  return {atk,def,spd,luk,maxMp};
}

function expForLevel(lv){ return Math.floor(100*Math.pow(lv,1.5)); }
const GROWTH={
  yunyi: {hp:12,mp:3, atk:2,def:2,spd:1,luk:1},
  linger:{hp:6, mp:12,atk:1,def:1,spd:1,luk:2},
  yuehua:{hp:8, mp:5, atk:2,def:1,spd:2,luk:2},
};

const GS={
  scene:'title',map:'village',
  player:{x:9,y:6,facing:'down'},
  party:[],gold:150,flags:{},inventory:{},
  defeated:{},encStep:0,
  battleData:null,dlgData:null,menuData:null,shopData:null,

  init(){
    this.party=[makePartyMember('yunyi')];
    this.gold=150; this.flags={}; this.inventory={herb:3};
    this.defeated={}; this.encStep=0;
    this.map='village'; this.player={x:9,y:6,facing:'down'};
  },
  addItem(id,n=1){ this.inventory[id]=(this.inventory[id]||0)+n; },
  removeItem(id,n=1){
    this.inventory[id]=Math.max(0,(this.inventory[id]||0)-n);
    if(!this.inventory[id]) delete this.inventory[id];
  },
  hasItem(id){ return (this.inventory[id]||0)>0; },
  getMember(id){ return this.party.find(m=>m.id===id); },
  addMember(id){
    if(this.party.find(m=>m.id===id)) return;
    const m=makePartyMember(id);
    m.lv=Math.max(1,this.party[0]?.lv||1);
    for(let i=1;i<m.lv;i++){
      const g=GROWTH[id]||{hp:8,mp:4,atk:2,def:1,spd:1,luk:1};
      m.maxHp+=g.hp; m.hp=m.maxHp; m.maxMp+=g.mp; m.mp=m.maxMp;
      m.baseAtk+=g.atk; m.baseDef+=g.def; m.baseSpd+=g.spd; m.baseLuk+=g.luk;
    }
    this.party.push(m);
  },
  save(slot){
    Save.write(slot,{
      map:this.map,player:{...this.player},
      party:JSON.parse(JSON.stringify(this.party)),
      gold:this.gold,flags:{...this.flags},
      inventory:{...this.inventory},defeated:{...this.defeated},
    });
  },
  load(slot){
    const d=Save.read(slot); if(!d) return false;
    Object.assign(this,{
      map:d.map,player:{...d.player},
      party:d.party,gold:d.gold,
      flags:d.flags||{},inventory:d.inventory||{},
      defeated:d.defeated||{},encStep:0,
    });
    return true;
  },
  levelUp(m){
    const g=GROWTH[m.id]||{hp:8,mp:4,atk:2,def:1,spd:1,luk:1};
    m.lv++; m.exp=0;
    m.maxHp+=g.hp; m.hp=Math.min(m.hp+g.hp,m.maxHp);
    m.maxMp+=g.mp; m.mp=Math.min(m.mp+g.mp,m.maxMp);
    m.baseAtk+=g.atk; m.baseDef+=g.def; m.baseSpd+=g.spd; m.baseLuk+=g.luk;
  },
};
