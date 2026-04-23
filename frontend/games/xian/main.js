// ═══════════════════════════════════════════════════════
//  Part 6: Game Orchestrator + Main Loop
// ═══════════════════════════════════════════════════════

const Game = {
  scene: null,

  // goScene('title'|'about'|'load'|'world'|'battle'|'gameover'|'victory')
  // goScene('dialogue', dlgId, onDone)
  // goScene('shop',     stockArray, onDone)
  // goScene('inn',      cost, onDone)
  // goScene('menu',     onClose)
  goScene(name, a, b){
    switch(name){
      case 'title':    this.scene=TitleScene;              TitleScene.enter?.();    break;
      case 'about':    this.scene=AboutScene;              AboutScene.enter?.();    break;
      case 'load':     this.scene=LoadScene;               LoadScene.enter?.();     break;
      case 'world':    this.scene=WorldScene;              WorldScene.enter?.();    break;
      case 'battle':   this.scene=BattleScene;             BattleScene.enter?.();   break;
      case 'gameover': this.scene=new GameOverScene();                              break;
      case 'victory':  this.scene=new VictoryScene();                              break;
      case 'dialogue': this.scene=new DialogueScene(a,b);                          break;
      case 'shop':     this.scene=new ShopScene(a,b);                              break;
      case 'inn':      this.scene=new InnScene(a,b);                               break;
      case 'menu':     this.scene=new MenuScene(a);                                break;
    }
  },

  update(){ Input.tick(); if(this.scene) this.scene.update(); },
  draw(ctx){ if(this.scene) this.scene.draw(ctx); },
};

// ─────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────
(function(){
  const canvas=document.getElementById('game-canvas');
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  Input.init();
  GS.init();
  Game.goScene('title');
  function loop(){
    try {
      ctx.clearRect(0,0,800,600);
      Game.update();
      Game.draw(ctx);
    } catch(e) {
      console.error('[仙俠傳] loop error:', e);
      ctx.fillStyle='#08060e'; ctx.fillRect(0,0,800,600);
      ctx.fillStyle='#e05050'; ctx.font='bold 16px serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('載入錯誤，請重新整理頁面', 400, 300);
      ctx.fillStyle='#9a8060'; ctx.font='12px monospace';
      ctx.fillText(String(e).slice(0,80), 400, 330);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
