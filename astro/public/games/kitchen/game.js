/* 不說廚房 — 多人合作料理遊戲（前端）
   純前端、零對外請求（只打本站 /api/games/kitchen）。
   玩法為原創實作，角色與菜色皆為本站自有（香菇柯基主廚＋台灣家常菜）。
   同步方式：輪詢 GET 房間狀態（1.5 秒），動作用 POST，計時以伺服器時間戳為準。 */
(function () {
  'use strict';

  var API = '/api/games/kitchen';
  var LS_TOKEN = 'kitchenTokenV1';
  var LS_ACCOUNT = 'kitchenAccountV1';
  var LS_ROOM = 'kitchenRoomV1';
  var PATIENCE_MS = { easy: 75000, normal: 60000, hard: 45000 };
  var DIFF_NAME = { easy: '簡單', normal: '普通', hard: '困難' };
  var STEP_MUL = { easy: 1, normal: 1, hard: 1.25 };

  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var toastEl = $('toast');
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mmss(ms) {
    ms = Math.max(0, ms);
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- 帳號 ---------- */
  var token = localStorage.getItem(LS_TOKEN) || '';
  var account = null;
  try { account = JSON.parse(localStorage.getItem(LS_ACCOUNT) || 'null'); } catch (e) { account = null; }
  var roomCode = localStorage.getItem(LS_ROOM) || '';
  var room = null;          // 最近一次的房間狀態
  var serverOffset = 0;     // room.now - Date.now()
  var pollTimer = null;
  var pollSeq = 0;
  var pendingRecovery = ''; // 剛建帳號的恢復碼：等進房後用小橫條顯示，不擋畫面
  function now() { return Date.now() + serverOffset; }

  async function api(path, method, body, useToken) {
    var headers = { 'Content-Type': 'application/json' };
    if (useToken !== false && token) headers.Authorization = 'Bearer ' + token;
    var res = await fetch(API + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined });
    var json = {};
    try { json = await res.json(); } catch (e) { /* 非 JSON 當作空 */ }
    if (!res.ok) { var err = new Error(json.error || ('請求失敗（' + res.status + '）')); err.status = res.status; throw err; }
    return json;
  }
  async function ensureAccount(name) {
    if (token && account) {
      try { var me = await api('/accounts', 'POST', { action: 'me' }); account = me.account; saveAccount(); return account; }
      catch (e) { /* token 失效，往下重建 */ token = ''; }
    }
    var r = await api('/accounts', 'POST', { action: 'create', displayName: name }, false);
    token = r.token; account = r.account; saveAccount();
    pendingRecovery = r.recoveryCode;
    return account;
  }
  function saveAccount() {
    if (token) localStorage.setItem(LS_TOKEN, token); else localStorage.removeItem(LS_TOKEN);
    if (account) localStorage.setItem(LS_ACCOUNT, JSON.stringify(account)); else localStorage.removeItem(LS_ACCOUNT);
  }
  function saveRoom() { if (roomCode) localStorage.setItem(LS_ROOM, roomCode); else localStorage.removeItem(LS_ROOM); }

  /* ---------- 畫面切換 ---------- */
  function show(id) {
    ['screen-join', 'screen-lobby', 'screen-game', 'screen-settle'].forEach(function (s) { $(s).hidden = s !== id; });
    $('topStats').hidden = id !== 'screen-game';
    $('leaveBtn').hidden = !(id === 'screen-lobby' || id === 'screen-game');
  }
  function showModal(html) { $('modalRoot').innerHTML = '<div class="kc-modal-back"><div class="kc-modal">' + html + '</div></div>'; }
  function closeModal() { $('modalRoot').innerHTML = ''; }
  function showRecoveryNote() {
    if (!pendingRecovery) return;
    var html = '🔑 恢復碼：<b>' + esc(pendingRecovery) + '</b>（換裝置或清瀏覽器資料時，靠它找回同一個暱稱）' +
      '<button class="kc-btn small" type="button" data-action="dismiss-recovery">我記下來了</button>';
    ['recoveryNote', 'recoveryNoteLobby'].forEach(function (id) {
      var el = $(id);
      if (el) { el.innerHTML = html; el.hidden = false; }
    });
  }
  function showHelp() {
    showModal('<h2>🍳 怎麼玩</h2>' +
      '<p><b>開房：</b>輸入暱稱、選難度，開一間廚房拿 4 碼房號，朋友輸入房號加入（1–6 人）。</p>' +
      '<p><b>接單：</b>客人點的單會出現在上方，每張單有等待時間，點「接單」就是你的，別人看得到是誰接的。</p>' +
      '<p><b>做菜：</b>每道菜有 2 個步驟，點「做」會占用對應工作站（備料台／煎炸台／燉煮鍋），煮好 12 秒內要按「收成」，不然燒焦重做。</p>' +
      '<p><b>出餐：</b>步驟做完按「出餐」賺錢，做得快還有小費。客人等太久會走人，已接的單還會扣 20 元。</p>' +
      '<p><b>班次：</b>每班 2:30，共 3 班，班班結算；零失誤有獎金。斷線重進：重新整理頁面就會回到同一間廚房。</p>' +
      '<button class="kc-btn primary" data-action="close-modal" type="button">知道了</button>');
  }

  /* ---------- 加入／開房 ---------- */
  function nick() { return $('nickInput').value.trim(); }
  async function withAccount(fn) {
    var name = nick();
    if (!name) { toast('先輸入暱稱'); $('nickInput').focus(); return; }
    try { await ensureAccount(name); await fn(); }
    catch (e) { toast(e.message || '出錯了'); showRecoveryNote(); }
  }
  async function createRoom() {
    var diff = (document.querySelector('input[name="diff"]:checked') || {}).value || 'normal';
    var r = await api('', 'POST', { difficulty: diff });
    enterRoom(r.room);
    toast('廚房開張！房號 ' + r.room.code);
  }
  async function joinRoom(code) {
    code = (code || $('codeInput').value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { toast('房號是 4 碼英文數字'); return; }
    var r = await api('/' + code, 'POST', { action: 'join' });
    enterRoom(r.room);
    toast('進廚房了！');
  }
  function enterRoom(r) {
    room = r;
    roomCode = r.code;
    serverOffset = (r.now || Date.now()) - Date.now();
    saveRoom();
    render();
    showRecoveryNote();
    startPoll();
  }
  async function refreshPublicRooms() {
    try {
      var r = await api('', 'GET', null, false);
      var box = $('publicRooms');
      if (!r.rooms.length) { box.innerHTML = '<p class="kc-hint">現在沒有公開廚房，自己開一間吧。</p>'; return; }
      box.innerHTML = r.rooms.map(function (rm) {
        return '<button class="kc-room-item" type="button" data-action="join-public" data-code="' + esc(rm.code) + '">' +
          '<b>' + esc(rm.code) + '</b><span>' + esc(rm.hostName) + ' 的廚房・' + esc(rm.difficultyName) + '</span>' +
          '<span style="margin-left:auto">' + rm.playerCount + '/6 人</span></button>';
      }).join('');
    } catch (e) { $('publicRooms').innerHTML = '<p class="kc-hint">公開廚房載入失敗，稍後再試。</p>'; }
  }

  /* ---------- 輪詢 ---------- */
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(poll, 1500);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  async function poll() {
    if (!roomCode) return;
    var seq = ++pollSeq;
    try {
      var r = await api('/' + roomCode, 'GET');
      if (seq !== pollSeq) return; // 過期的回應不要
      room = r.room;
      serverOffset = (r.room.now || Date.now()) - Date.now();
      render();
    } catch (e) {
      if (e.status === 404 || e.status === 403) {
        stopPoll(); roomCode = ''; room = null; saveRoom();
        show('screen-join'); refreshPublicRooms();
        toast('那間廚房找不到了（可能已打烊）');
      }
    }
  }

  /* ---------- 動作 ---------- */
  async function act(action, extra) {
    try {
      var body = Object.assign({ action: action }, extra || {});
      var r = await api('/' + roomCode, 'POST', body);
      if (r.room) { room = r.room; serverOffset = (r.room.now || Date.now()) - Date.now(); render(); }
      return r;
    } catch (e) { toast(e.message || '出錯了'); throw e; }
  }

  /* ---------- 渲染 ---------- */
  function playerItem(p) {
    return '<li><span class="kc-dot" style="background:' + esc(p.color) + '"></span>' +
      '<span class="kc-pname">' + esc(p.name) + '</span>' +
      '<span class="kc-ptag">' + (p.isHost ? '👑 房主 ' : '') + '🍽️' + p.served + '・✅' + p.stepsDone +
      (p.online === false ? ' <span class="kc-off">・離線</span>' : '') + '</span></li>';
  }
  function render() {
    if (!room) return;
    if (room.status === 'lobby') {
      show('screen-lobby');
      $('roomCodeBig').textContent = room.code;
      $('lobbyDiff').textContent = '難度：' + DIFF_NAME[room.difficulty] + '・第 1 班 2:30・共 3 班';
      $('playerCount').textContent = room.players.length + '/6 人';
      $('lobbyPlayers').innerHTML = room.players.map(playerItem).join('');
      $('startBtn').disabled = !(room.me && room.me.isHost);
      $('startHint').textContent = room.me && room.me.isHost ? '你是房主，人到齊就按開工。' : '等房主按開工…';
    } else if (room.status === 'playing') {
      show('screen-game');
      $('goldVal').textContent = room.money;
      $('shiftVal').textContent = '第 ' + room.shift + ' 班';
      $('servedVal').textContent = room.served;
      renderGame();
    } else if (room.status === 'finished') {
      stopPoll();
      show('screen-settle');
      $('finalMoney').textContent = room.money;
      $('finalServed').textContent = room.served;
      $('finalScore').textContent = room.score == null ? 0 : room.score;
      $('finalRank').innerHTML = (room.ranking || []).map(function (r) {
        return '<li><span class="kc-dot" style="background:' + esc(r.color) + '"></span><span class="kc-pname">' + esc(r.name) + '</span>' +
          '<span>出餐 ' + r.served + '・步驟 ' + r.stepsDone + '</span><span class="pts">' + r.points + ' 分</span></li>';
      }).join('');
    }
  }
  function renderGame() {
    // 訂單
    var box = $('orders');
    if (!room.orders.length) {
      box.innerHTML = '<p class="kc-empty">還沒有客人…等一下就有單進來了 🍜</p>';
    } else {
      box.innerHTML = room.orders.map(function (o) {
        var mine = o.takenBy && room.me && o.takenBy === room.me.accountId;
        var total = PATIENCE_MS[room.difficulty] || 60000;
        var stepsHtml = o.steps.map(function (s, i) {
          var cls = i < o.progress ? 'done' : (i === o.progress ? 'now' : '');
          return '<li class="' + cls + '">' + (i < o.progress ? '✅ ' : '') + esc(s.label) +
            ' <span class="st">' + esc(s.stationEmoji) + esc(s.stationName) + '・' + s.secs + ' 秒</span></li>';
        }).join('');
        var body = '';
        if (o.ready) {
          body += '<div class="kc-ready">🔔 「' + esc(o.ready.label) + '」好了！<span class="kc-burn-count" data-ends="' + o.ready.burnsAt + '"></span> 內收成，不然燒焦！</div>';
        } else if (o.cooking) {
          body += '<div class="kc-cooking">⏳ 料理中：「' + esc(o.cooking.label) + '」（' + esc(o.cooking.byName) + '）…</div>';
        }
        var actions = '';
        if (!o.takenBy) {
          actions += '<button class="kc-btn primary" type="button" data-action="take" data-id="' + o.id + '">📋 接單</button>';
        } else if (mine && !o.cooking && !o.ready && o.progress < o.stepsTotal) {
          actions += '<button class="kc-btn" type="button" data-action="release" data-id="' + o.id + '">放回這張單</button>';
        }
        if (o.ready) {
          actions += '<button class="kc-btn primary" type="button" data-action="collect" data-id="' + o.id + '">✅ 收成</button>';
        } else if (o.takenBy && o.nextStep) {
          actions += '<button class="kc-btn primary" type="button" data-action="cook" data-id="' + o.id + '">' + esc(o.nextStep.stationEmoji) + ' 做：' + esc(o.nextStep.label) + '</button>';
        }
        if (o.progress >= o.stepsTotal) {
          actions += '<button class="kc-btn primary" type="button" data-action="serve" data-id="' + o.id + '">🍽️ 出餐 +' + o.price + ' 元</button>';
        }
        return '<article class="kc-order' + (mine ? ' mine' : '') + '">' +
          '<div class="kc-order-head"><span class="kc-order-emoji">' + esc(o.emoji) + '</span>' +
          '<span class="kc-order-name">' + esc(o.dishName) + '</span>' +
          '<span class="kc-order-price">🪙 ' + o.price + '</span></div>' +
          '<div class="kc-patience"><div class="kc-patience-fill" data-ends="' + o.patienceEndsAt + '" data-total="' + total + '"></div></div>' +
          '<p class="kc-order-taker">' + (o.takenBy ? '👨‍🍳 ' + esc(o.takenByName) + ' 負責' + (mine ? '（你）' : '') : '還沒人接') + '・' + o.progress + '/' + o.stepsTotal + ' 步</p>' +
          '<ul class="kc-steps">' + stepsHtml + '</ul>' + body +
          '<div class="kc-order-actions">' + actions + '</div></article>';
      }).join('');
    }
    $('orderHint').textContent = '共 ' + room.orders.length + ' 張單';
    // 工作站
    $('stations').innerHTML = room.stations.map(function (st) {
      var state = '空閒中';
      var bar = '';
      if (st.job) {
        var order = room.orders.find(function (o) { return o.id === st.job.orderId; });
        var dishName = order ? order.dishName : '';
        var dur = 6000;
        if (order) { var step = order.steps[st.job.stepIdx]; if (step) dur = step.secs * 1000 * (STEP_MUL[room.difficulty] || 1); }
        state = '🔥 ' + esc(dishName) + '：' + esc(st.job.label) + '（' + esc(st.job.byName) + '）';
        bar = '<div class="kc-station-bar"><div class="kc-station-fill" data-ends="' + st.job.endsAt + '" data-dur="' + dur + '"></div></div>';
      } else if (st.done) {
        state = '🔔 做好了，等收成';
      }
      return '<div class="kc-station' + (st.job ? ' busy' : '') + '"><div class="kc-station-emoji">' + esc(st.emoji) + '</div>' +
        '<div class="kc-station-name">' + esc(st.name) + '</div><div class="kc-station-state">' + state + '</div>' + bar + '</div>';
    }).join('');
    // 廚師與日誌
    $('gamePlayers').innerHTML = room.players.map(playerItem).join('');
    $('gameLog').innerHTML = room.log.slice(-12).reverse().map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
    tickLocal();
  }
  /* 本地倒數（兩次輪詢之間讓進度條動起來） */
  function tickLocal() {
    var t = now();
    var remain = room.shiftEndsAt - t;
    $('shiftClock').textContent = mmss(remain);
    $('shiftFill').style.width = Math.max(0, Math.min(100, remain / (room.shiftMs || 150000) * 100)) + '%';
    document.querySelectorAll('.kc-patience-fill').forEach(function (el) {
      var total = parseFloat(el.getAttribute('data-total')) || 60000;
      var left = parseFloat(el.getAttribute('data-ends')) - t;
      el.style.width = Math.max(0, Math.min(100, left / total * 100)) + '%';
      el.classList.toggle('low', left < 15000);
    });
    document.querySelectorAll('.kc-station-fill').forEach(function (el) {
      var dur = parseFloat(el.getAttribute('data-dur')) || 6000;
      var left = parseFloat(el.getAttribute('data-ends')) - t;
      el.style.width = Math.max(0, Math.min(100, (1 - left / dur) * 100)) + '%';
    });
    document.querySelectorAll('.kc-burn-count').forEach(function (el) {
      el.textContent = '剩 ' + Math.max(0, Math.ceil((parseFloat(el.getAttribute('data-ends')) - t) / 1000)) + ' 秒';
    });
  }
  setInterval(function () { if (room && room.status === 'playing') tickLocal(); }, 500);

  /* ---------- 事件委派 ---------- */
  app.addEventListener('click', async function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');
    try {
      if (action === 'close-modal') closeModal();
      else if (action === 'dismiss-recovery') {
        pendingRecovery = '';
        ['recoveryNote', 'recoveryNoteLobby'].forEach(function (id) { var el = $(id); if (el) el.hidden = true; });
      }
      else if (action === 'take') await act('takeOrder', { orderId: id });
      else if (action === 'release') await act('releaseOrder', { orderId: id });
      else if (action === 'cook') await act('startStep', { orderId: id });
      else if (action === 'collect') await act('collectStep', { orderId: id });
      else if (action === 'serve') await act('serveDish', { orderId: id });
      else if (action === 'join-public') { await withAccount(function () { return joinRoom(el.getAttribute('data-code')); }); }
    } catch (e) { /* act 已 toast */ }
  });
  $('modalRoot').addEventListener('click', function (ev) {
    if (ev.target.classList.contains('kc-modal-back')) closeModal();
  });
  $('titleBtn').addEventListener('click', function () { if (!roomCode) { show('screen-join'); } });
  $('helpBtn').addEventListener('click', showHelp);
  $('leaveBtn').addEventListener('click', async function () {
    if (!roomCode) return;
    try { await act('leave'); } catch (e) { /* 已離開也沒關係 */ }
    stopPoll(); roomCode = ''; room = null; saveRoom();
    show('screen-join'); refreshPublicRooms();
  });
  $('createBtn').addEventListener('click', function () { withAccount(createRoom); });
  $('joinBtn').addEventListener('click', function () { withAccount(function () { return joinRoom(); }); });
  $('codeInput').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') $('joinBtn').click(); });
  $('copyCodeBtn').addEventListener('click', function () {
    var code = $('roomCodeBig').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(function () { toast('房號已複製：' + code); }, function () { toast('房號：' + code); });
    else toast('房號：' + code);
  });
  $('startBtn').addEventListener('click', async function () { try { await act('start'); toast('開工！'); } catch (e) { /* act 已 toast */ } });
  $('againBtn').addEventListener('click', function () {
    stopPoll(); roomCode = ''; room = null; saveRoom();
    show('screen-join'); refreshPublicRooms();
  });
  $('refreshRoomsBtn').addEventListener('click', refreshPublicRooms);
  $('resumeBtn').addEventListener('click', async function () {
    if (!roomCode) return;
    try {
      if (token && account) { var r = await api('/' + roomCode, 'GET'); enterRoom(r.room); toast('回到廚房了！'); }
      else toast('先輸入暱稱再回廚房');
    } catch (e) { toast('那間廚房已經打烊了'); roomCode = ''; saveRoom(); $('resumeBtn').hidden = true; }
  });

  /* ---------- 啟動 ---------- */
  if (account && account.display_name) $('nickInput').value = account.display_name;
  if (roomCode) $('resumeBtn').hidden = false;
  show('screen-join');
  refreshPublicRooms();
  // 斷線重進：有存房號就直接回去
  (async function () {
    if (!roomCode || !token || !account) return;
    try {
      var r = await api('/' + roomCode, 'GET');
      if (r.room.players.some(function (p) { return p.accountId === account.id; })) {
        $('nickInput').value = account.display_name;
        enterRoom(r.room);
        toast('回到上次的廚房了！');
      } else { roomCode = ''; saveRoom(); $('resumeBtn').hidden = true; }
    } catch (e) { /* 房間沒了就留在加入畫面 */ }
  })();
})();
