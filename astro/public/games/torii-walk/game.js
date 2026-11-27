/* 千本鳥居回家路 — 一個小孩，一隻狗，走長長的路回家。
   純 canvas 程序化繪圖，零外部請求。 */
(() => {
  'use strict';

  // ---------- DOM ----------
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hudDist = document.getElementById('hudDist');
  const hudLeaves = document.getElementById('hudLeaves');
  const hudHearts = document.getElementById('hudHearts');
  const hudBest = document.getElementById('hudBest');
  const progressFill = document.getElementById('progressFill');
  const progressWalker = document.getElementById('progressWalker');
  const screens = {
    menu: document.getElementById('screenMenu'),
    win: document.getElementById('screenWin'),
    over: document.getElementById('screenOver'),
    pause: document.getElementById('screenPause'),
  };
  const winStats = document.getElementById('winStats');
  const winBest = document.getElementById('winBest');
  const overStats = document.getElementById('overStats');
  const overBest = document.getElementById('overBest');
  const startBtn = document.getElementById('startBtn');
  const winAgainBtn = document.getElementById('winAgainBtn');
  const winHomeBtn = document.getElementById('winHomeBtn');
  const overAgainBtn = document.getElementById('overAgainBtn');
  const overHomeBtn = document.getElementById('overHomeBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const jumpBtn = document.getElementById('jumpBtn');
  const soundBtn = document.getElementById('soundBtn');
  const restartBtn = document.getElementById('restartBtn');

  // ---------- 常數 ----------
  const GOAL_M = 1000;          // 到家距離（公尺）
  const PX_PER_M = 20;          // 1 公尺 = 20 px
  const GRAV = 2600;            // 重力 px/s^2
  const JUMP_V = 920;           // 跳躍初速 px/s
  const BASE_SPEED = 220;       // 起始速度 px/s
  const MAX_SPEED = 440;        // 最高速度 px/s
  const GATE_GAP = 260;         // 鳥居間距（世界 px）
  const TREE_GAP = 360;         // 楓樹間距（世界 px）
  const BEST_KEY = 'toriiWalkBest';

  // ---------- 狀態 ----------
  let W = 720, H = 420, DPR = 1, groundY = 360;
  let state = 'menu';           // menu | playing | over | win | pause
  let scrollX = 0;              // 世界捲動 px
  let dist = 0;                 // 公尺
  let leaves = 0;
  let hearts = 3;
  let speed = 0;
  let airH = 0;                 // 離地高度 px
  let vy = 0;
  let dogAirH = 0;
  let invUntil = 0;             // 無敵到幾 ms
  let obstacles = [];
  let falling = [];             // 飄落的楓葉
  let spawnIn = 1.0;            // 下一個障礙還有幾秒
  let leafIn = 0.6;             // 下一片自然飄落的楓葉還有幾秒
  let lastT = 0;
  let nowMs = 0;
  let soundOn = true;
  let best = loadBest();

  // ---------- 工具 ----------
  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (!raw) return { dist: 0, leaves: 0 };
      const o = JSON.parse(raw);
      return { dist: o.dist | 0, leaves: o.leaves | 0 };
    } catch (e) { return { dist: 0, leaves: 0 }; }
  }
  function saveBest() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* 忽略 */ }
  }

  // ---------- 音效（WebAudio 合成，無外部檔案） ----------
  let actx = null;
  function beep(f0, f1, dur, type, vol) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* 沒有音訊環境就靜音 */ }
  }
  const sfxJump = () => beep(300, 540, 0.12, 'square', 0.05);
  const sfxLeaf = () => beep(880, 1320, 0.14, 'sine', 0.09);
  const sfxHit = () => beep(180, 60, 0.22, 'sawtooth', 0.1);
  const sfxWin = () => { beep(523, 523, 0.16, 'sine', 0.09); setTimeout(() => beep(659, 659, 0.16, 'sine', 0.09), 140); setTimeout(() => beep(784, 784, 0.3, 'sine', 0.09), 280); };

  // ---------- 尺寸 ----------
  function resize() {
    const w = Math.min(stage.clientWidth, 760);
    const h = clamp(Math.round(w * 0.58), 300, 440);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = w; H = h;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.height = h + 'px';
    groundY = h - 58;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- HUD ----------
  function renderHearts() {
    let html = '';
    for (let i = 0; i < 3; i++) {
      html += hearts > i ? '<span>❤️</span>' : '<span class="lost">❤️</span>';
    }
    hudHearts.innerHTML = html;
    hudHearts.setAttribute('aria-label', '體力 ' + hearts + ' 顆心');
  }
  function renderBest() {
    hudBest.textContent = best.dist > 0 ? best.dist + ' m · 🍁 ' + best.leaves : '—';
  }
  function renderHud() {
    hudDist.textContent = Math.floor(dist);
    hudLeaves.textContent = leaves;
    const pct = clamp(dist / GOAL_M * 100, 0, 100);
    progressFill.style.width = pct + '%';
    progressWalker.style.left = pct + '%';
  }
  function showScreen(name) {
    Object.keys(screens).forEach(k => { screens[k].hidden = (k !== name); });
  }
  renderHearts();
  renderBest();
  renderHud();

  // ---------- 流程 ----------
  function reset() {
    scrollX = 0; dist = 0; leaves = 0; hearts = 3;
    airH = 0; vy = 0; dogAirH = 0; invUntil = 0;
    obstacles = []; falling = [];
    spawnIn = 1.1; leafIn = 0.5;
    renderHearts(); renderHud();
  }
  function startGame() {
    reset();
    state = 'playing';
    showScreen(null);
    sfxJump();
  }
  function toMenu() {
    reset();
    state = 'menu';
    showScreen('menu');
  }
  function gameOver() {
    state = 'over';
    let isBest = false;
    if (Math.floor(dist) > best.dist) { best.dist = Math.floor(dist); isBest = true; }
    if (leaves > best.leaves) { best.leaves = leaves; isBest = true; }
    saveBest(); renderBest();
    overStats.textContent = '走了 ' + Math.floor(dist) + ' m，撿了 ' + leaves + ' 片楓葉' + (isBest ? '（新紀錄！）' : '');
    overBest.textContent = '最佳：' + best.dist + ' m · 🍁 ' + best.leaves;
    showScreen('over');
  }
  function winGame() {
    state = 'win';
    let isBest = false;
    if (Math.floor(dist) > best.dist) { best.dist = Math.floor(dist); isBest = true; }
    if (leaves > best.leaves) { best.leaves = leaves; isBest = true; }
    saveBest(); renderBest();
    sfxWin();
    winStats.textContent = '走了 1000 m，撿了 ' + leaves + ' 片楓葉' + (isBest ? '（新紀錄！）' : '');
    winBest.textContent = '最佳：' + best.dist + ' m · 🍁 ' + best.leaves;
    renderHud();
    showScreen('win');
  }
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'pause';
    showScreen('pause');
  }
  function resumeGame() {
    if (state !== 'pause') return;
    state = 'playing';
    showScreen(null);
  }

  function doJump() {
    if (state === 'menu') { startGame(); return; }
    if (state === 'pause') { resumeGame(); return; }
    if (state !== 'playing') return;
    if (airH <= 0.5) {
      vy = JUMP_V;
      airH = 0.5;
      sfxJump();
    }
  }

  // ---------- 生成 ----------
  function spawnObstacle() {
    const types = ['stone', 'puddle', 'branch'];
    const type = types[Math.floor(Math.random() * types.length)];
    const ob = { type, x: W + 60, passed: false };
    if (type === 'stone') { ob.w = rand(34, 48); ob.h = rand(22, 30); }
    else if (type === 'puddle') { ob.w = rand(56, 74); ob.h = 12; }
    else { ob.w = rand(50, 66); ob.h = 16; }
    obstacles.push(ob);
    // 一半機率在障礙上方排一串楓葉，獎勵跳起來
    if (Math.random() < 0.55) {
      for (let i = 0; i < 3; i++) {
        falling.push({
          x: ob.x + ob.w / 2 + (i - 1) * 34,
          y: groundY - 78 - Math.abs(i - 1) * -22 - (i === 1 ? 26 : 0),
          vy: 0, sway: 0, phase: rand(0, 6.28), rot: rand(-0.5, 0.5),
          hue: Math.floor(rand(0, 3)), arc: true,
        });
      }
    }
  }
  function spawnLeaf() {
    falling.push({
      x: rand(W * 0.45, W + 20),
      y: -16,
      vy: rand(55, 105),
      sway: rand(18, 42),
      phase: rand(0, 6.28),
      rot: rand(-0.6, 0.6),
      hue: Math.floor(rand(0, 3)),
      arc: false,
    });
  }

  // ---------- 更新 ----------
  function update(dt) {
    nowMs = performance.now();
    if (state === 'menu') {
      scrollX += 46 * dt;
      return;
    }
    if (state !== 'playing') return;

    speed = Math.min(MAX_SPEED, BASE_SPEED + dist * 0.22);
    scrollX += speed * dt;
    dist = scrollX / PX_PER_M;

    // 跳躍
    if (airH > 0) {
      vy -= GRAV * dt;
      airH += vy * dt;
      if (airH <= 0) { airH = 0; vy = 0; }
    }
    dogAirH += (airH - dogAirH) * Math.min(1, dt * 14);

    // 生成障礙
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnObstacle();
      const minGap = 250 / speed; // 至少 250px 間隔
      spawnIn = Math.max(minGap, rand(1.0, 1.7) - dist * 0.0004);
    }
    // 自然飄落的楓葉
    leafIn -= dt;
    if (leafIn <= 0) {
      spawnLeaf();
      leafIn = rand(0.9, 1.6);
    }

    // 移動障礙
    const px = playerX();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.x -= speed * dt;
      if (ob.x + ob.w < -80) { obstacles.splice(i, 1); continue; }
      // 碰撞（玩家矩形略縮，寬容一點）
      if (nowMs > invUntil) {
        const pL = px - 13, pR = px + 13;
        const pT = groundY - airH - 52, pB = groundY - airH;
        const oL = ob.x, oR = ob.x + ob.w, oT = groundY - ob.h, oB = groundY;
        if (pR > oL && pL < oR && pB > oT + 4 && pT < oB) {
          hearts -= 1;
          renderHearts();
          invUntil = nowMs + 1400;
          sfxHit();
          stage.classList.remove('hit');
          void stage.offsetWidth; // 重啟 shake 動畫
          stage.classList.add('hit');
          if (hearts <= 0) { gameOver(); return; }
        }
      }
    }

    // 楓葉
    const chestX = px + 4;
    const chestY = groundY - airH - 30;
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      if (!f.arc) {
        f.y += f.vy * dt;
        f.phase += dt * 2.2;
        f.x += Math.sin(f.phase) * f.sway * dt;
      } else {
        f.x -= speed * dt; // 弧線葉跟著世界走
      }
      const dx = f.x - chestX, dy = f.y - chestY;
      if (dx * dx + dy * dy < 36 * 36) {
        falling.splice(i, 1);
        leaves += 1;
        hudLeaves.textContent = leaves;
        sfxLeaf();
        continue;
      }
      if (f.y > groundY + 24 || f.x < -40) falling.splice(i, 1);
    }

    // 到家
    if (dist >= GOAL_M) { winGame(); return; }
    renderHud();
  }

  function playerX() { return Math.round(W * 0.26); }

  // ---------- 繪圖 ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function ellipse(x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#ffe9bd');
    g.addColorStop(0.55, '#ffc98f');
    g.addColorStop(1, '#ff9e7a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);
    // 太陽
    ctx.fillStyle = 'rgba(255, 214, 130, 0.55)';
    ellipse(W * 0.78, H * 0.2, 52, 52); ctx.fill();
    ctx.fillStyle = '#ffdf8a';
    ellipse(W * 0.78, H * 0.2, 36, 36); ctx.fill();
  }

  function drawMountains() {
    const layers = [
      { p: 0.22, base: groundY - 92, amp: 26, col: 'rgba(216, 138, 106, 0.55)' },
      { p: 0.42, base: groundY - 58, amp: 20, col: 'rgba(190, 110, 84, 0.6)' },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(-4, groundY);
      for (let x = -4; x <= W + 4; x += 24) {
        const y = L.base + Math.sin((x + scrollX * L.p) * 0.012) * L.amp
          + Math.sin((x + scrollX * L.p) * 0.0031 + 2) * 14;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 4, groundY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds() {
    ctx.fillStyle = 'rgba(255, 250, 240, 0.85)';
    for (let i = 0; i < 4; i++) {
      const span = W + 320;
      let x = (i * 310 + 90 - scrollX * 0.12) % span;
      if (x < -160) x += span;
      const y = 34 + i * 26 + hash(i + 9) * 14;
      ellipse(x, y, 42, 14); ctx.fill();
      ellipse(x + 28, y + 4, 32, 12); ctx.fill();
      ellipse(x - 30, y + 5, 28, 11); ctx.fill();
    }
  }

  function drawTree(sx, s, seed) {
    const baseY = groundY + 4;
    const trunkH = 62 * s;
    ctx.strokeStyle = '#7a4a30';
    ctx.lineWidth = 7 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, baseY);
    ctx.quadraticCurveTo(sx + 4 * s, baseY - trunkH * 0.55, sx + (hash(seed + 1) - 0.5) * 14 * s, baseY - trunkH);
    ctx.stroke();
    // 楓葉樹冠：三團紅橘金
    const cols = ['#d9382b', '#e05a3a', '#f2a03d'];
    const blobs = [
      [0, -trunkH - 16 * s, 30 * s],
      [-24 * s, -trunkH - 4 * s, 22 * s],
      [24 * s, -trunkH - 4 * s, 22 * s],
      [0, -trunkH - 30 * s, 20 * s],
    ];
    for (let i = 0; i < blobs.length; i++) {
      ctx.fillStyle = cols[(i + Math.floor(hash(seed) * 3)) % 3];
      ellipse(sx + blobs[i][0], baseY + blobs[i][1], blobs[i][2], blobs[i][2] * 0.82);
      ctx.fill();
    }
    // 樹冠暗邊
    ctx.strokeStyle = 'rgba(120, 40, 20, 0.35)';
    ctx.lineWidth = 2;
    ellipse(sx, baseY - trunkH - 16 * s, 30 * s, 30 * s * 0.82); ctx.stroke();
  }

  function drawTorii(sx) {
    const w = 92, h = 148;
    const top = groundY - h;
    ctx.lineCap = 'round';
    // 柱
    ctx.fillStyle = '#d9382b';
    ctx.strokeStyle = '#8f1d12';
    ctx.lineWidth = 2;
    rr(sx - w / 2 + 6, top + 26, 11, h - 26, 4); ctx.fill(); ctx.stroke();
    rr(sx + w / 2 - 17, top + 26, 11, h - 26, 4); ctx.fill(); ctx.stroke();
    // 上楣（笠木）：微彎，兩端上翹
    ctx.fillStyle = '#2b2622';
    ctx.beginPath();
    ctx.moveTo(sx - w / 2 - 8, top + 16);
    ctx.quadraticCurveTo(sx, top - 4, sx + w / 2 + 8, top + 16);
    ctx.lineTo(sx + w / 2 + 8, top + 24);
    ctx.quadraticCurveTo(sx, top + 6, sx - w / 2 - 8, top + 24);
    ctx.closePath();
    ctx.fill();
    // 下楣（島木）
    ctx.fillStyle = '#d9382b';
    rr(sx - w / 2 + 2, top + 34, w - 4, 10, 4); ctx.fill();
    ctx.strokeStyle = '#8f1d12'; ctx.stroke();
    // 中央匾額
    ctx.fillStyle = '#2b2622';
    rr(sx - 13, top + 48, 26, 16, 3); ctx.fill();
    ctx.fillStyle = '#f2b544';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('千', sx, top + 57);
    // 貫（中間橫木）
    ctx.fillStyle = '#c62f24';
    rr(sx - w / 2 + 12, top + 84, w - 24, 7, 3); ctx.fill();
  }

  function drawLantern(sx) {
    const baseY = groundY + 2;
    ctx.fillStyle = '#9a938a';
    ctx.strokeStyle = '#6e675f';
    ctx.lineWidth = 1.5;
    rr(sx - 9, baseY - 46, 18, 12, 2); ctx.fill(); ctx.stroke(); // 笠
    rr(sx - 7, baseY - 34, 14, 16, 2); ctx.fill(); ctx.stroke(); // 火袋
    ctx.fillStyle = '#ffd98a';
    ellipse(sx, baseY - 26, 4, 5); ctx.fill(); // 燈光
    rr(sx - 5, baseY - 18, 10, 18, 2); ctx.fillStyle = '#9a938a'; ctx.fill(); ctx.stroke(); // 柱
  }

  function drawSign(sx, meters) {
    const baseY = groundY + 2;
    ctx.strokeStyle = '#7a4a30';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx, baseY); ctx.lineTo(sx, baseY - 34); ctx.stroke();
    ctx.fillStyle = '#f6e3c2';
    ctx.strokeStyle = '#8a6a48';
    ctx.lineWidth = 1.5;
    rr(sx - 20, baseY - 56, 40, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a4a2a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meters + 'm', sx, baseY - 45);
  }

  function drawHouse(sx) {
    const baseY = groundY + 4;
    // 牆
    ctx.fillStyle = '#fdf1d7';
    ctx.strokeStyle = '#8a6a48';
    ctx.lineWidth = 2;
    rr(sx - 58, baseY - 78, 116, 78, 4); ctx.fill(); ctx.stroke();
    // 屋頂
    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath();
    ctx.moveTo(sx - 70, baseY - 74);
    ctx.lineTo(sx, baseY - 118);
    ctx.lineTo(sx + 70, baseY - 74);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9382b';
    ctx.fillRect(sx - 4, baseY - 126, 8, 10);
    // 門
    ctx.fillStyle = '#7a4a30';
    rr(sx - 14, baseY - 44, 28, 44, 4); ctx.fill();
    // 窗（暖光）
    ctx.fillStyle = '#ffd98a';
    rr(sx - 48, baseY - 62, 24, 22, 3); ctx.fill();
    rr(sx + 24, baseY - 62, 24, 22, 3); ctx.fill();
    ctx.strokeStyle = '#8a6a48';
    ctx.strokeRect(sx - 48, baseY - 62, 24, 22);
    ctx.strokeRect(sx + 24, baseY - 62, 24, 22);
  }

  function drawGround() {
    // 草地帶
    ctx.fillStyle = '#c98f5a';
    ctx.fillRect(0, groundY - 10, W, 12);
    // 泥土路
    ctx.fillStyle = '#eec184';
    ctx.fillRect(0, groundY + 2, W, H - groundY);
    // 路面斑點
    ctx.fillStyle = 'rgba(160, 110, 60, 0.35)';
    const off = scrollX % 46;
    for (let x = -off; x < W; x += 46) {
      ellipse(x + 12, groundY + 22 + hash(Math.floor((scrollX + x) / 46)) * 18, 7, 3);
      ctx.fill();
    }
    // 路緣草叢
    ctx.strokeStyle = '#7a9a4a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const off2 = scrollX % 74;
    for (let x = -off2; x < W; x += 74) {
      const gx = x + 20;
      ctx.beginPath();
      ctx.moveTo(gx, groundY + 2);
      ctx.quadraticCurveTo(gx - 4, groundY - 8, gx - 7, groundY - 12);
      ctx.moveTo(gx + 4, groundY + 2);
      ctx.quadraticCurveTo(gx + 6, groundY - 7, gx + 9, groundY - 11);
      ctx.stroke();
    }
  }

  function drawObstacle(ob) {
    const y = groundY;
    if (ob.type === 'stone') {
      ctx.fillStyle = '#a8a29a';
      ctx.strokeStyle = '#6e675f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ob.x, y);
      ctx.quadraticCurveTo(ob.x + 2, y - ob.h, ob.x + ob.w / 2, y - ob.h);
      ctx.quadraticCurveTo(ob.x + ob.w - 2, y - ob.h, ob.x + ob.w, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ellipse(ob.x + ob.w * 0.35, y - ob.h * 0.7, 6, 3.5); ctx.fill();
    } else if (ob.type === 'puddle') {
      ctx.fillStyle = '#7fb8d8';
      ellipse(ob.x + ob.w / 2, y - 3, ob.w / 2, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ellipse(ob.x + ob.w * 0.35, y - 4, ob.w * 0.22, 2.5); ctx.fill();
      ctx.strokeStyle = 'rgba(90,140,170,0.8)';
      ctx.lineWidth = 1.5;
      ellipse(ob.x + ob.w / 2, y - 3, ob.w / 2, 6); ctx.stroke();
    } else {
      // 倒下的樹枝
      ctx.strokeStyle = '#7a4a30';
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(ob.x, y - 3);
      ctx.lineTo(ob.x + ob.w, y - 9);
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(ob.x + ob.w * 0.4, y - 6);
      ctx.lineTo(ob.x + ob.w * 0.55, y - 18);
      ctx.moveTo(ob.x + ob.w * 0.7, y - 8);
      ctx.lineTo(ob.x + ob.w * 0.85, y - 16);
      ctx.stroke();
      ctx.fillStyle = '#e05a3a';
      ellipse(ob.x + ob.w * 0.55, y - 19, 5, 4); ctx.fill();
    }
  }

  const LEAF_COLS = ['#d9382b', '#e05a3a', '#f2a03d'];
  function drawLeaf(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot + Math.sin(f.phase) * 0.35);
    ctx.fillStyle = LEAF_COLS[f.hue];
    ctx.strokeStyle = 'rgba(120, 40, 20, 0.4)';
    ctx.lineWidth = 1;
    // 五瓣楓葉
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const tx = Math.cos(a) * 11, ty = Math.sin(a) * 11;
      const mx = Math.cos(a + 0.55) * 4.5, my = Math.sin(a + 0.55) * 4.5;
      if (i === 0) ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.quadraticCurveTo(Math.cos(a + 0.72) * 4.5, Math.sin(a + 0.72) * 4.5, 0, 0);
    }
    ctx.fill(); ctx.stroke();
    // 葉柄
    ctx.strokeStyle = '#7a4a30';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 11); ctx.stroke();
    ctx.restore();
  }

  function drawChild(px, phase) {
    const feetY = groundY - airH;
    const swing = Math.sin(phase) * (airH > 0 ? 0.4 : 1);
    const bob = airH > 0 ? 0 : Math.abs(Math.sin(phase)) * 2;
    const blink = state === 'playing' && nowMs < invUntil && Math.floor(nowMs / 110) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.35;
    ctx.translate(px, feetY - bob);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 腿（走路擺動）
    ctx.strokeStyle = '#3d3d5c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(-6 + swing * 7, 0);
    ctx.moveTo(0, -26);
    ctx.lineTo(6 - swing * 7, 0);
    ctx.stroke();
    // 鞋
    ctx.fillStyle = '#d9382b';
    ellipse(-6 + swing * 7, -1, 6, 3.5); ctx.fill();
    ellipse(6 - swing * 7, -1, 6, 3.5); ctx.fill();
    // 書包（背後）
    ctx.fillStyle = '#8a5a2e';
    ctx.strokeStyle = '#5e3a1a';
    ctx.lineWidth = 1.5;
    rr(-17, -48, 13, 20, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2b544';
    ctx.fillRect(-14, -42, 7, 4);
    // 身體（芥末黃外套）
    ctx.fillStyle = '#f2b544';
    ctx.strokeStyle = '#a87608';
    rr(-9, -52, 19, 28, 8); ctx.fill(); ctx.stroke();
    // 手臂
    ctx.strokeStyle = '#f2b544';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, -46);
    ctx.lineTo(13 - swing * 6, -34);
    ctx.stroke();
    // 紅圍巾（飄）
    ctx.strokeStyle = '#d9382b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-2, -50);
    ctx.quadraticCurveTo(-14, -52 + Math.sin(phase * 1.3) * 3, -22, -48 + Math.sin(phase * 1.3 + 1) * 4);
    ctx.stroke();
    // 頭
    ctx.fillStyle = '#ffd9b0';
    ctx.strokeStyle = '#c98f5a';
    ctx.lineWidth = 1.5;
    ellipse(2, -60, 11, 11); ctx.fill(); ctx.stroke();
    // 頭髮
    ctx.fillStyle = '#4a3226';
    ctx.beginPath();
    ctx.arc(2, -62, 11, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(12, -56, 10, -52);
    ctx.quadraticCurveTo(2, -58, -8, -53);
    ctx.closePath();
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#2b2622';
    ellipse(6, -60, 1.4, 1.8); ctx.fill();
    ctx.restore();
  }

  function drawDog(px, phase) {
    const feetY = groundY - dogAirH;
    const bob = dogAirH > 0 ? 0 : Math.abs(Math.sin(phase + 0.9)) * 1.5;
    const wag = Math.sin(nowMs / 90) * 0.5;
    ctx.save();
    ctx.translate(px, feetY - bob);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 尾巴
    ctx.strokeStyle = '#e8913a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, -22);
    ctx.quadraticCurveTo(-24, -30 + wag * 6, -27, -34 + wag * 8);
    ctx.stroke();
    // 腿
    ctx.strokeStyle = '#c96f1e';
    ctx.lineWidth = 4;
    const s1 = Math.sin(phase + 0.9), s2 = Math.sin(phase + 0.9 + Math.PI);
    ctx.beginPath();
    ctx.moveTo(-9, -12); ctx.lineTo(-9 + s1 * 5, 0);
    ctx.moveTo(9, -12); ctx.lineTo(9 + s2 * 5, 0);
    ctx.moveTo(-4, -12); ctx.lineTo(-4 + s2 * 5, 0);
    ctx.moveTo(5, -12); ctx.lineTo(5 + s1 * 5, 0);
    ctx.stroke();
    // 身體
    ctx.fillStyle = '#e8913a';
    ctx.strokeStyle = '#b35f14';
    ctx.lineWidth = 1.5;
    ellipse(0, -18, 17, 10); ctx.fill(); ctx.stroke();
    // 頭
    ctx.fillStyle = '#e8913a';
    ellipse(17, -26, 9, 8); ctx.fill(); ctx.stroke();
    // 垂耳
    ctx.fillStyle = '#c96f1e';
    ellipse(13, -24, 4, 6); ctx.fill();
    // 鼻子
    ctx.fillStyle = '#2b2622';
    ellipse(25, -27, 2.4, 2); ctx.fill();
    // 眼睛
    ellipse(19, -28, 1.3, 1.6); ctx.fill();
    ctx.restore();
  }

  // ---------- 主繪製 ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawClouds();
    drawMountains();
    // 楓樹（中景）
    const treeP = 0.6;
    const firstTree = Math.floor((scrollX * treeP - 160) / TREE_GAP);
    for (let j = firstTree; j < firstTree + Math.ceil(W / TREE_GAP) + 3; j++) {
      const wx = j * TREE_GAP + hash(j) * 150;
      const sx = wx - scrollX * treeP;
      if (sx < -120 || sx > W + 120) continue;
      drawTree(sx, 0.8 + hash(j + 40) * 0.5, j);
    }
    // 鳥居（前景）
    const firstGate = Math.floor((scrollX - 120) / GATE_GAP);
    for (let i = firstGate; i < firstGate + Math.ceil(W / GATE_GAP) + 3; i++) {
      if (i < 0) continue;
      const sx = i * GATE_GAP - scrollX;
      if (sx < -130 || sx > W + 130) continue;
      drawTorii(sx);
      if (i % 4 === 2) drawLantern(sx + 78);
    }
    // 里程牌（每 100 m）
    const firstSign = Math.floor((scrollX - 60) / (100 * PX_PER_M));
    for (let m = firstSign; m < firstSign + 3; m++) {
      if (m <= 0 || m >= 10) continue;
      const sx = m * 100 * PX_PER_M - scrollX;
      if (sx < -60 || sx > W + 60) continue;
      drawSign(sx, m * 100);
    }
    // 家（最後 100 m 出現）
    const houseX = GOAL_M * PX_PER_M - scrollX;
    if (houseX < W + 140) drawHouse(Math.min(houseX, W - 70));
    drawGround();
    // 障礙與楓葉
    for (const ob of obstacles) drawObstacle(ob);
    for (const f of falling) drawLeaf(f);
    // 孩子與狗
    const px = playerX();
    const phase = scrollX * 0.045;
    drawDog(px - 48, phase);
    drawChild(px, phase);
  }

  // ---------- 主迴圈 ----------
  function loop(t) {
    const dt = Math.min((t - lastT) / 1000 || 0, 0.05);
    lastT = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 輸入 ----------
  function bindTap(el, fn) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  }
  bindTap(stage, () => {
    if (state === 'playing' || state === 'menu' || state === 'pause') doJump();
  });
  bindTap(jumpBtn, doJump);
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state === 'over' || state === 'win') { startGame(); return; }
      doJump();
    }
    if (e.code === 'Enter' && (state === 'over' || state === 'win')) startGame();
  });
  startBtn.addEventListener('click', startGame);
  winAgainBtn.addEventListener('click', startGame);
  overAgainBtn.addEventListener('click', startGame);
  winHomeBtn.addEventListener('click', toMenu);
  overHomeBtn.addEventListener('click', toMenu);
  resumeBtn.addEventListener('click', resumeGame);
  restartBtn.addEventListener('click', () => { if (state !== 'menu') startGame(); });
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊 音效開' : '🔇 音效關';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  // 測試用（不影響遊玩）：window.__toriiWalk
  window.__toriiWalk = {
    get state() { return state; },
    get dist() { return dist; },
    get leaves() { return leaves; },
    get hearts() { return hearts; },
    start: startGame,
    jump: doJump,
    setDist(m) { scrollX = m * PX_PER_M; dist = m; },
    spawnLeafAt(x, y) { falling.push({ x, y, vy: 0, sway: 0, phase: 0, rot: 0, hue: 0, arc: true }); },
    spawnObstacleAt(type, x) {
      const ob = { type, x, passed: false };
      ob.w = type === 'puddle' ? 60 : 40;
      ob.h = type === 'puddle' ? 12 : 26;
      obstacles.push(ob);
    },
  };

  lastT = performance.now();
  requestAnimationFrame(loop);
})();
