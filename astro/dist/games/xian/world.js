// ═══════════════════════════════════════════════════════
//  Part 3: Title Screen + World Scene
// ═══════════════════════════════════════════════════════

const TILE_SZ=40;
const TILE_COLORS={
  0:['#7a6545','#8a7555'],  // path
  1:['#3c2d1e','#4a3828'],  // wall
  2:['#2a5218','#336622'],  // grass
  3:['#193810','#224d14'],  // tree
  4:['#1a3468','#1e3d78'],  // water
  5:['#2a1e12','#332515'],  // floor
  6:['#7a5a10','#8b6914'],  // door
};

// ── Title Scene ──────────────────────────────────────────
const TitleScene={
  cursor:0,
  options:['開始新遊戲','繼續遊戲','關於'],
  t:0,
  enter(){ this.cursor=0; this.t=0; },

  update(){
    this.t++;
    if(Input.up   && this.cursor>0) this.cursor--;
    if(Input.down && this.cursor<this.options.length-1) this.cursor++;
    if(Input.confirm){
      if(this.cursor===0){ GS.init(); Game.goScene('world'); }
      else if(this.cursor===1){ Game.goScene('load'); }
      else if(this.cursor===2){ Game.goScene('about'); }
    }
  },

  draw(ctx){
    const W=800,H=600,t=this.t;
    // bg gradient
    const grd=ctx.createRadialGradient(W/2,H/2,50,W/2,H/2,400);
    grd.addColorStop(0,'#1a0a2e'); grd.addColorStop(1,'#08040e');
    ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);
    // animated particles
    ctx.fillStyle='rgba(232,192,96,0.5)';
    for(let i=0;i<30;i++){
      const px=Math.sin(i*1.3+t*0.01)*350+W/2;
      const py=((i*37+t*0.4)%H);
      ctx.beginPath(); ctx.arc(px,py,1,0,Math.PI*2); ctx.fill();
    }
    // title
    ctx.save();
    ctx.shadowColor='#e8c060'; ctx.shadowBlur=30;
    txt(ctx,'仙 俠 傳',W/2,160,{size:72,color:'#e8c060',align:'center',bold:true,shadow:true});
    ctx.restore();
    txt(ctx,'— 回合制 · 仙劍風格 RPG —',W/2,220,{size:16,color:'#9a8060',align:'center'});
    // divider
    ctx.strokeStyle='rgba(122,92,30,0.6)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(240,248); ctx.lineTo(560,248); ctx.stroke();
    // menu
    const opts=this.options;
    const menuY=290;
    for(let i=0;i<opts.length;i++){
      const sel=i===this.cursor;
      const y=menuY+i*52;
      if(sel){
        ctx.fillStyle='rgba(122,92,30,0.3)';
        ctx.beginPath(); ctx.roundRect(W/2-120,y-20,240,40,4); ctx.fill();
        ctx.strokeStyle='#7a5c1e'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.roundRect(W/2-120,y-20,240,40,4); ctx.stroke();
      }
      txt(ctx,opts[i],W/2,y,{size:20,color:sel?'#ffd700':'#c8a060',align:'center',shadow:true});
      if(sel){
        const blink=Math.sin(t*0.1)>0;
        if(blink) txt(ctx,'◆',W/2-140,y,{size:14,color:'#ffd700',align:'center'});
      }
    }
    txt(ctx,'方向鍵選擇  ·  Z/Enter 確認',W/2,540,{size:12,color:'#5a4a2a',align:'center'});
    txt(ctx,'© 2026 仙俠傳',W/2,565,{size:11,color:'#3a2a14',align:'center'});
  },
};

// ── About Scene ──────────────────────────────────────────
const AboutScene={
  enter(){},
  update(){ if(Input.confirm||Input.cancel) Game.goScene('title'); },
  draw(ctx){
    ctx.fillStyle='#08040e'; ctx.fillRect(0,0,800,600);
    panel(ctx,160,60,480,460);
    txt(ctx,'關於仙俠傳',400,100,{size:24,color:'#ffd700',align:'center',bold:true});
    const lines=[
      '一款以仙劍奇俠傳為靈感的',
      '純瀏覽器回合制 RPG 遊戲。',
      '',
      '【操作說明】',
      '方向鍵 / WASD — 移動',
      'Z / Enter — 確認 / 互動',
      'X / Esc   — 取消 / 選單',
      '',
      '【遊戲特色】',
      '・三位個性鮮明的角色',
      '・完整的回合制戰鬥系統',
      '・技能、裝備、道具系統',
      '・三章完整劇情',
      '・存檔系統（三格存檔）',
    ];
    let y=145;
    for(const l of lines){
      txt(ctx,l,400,y,{size:13,color:l.startsWith('【')?'#e8c060':'#c8a870',align:'center'});
      y+=26;
    }
    txt(ctx,'Z/Enter 返回',400,490,{size:13,color:'#7a6030',align:'center'});
  },
};

// ── Load Scene ───────────────────────────────────────────
const LoadScene={
  cursor:0,
  enter(){ this.cursor=0; },
  update(){
    if(Input.up   && this.cursor>0) this.cursor--;
    if(Input.down && this.cursor<3) this.cursor++;
    if(Input.confirm){
      if(this.cursor<3){
        const ok=GS.load(this.cursor);
        if(ok) Game.goScene('world');
      } else { Game.goScene('title'); }
    }
    if(Input.cancel) Game.goScene('title');
  },
  draw(ctx){
    ctx.fillStyle='#08040e'; ctx.fillRect(0,0,800,600);
    panel(ctx,160,80,480,420);
    txt(ctx,'讀取存檔',400,115,{size:22,color:'#ffd700',align:'center',bold:true});
    const slots=Save.slots();
    for(let i=0;i<3;i++){
      const sel=i===this.cursor;
      const y=175+i*90;
      ctx.fillStyle=sel?'rgba(122,92,30,0.35)':'rgba(255,255,255,0.03)';
      ctx.beginPath(); ctx.roundRect(190,y-22,420,70,5); ctx.fill();
      if(sel){ ctx.strokeStyle='#7a5c1e'; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(190,y-22,420,70,5); ctx.stroke(); }
      const d=slots[i];
      if(d){
        txt(ctx,`存檔 ${i+1}`,210,y,{size:14,color:sel?'#ffd700':'#c8a060',bold:true});
        txt(ctx,`地點：${MAPS[d.map]?.name||d.map}`,210,y+22,{size:12,color:'#a08060'});
        txt(ctx,`Lv.${d.party[0]?.lv||1}  金：${d.gold}`,380,y,{size:12,color:'#9a9060'});
      } else {
        txt(ctx,`存檔 ${i+1}  ─  （空）`,210,y+10,{size:14,color:'#5a4a2a'});
      }
    }
    const sel3=this.cursor===3;
    txt(ctx,'返回標題',400,440,{size:16,color:sel3?'#ffd700':'#c8a060',align:'center'});
    txt(ctx,'方向鍵選擇  Z 讀取',400,490,{size:12,color:'#5a4030',align:'center'});
  },
};

// ── World Scene ──────────────────────────────────────────
const WorldScene={
  moveTimer:0,
  stepTimer:0,
  camX:0, camY:0,
  msgTimer:0, msg:'',

  enter(){
    const map=MAPS[GS.map];
    this.camX=GS.player.x*TILE_SZ-400+TILE_SZ/2;
    this.camY=GS.player.y*TILE_SZ-300+TILE_SZ/2;
    this.clampCam(map);
  },

  clampCam(map){
    this.camX=Math.max(0,Math.min(this.camX,map.w*TILE_SZ-800));
    this.camY=Math.max(0,Math.min(this.camY,map.h*TILE_SZ-600));
  },

  showMsg(m,t=120){ this.msg=m; this.msgTimer=t; },

  update(){
    const map=MAPS[GS.map];
    if(this.msgTimer>0){ this.msgTimer--; }
    if(this.moveTimer>0){ this.moveTimer--; return; }

    // Open menu
    if(Input.cancel){ Game.goScene('menu',()=>Game.goScene('world')); return; }

    // Move
    let dx=0,dy=0;
    if(Input.upH)    { dy=-1; GS.player.facing='up'; }
    else if(Input.downH) { dy=1;  GS.player.facing='down'; }
    else if(Input.leftH) { dx=-1; GS.player.facing='left'; }
    else if(Input.rightH){ dx=1;  GS.player.facing='right'; }

    if(dx||dy){
      const nx=GS.player.x+dx, ny=GS.player.y+dy;
      if(this.canMove(map,nx,ny)){
        GS.player.x=nx; GS.player.y=ny;
        this.moveTimer=8;
        this.camX=GS.player.x*TILE_SZ-400+TILE_SZ/2;
        this.camY=GS.player.y*TILE_SZ-300+TILE_SZ/2;
        this.clampCam(map);
        this.stepTimer++;
        // Random encounter
        if(map.enc>0 && this.stepTimer%3===0){
          if(Math.random()<map.enc){ this.startEncounter(map); return; }
        }
        // Check exits
        for(const ex of map.exits||[]){
          if(ex.x===nx&&ex.y===ny){
            GS.map=ex.to;
            GS.player.x=ex.tx; GS.player.y=ex.ty;
            Game.goScene('world'); return;
          }
        }
      }
    }

    // Interact (Z near NPC)
    if(Input.confirm){
      const fx=GS.player.x+(GS.player.facing==='right'?1:GS.player.facing==='left'?-1:0);
      const fy=GS.player.y+(GS.player.facing==='down'?1:GS.player.facing==='up'?-1:0);
      for(const npc of map.npcs||[]){
        if((npc.x===fx&&npc.y===fy)||(npc.x===GS.player.x&&npc.y===GS.player.y)){
          this.interactNPC(npc,map); return;
        }
      }
    }
  },

  canMove(map,x,y){
    if(x<0||y<0||x>=map.w||y>=map.h) return false;
    const t=map.data[y][x];
    if(t===1||t===3||t===4) return false; // wall, tree, water
    return true;
  },

  interactNPC(npc,map){
    if(npc.bossId&&!GS.defeated[npc.bossId]){
      const onBattle=()=>{
        const e=ENEMIES[npc.bossId];
        GS.battleData={
          enemies:[{id:npc.bossId,hp:e.hp,maxHp:e.hp,actIdx:0,status:[]}],
          bgMap:GS.map,isBoss:true,isRandom:false,
          postDlg:npc.bossId==='snakeBoss'?'after_snake':'after_demon',
          onWin:npc.bossId==='demonLord'?'victory':'world',
        };
        Game.goScene('battle');
      };
      if(npc.dlg) Game.goScene('dialogue',npc.dlg,onBattle);
      else onBattle();
      return;
    }
    if(npc.isShop){
      Game.goScene('shop',SHOP_STOCK[npc.stock||GS.map]||SHOP_STOCK.village,()=>Game.goScene('world'));
      return;
    }
    if(npc.isInn){
      Game.goScene('inn',50,()=>Game.goScene('world'));
      return;
    }
    if(npc.joinChar&&!GS.getMember(npc.joinChar)){
      const jc=npc.joinChar;
      Game.goScene('dialogue',npc.dlg,()=>{
        GS.addMember(jc);
        WorldScene.showMsg((CHAR_BASE[jc]?.name||jc)+' 加入了隊伍！');
        Game.goScene('world');
      });
      return;
    }
    if(npc.dlg&&DLGS[npc.dlg]){
      Game.goScene('dialogue',npc.dlg,()=>Game.goScene('world'));
    }
  },

  startEncounter(map){
    const pool=map.enemies||['wolf'];
    const id=pool[Math.floor(Math.random()*pool.length)];
    const count=Math.random()<0.3?2:1;
    const enemies=[];
    for(let i=0;i<count;i++){
      const e=ENEMIES[id];
      enemies.push({id,hp:e.hp,maxHp:e.hp,actIdx:0,status:[]});
    }
    GS.battleData={enemies,bgMap:GS.map,onWin:'world',isRandom:true,isBoss:false};
    Game.goScene('battle');
  },

  draw(ctx){
    const map=MAPS[GS.map];
    ctx.save(); ctx.translate(-this.camX,-this.camY);
    this.drawTiles(ctx,map);
    this.drawNPCs(ctx,map);
    this.drawPlayer(ctx);
    ctx.restore();
    this.drawHUD(ctx);
    if(this.msgTimer>0){
      panel(ctx,180,260,440,50);
      txt(ctx,this.msg,400,285,{size:14,align:'center',color:'#ffd700'});
    }
  },

  drawTiles(ctx,map){
    const startX=Math.floor(this.camX/TILE_SZ),startY=Math.floor(this.camY/TILE_SZ);
    const endX=Math.min(map.w,startX+22),endY=Math.min(map.h,startY+17);
    for(let y=startY;y<endY;y++){
      for(let x=startX;x<endX;x++){
        const t=map.data[y][x];
        const cols=TILE_COLORS[t]||['#333','#444'];
        const px=x*TILE_SZ, py=y*TILE_SZ;
        ctx.fillStyle=cols[(x+y)%2]; ctx.fillRect(px,py,TILE_SZ,TILE_SZ);
        // details
        if(t===3){
          ctx.fillStyle='#0d2208';
          ctx.beginPath(); ctx.moveTo(px+TILE_SZ/2,py+4); ctx.lineTo(px+4,py+TILE_SZ-4); ctx.lineTo(px+TILE_SZ-4,py+TILE_SZ-4); ctx.closePath(); ctx.fill();
          ctx.fillStyle='#2a5810';
          ctx.beginPath(); ctx.moveTo(px+TILE_SZ/2,py+2); ctx.lineTo(px+6,py+TILE_SZ-6); ctx.lineTo(px+TILE_SZ-6,py+TILE_SZ-6); ctx.closePath(); ctx.fill();
        } else if(t===4){
          ctx.fillStyle='rgba(50,120,220,0.25)';
          ctx.fillRect(px,py,TILE_SZ,TILE_SZ);
        } else if(t===1){
          ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1;
          ctx.strokeRect(px,py,TILE_SZ,TILE_SZ);
        } else if(t===6){
          ctx.strokeStyle='#c8a020'; ctx.lineWidth=2;
          ctx.strokeRect(px+2,py+2,TILE_SZ-4,TILE_SZ-4);
        }
      }
    }
  },

  drawNPCs(ctx,map){
    for(const npc of map.npcs||[]){
      if(!npc.name) continue;
      if(npc.bossId&&GS.defeated[npc.bossId]) continue;
      if(npc.joinChar&&GS.getMember(npc.joinChar)) continue;
      const px=npc.x*TILE_SZ+TILE_SZ/2;
      const py=npc.y*TILE_SZ+TILE_SZ/2;
      drawSprite(ctx,'sword',px,py,10,npc.color||C.npc);
      txt(ctx,npc.name,px,py-28,{size:10,align:'center',color:'#e8c060',shadow:true});
    }
    // Party members in world (after leader)
    if(GS.party.length>1){
      for(let i=1;i<GS.party.length;i++){
        const m=GS.party[i];
        const offset=i*6;
        const px=GS.player.x*TILE_SZ+TILE_SZ/2-offset;
        const py=GS.player.y*TILE_SZ+TILE_SZ/2+offset;
        drawSprite(ctx,m.shape,px,py,9,m.color);
      }
    }
  },

  drawPlayer(ctx){
    const px=GS.player.x*TILE_SZ+TILE_SZ/2;
    const py=GS.player.y*TILE_SZ+TILE_SZ/2;
    // shadow
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px,py+8,10,4,0,0,Math.PI*2); ctx.fill();
    drawSprite(ctx,GS.party[0]?.shape||'sword',px,py,11,GS.party[0]?.color||'#4a9eff');
  },

  drawHUD(ctx){
    // Map name
    panel(ctx,10,10,160,30);
    txt(ctx,MAPS[GS.map]?.name||GS.map,90,25,{size:13,align:'center',color:'#e8c060'});
    // Gold
    panel(ctx,10,48,160,30);
    txt(ctx,'金幣 '+GS.gold,90,63,{size:13,align:'center',color:'#ffd700'});
    // Mini party HUD
    for(let i=0;i<GS.party.length;i++){
      const m=GS.party[i]; const y=10+i*56;
      panel(ctx,630,y,160,50);
      txt(ctx,m.name,640,y+13,{size:11,color:m.dead?'#888':'#f0e6c8'});
      txt(ctx,'Lv.'+m.lv,760,y+13,{size:10,color:'#a09060',align:'right'});
      bar(ctx,640,y+26,140,7,m.hp,m.maxHp,'#e05050');
      txt(ctx,'HP',640,y+40,{size:9,color:'#c84040'});
      txt(ctx,m.hp+'/'+m.maxHp,760,y+40,{size:9,color:'#a08060',align:'right'});
    }
    // Controls hint
    txt(ctx,'X/Esc 選單  Z 互動',400,586,{size:11,color:'#4a3a1a',align:'center'});
  },
};
