// ═══════════════════════════════════════════════════════
//  Part 4: Battle System
// ═══════════════════════════════════════════════════════

const BattleScene={
  // phases: 'start'|'playerTurn'|'actionMenu'|'skillMenu'|'itemMenu'|'targetMenu'|'anim'|'enemyTurn'|'result'|'levelup'|'escape'
  phase:'start',
  cursor:0, subCursor:0, targetCursor:0,
  activeIdx:0,   // which party member's turn
  turnOrder:[],
  log:[],        // battle log lines
  logTimer:0,
  animTimer:0,
  animData:null, // {type, src, tgts, dmgs, skill}
  resultData:null,
  levelupQueue:[],
  flashTimers:{}, // enemyIdx or partyIdx -> timer
  escapeFail:false,
  winFlag:false,
  loseFlag:false,

  ACTIONS:['攻擊','技能','道具','防禦','逃跑'],

  enter(){
    this.phase='start';
    this.cursor=0; this.subCursor=0; this.targetCursor=0;
    this.log=[]; this.logTimer=60;
    this.flashTimers={}; this.animTimer=0;
    this.escapeFail=false; this.winFlag=false; this.loseFlag=false;
    const bd=GS.battleData;
    // Reset party status for new battle
    for(const m of GS.party){ m.status=m.status.filter(s=>s==='poison'); }
    this.buildTurnOrder();
    this.addLog('⚔️ 戰鬥開始！'+(bd.enemies.length>1?` ${bd.enemies.length} 隻敵人！`:''));
    this.nextTurn();
  },

  buildTurnOrder(){
    // Simple: party goes first, then enemies each round
    this.turnOrder=[];
    this.activeIdx=0;
  },

  addLog(msg){ this.log.push(msg); if(this.log.length>5) this.log.shift(); },

  update(){
    if(this.logTimer>0){ this.logTimer--; }
    // flash timers
    for(const k in this.flashTimers){ if(this.flashTimers[k]>0) this.flashTimers[k]--; }

    if(this.phase==='start'){
      if(this.logTimer<=0){ this.phase='playerTurn'; this.cursor=0; }
      return;
    }
    if(this.phase==='anim'){
      this.animTimer--;
      if(this.animTimer<=0){ this.afterAnim(); }
      return;
    }
    if(this.phase==='result'||this.phase==='levelup'){
      this.updateResult(); return;
    }
    if(this.phase==='enemyTurn'){
      this.logTimer--;
      if(this.logTimer<=0){ this.doEnemyTurn(); }
      return;
    }
    if(this.phase==='escape'){ this.updateEscape(); return; }
    if(this.phase==='playerTurn') this.updatePlayerTurn();
    if(this.phase==='actionMenu') this.updateActionMenu();
    if(this.phase==='skillMenu')  this.updateSkillMenu();
    if(this.phase==='itemMenu')   this.updateItemMenu();
    if(this.phase==='targetMenu') this.updateTargetMenu();
  },

  updatePlayerTurn(){
    // find next alive party member
    const alive=GS.party.filter(m=>!m.dead);
    if(!alive.length){ this.endBattle(false); return; }
    this.phase='actionMenu'; this.cursor=0;
    this.addLog(`${GS.party[this.activeIdx].name} 的回合`);
    this.logTimer=30;
  },

  nextTurn(){
    // cycle through party, then enemy, then next round
    const aliveParty=GS.party.filter(m=>!m.dead);
    if(!aliveParty.length){ this.endBattle(false); return; }
    const aliveEnemy=GS.battleData.enemies.filter(e=>e.hp>0);
    if(!aliveEnemy.length){ this.endBattle(true); return; }
    // tick poison for party
    for(const m of GS.party){
      if(m.status.includes('poison')&&!m.dead){
        const dmg=Math.max(1,Math.floor(m.maxHp*0.07));
        m.hp=Math.max(0,m.hp-dmg);
        this.addLog(`${m.name} 中毒受到 ${dmg} 傷害！`);
        if(m.hp===0){ m.dead=true; this.addLog(`${m.name} 昏倒了！`); }
      }
    }
    // find next alive party member
    let found=false;
    for(let i=0;i<GS.party.length;i++){
      if(!GS.party[i].dead){ this.activeIdx=i; found=true; break; }
    }
    if(!found){ this.endBattle(false); return; }
    this.phase='actionMenu'; this.cursor=0;
    this.addLog(`${GS.party[this.activeIdx].name} 的回合`);
    this.logTimer=20;
  },

  updateActionMenu(){
    if(Input.up   && this.cursor>0) this.cursor--;
    if(Input.down && this.cursor<this.ACTIONS.length-1) this.cursor++;
    if(Input.cancel){ this.cursor=0; return; }
    if(Input.confirm){ this.chooseAction(); }
  },

  chooseAction(){
    const act=this.ACTIONS[this.cursor];
    const m=GS.party[this.activeIdx];
    if(act==='攻擊'){
      this.phase='targetMenu'; this.targetCursor=0;
      this._pendingAction={type:'attack'};
    } else if(act==='技能'){
      if(m.skills.length){ this.phase='skillMenu'; this.subCursor=0; }
    } else if(act==='道具'){
      const useables=Object.entries(GS.inventory).filter(([id])=>ITEMS[id]?.cat==='use');
      if(useables.length){ this.phase='itemMenu'; this.subCursor=0; }
      else this.addLog('沒有可用的道具！');
    } else if(act==='防禦'){
      m.status.push('defend');
      this.addLog(`${m.name} 進入防禦姿態！`);
      this.afterPartyAction();
    } else if(act==='逃跑'){
      this.tryEscape();
    }
  },

  updateSkillMenu(){
    const m=GS.party[this.activeIdx];
    const sk=m.skills;
    if(Input.up   && this.subCursor>0) this.subCursor--;
    if(Input.down && this.subCursor<sk.length-1) this.subCursor++;
    if(Input.cancel){ this.phase='actionMenu'; return; }
    if(Input.confirm){
      const skId=sk[this.subCursor];
      const skill=SKILLS[skId];
      if(m.mp<skill.mp){ this.addLog('靈力不足！'); return; }
      this._pendingAction={type:'skill',skId};
      if(skill.tgt==='all'||(skill.type==='heal'&&skill.tgt==='all')){
        this.executeAction(this._pendingAction,-1); // -1 = all
      } else if(skill.type==='heal'){
        this.phase='targetMenu'; this.targetCursor=0; this._pendingAction.healParty=true;
      } else {
        this.phase='targetMenu'; this.targetCursor=0;
      }
    }
  },

  updateItemMenu(){
    const useables=Object.entries(GS.inventory).filter(([id])=>ITEMS[id]?.cat==='use');
    if(Input.up   && this.subCursor>0) this.subCursor--;
    if(Input.down && this.subCursor<useables.length-1) this.subCursor++;
    if(Input.cancel){ this.phase='actionMenu'; return; }
    if(Input.confirm){
      const [itemId]=useables[this.subCursor];
      this._pendingAction={type:'item',itemId};
      this.phase='targetMenu'; this.targetCursor=0; this._pendingAction.healParty=true;
    }
  },

  updateTargetMenu(){
    const pa=this._pendingAction;
    const isHeal=pa.healParty;
    const targets=isHeal?GS.party:GS.battleData.enemies.filter(e=>e.hp>0);
    if(Input.up   && this.targetCursor>0) this.targetCursor--;
    if(Input.down && this.targetCursor<targets.length-1) this.targetCursor++;
    if(Input.cancel){ this.phase=pa.type==='skill'?'skillMenu':pa.type==='item'?'itemMenu':'actionMenu'; return; }
    if(Input.confirm){ this.executeAction(pa,this.targetCursor); }
  },

  executeAction(action,tgtIdx){
    const m=GS.party[this.activeIdx];
    const aliveEnemies=GS.battleData.enemies.filter(e=>e.hp>0);
    let dmgs=[], tgts=[], msgs=[];

    if(action.type==='attack'){
      const en=aliveEnemies[tgtIdx];
      const st=calcStats(m);
      const crit=Math.random()<(st.luk/200+0.05);
      let dmg=Math.max(1,Math.floor(st.atk*1.0-en.hp*0.05));
      dmg=Math.max(1,Math.floor(dmg*(crit?1.7:1)*(0.85+Math.random()*0.3)));
      en.hp=Math.max(0,en.hp-dmg);
      dmgs=[dmg]; tgts=[{isEnemy:true,idx:GS.battleData.enemies.indexOf(en)}];
      msgs=[`${m.name} 攻擊 ${ENEMIES[en.id].name} 造成 ${dmg}${crit?' 暴擊！':''} 傷害！`];
      this.flashTimers[`e${GS.battleData.enemies.indexOf(en)}`]=12;

    } else if(action.type==='skill'){
      const skill=SKILLS[action.skId];
      m.mp=Math.max(0,m.mp-skill.mp);
      const st=calcStats(m);

      if(skill.type==='heal'){
        const healTargets=tgtIdx===-1?GS.party:[GS.party[tgtIdx]];
        for(const t of healTargets){
          const heal=Math.floor(st.atk*skill.pow*(0.9+Math.random()*0.2));
          t.hp=Math.min(t.maxHp,t.hp+heal);
          msgs.push(`${t.name} 恢復 ${heal} 生命值！`);
        }
      } else {
        const enTargets=tgtIdx===-1?aliveEnemies:[aliveEnemies[tgtIdx]];
        for(const en of enTargets){
          const crit=Math.random()<(st.luk/150+0.05);
          let dmg=Math.max(1,Math.floor(st.atk*skill.pow*(0.9+Math.random()*0.2)));
          if(skill.pierce) dmg=Math.floor(dmg*(1+skill.pierce));
          if(crit) dmg=Math.floor(dmg*1.6);
          en.hp=Math.max(0,en.hp-dmg);
          const ei=GS.battleData.enemies.indexOf(en);
          this.flashTimers[`e${ei}`]=12;
          dmgs.push(dmg);
          tgts.push({isEnemy:true,idx:ei});
          msgs.push(`${ENEMIES[en.id].name} 受到 ${dmg}${crit?' 暴擊！':''} 傷害！`);
          // debuff
          if(skill.debuff&&Math.random()<0.6){
            for(const [k,v] of Object.entries(skill.debuff)){
              if(!en.status) en.status=[];
              if(!en.status.includes(k)) for(let x=0;x<v;x++) en.status.push(k);
              msgs.push(`${ENEMIES[en.id].name} 陷入${k==='poison'?'中毒':'異常'}狀態！`);
            }
          }
        }
      }
      msgs.unshift(`${m.name} 使用 ${skill.name}！`);

    } else if(action.type==='item'){
      const it=ITEMS[action.itemId];
      GS.removeItem(action.itemId);
      const t=GS.party[tgtIdx];
      if(it.hp){ t.hp=Math.min(t.maxHp,t.hp+it.hp); msgs.push(`${t.name} 恢復 ${it.hp} 生命值！`); }
      if(it.mp){ t.mp=Math.min(t.maxMp||t.mp,t.mp+it.mp); msgs.push(`${t.name} 恢復 ${it.mp} 靈力！`); }
      if(it.revive&&t.dead){ t.dead=false; t.hp=Math.floor(t.maxHp*(it.revive/100)); msgs.push(`${t.name} 甦醒了！`); }
      msgs.unshift(`${m.name} 使用 ${it.name}！`);
    }

    for(const msg of msgs) this.addLog(msg);
    this.animTimer=40; this.phase='anim';
    this._postAnim=()=>{ this.afterPartyAction(); };
  },

  afterAnim(){
    // Check if all enemies dead
    const aliveEnemy=GS.battleData.enemies.filter(e=>e.hp>0);
    if(!aliveEnemy.length){ this.endBattle(true); return; }
    const aliveParty=GS.party.filter(m=>!m.dead);
    if(!aliveParty.length){ this.endBattle(false); return; }
    if(this._postAnim){ const fn=this._postAnim; this._postAnim=null; fn(); }
  },

  afterPartyAction(){
    // Move to next party member or enemy turn
    let nextIdx=-1;
    for(let i=this.activeIdx+1;i<GS.party.length;i++){
      if(!GS.party[i].dead){ nextIdx=i; break; }
    }
    if(nextIdx!==-1){
      this.activeIdx=nextIdx;
      this.phase='actionMenu'; this.cursor=0;
      this.addLog(`${GS.party[this.activeIdx].name} 的回合`);
      this.logTimer=20;
    } else {
      // Enemy turn
      this.activeIdx=0;
      this.phase='enemyTurn';
      this.logTimer=35;
    }
  },

  doEnemyTurn(){
    const aliveEnemies=GS.battleData.enemies.filter(e=>e.hp>0);
    const aliveParty=GS.party.filter(m=>!m.dead);
    if(!aliveEnemies.length||!aliveParty.length){ this.nextTurn(); return; }

    let msgs=[];
    for(const en of aliveEnemies){
      // tick enemy poison
      if(en.status&&en.status.includes('poison')){
        const pdmg=Math.max(1,Math.floor(en.maxHp*0.06));
        en.hp=Math.max(0,en.hp-pdmg);
        msgs.push(`${ENEMIES[en.id].name} 中毒受到 ${pdmg} 傷害！`);
        if(en.hp===0) continue;
      }
      if(en.status&&en.status.includes('stun')){
        en.status=en.status.filter(s=>s!=='stun');
        msgs.push(`${ENEMIES[en.id].name} 被暈眩，無法行動！`); continue;
      }
      const eData=ENEMIES[en.id];
      const actName=eData.acts[en.actIdx%eData.acts.length];
      en.actIdx=(en.actIdx||0)+1;
      const act=ENEMY_ACTS[actName];
      if(!act) continue;

      if(act.type==='atk'){
        const tgt=aliveParty[Math.floor(Math.random()*aliveParty.length)];
        const pi=GS.party.indexOf(tgt);
        const st=calcStats(tgt);
        const defending=tgt.status.includes('defend');
        let dmg=Math.max(1,Math.floor(eData.atk*act.pow*(0.85+Math.random()*0.3)));
        if(defending) dmg=Math.floor(dmg*0.5);
        dmg=Math.max(1,dmg-Math.floor(st.def*0.5));
        tgt.hp=Math.max(0,tgt.hp-dmg);
        this.flashTimers[`p${pi}`]=12;
        msgs.push(`${eData.name} 使用 ${act.name}，${tgt.name} 受到 ${dmg} 傷害！`);
        if(tgt.hp===0){ tgt.dead=true; msgs.push(`${tgt.name} 昏倒了！`); }
        if(act.debuff&&Math.random()<0.5){
          for(const [k] of Object.entries(act.debuff)){
            if(!tgt.status.includes(k)) tgt.status.push(k);
          }
        }
      } else if(act.type==='selfheal'){
        en.hp=Math.min(en.maxHp,en.hp+(act.val||80));
        msgs.push(`${eData.name} 恢復了體力！`);
      } else if(act.type==='self'){
        if(act.buff?.atk){ eData.atk+=act.buff.atk; msgs.push(`${eData.name} 攻擊力提升！`); }
      } else if(act.type==='debuff'){
        const tgt=aliveParty[Math.floor(Math.random()*aliveParty.length)];
        tgt.status.push('atkDown');
        msgs.push(`${eData.name} 詛咒了 ${tgt.name}！`);
      } else if(act.type==='atk'&&act.tgt==='all'){
        for(const tgt of aliveParty){
          const st=calcStats(tgt);
          let dmg=Math.max(1,Math.floor(eData.atk*act.pow*(0.8+Math.random()*0.4)-st.def*0.4));
          tgt.hp=Math.max(0,tgt.hp-dmg);
          if(tgt.hp===0){ tgt.dead=true; }
        }
        msgs.push(`${eData.name} 使用 ${act.name}，全體受到傷害！`);
      }
      // clear defend
      tgt_clear: for(const m of GS.party){ m.status=m.status.filter(s=>s!=='defend'); }
    }

    for(const msg of msgs) this.addLog(msg);
    this.animTimer=50; this.phase='anim';
    this._postAnim=()=>{
      const aliveParty=GS.party.filter(m=>!m.dead);
      if(!aliveParty.length){ this.endBattle(false); return; }
      const aliveEnemy=GS.battleData.enemies.filter(e=>e.hp>0);
      if(!aliveEnemy.length){ this.endBattle(true); return; }
      // Start next round from first alive party member
      this.activeIdx=0;
      for(let i=0;i<GS.party.length;i++){ if(!GS.party[i].dead){ this.activeIdx=i; break; } }
      this.phase='actionMenu'; this.cursor=0;
      this.addLog(`${GS.party[this.activeIdx].name} 的回合`);
      this.logTimer=20;
    };
  },

  tryEscape(){
    const bd=GS.battleData;
    if(bd.isBoss){ this.addLog('無法從Boss戰中逃跑！'); return; }
    if(Math.random()<0.55){
      this.addLog('成功逃跑！');
      this.animTimer=40; this.phase='anim';
      this._postAnim=()=>{ Game.goScene('world'); };
    } else {
      this.addLog('逃跑失敗！');
      this.afterPartyAction();
    }
  },

  endBattle(win){
    const bd=GS.battleData;
    if(win){
      let totalExp=0,totalGold=0;
      const drops=[];
      for(const en of bd.enemies){
        const eData=ENEMIES[en.id];
        totalExp+=eData.exp; totalGold+=eData.gold+Math.floor(Math.random()*eData.gold*0.3);
        for(const dr of eData.drops||[]){
          if(Math.random()<dr.r){ drops.push(dr.id); GS.addItem(dr.id); }
        }
      }
      GS.gold+=totalGold;
      const aliveParty=GS.party.filter(m=>!m.dead);
      const expEach=Math.floor(totalExp/aliveParty.length);
      for(const m of aliveParty) m.exp+=expEach;
      // Check level ups
      const lvUps=[];
      for(const m of GS.party){
        while(m.exp>=expForLevel(m.lv)&&m.lv<50){
          m.exp-=expForLevel(m.lv);
          const oldLv=m.lv;
          GS.levelUp(m);
          lvUps.push({member:m,newLv:m.lv});
        }
      }
      // Boss flag
      if(bd.enemies[0]&&ENEMIES[bd.enemies[0].id]?.isBoss){
        GS.defeated[bd.enemies[0].id]=true;
      }
      this.resultData={win:true,exp:expEach,gold:totalGold,drops,lvUps};
      this.phase='result'; this.cursor=0;
    } else {
      this.resultData={win:false};
      this.phase='result'; this.cursor=0;
    }
  },

  updateResult(){
    if(this.phase==='result'){
      if(Input.confirm||Input.cancel){
        const rd=this.resultData;
        if(!rd.win){ Game.goScene('gameover'); return; }
        if(rd.lvUps&&rd.lvUps.length){
          this.levelupQueue=[...rd.lvUps];
          this.phase='levelup'; return;
        }
        this.afterBattle();
      }
    } else if(this.phase==='levelup'){
      if(Input.confirm||Input.cancel){
        this.levelupQueue.shift();
        if(!this.levelupQueue.length) this.afterBattle();
      }
    }
  },

  afterBattle(){
    const bd=GS.battleData;
    if(bd.postDlg&&DLGS[bd.postDlg]){
      Game.goScene('dialogue',bd.postDlg,()=>Game.goScene(bd.onWin||'world'));
      return;
    }
    Game.goScene(bd.onWin||'world');
  },

  updateEscape(){ if(Input.confirm) Game.goScene('world'); },

  draw(ctx){
    const bd=GS.battleData;
    const W=800,H=600;
    // Background
    this.drawBG(ctx,W,H);
    // Enemies
    const aliveEn=bd.enemies.filter(e=>e.hp>0);
    const enCount=aliveEn.length;
    for(let i=0;i<enCount;i++){
      const en=aliveEn[i];
      const ex=W*0.55+((i-(enCount-1)/2)*140);
      const ey=H*0.38;
      const flash=this.flashTimers[`e${bd.enemies.indexOf(en)}`]>0;
      drawEnemy(ctx,en.id,ex,ey,en.hp,en.maxHp,flash);
    }
    // Party sprites (battle formation, left side)
    for(let i=0;i<GS.party.length;i++){
      const m=GS.party[i];
      const px=130-i*10, py=220+i*80;
      if(m.dead){ ctx.globalAlpha=0.3; }
      const flash=this.flashTimers[`p${i}`]>0;
      if(flash){ ctx.globalAlpha=0.5; }
      drawSprite(ctx,m.shape,px,py,14,m.color);
      ctx.globalAlpha=1;
    }
    // Party status panel
    panel(ctx,0,400,300,198);
    for(let i=0;i<GS.party.length;i++){
      const m=GS.party[i]; const py=412+i*60;
      txt(ctx,m.name,12,py,{size:13,color:m.dead?'#666':i===this.activeIdx&&(this.phase==='actionMenu'||this.phase==='skillMenu'||this.phase==='itemMenu'||this.phase==='targetMenu')?'#ffd700':'#f0e6c8',bold:i===this.activeIdx});
      txt(ctx,'Lv.'+m.lv,100,py,{size:11,color:'#9a8060'});
      const st=calcStats(m);
      txt(ctx,`HP ${m.hp}/${m.maxHp}`,12,py+16,{size:11,color:'#e05050'});
      bar(ctx,80,py+10,210,8,m.hp,m.maxHp,'#e05050');
      txt(ctx,`MP ${m.mp}/${st.maxMp}`,12,py+30,{size:11,color:'#5080e8'});
      bar(ctx,80,py+24,210,8,m.mp,st.maxMp,'#5080e8');
      if(m.status.length){
        const stStr=m.status.filter((v,i,a)=>a.indexOf(v)===i).join(' ');
        txt(ctx,stStr,250,py,{size:10,color:'#c850c8'});
      }
    }
    // Action menus
    if(this.phase==='actionMenu') this.drawActionMenu(ctx);
    else if(this.phase==='skillMenu') this.drawSkillMenu(ctx);
    else if(this.phase==='itemMenu') this.drawItemMenu(ctx);
    else if(this.phase==='targetMenu') this.drawTargetMenu(ctx);
    // Battle log
    panel(ctx,300,520,500,78);
    for(let i=0;i<this.log.length;i++){
      txt(ctx,this.log[this.log.length-1-i],310,592-(i*14),{size:11,color:i===0?'#f0e6c8':'#8a7a5a'});
    }
    // Result overlay
    if(this.phase==='result') this.drawResult(ctx);
    if(this.phase==='levelup') this.drawLevelup(ctx);
  },

  drawBG(ctx,W,H){
    const map=GS.battleData?.bgMap||'village';
    const grd=ctx.createLinearGradient(0,0,0,H);
    if(map==='castle'){ grd.addColorStop(0,'#1a0408'); grd.addColorStop(1,'#300808'); }
    else if(map==='forest'){ grd.addColorStop(0,'#080e04'); grd.addColorStop(1,'#0e1a08'); }
    else { grd.addColorStop(0,'#080c18'); grd.addColorStop(1,'#0c1428'); }
    ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);
    // ground
    ctx.fillStyle=map==='castle'?'#1a0c08':map==='forest'?'#0c1a08':'#0c1020';
    ctx.fillRect(0,H*0.55,W,H*0.45);
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,H*0.55); ctx.lineTo(W,H*0.55); ctx.stroke();
  },

  drawActionMenu(ctx){
    panel(ctx,302,400,196,118);
    txt(ctx,'命令',400,415,{size:13,color:'#e8c060',align:'center',bold:true});
    const cols=['#f0e6c8','#f0e6c8','#f0e6c8','#50c878','#e05050'];
    for(let i=0;i<this.ACTIONS.length;i++){
      const sel=i===this.cursor;
      if(sel){
        ctx.fillStyle='rgba(122,92,30,0.4)';
        ctx.fillRect(308,424+i*17,180,16);
      }
      txt(ctx,(sel?'▶ ':' ')+this.ACTIONS[i],320,432+i*17,{size:12,color:cols[i]});
    }
  },

  drawSkillMenu(ctx){
    const m=GS.party[this.activeIdx];
    panel(ctx,302,350,280,170);
    txt(ctx,'技能',442,365,{size:13,color:'#e8c060',align:'center',bold:true});
    for(let i=0;i<m.skills.length;i++){
      const sk=SKILLS[m.skills[i]]; if(!sk) continue;
      const sel=i===this.subCursor;
      if(sel){ ctx.fillStyle='rgba(122,92,30,0.4)'; ctx.fillRect(308,374+i*22,266,20); }
      const mpOk=m.mp>=sk.mp;
      txt(ctx,(sel?'▶ ':' ')+sk.name,318,384+i*22,{size:12,color:sel?'#ffd700':'#d0c090'});
      txt(ctx,`MP:${sk.mp}`,520,384+i*22,{size:11,color:mpOk?'#5080e8':'#884040',align:'right'});
    }
    txt(ctx,SKILLS[m.skills[this.subCursor]]?.desc||'',442,500,{size:10,color:'#8a7a5a',align:'center'});
  },

  drawItemMenu(ctx){
    const useables=Object.entries(GS.inventory).filter(([id])=>ITEMS[id]?.cat==='use');
    panel(ctx,302,350,280,170);
    txt(ctx,'道具',442,365,{size:13,color:'#e8c060',align:'center',bold:true});
    for(let i=0;i<useables.length;i++){
      const [id,cnt]=useables[i]; const it=ITEMS[id];
      const sel=i===this.subCursor;
      if(sel){ ctx.fillStyle='rgba(122,92,30,0.4)'; ctx.fillRect(308,374+i*22,266,20); }
      txt(ctx,(sel?'▶ ':' ')+it.name,318,384+i*22,{size:12,color:sel?'#ffd700':'#d0c090'});
      txt(ctx,'x'+cnt,560,384+i*22,{size:11,color:'#9a8060',align:'right'});
    }
  },

  drawTargetMenu(ctx){
    const pa=this._pendingAction;
    const isHeal=pa.healParty;
    const targets=isHeal?GS.party:GS.battleData.enemies.filter(e=>e.hp>0);
    panel(ctx,302,350,280,120);
    txt(ctx,'選擇目標',442,365,{size:13,color:'#e8c060',align:'center',bold:true});
    for(let i=0;i<targets.length;i++){
      const t=targets[i]; const sel=i===this.targetCursor;
      if(sel){ ctx.fillStyle='rgba(122,92,30,0.4)'; ctx.fillRect(308,374+i*24,266,22); }
      const name=isHeal?t.name:ENEMIES[t.id].name;
      const hp=isHeal?`${t.hp}/${t.maxHp}`:`${t.hp}/${t.maxHp}`;
      txt(ctx,(sel?'▶ ':' ')+name,318,385+i*24,{size:12,color:sel?'#ffd700':'#d0c090'});
      txt(ctx,'HP:'+hp,560,385+i*24,{size:11,color:'#9a6060',align:'right'});
    }
  },

  drawResult(ctx){
    const rd=this.resultData;
    panel(ctx,200,160,400,280);
    if(rd.win){
      txt(ctx,'戰鬥勝利！',400,190,{size:24,color:'#ffd700',align:'center',bold:true,shadow:true});
      txt(ctx,`獲得 EXP: ${rd.exp}`,400,228,{size:16,color:'#50c878',align:'center'});
      txt(ctx,`獲得金幣: ${rd.gold}`,400,252,{size:16,color:'#ffd700',align:'center'});
      if(rd.drops.length){
        txt(ctx,'獲得道具: '+rd.drops.map(id=>ITEMS[id]?.name||id).join('、'),400,276,{size:13,color:'#c8a060',align:'center'});
      }
    } else {
      txt(ctx,'隊伍全滅…',400,195,{size:24,color:'#e05050',align:'center',bold:true,shadow:true});
      txt(ctx,'旅途在此終結。',400,240,{size:15,color:'#a08060',align:'center'});
    }
    txt(ctx,'按 Z/Enter 繼續',400,410,{size:13,color:'#7a6030',align:'center'});
  },

  drawLevelup(ctx){
    const lv=this.levelupQueue[0]; if(!lv) return;
    panel(ctx,200,160,400,240);
    ctx.save(); ctx.shadowColor='#ffd700'; ctx.shadowBlur=20;
    txt(ctx,'等級提升！',400,195,{size:22,color:'#ffd700',align:'center',bold:true});
    ctx.restore();
    txt(ctx,`${lv.member.name}  Lv. ${lv.newLv-1} → ${lv.newLv}`,400,230,{size:16,color:'#f0e6c8',align:'center'});
    const g=GROWTH[lv.member.id]||{hp:8,mp:4,atk:2,def:1,spd:1,luk:1};
    txt(ctx,`HP+${g.hp}  MP+${g.mp}  ATK+${g.atk}  DEF+${g.def}`,400,264,{size:13,color:'#50c878',align:'center'});
    txt(ctx,'按 Z/Enter 繼續',400,370,{size:13,color:'#7a6030',align:'center'});
  },
};
