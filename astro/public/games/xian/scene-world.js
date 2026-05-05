'use strict';

const TILE_SZ = 48;

// ── Tile renderer ──────────────────────────────────────────
function drawTile(g, type, x, y, sz) {
  const s = sz, hs = sz/2;

  if (type === 0) { // Path — sandy cobblestone
    g.fillStyle(0x8a7348, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x6e5c38, 0.4);
    g.fillRect(x+2, y+2, s/2-3, s/2-3);
    g.fillRect(x+s/2+1, y+s/2+1, s/2-3, s/2-3);
    g.fillStyle(0xa08850, 0.3);
    g.fillRect(x+s/2+1, y+2, s/2-3, s/2-3);
    g.fillRect(x+2, y+s/2+1, s/2-3, s/2-3);
    g.lineStyle(1, 0x5a4828, 0.3);
    g.strokeRect(x, y, s, s);
  } else if (type === 1) { // Wall — dark stone bricks
    g.fillStyle(0x2c1e12, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x3e2a1a, 0.8);
    // Brick rows
    g.fillRect(x+1, y+1, s-2, s/3-2);
    g.fillRect(x+s/4, y+s/3, s*3/4-1, s/3-2);
    g.fillRect(x+1, y+s*2/3, s/2-2, s/3-2);
    g.fillStyle(0x1a100a, 0.5);
    g.fillRect(x, y+s/3, s, 2);
    g.fillRect(x, y+s*2/3, s, 2);
    // Mortar lines
    g.fillRect(x+s/2, y, 2, s/3);
    g.fillRect(x+s/4, y+s/3, 2, s/3);
    g.fillRect(x+s*3/4, y+s/3, 2, s/3);
    g.fillRect(x+s/2, y+s*2/3, 2, s/3);
    // Top highlight
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(x, y, s, 2);
  } else if (type === 2) { // Grass — rich green
    g.fillStyle(0x3a6c1a, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x4a8a22, 0.6);
    g.fillRect(x+3, y+4, 7, 5); g.fillRect(x+s-12, y+3, 8, 6);
    g.fillRect(x+6, y+s-10, 9, 7); g.fillRect(x+s-14, y+s-12, 7, 8);
    g.fillStyle(0x2a5010, 0.5);
    g.fillRect(x+s/2-4, y+s/2-3, 8, 6);
    g.fillStyle(0x5aa02a, 0.25);
    g.fillRect(x, y, s/2, 2); g.fillRect(x+s/2, y+s-2, s/2, 2);
  } else if (type === 3) { // Tree — dark forest
    g.fillStyle(0x142e07, 1); g.fillRect(x, y, s, s);
    // Root flare
    g.fillStyle(0x3a2008, 0.6);
    g.fillEllipse(x+hs, y+s*0.9, s*0.55, s*0.22);
    // Trunk
    g.fillStyle(0x5a3010, 1);
    g.fillRect(x+hs-4, y+s*0.55, 8, s*0.45);
    // Bark detail
    g.fillStyle(0x3a1e08, 0.6);
    g.fillRect(x+hs-2, y+s*0.6, 2, s*0.3);
    g.fillRect(x+hs+1, y+s*0.65, 2, s*0.25);
    // Canopy shadow
    g.fillStyle(0x1a3c0a, 1);
    g.fillCircle(x+hs, y+hs-4, s*0.44);
    // Main canopy
    g.fillStyle(0x2d6814, 1);
    g.fillCircle(x+hs, y+hs-7, s*0.38);
    // Secondary leaf clusters
    g.fillStyle(0x3a8020, 0.85);
    g.fillCircle(x+hs-8, y+hs-10, s*0.27);
    g.fillCircle(x+hs+8, y+hs-5, s*0.23);
    // Light-side highlight
    g.fillStyle(0x50a030, 0.55);
    g.fillCircle(x+hs-7, y+hs-15, s*0.2);
    // Top glint
    g.fillStyle(0x70c040, 0.3);
    g.fillCircle(x+hs-7, y+hs-19, s*0.1);
  } else if (type === 4) { // Water — deep blue
    g.fillStyle(0x0d2058, 1); g.fillRect(x, y, s, s);
    // Depth wave layers
    g.fillStyle(0x1838a8, 0.45);
    g.fillEllipse(x+s*0.3, y+hs-3, s*0.7, 10);
    g.fillStyle(0x2855b8, 0.35);
    g.fillEllipse(x+s*0.65, y+hs+5, s*0.55, 8);
    g.fillStyle(0x1a3898, 0.3);
    g.fillEllipse(x+s*0.2, y+hs+10, s*0.45, 6);
    // Foam / light ripples
    g.fillStyle(0x80b8ff, 0.18);
    g.fillEllipse(x+s*0.28, y+hs-4, s*0.35, 4);
    g.fillEllipse(x+s*0.65, y+hs+4, s*0.28, 3);
    // Shimmer highlights
    g.fillStyle(0xffffff, 0.08);
    g.fillEllipse(x+s*0.15, y+hs-9, s*0.18, 2);
    g.fillEllipse(x+s*0.55, y+hs+8, s*0.14, 2);
    // Edge shadow
    g.fillStyle(0x000000, 0.15);
    g.fillRect(x, y, s, 2);
    g.fillRect(x, y+s-2, s, 2);
  } else if (type === 5) { // Floor — dungeon stone
    g.fillStyle(0x211610, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0x2e1e14, 0.8);
    g.fillRect(x+1, y+1, s/2-2, s/2-2);
    g.fillRect(x+s/2+1, y+s/2+1, s/2-2, s/2-2);
    g.fillStyle(0x1a100c, 0.6);
    g.fillRect(x+s/2+1, y+1, s/2-2, s/2-2);
    g.fillRect(x+1, y+s/2+1, s/2-2, s/2-2);
    g.lineStyle(1, 0x0a0604, 0.8);
    g.lineBetween(x, y+s/2, x+s, y+s/2);
    g.lineBetween(x+s/2, y, x+s/2, y+s);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(x, y, s, 1); g.fillRect(x, y, 1, s);
  } else if (type === 6) { // Door — golden arch
    g.fillStyle(0x6a4e10, 1); g.fillRect(x, y, s, s);
    g.fillStyle(0xb08020, 0.9);
    g.fillRect(x+s*0.25, y+s*0.15, s*0.5, s*0.8);
    g.fillStyle(0xd4a030, 0.7);
    g.fillCircle(x+hs, y+s*0.28, s*0.24);
    g.fillStyle(0xe8c060, 0.4);
    g.fillCircle(x+hs+4, y+hs, 3);
    g.lineStyle(2, 0x7a5800, 0.8);
    g.strokeRect(x+s*0.25, y+s*0.15, s*0.5, s*0.8);
  }
}

// ══════════════════════════════════════════════════════════
class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  create() {
    Sound?.bgm(MAPS[GS.map]?.music || 'village');
    // Track maps visited
    if (!GS.flags._mapsVis) GS.flags._mapsVis = {};
    GS.flags._mapsVis[GS.map] = true;
    if (Object.keys(GS.flags._mapsVis).length >= 3) Achieve?.unlock('all_maps');
    if (GS.party.length >= 3) Achieve?.unlock('full_party');
    const map = MAPS[GS.map];
    const MAP_W = map.w * TILE_SZ;
    const MAP_H = map.h * TILE_SZ;
    const W = this.scale.width, H = this.scale.height;
    const HUD_H = 52;

    // Tiles
    this.tileGfx = this.add.graphics();
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        drawTile(this.tileGfx, map.tiles[y][x], x*TILE_SZ, y*TILE_SZ, TILE_SZ);
      }
    }

    // Map name banner (corner — permanent)
    const banner = this.add.graphics().setDepth(2);
    banner.fillStyle(0x0e0a1c, 0.85);
    banner.fillRoundedRect(8, 8, 180, 36, 8);
    banner.lineStyle(1, 0x9a7828, 0.7);
    banner.strokeRoundedRect(8, 8, 180, 36, 8);
    const mapLabel = map.name + (GS.flags.ngplus ? '  ★' : '');
    this.add.text(98, 26, mapLabel, {
      fontSize:'16px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color: GS.flags.ngplus ? '#ffe080' : '#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0.5).setDepth(3);

    // Dramatic entrance banner (centered, fades out)
    if (!GS.flags._pendingLines) {
      const eBg=this.add.graphics().setScrollFactor(0).setDepth(28).setAlpha(0);
      const ebW=Math.min(260,W*0.7), ebH=68, ebX=(W-ebW)/2, ebY=H/2-ebH/2;
      eBg.fillStyle(0x060312,0.94); eBg.fillRoundedRect(ebX,ebY,ebW,ebH,10);
      eBg.lineStyle(2,0x9a7828,0.85); eBg.strokeRoundedRect(ebX,ebY,ebW,ebH,10);
      eBg.lineStyle(1,0x4a3808,0.5); eBg.strokeRoundedRect(ebX+3,ebY+3,ebW-6,ebH-6,8);
      const eT=this.add.text(W/2,H/2-6,map.name,{
        fontSize:'22px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#ffd700',stroke:'#000',strokeThickness:3,
        shadow:{offsetX:0,offsetY:0,color:'#ffd700',blur:14,fill:true},
      }).setOrigin(0.5).setScrollFactor(0).setDepth(29).setAlpha(0);
      const eS=this.add.text(W/2,H/2+20,GS.flags.ngplus?'★ 新遊戲＋ ★':'— 天命之路 —',{
        fontSize:'11px',fontFamily:'"Noto Serif TC","SimSun",serif',
        color:GS.flags.ngplus?'#ffe080':'#9a7840',stroke:'#000',strokeThickness:1,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(29).setAlpha(0);
      this.tweens.add({targets:[eBg,eT,eS],alpha:1,duration:380,ease:'Power2',
        onComplete:()=>this.time.delayedCall(1600,()=>
          this.tweens.add({targets:[eBg,eT,eS],alpha:0,duration:480,onComplete:()=>{ eBg.destroy();eT.destroy();eS.destroy(); }})
        )
      });
    }

    // NPCs
    this.npcObjects = (map.npcs||[]).map(npc => {
      const sx = npc.x * TILE_SZ + TILE_SZ/2;
      const sy = npc.y * TILE_SZ + TILE_SZ/2;
      const g = this.add.graphics().setDepth(4);
      this._drawNpc(g, sx, sy, npc.join ? 0x80e0c0 : 0xd4b060);
      const lbl = this.add.text(sx, sy-36, npc.name, {
        fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#f0e090', stroke:'#000', strokeThickness:3,
        backgroundColor: '#00000066', padding:{ x:4, y:2 },
      }).setOrigin(0.5, 0.5).setDepth(5);
      return { npc, g, lbl };
    });

    // NPC float animation — gentle vertical bob
    this.npcObjects.forEach(({ g, lbl, npc }, i) => {
      const baseY = npc.y * TILE_SZ + TILE_SZ/2;
      const phase = i * 1.4;
      g._npcBaseY = baseY; g._npcPhase = phase;
      lbl._npcBaseY = baseY - 36; lbl._npcPhase = phase;
    });

    // Periodic NPC "！" hint bubbles
    if (this.npcObjects.length > 0) {
      this.time.addEvent({ delay:9000+Math.random()*3000, loop:true, callback:()=>{
        if (this.inDialog || !this.npcObjects?.length) return;
        const no=this.npcObjects[Math.floor(Math.random()*this.npcObjects.length)];
        if (!no?.g?.active) return;
        const bx=no.npc.x*TILE_SZ+TILE_SZ/2, by=no.npc.y*TILE_SZ-4;
        const bGfx=this.add.graphics().setDepth(5.5);
        bGfx.fillStyle(0xf4ecd8,0.95); bGfx.fillRoundedRect(-13,-15,26,20,4);
        bGfx.lineStyle(1,0x9a7828,0.6); bGfx.strokeRoundedRect(-13,-15,26,20,4);
        bGfx.fillStyle(0xf4ecd8,0.85);
        bGfx.fillTriangle(-4,5,4,5,0,11);
        const bTxt=this.add.text(0,-5,'！',{fontSize:'12px',fontFamily:'serif',color:'#c04020',stroke:'#000',strokeThickness:1}).setOrigin(0.5).setDepth(5.6);
        bGfx.setPosition(bx,by-48); bTxt.setPosition(bx,by-53);
        this.tweens.add({targets:[bGfx,bTxt],alpha:1,y:'-=4',duration:260,
          onComplete:()=>this.time.delayedCall(1400,()=>
            this.tweens.add({targets:[bGfx,bTxt],alpha:0,y:'-=8',duration:320,onComplete:()=>{ bGfx.destroy();bTxt.destroy(); }})
          )
        });
      }});
    }

    // Chests
    if (!GS.flags.chests) GS.flags.chests = {};
    this.chestObjects = (map.chests||[]).map(chest => {
      const sx = chest.x * TILE_SZ + TILE_SZ/2;
      const sy = chest.y * TILE_SZ + TILE_SZ/2;
      const g = this.add.graphics().setDepth(4);
      const opened = !!GS.flags.chests[chest.id];
      this._drawChest(g, sx, sy, opened);
      return { chest, g, opened };
    });

    // Chest sparkle for unopened chests
    this.chestObjects.forEach(({ chest, opened }) => {
      if (!opened) {
        this.time.addEvent({ delay: 1800 + Math.random()*600, loop: true, callback: () => {
          if (GS.flags.chests?.[chest.id]) return;
          const sx = chest.x * TILE_SZ + TILE_SZ/2;
          const sy = chest.y * TILE_SZ + TILE_SZ/2;
          const p = this.add.graphics().setDepth(5);
          p.fillStyle(0xffd700, 0.9);
          p.fillTriangle(-2,-5,2,-5,0,4); p.fillTriangle(-5,-1,5,-1,0,4);
          p.setPosition(sx + (Math.random()-0.5)*10, sy - 6);
          this.tweens.add({ targets:p, y:p.y-14-Math.random()*8, alpha:0, scaleX:1.5, scaleY:1.5, duration:700+Math.random()*300, onComplete:()=>p.destroy() });
        }});
      }
    });

    // Exit portal glow graphics (updated each frame)
    this._exitGlowG = this.add.graphics().setDepth(2);

    // Player
    this.playerGfx = this.add.graphics().setDepth(6);
    this._drawPlayer();

    // HUD (camera-fixed)
    this._buildHud(W, HUD_H, MAP_W);

    // Camera setup
    const camH = MAP_H;
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H + HUD_H);
    this.cameras.main.startFollow(this.playerGfx, true, 0.12, 0.12);

    // Atmosphere particles
    this._spawnAtmosphere(MAP_W, MAP_H);

    // Mini-map
    const mms = 5, mmX = W - map.w*mms - 12, mmY = 10;
    this._mmapX = mmX; this._mmapY = mmY; this._mmapS = mms;
    const mmBg = this.add.graphics().setScrollFactor(0).setDepth(18);
    mmBg.fillStyle(0x000000, 0.72); mmBg.fillRect(mmX-2, mmY-2, map.w*mms+4, map.h*mms+4);
    mmBg.lineStyle(1, 0x9a7828, 0.7); mmBg.strokeRect(mmX-2, mmY-2, map.w*mms+4, map.h*mms+4);
    const MM_CLR = {0:0x7a6030, 1:0x141010, 2:0x2a5010, 3:0x0e2005, 4:0x0a1840, 5:0x1e1408, 6:0x9a7828};
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        mmBg.fillStyle(MM_CLR[map.tiles[ty][tx]] ?? 0x1a1010, 1);
        mmBg.fillRect(mmX + tx*mms, mmY + ty*mms, mms-0.5, mms-0.5);
      }
    }
    (map.exits||[]).forEach(e => { mmBg.fillStyle(0x40ff80, 0.85); mmBg.fillRect(mmX+e.x*mms, mmY+e.y*mms, mms, mms); });
    (map.npcs||[]).forEach(n => { mmBg.fillStyle(0xe8c060, 0.7); mmBg.fillCircle(mmX+n.x*mms+mms/2, mmY+n.y*mms+mms/2, mms*0.45); });
    (map.chests||[]).forEach(c => {
      mmBg.fillStyle(GS.flags.chests?.[c.id] ? 0x555555 : 0xffd700, 0.9);
      mmBg.fillRect(mmX+c.x*mms+1, mmY+c.y*mms+1, mms-2, mms-2);
    });
    this._mmapFg = this.add.graphics().setScrollFactor(0).setDepth(19);
    this._refreshMinimap();

    // Post-battle pending dialogue (e.g. after boss)
    if (GS.flags._pendingLines) {
      const lines = [...GS.flags._pendingLines];
      const isFinal = !!GS.flags._isFinalBoss;
      delete GS.flags._pendingLines; delete GS.flags._isFinalBoss;
      this.cameras.main.fadeIn(400, 0, 0, 0);
      this.time.delayedCall(600, () => this._showDialog(lines, () => {
        if (isFinal) {
          Sound?.stopBgm();
          this.cameras.main.fadeOut(1200, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('EndingScene'));
        }
      }));
    }

    // Input
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,    w: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
      z: Phaser.Input.Keyboard.KeyCodes.Z, enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      x: Phaser.Input.Keyboard.KeyCodes.X,  esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      m: Phaser.Input.Keyboard.KeyCodes.M,
    });

    this.moveDelay = 0;
    this.inDialog = false;
    this.bobTimer = 0;
    this._dayStep = 0;
    this._skyOverlay = this.add.graphics().setScrollFactor(0).setDepth(9);

    // Castle visit flag for quest tracking
    if (GS.map === 'castle') GS.flags.visitedCastle = true;
    // Check quest completions on each scene enter (delayed so scene renders first)
    this.time.delayedCall(800, () => this._checkQuestToasts?.());

    // NG+ banner on first load of village in NG+
    if (GS.flags.ngplus && GS.map === 'village' && !GS.flags._ngBannerShown) {
      GS.flags._ngBannerShown = true;
      const ngW = Math.min(300, W - 40), ngX = (W - ngW) / 2;
      const ngG = this.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
      ngG.fillStyle(0x100820, 0.92); ngG.fillRoundedRect(ngX, H/2-40, ngW, 80, 10);
      ngG.lineStyle(2, 0xffd700, 0.9); ngG.strokeRoundedRect(ngX, H/2-40, ngW, 80, 10);
      const ngT = this.add.text(W/2, H/2-14, '★ 新遊戲＋ ★', {
        fontSize:'22px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#ffd700', fontStyle:'bold', stroke:'#000', strokeThickness:3,
        shadow:{ offsetX:0, offsetY:0, color:'#ffd700', blur:16, fill:true },
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(31).setAlpha(0);
      const ngS = this.add.text(W/2, H/2+16, '繼承靈石　妖王更強', {
        fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8b080', stroke:'#000', strokeThickness:2,
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(31).setAlpha(0);
      this.tweens.add({ targets:[ngG,ngT,ngS], alpha:1, duration:600, hold:2200, yoyo:true, onComplete:()=>{ ngG.destroy(); ngT.destroy(); ngS.destroy(); } });
    }

    // Achievement toast listener
    this._onAchieve = (e) => this._showAchieveToast(e.detail);
    window.addEventListener('xian:achievement', this._onAchieve);
    this.events.once('shutdown', () => window.removeEventListener('xian:achievement', this._onAchieve));

    // Quest completion tracking (skip q1 which is always done)
    this._shownQuestToasts = new Set(GS.flags._shownQuestToasts || ['q1']);

    // Playtime counter (seconds)
    this._ptCounter = 0;
  }

  _drawNpc(g, x, y, color=0xd4b060) {
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.25); g.fillEllipse(x, y+21, 26, 7);
    // Robe skirt (tapered wider at bottom — xianxia style)
    g.fillStyle(color, 1);
    g.fillTriangle(x-10, y+8, x+10, y+8, x-15, y+23);
    g.fillTriangle(x-10, y+8, x+10, y+8, x+15, y+23);
    g.fillRect(x-10, y+6, 20, 4);
    // Upper body / torso
    g.fillRect(x-9, y-8, 18, 16);
    // Sleeves / arms
    g.fillRect(x-19, y-5, 11, 6);
    g.fillRect(x+8,  y-5, 11, 6);
    // Collar / sash center line
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(x-1, y-8, 2, 14);
    // Head
    g.fillStyle(color, 1);
    g.fillCircle(x, y-18, 10);
    // Topknot (xianxia hair bun)
    g.fillStyle(0x1c1000, 1);
    g.fillRect(x-2, y-31, 4, 11);
    g.fillCircle(x, y-32, 3);
    // Eyes
    g.fillStyle(0x1a0800, 1);
    g.fillCircle(x-3, y-18, 1.5);
    g.fillCircle(x+3, y-18, 1.5);
    // Face highlight
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(x-3, y-22, 3);
    // Glow indicator
    g.lineStyle(1, color, 0.5);
    g.strokeCircle(x, y-18, 12);
  }

  _drawChest(g, x, y, opened) {
    g.clear();
    const w = 22, h = 16;
    // Shadow
    g.fillStyle(0x000000, 0.22); g.fillEllipse(x, y+h/2+4, w+6, 5);
    // Chest body
    g.fillStyle(opened ? 0x4a3010 : 0x7a5218, 1);
    g.fillRect(x-w/2, y-h/2, w, h);
    // Lid
    g.fillStyle(opened ? 0x362208 : 0x9a6a24, 1);
    g.fillRect(x-w/2, y-h/2-5, w, 7);
    // Metal bands
    g.fillStyle(opened ? 0x3a3020 : 0xc8a040, 1);
    g.fillRect(x-w/2, y-3, w, 3);
    g.fillRect(x-2, y-h/2-5, 4, h+5);
    // Lock
    g.fillStyle(opened ? 0x2a2010 : 0xffe080, 1);
    g.fillRect(x-3, y-5, 6, 5);
    // Shine (closed only)
    if (!opened) {
      g.fillStyle(0xffffff, 0.15);
      g.fillRect(x-w/2+2, y-h/2-4, w-4, 3);
    }
    // Open lid gap
    if (opened) {
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x-w/2+1, y-h/2-4, w-2, 4);
    }
  }

  _spawnAtmosphere(mapW, mapH) {
    const map = GS.map;
    if (map === 'forest') {
      // Falling leaves
      this.time.addEvent({ delay: 300, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const px = vp.x + Math.random() * vp.width;
        const p = this.add.graphics().setDepth(3);
        const lc = [0x60c840,0x80e860,0x50a830,0xc8e040][Math.floor(Math.random()*4)];
        p.fillStyle(lc, 0.55 + Math.random()*0.35);
        p.fillEllipse(0, 0, 8+Math.random()*5, 4+Math.random()*3);
        p.setPosition(px, vp.y - 10); p.setAngle(Math.random()*360);
        this.tweens.add({ targets:p, x:px+(Math.random()-0.5)*100, y:vp.y+vp.height+20,
          angle:p.angle+(Math.random()-0.5)*300, alpha:0, duration:3500+Math.random()*2500, onComplete:()=>p.destroy() });
      }});
      this.time.addEvent({ delay: 550, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0x80e840, 0.35); p.fillCircle(0, 0, 1.5+Math.random()*1.5);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+Math.random()*vp.height);
        this.tweens.add({ targets:p, x:p.x+18, y:p.y-55, alpha:0, duration:2400, onComplete:()=>p.destroy() });
      }});
    } else if (map === 'cave') {
      // Water drips
      this.time.addEvent({ delay: 200, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const px = vp.x + Math.random() * vp.width;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0x4090c0, 0.4+Math.random()*0.35); p.fillEllipse(0, 0, 2, 7);
        p.setPosition(px, vp.y - 5);
        this.tweens.add({ targets:p, y:vp.y+100+Math.random()*120, alpha:0, duration:500+Math.random()*350, onComplete:()=>p.destroy() });
      }});
      // Glowing embers/spores
      this.time.addEvent({ delay: 480, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0xff6040, 0.28+Math.random()*0.2); p.fillCircle(0, 0, 1.2+Math.random()*1.5);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+Math.random()*vp.height);
        this.tweens.add({ targets:p, x:p.x+(Math.random()-0.5)*25, y:p.y-45, alpha:0, duration:2800, onComplete:()=>p.destroy() });
      }});
    } else if (map === 'shrine') {
      // Cherry blossoms
      this.time.addEvent({ delay: 340, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const px = vp.x + Math.random() * vp.width;
        const p = this.add.graphics().setDepth(3);
        const pc = [0xffb0d0,0xffd0e0,0xff80b0,0xffe8f0][Math.floor(Math.random()*4)];
        p.fillStyle(pc, 0.5+Math.random()*0.4); p.fillEllipse(0, 0, 7+Math.random()*5, 4+Math.random()*3);
        p.setPosition(px, vp.y-10); p.setAngle(Math.random()*360);
        this.tweens.add({ targets:p, x:px+(Math.random()-0.5)*70, y:vp.y+vp.height+20,
          angle:p.angle+(Math.random()-0.5)*160, alpha:0, duration:5500+Math.random()*2500, onComplete:()=>p.destroy() });
      }});
      // Golden motes
      this.time.addEvent({ delay: 700, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0xffe080, 0.45); p.fillCircle(0, 0, 1.5+Math.random()*2);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+Math.random()*vp.height);
        this.tweens.add({ targets:p, y:p.y-75, alpha:0, duration:3200, onComplete:()=>p.destroy() });
      }});
    } else if (map === 'castle') {
      // Sand/dust blowing sideways
      this.time.addEvent({ delay: 110, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const py = vp.y + Math.random() * vp.height;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0xd0a040, 0.16+Math.random()*0.22); p.fillEllipse(0, 0, 5+Math.random()*5, 2);
        p.setPosition(vp.x - 10, py);
        this.tweens.add({ targets:p, x:vp.x+vp.width+20, y:py+(Math.random()-0.5)*30, alpha:0, duration:700+Math.random()*500, onComplete:()=>p.destroy() });
      }});
    } else if (map === 'dragonPalace') {
      // Rising bubbles
      this.time.addEvent({ delay: 350, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const r = 2.5 + Math.random()*3;
        const p = this.add.graphics().setDepth(3);
        p.lineStyle(1.2, 0x60d0ff, 0.55+Math.random()*0.35);
        p.strokeCircle(0, 0, r);
        p.fillStyle(0x80e8ff, 0.12); p.fillCircle(0, 0, r);
        p.fillStyle(0xffffff, 0.4); p.fillCircle(-r*0.3, -r*0.35, r*0.28);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+vp.height);
        this.tweens.add({ targets:p, y:vp.y-20, alpha:0, duration:1800+Math.random()*1500, onComplete:()=>p.destroy() });
      }});
      // Glowing deep-sea wisps
      this.time.addEvent({ delay: 650, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0x2080ff, 0.45+Math.random()*0.3); p.fillCircle(0, 0, 1.5+Math.random()*2.5);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+Math.random()*vp.height);
        this.tweens.add({ targets:p, x:p.x+(Math.random()-0.5)*28, y:p.y-38, alpha:0, duration:2200, onComplete:()=>p.destroy() });
      }});
    } else if (map === 'dungeon') {
      // Purple spore wisps (盤絲洞 — spider cave)
      this.time.addEvent({ delay: 280, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        const pc = [0x8020c0,0xb040e0,0x600090,0xd060ff][Math.floor(Math.random()*4)];
        p.fillStyle(pc, 0.25+Math.random()*0.3); p.fillCircle(0, 0, 1.5+Math.random()*2);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+vp.height*0.3+Math.random()*vp.height*0.7);
        this.tweens.add({ targets:p, x:p.x+(Math.random()-0.5)*30, y:p.y-40, alpha:0, duration:2000+Math.random()*1000, onComplete:()=>p.destroy() });
      }});
      // Web strand glints
      this.time.addEvent({ delay: 900, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        const len = 20+Math.random()*35, ang = Math.random()*Math.PI*2;
        p.lineStyle(0.8, 0xd0b0e0, 0.22+Math.random()*0.22);
        p.lineBetween(0, 0, Math.cos(ang)*len, Math.sin(ang)*len);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+Math.random()*vp.height);
        this.tweens.add({ targets:p, alpha:0, duration:2500+Math.random()*1500, onComplete:()=>p.destroy() });
      }});
    } else if (map === 'village') {
      // Fireflies
      this.time.addEvent({ delay: 950, loop: true, callback: () => {
        const vp = this.cameras.main.worldView;
        const p = this.add.graphics().setDepth(3);
        p.fillStyle(0xc0ff60, 0.7); p.fillCircle(0, 0, 2+Math.random()*1.5);
        p.setPosition(vp.x+Math.random()*vp.width, vp.y+Math.random()*vp.height);
        this.tweens.add({ targets:p, x:p.x+(Math.random()-0.5)*50, y:p.y+(Math.random()-0.5)*35,
          alpha:{ from:0, to:0.8 }, duration:1300, yoyo:true, onComplete:()=>p.destroy() });
      }});
    }
  }

  _openChest(chest) {
    if (!GS.flags.chests) GS.flags.chests = {};
    GS.flags.chests[chest.id] = true;
    if(Object.keys(GS.flags.chests).length>=5) Achieve?.unlock('all_chests');
    const rewards = [];
    if (chest.gold) { GS.gold += chest.gold; rewards.push(`${chest.gold} 靈石`); }
    if (chest.item) { GS.addItem(chest.item); rewards.push(ITEMS[chest.item]?.name || chest.item); }
    Sound?.play('chest');
    const co = this.chestObjects?.find(c => c.chest === chest);
    if (co) { co.opened = true; this._drawChest(co.g, chest.x*TILE_SZ+TILE_SZ/2, chest.y*TILE_SZ+TILE_SZ/2, true); }
    this._showDialog(['打開了寶箱！', `獲得：${rewards.join('、')}！`], () => { this._refreshHud(); this._checkQuestToasts(); });
  }

  _refreshMinimap() {
    if (!this._mmapFg) return;
    this._mmapFg.clear();
    const { x, y } = GS.player;
    const mms = this._mmapS;
    const mx = this._mmapX + x*mms + mms/2;
    const my = this._mmapY + y*mms + mms/2;
    this._mmapFg.fillStyle(0xffffff, 1);
    this._mmapFg.fillCircle(mx, my, mms*0.75);
    this._mmapFg.lineStyle(1, 0x000000, 0.4);
    this._mmapFg.strokeCircle(mx, my, mms*0.75);
  }

  _drawPlayer() {
    this.playerGfx.clear();
    const { x, y } = GS.player;
    const sx = x * TILE_SZ + TILE_SZ/2;
    const sy = y * TILE_SZ + TILE_SZ/2;
    const bob = Math.sin(this.bobTimer * 0.15) * 1.5;
    const m = GS.party[0];
    const col = m ? m.color : 0x4a9eff;
    const id  = m ? m.id   : 'yunyi';
    const g   = this.playerGfx;

    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(sx, sy+23, 32, 8);

    if (id === 'yunyi') {
      // golden armor + 金箍棒
      const gc = 0xf0a010;
      // legs
      g.fillStyle(0x7a4010, 1); g.fillRect(sx-10,sy+8+bob,9,16); g.fillRect(sx+1,sy+8+bob,9,16);
      // armor body
      g.fillStyle(gc, 1);
      g.fillTriangle(sx-13,sy+8+bob, sx+13,sy+8+bob, sx-10,sy-10+bob);
      g.fillTriangle(sx-10,sy-10+bob, sx+13,sy+8+bob, sx+10,sy-10+bob);
      // armor highlight
      g.fillStyle(0xffe870, 0.4); g.fillTriangle(sx-4,sy+4+bob, sx+4,sy+4+bob, sx,sy-8+bob);
      // red belt
      g.fillStyle(0xc83010, 1); g.fillRect(sx-13,sy+5+bob,26,4);
      // sleeves
      g.fillStyle(gc, 1); g.fillRect(sx-23,sy-8+bob,14,8); g.fillRect(sx+9,sy-8+bob,14,8);
      // hands
      g.fillStyle(0xd4a060, 1); g.fillCircle(sx-17,sy-4+bob,4); g.fillCircle(sx+17,sy-4+bob,4);
      // collar
      g.fillStyle(0xffe060, 0.5); g.fillRect(sx-2,sy-10+bob,4,12);
      // head
      g.fillStyle(0xd4a060, 1); g.fillCircle(sx,sy-22+bob,11);
      // 金箍 headband
      g.fillStyle(0xffd700, 1); g.fillRect(sx-12,sy-24+bob,24,5);
      g.lineStyle(1,0xd4a010,0.8); g.strokeRect(sx-12,sy-24+bob,24,5);
      // hair
      g.fillStyle(0x201000, 1); g.fillCircle(sx,sy-34+bob,6); g.fillRect(sx-7,sy-34+bob,14,5);
      // eyes
      g.fillStyle(0x0c0808, 1); g.fillCircle(sx-4,sy-22+bob,2.2); g.fillCircle(sx+4,sy-22+bob,2.2);
      g.fillStyle(0xffffff, 1); g.fillCircle(sx-5,sy-23+bob,0.9); g.fillCircle(sx+3,sy-23+bob,0.9);
      // 金箍棒
      g.lineStyle(3.5,0xc84010,1); g.lineBetween(sx+16,sy-36+bob,sx+16,sy+24+bob);
      g.fillStyle(0xffd700,1); g.fillRect(sx+11,sy-36+bob,10,5); g.fillRect(sx+11,sy-2+bob,10,5); g.fillRect(sx+11,sy+20+bob,10,5);
    } else if (id === 'linger') {
      // elder mage, green robes, white beard
      const rc = 0x508840;
      g.fillStyle(rc, 0.7); g.fillRect(sx-10,sy+8+bob,9,16); g.fillRect(sx+1,sy+8+bob,9,16);
      g.fillStyle(rc, 1);
      g.fillTriangle(sx-13,sy+8+bob, sx+13,sy+8+bob, sx-11,sy-10+bob);
      g.fillTriangle(sx-11,sy-10+bob, sx+13,sy+8+bob, sx+11,sy-10+bob);
      g.fillStyle(0x80c860, 0.3); g.fillTriangle(sx-4,sy+4+bob, sx+4,sy+4+bob, sx,sy-8+bob);
      g.fillStyle(0x2a6040, 1); g.fillRect(sx-13,sy+5+bob,26,4);
      g.fillStyle(rc, 1); g.fillRect(sx-23,sy-8+bob,14,8); g.fillRect(sx+9,sy-8+bob,14,8);
      g.fillStyle(0xd4b888, 1); g.fillCircle(sx-17,sy-4+bob,4); g.fillCircle(sx+17,sy-4+bob,4);
      g.fillStyle(0xd4b888, 1); g.fillCircle(sx,sy-22+bob,11);
      g.fillStyle(0xf0ece8, 0.95); g.fillTriangle(sx-7,sy-16+bob, sx+7,sy-16+bob, sx,sy-1+bob);
      g.fillStyle(0xf0ece8, 1); g.fillCircle(sx,sy-34+bob,6); g.fillRect(sx-7,sy-34+bob,14,5);
      g.fillStyle(0x2a6040, 1); g.fillRect(sx-4,sy-22+bob,8,4);
      g.fillStyle(0x0c0c0c, 1); g.fillRect(sx-6,sy-23+bob,4,2); g.fillRect(sx+2,sy-23+bob,4,2);
      g.fillStyle(0xffffff, 1); g.fillCircle(sx-5,sy-23+bob,0.9); g.fillCircle(sx+3,sy-23+bob,0.9);
      // nature staff
      g.lineStyle(3,0x5a3810,1); g.lineBetween(sx-18,sy-38+bob,sx-18,sy+24+bob);
      g.lineStyle(2,0x7a5020,0.7); g.lineBetween(sx-22,sy-16+bob,sx-14,sy-24+bob);
      g.fillStyle(0x40a030,1); g.fillCircle(sx-18,sy-40+bob,8);
      g.fillStyle(0x80e060,0.6); g.fillCircle(sx-21,sy-43+bob,4);
      g.fillStyle(0x40a030,0.2); g.fillCircle(sx-18,sy-40+bob,14);
    } else {
      // yuehua — celestial archer, light blue
      const cc = 0x60c8ff;
      g.fillStyle(cc, 0.7); g.fillRect(sx-10,sy+8+bob,9,16); g.fillRect(sx+1,sy+8+bob,9,16);
      g.fillStyle(cc, 1);
      g.fillTriangle(sx-13,sy+8+bob, sx+13,sy+8+bob, sx-10,sy-10+bob);
      g.fillTriangle(sx-10,sy-10+bob, sx+13,sy+8+bob, sx+10,sy-10+bob);
      g.fillStyle(0xffffff, 0.12); g.fillTriangle(sx-4,sy+4+bob, sx+4,sy+4+bob, sx,sy-8+bob);
      g.fillStyle(0x48c890, 1); g.fillRect(sx-13,sy+5+bob,26,4);
      g.fillStyle(cc, 1); g.fillRect(sx-23,sy-8+bob,14,8); g.fillRect(sx+9,sy-8+bob,14,8);
      g.fillStyle(0xd4c0a8, 1); g.fillCircle(sx-17,sy-4+bob,4); g.fillCircle(sx+17,sy-4+bob,4);
      g.fillStyle(0xd4c0a8, 1); g.fillCircle(sx,sy-22+bob,11);
      g.fillStyle(0xffffff, 0.18); g.fillCircle(sx-3,sy-26+bob,5);
      g.fillStyle(0x1c1000, 1); g.fillCircle(sx,sy-34+bob,6); g.fillRect(sx-7,sy-34+bob,14,5);
      g.fillStyle(0xffd700,1); g.fillCircle(sx+7,sy-34+bob,5);
      g.fillStyle(0xff80c0,0.9);
      for (let a=0;a<5;a++){const r=a*Math.PI*2/5; g.fillCircle(sx+7+Math.cos(r)*4,sy-34+bob+Math.sin(r)*4,2.5);}
      g.fillStyle(0x0c0808, 1); g.fillCircle(sx-4,sy-22+bob,2); g.fillCircle(sx+4,sy-22+bob,2);
      g.fillStyle(0xffffff, 1); g.fillCircle(sx-5,sy-23+bob,0.9); g.fillCircle(sx+3,sy-23+bob,0.9);
      // bow
      g.lineStyle(2.5,0x9a6830,1);
      g.beginPath(); g.arc(sx-18,sy-6+bob,18,Math.PI*0.2,Math.PI*1.8); g.strokePath();
      g.lineStyle(1,0xd8c8a0,0.8); g.lineBetween(sx-18,sy-22+bob,sx-18,sy+10+bob);
      g.lineStyle(1.5,0x9a7030,1); g.lineBetween(sx-6,sy-8+bob,sx-28,sy-8+bob);
      g.fillStyle(0xc0c8d8,1); g.fillTriangle(sx-28,sy-12+bob,sx-34,sy-8+bob,sx-28,sy-4+bob);
    }

    g.lineStyle(1.5,0xffffff,0.2);
    g.strokeCircle(sx,sy-22+bob,15);
    g.setPosition(0,0);
    this._refreshMinimap();
  }

  _drawSky() {
    this._skyOverlay.clear();
    const t=(this._dayStep%400)/400;
    const night=0.5-0.5*Math.cos(t*Math.PI*2);
    if (night<0.03) return;
    const isNight=night>0.5;
    this._skyOverlay.fillStyle(isNight?0x1a3080:0xff7820, Math.min(0.16, isNight?(night-0.5)*0.26:night*0.14));
    this._skyOverlay.fillRect(0,0,this.scale.width,this.scale.height);
  }

  _buildHud(W, HUD_H, MAP_W) {
    const hudY = MAPS[GS.map].h * TILE_SZ;

    const hudBg = this.add.graphics().setDepth(10).setScrollFactor(0);
    hudBg.fillStyle(0x0a0816, 0.96);
    hudBg.fillRect(0, 0, W, HUD_H);
    hudBg.lineStyle(1, 0x9a7828, 0.6);
    hudBg.lineBetween(0, 0, W, 0);

    // Map name (scrollfactor 0)
    this.hudMapText = this.add.text(16, HUD_H/2, MAPS[GS.map].name, {
      fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0, 0.5).setDepth(11).setScrollFactor(0).setY(this.cameras.main.height - HUD_H + HUD_H/2);

    this.hudGold = this.add.text(200, 0, '💰 ' + GS.gold, {
      fontSize:'14px', fontFamily:'serif', color:'#e8c060', stroke:'#000', strokeThickness:2,
    }).setOrigin(0, 0.5).setDepth(11).setScrollFactor(0).setY(this.cameras.main.height - HUD_H + HUD_H/2);

    this.hudHpBars = [];
    this.hudHpTexts = [];
    GS.party.forEach((m, i) => {
      const barX = 360 + i * 200;
      const barY = this.cameras.main.height - HUD_H + 12;
      const nameT = this.add.text(barX, barY, `${m.name} Lv.${m.lv}`, {
        fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
        color:'#c8a060', stroke:'#000', strokeThickness:1,
      }).setScrollFactor(0).setDepth(11);
      const hpBar = mkBar(this, barX, barY+14, 120, 8, m.hp, m.maxHp, 0xe05050).setScrollFactor(0).setDepth(11);
      const mpBar = mkBar(this, barX, barY+26, 120, 6, m.mp, m.maxMp||1, 0x5080e8).setScrollFactor(0).setDepth(11);
      this.hudHpBars.push({ hpBar, mpBar, m });
    });

    this.add.text(W-16, this.cameras.main.height - HUD_H + HUD_H/2, 'X=選單  M=靜音', {
      fontSize:'11px', fontFamily:'serif', color:'#5a4a2a', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(11);
  }

  _refreshHud() {
    if (this.hudGold) this.hudGold.setText('💰 ' + GS.gold);
    this.hudHpBars.forEach(({hpBar, mpBar, m}) => {
      if (hpBar.active) hpBar.destroy();
      if (mpBar.active) mpBar.destroy();
    });
    if (this._hudStatusObjs) this._hudStatusObjs.forEach(o=>{ if(o&&o.active) o.destroy(); });
    this._hudStatusObjs = [];
    GS.party.forEach((m, i) => {
      const barX = 360 + i * 200;
      const barY = this.cameras.main.height - 52 + 12;
      const hpClr = m.dead ? 0x443838 : m.hp<=Math.floor(m.maxHp*0.25) ? 0xff6020 : 0xe05050;
      this._hudStatusObjs.push(
        mkBar(this, barX, barY+14, 120, 8, m.hp, m.maxHp, hpClr).setScrollFactor(0).setDepth(11),
        mkBar(this, barX, barY+26, 120, 6, m.mp, m.maxMp||1, 0x5080e8).setScrollFactor(0).setDepth(11),
      );
      if (m.dead) {
        const dt=this.add.text(barX+60,barY+20,'陣亡',{fontSize:'9px',fontFamily:'serif',color:'#886060',stroke:'#000',strokeThickness:1}).setScrollFactor(0).setDepth(12).setOrigin(0.5);
        this._hudStatusObjs.push(dt);
      } else if (m.status?.includes('poison')) {
        const dg=this.add.graphics().setScrollFactor(0).setDepth(12);
        dg.fillStyle(0xb040e0,0.9); dg.fillCircle(barX+130,barY+20,4);
        this._hudStatusObjs.push(dg);
      }
    });
  }

  _checkQuestToasts() {
    if (typeof QUESTS === 'undefined') return;
    QUESTS.forEach(q => {
      if (this._shownQuestToasts.has(q.id)) return;
      if (q.done()) {
        this._shownQuestToasts.add(q.id);
        GS.flags._shownQuestToasts = [...this._shownQuestToasts];
        this.time.delayedCall(400, () => this._showQuestToast(q));
      }
    });
  }

  _showQuestToast(q) {
    const W = this.scale.width;
    const toastW = Math.min(340, W - 30);
    const tx = W/2 - toastW/2;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    bg.fillStyle(0x081208, 0.96);
    bg.fillRoundedRect(tx, 78, toastW, 60, 8);
    bg.lineStyle(2, 0x60d040, 0.95);
    bg.strokeRoundedRect(tx, 78, toastW, 60, 8);
    const t1 = this.add.text(W/2, 86, '✓ 任務完成！', {
      fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#60d040', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    const t2 = this.add.text(W/2, 102, q.name, {
      fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#c0f070', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    const t3 = this.add.text(W/2, 119, q.desc, {
      fontSize:'10px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#608040', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    Sound?.play('levelUp');
    this.tweens.add({ targets:[bg,t1,t2,t3], alpha:1, duration:280, ease:'Power2',
      onComplete:()=>this.tweens.add({ targets:[bg,t1,t2,t3], alpha:0, duration:500, delay:2800,
        onComplete:()=>{ bg.destroy(); t1.destroy(); t2.destroy(); t3.destroy(); } }) });
  }

  _showAchieveToast(a) {
    if (!a) return;
    Sound?.play('chest');
    const W = this.scale.width;
    const toastW = Math.min(340, W - 30);
    const tx = W/2 - toastW/2;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    bg.fillStyle(0x121808, 0.96);
    bg.fillRoundedRect(tx, 12, toastW, 60, 8);
    bg.lineStyle(2, 0xffd700, 0.95);
    bg.strokeRoundedRect(tx, 12, toastW, 60, 8);
    const t1 = this.add.text(W/2, 20, '★ 成就解鎖！', {
      fontSize:'11px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#ffd700', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    const t2 = this.add.text(W/2, 36, `${a.icon||'🏆'} ${a.name}`, {
      fontSize:'14px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#e8c060', fontStyle:'bold', stroke:'#000', strokeThickness:2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    const t3 = this.add.text(W/2, 53, a.desc, {
      fontSize:'10px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#9a8050', stroke:'#000', strokeThickness:1,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    this.tweens.add({ targets:[bg,t1,t2,t3], alpha:1, duration:280, ease:'Power2',
      onComplete:()=>this.tweens.add({ targets:[bg,t1,t2,t3], alpha:0, duration:500, delay:2600,
        onComplete:()=>{ bg.destroy(); t1.destroy(); t2.destroy(); t3.destroy(); } }) });
  }

  _canWalk(x, y) {
    const map = MAPS[GS.map];
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = map.tiles[y][x];
    return t !== 1 && t !== 3 && t !== 4;
  }

  _tryMove(dx, dy) {
    const nx = GS.player.x + dx, ny = GS.player.y + dy;
    if (!this._canWalk(nx, ny)) return false;
    GS.player.x = nx; GS.player.y = ny;
    if (dx < 0) GS.player.facing='left';
    else if (dx > 0) GS.player.facing='right';
    else if (dy < 0) GS.player.facing='up';
    else GS.player.facing='down';
    return true;
  }

  _checkEnc() {
    const enc = MAPS[GS.map].enc;
    if (!enc.rate || !enc.enemies.length) return;
    GS.encStep++;
    if (GS.encStep < 5) return;
    const avgLv = Math.floor(GS.party.reduce((s,m)=>s+(m.lv||1),0) / Math.max(1,GS.party.length));
    const scaledRate = enc.rate * Math.max(0.3, 1 - (avgLv - 1) * 0.07);
    if (Math.random() < scaledRate) {
      GS.encStep = 0;
      const pool = enc.enemies.filter(e => !GS.defeated[e]);
      if (!pool.length) return;
      const count = 1 + Math.floor(Math.random() * 2);
      const enemies = [];
      for (let i = 0; i < count; i++) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        const base = ENEMIES[id];
        const ngS = GS.flags.ngplus ? 1.35 : 1.0;
        enemies.push({ id, name:base.name,
          hp:Math.floor(base.hp*ngS), maxHp:Math.floor(base.hp*ngS),
          atk:Math.floor(base.atk*ngS), def:Math.floor(base.def*ngS), spd:base.spd,
          color:base.color, sz:base.sz, acts:base.acts, drops:base.drops,
          status:[], dead:false });
      }
      GS.battleData = { enemies };
      this.inDialog = true;
      this.cameras.main.flash(100, 255, 30, 30, true);
      this.cameras.main.shake(180, 0.006);
      const W2=this.scale.width, H2=this.scale.height;
      const et=this.add.text(W2/2, H2/2, '！', {
        fontSize:Math.floor(H2*0.18)+'px', fontFamily:'serif',
        color:'#ff2020', stroke:'#000', strokeThickness:8,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(28).setAlpha(0).setScale(0.4);
      this.tweens.add({targets:et, alpha:1, scaleX:1.5, scaleY:1.5, duration:120, ease:'Back.easeOut',
        onComplete:()=>this.time.delayedCall(180,()=>{
          this.cameras.main.fadeOut(280,0,0,0);
          this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('BattleScene'));
        })
      });
    }
  }

  _interact() {
    const { x, y, facing } = GS.player;
    const dx = facing==='right'?1:facing==='left'?-1:0;
    const dy = facing==='down'?1:facing==='up'?-1:0;
    const tx = x+dx, ty = y+dy;

    const map = MAPS[GS.map];
    const exit = map.exits?.find(e => e.x===x && e.y===y);
    if (exit) { this._doExit(exit); return; }

    const npc = map.npcs?.find(n => n.x===tx && n.y===ty);
    if (npc) { this._talkNpc(npc); return; }

    const chest = map.chests?.find(c => c.x===tx && c.y===ty && !GS.flags.chests?.[c.id]);
    if (chest) { this._openChest(chest); return; }
    const openedChest = map.chests?.find(c => c.x===tx && c.y===ty && GS.flags.chests?.[c.id]);
    if (openedChest) { this._showDialog(['寶箱已被打開。']); }
  }

  _doExit(exit) {
    if (this._exiting) return;
    if (exit.to === 'dragonPalace' && !GS.flags.defeatedDragon) {
      this._showDialog(['【虎先鋒守護此路！須先擊敗虎先鋒，方可進入東海龍宮。】']);
      return;
    }
    if (exit.to === 'shrine' && !GS.flags.defeated_dragonKing) {
      this._showDialog(['【東海龍王守護此路！須先擊敗東海龍王，方可進入小西天。】']);
      return;
    }
    if (exit.to === 'lingxiao') {
      if (!GS.flags.ngplus) {
        this._showDialog(['〔天門緊閉〕', '靈霄殿為天帝居所，非尋常天命人可入。', '唯有歷盡一周目磨難、踏上二周目征途者，', '方能開啟這扇天門。']);
        return;
      }
      if (!GS.flags.defeated_boss) {
        this._showDialog(['〔天門未全開〕', '天帝之門雖為二周目而開，', '然須先擊敗黃眉大王，淨化三界妖氣，', '靈霄殿方才完全開啟。']);
        return;
      }
    }
    this._exiting = true;
    const W = this.scale.width;
    const banner = this.add.text(W/2, 56, exit.msg, {
      fontSize:'17px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#ffd700', stroke:'#000', strokeThickness:3,
      backgroundColor:'#00000099', padding:{x:14, y:7},
    }).setOrigin(0.5).setScrollFactor(0).setDepth(25).setAlpha(0);
    this.tweens.add({ targets:banner, alpha:1, duration:160 });
    GS.map = exit.to;
    GS.player.x = exit.toX; GS.player.y = exit.toY; GS.player.facing = 'down';
    GS.save(0);
    Sound?.play('mapTransition');
    this.cameras.main.fadeOut(380, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
  }

  _talkNpc(npc) {
    if (npc.shop) {
      this.scene.launch('ShopScene', { stock: SHOP_STOCK[npc.shop], caller:'WorldScene' });
      this.scene.pause(); return;
    }
    if (npc.inn) {
      this._showDialog([...npc.dlg], () => {
        this._showDialog([`住宿費 ${npc.inn} 靈石。是否休息？（Z確認）`], () => {
          if (GS.gold >= npc.inn) {
            GS.gold -= npc.inn;
            GS.party.forEach(m => { m.hp=m.maxHp; m.mp=m.maxMp; m.status=[]; m.dead=false; });
            Sound?.play('inn');
            this._showDialog(['全員體力恢復！'], () => this._refreshHud());
          } else { this._showDialog(['靈石不足…']); }
        });
      }, npc.name);
      return;
    }
    if (npc.boss) {
      if (npc.trigger) {
        const parts = npc.trigger.split('.');
        let val = GS;
        for (const p of parts) val = val?.[p];
        if (!val) { this._showDialog(['此路不通…']); return; }
      }
      const bossDlg = (GS.flags.ngplus && npc.dlgNG) ? npc.dlgNG : npc.dlg;
      this._showDialog([...bossDlg], () => {
        const base = ENEMIES[npc.boss];
        const ngS = GS.flags.ngplus ? 1.35 : 1.0;
        GS.battleData = { enemies:[{
          id:npc.boss, name:base.name,
          hp:Math.floor(base.hp*ngS), maxHp:Math.floor(base.hp*ngS),
          atk:Math.floor(base.atk*ngS), def:Math.floor(base.def*ngS), spd:base.spd,
          color:base.color, sz:base.sz, acts:base.acts, drops:base.drops,
          status:[], dead:false, boss:true,
        }], isBoss:true };
        Sound?.play('bossIntro');
        this.scene.start('BattleScene');
      }, npc.name);
      return;
    }
    if (npc.join) {
      if (GS.getMember(npc.join)) {
        this._showDialog([...npc.dlg], null, npc.name);
        return;
      }
      this._showDialog([...npc.dlg], () => {
        GS.addMember(npc.join);
        this._showDialog([`${CHAR_BASE[npc.join].name} 加入了隊伍！`], () => this.scene.restart());
      }, npc.name);
      return;
    }
    const contextDlg = this._getContextDlg(npc);
    if (contextDlg) { this._showDialog(contextDlg, null, npc.name); return; }
    const dlg = (GS.flags.ngplus && npc.dlgNG) ? npc.dlgNG : npc.dlg;
    this._showDialog([...dlg], null, npc.name);
  }

  _getContextDlg(npc) {
    const f = GS.flags;
    if (npc.name === '老猴子') {
      if (f.defeated_boss)     return ['黃眉大王終於伏誅！天命得成！', '孩子，你做到了。這一路的艱辛，老朽都看在眼裡。', '山河重歸安寧，老朽在此多謝天命之人！'];
      if (f.defeated_dragonKing) return ['東海龍王已敗，龍珠到手！', '前往小西天的路已開，黃眉大王還在等著你。', '快去吧，天命之人，勝利就在眼前！'];
      if (f.defeated_silverKing) return ['銀角大王已伏誅！天命人了不起！', '東海龍宮的路已通，龍王等待挑戰。', '帶著三人之力，繼續前進吧！'];
      if (f.defeatedDragon)    return ['虎先鋒已敗！哈哈哈！', '東海龍宮的大門已為你敞開。', '繼續保持這股氣勢，天命之路必成！'];
    }
    if (npc.name === '村婦') {
      if (f.defeated_boss)   return ['黃眉大王被你除掉了！謝謝你！', '村子的孩子可以回來了，全靠天命之人的英勇！'];
      if (f.defeatedDragon)  return ['聽說你打敗了黃風嶺的虎先鋒！', '村民們都在慶賀，請你多保重！'];
    }
    if (npc.name === '土地廟') {
      if (f.defeated_boss)   return ['〔石碑刻字〕', '黃眉大王已伏，天命圓滿。', '願此後山河無憂，妖氣不生。'];
      if (f.party?.length>=3||GS.party.length>=3) return ['〔石碑刻字〕', '三位天命者已聚，山神之力加護汝等。', '除妖之路，前途光明！'];
    }
    if (npc.name === '客棧掌柜') {
      if (f.defeated_boss)   return ['天命人，黃眉大王已除，天下太平！', '今晚若要住宿，老夫只收半價。', '英雄難得，請多保重！'];
    }
    return null;
  }

  _showDialog(lines, onDone=null, speaker=null) {
    if (!lines.length) { if (onDone) onDone(); return; }
    this.inDialog = true;
    let idx = 0;
    let typing = false;
    let typeTimer = null;

    const W = this.scale.width;
    const boxH = 110;
    const boxY = this.cameras.main.scrollY + this.cameras.main.height - boxH - 56;

    const box = this.add.graphics().setDepth(20);
    box.fillStyle(0x0c0818, 0.97);
    box.fillRoundedRect(20, boxY, W-40, boxH, 10);
    box.lineStyle(2, 0x9a7828, 1);
    box.strokeRoundedRect(20, boxY, W-40, boxH, 10);
    box.lineStyle(1, 0x4a3810, 0.6);
    box.strokeRoundedRect(24, boxY+4, W-48, boxH-8, 7);

    const speakerTxt = speaker ? this.add.text(36, boxY-22, speaker, {
      fontSize:'13px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#ffd700', stroke:'#000', strokeThickness:3,
      backgroundColor:'#0c0818cc', padding:{ x:8, y:3 },
    }).setDepth(21) : null;

    const txt = this.add.text(40, boxY+20, '', {
      fontSize:'15px', fontFamily:'"Noto Serif TC","SimSun",serif',
      color:'#f0e6c8', stroke:'#000', strokeThickness:2,
      wordWrap:{ width: W-80 },
    }).setDepth(21);

    const hint = this.add.text(W-30, boxY+boxH-18, 'Z ▶', {
      fontSize:'11px', fontFamily:'serif', color:'#9a7040', stroke:'#000', strokeThickness:1,
    }).setOrigin(1, 0.5).setDepth(21).setAlpha(0);

    const blinker = this.time.addEvent({ delay:500, loop:true, callback:() => {
      if (!typing) hint.setAlpha(hint.alpha > 0.5 ? 0.3 : 1);
    }});

    const startTyping = () => {
      const full = lines[idx];
      let ci = 0;
      typing = true;
      hint.setAlpha(0);
      if (typeTimer) typeTimer.destroy();
      typeTimer = this.time.addEvent({ delay:35, loop:true, callback:() => {
        ci++;
        txt.setText(full.slice(0, ci));
        if (ci >= full.length) {
          typeTimer.destroy(); typeTimer = null;
          typing = false;
          hint.setAlpha(1);
        }
      }});
    };
    startTyping();

    const padTimer = this.time.addEvent({ delay:80, loop:true, callback:() => {
      if (window.PAD?.ok) { window.PAD.ok = false; handler({ code:'KeyZ' }); }
    }});

    const cleanup = () => {
      if (typeTimer) { typeTimer.destroy(); typeTimer = null; }
      blinker.destroy(); padTimer.destroy();
      box.destroy(); txt.destroy(); hint.destroy();
      if (speakerTxt) speakerTxt.destroy();
      this.inDialog = false;
      this.input.keyboard.off('keydown', handler);
    };

    const handler = (evt) => {
      if (evt.code === 'KeyZ' || evt.code === 'Enter') {
        if (typing) {
          if (typeTimer) { typeTimer.destroy(); typeTimer = null; }
          typing = false;
          txt.setText(lines[idx]);
          hint.setAlpha(1);
          return;
        }
        idx++;
        if (idx < lines.length) {
          txt.setText('');
          startTyping();
        } else {
          cleanup();
          if (onDone) onDone();
        }
      }
    };
    this.input.keyboard.on('keydown', handler);
  }

  _checkAutoExit() {
    const { x, y } = GS.player;
    const exit = MAPS[GS.map].exits?.find(e => e.x===x && e.y===y);
    if (exit) this._doExit(exit);
  }

  update() {
    this._ptCounter++;
    if (this._ptCounter >= 60) { this._ptCounter = 0; GS.flags.playtime = (GS.flags.playtime||0) + 1; }
    if (this.inDialog) return;
    this.bobTimer++;
    this.moveDelay = Math.max(0, this.moveDelay - 1);

    // NPC float bob (redraw every 3 frames to save CPU)
    if (this.bobTimer % 3 === 0 && this.npcObjects) {
      this.npcObjects.forEach(({ g, lbl, npc }) => {
        if (!g._npcBaseY) return;
        const bob = Math.sin(this.bobTimer * 0.04 + g._npcPhase) * 2.8;
        g.clear();
        this._drawNpc(g, npc.x * TILE_SZ + TILE_SZ/2, g._npcBaseY + bob, npc.join ? 0x80e0c0 : 0xd4b060);
        if (lbl.active) lbl.setY(lbl._npcBaseY + bob);
      });
    }

    // Exit portal glow pulse
    if (this._exitGlowG) {
      this._exitGlowG.clear();
      const map = MAPS[GS.map];
      (map.exits||[]).forEach((exit, i) => {
        const ex = exit.x * TILE_SZ + TILE_SZ/2;
        const ey = exit.y * TILE_SZ + TILE_SZ/2;
        const pulse = 0.28 + Math.abs(Math.sin(this.bobTimer * 0.05 + i * 1.8)) * 0.32;
        this._exitGlowG.fillStyle(0x40ff80, pulse * 0.45);
        this._exitGlowG.fillCircle(ex, ey, TILE_SZ * 0.42);
        this._exitGlowG.lineStyle(1.8, 0x80ff80, pulse);
        this._exitGlowG.strokeCircle(ex, ey, TILE_SZ * 0.43);
      });
    }

    if (this.moveDelay > 0) { this._drawPlayer(); return; }

    const up    = this.keys.up.isDown    || this.keys.w.isDown    || !!window.PAD?.up;
    const down  = this.keys.down.isDown  || this.keys.s.isDown   || !!window.PAD?.down;
    const left  = this.keys.left.isDown  || this.keys.a.isDown   || !!window.PAD?.left;
    const right = this.keys.right.isDown || this.keys.d.isDown   || !!window.PAD?.right;
    const okPad = !!window.PAD?.ok;  if (okPad && window.PAD) window.PAD.ok   = false;
    const mnPad = !!window.PAD?.menu; if (mnPad && window.PAD) window.PAD.menu = false;
    const ok    = Phaser.Input.Keyboard.JustDown(this.keys.z)   || Phaser.Input.Keyboard.JustDown(this.keys.enter) || okPad;
    const menu  = Phaser.Input.Keyboard.JustDown(this.keys.x)   || Phaser.Input.Keyboard.JustDown(this.keys.esc)  || mnPad;

    const muteKey = Phaser.Input.Keyboard.JustDown(this.keys.m);
    if (muteKey) {
      const muted = Sound?.toggleMute();
      if (this._muteHint) this._muteHint.destroy();
      this._muteHint = this.add.text(this.scale.width - 20, 20, muted ? '靜音 ON' : '音樂 ON', {
        fontSize:'13px', fontFamily:'serif',
        color: muted ? '#ff8888' : '#88ffcc',
        stroke:'#000', strokeThickness:2,
        backgroundColor:'#00000088', padding:{x:6, y:3},
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
      this.time.delayedCall(1500, () => { if (this._muteHint) { this._muteHint.destroy(); this._muteHint = null; } });
    }
    if (menu) {
      this.scene.launch('MenuScene', { caller:'WorldScene' });
      this.scene.pause(); return;
    }
    if (ok) { this._interact(); return; }

    let moved = false;
    if (up)         moved = this._tryMove(0,-1);
    else if (down)  moved = this._tryMove(0,1);
    else if (left)  moved = this._tryMove(-1,0);
    else if (right) moved = this._tryMove(1,0);

    if (moved) {
      this.moveDelay = 7;
      this._dayStep++;
      if (this._dayStep % 4 === 0) this._drawSky();
      if (this.bobTimer % 12 === 0) Sound?.play('step');
      // Footstep dust
      const dustX = GS.player.x * TILE_SZ + TILE_SZ / 2;
      const dustY = GS.player.y * TILE_SZ + TILE_SZ * 0.75;
      for (let di = 0; di < 2; di++) {
        const dp = this.add.graphics().setDepth(5.5);
        dp.fillStyle(0xa09060, 0.42 + Math.random() * 0.2);
        dp.fillCircle(0, 0, 2 + Math.random() * 2);
        dp.setPosition(dustX + (Math.random() - 0.5) * 12, dustY + Math.random() * 4);
        this.tweens.add({ targets: dp, x: dp.x + (Math.random() - 0.5) * 14, y: dp.y - 8, alpha: 0, scaleX: 2, scaleY: 2, duration: 380 + Math.random() * 200, onComplete: () => dp.destroy() });
      }
      this._drawPlayer();
      this._checkAutoExit();
      if (!this.inDialog) this._checkEnc();
    } else {
      this._drawPlayer();
    }
  }
}
