'use strict';
/* 阿瓦隆發牌工具：純前端、零對外請求。
   角色配置依官方規則核實（好人／壞人人數與特殊角色）：
   8人：好人5（梅林、派西維爾、忠臣x3）／壞人3（魔甘娜、莫德雷德、刺客）
   9人：好人6（梅林、派西維爾、忠臣x4）／壞人3（魔甘娜、莫德雷德、刺客）
   10人：好人6（梅林、派西維爾、忠臣x4）／壞人4（魔甘娜、莫德雷德、刺客、奧伯倫）
   發牌資訊：壞人互認（奧伯倫除外）；梅林看壞人但看不到莫德雷德；
   派西維爾只看到梅林與魔甘娜兩人。 */

var ROLES = {
  merlin:   { key: 'merlin',   name: '梅林',     side: 'good',
              desc: '你看得見壞人，但看不見莫德雷德。守住你的身份，別讓刺客在最後找到你。' },
  percival: { key: 'percival', name: '派西維爾', side: 'good',
              desc: '你看得見梅林與魔甘娜的拇指，但分不出誰是誰。想辦法保護真正的梅林。' },
  loyal:    { key: 'loyal',    name: '忠臣',     side: 'good',
              desc: '亞瑟的忠臣。你只知道自己的身份，仔細聽、仔細看，找出梅林。' },
  morgana:  { key: 'morgana',  name: '魔甘娜',   side: 'evil',
              desc: '你假扮梅林，誤導派西維爾。壞人隊友都知道彼此（奧伯倫除外）。' },
  mordred:  { key: 'mordred',  name: '莫德雷德', side: 'evil',
              desc: '梅林看不見你，你是壞人最安全的藏身之處。' },
  assassin: { key: 'assassin', name: '刺客',     side: 'evil',
              desc: '遊戲最後，你有一次機會指認梅林。猜中，壞人直接獲勝。' },
  oberon:   { key: 'oberon',   name: '奧伯倫',   side: 'evil',
              desc: '你不認識其他壞人，其他壞人也不認識你。獨自作戰吧。' },
};

var SETUPS = {
  8:  { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal'],
        evil: ['morgana', 'mordred', 'assassin'] },
  9:  { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal'],
        evil: ['morgana', 'mordred', 'assassin'] },
  10: { good: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal'],
        evil: ['morgana', 'mordred', 'assassin', 'oberon'] },
};

var SAVE_KEY = 'avalon-deal-v1';

/* ---- 純函式（可單獨驗證） ---- */
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function dealRoles(count) {
  var s = SETUPS[count];
  if (!s) return null;
  return shuffle(s.good.concat(s.evil));
}

/* 玩家編號用 1-based；回傳提示字串 */
function hintFor(roles, idx) {
  var role = ROLES[roles[idx]];
  var nums = function (list) { return list.map(function (i) { return (i + 1) + '號'; }).join('、'); };
  if (role.key === 'merlin') {
    var evilSeen = [];
    for (var i = 0; i < roles.length; i++) {
      if (i !== idx && ROLES[roles[i]].side === 'evil' && roles[i] !== 'mordred') evilSeen.push(i);
    }
    return '壞人在 ' + nums(evilSeen) + '（莫德雷德不在其中）';
  }
  if (role.key === 'percival') {
    var seen = [];
    for (var j = 0; j < roles.length; j++) {
      if (roles[j] === 'merlin' || roles[j] === 'morgana') seen.push(j);
    }
    return '梅林與魔甘娜在 ' + nums(shuffle(seen)) + '（不分先後）';
  }
  if (role.key === 'oberon') return '你沒有隊友資訊。';
  if (role.side === 'evil') {
    var mates = [];
    for (var k = 0; k < roles.length; k++) {
      if (k !== idx && ROLES[roles[k]].side === 'evil' && roles[k] !== 'oberon') mates.push(k);
    }
    return mates.length ? '隊友在 ' + nums(mates) : '你沒有隊友資訊。';
  }
  return '你沒有額外資訊。';
}

/* ---- UI 狀態機 ---- */
var state = null; /* { count, roles, idx, revealed } */
var lastCount = 8;

function $(id) { return document.getElementById(id); }

function show(id) {
  ['screen-home', 'screen-deal', 'screen-done'].forEach(function (s) {
    $(s).hidden = (s !== id);
  });
}

function save() {
  try {
    if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* 私密模式等寫入失敗時照常玩，只是不存檔 */ }
}

function loadSaved() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !SETUPS[s.count] || !Array.isArray(s.roles) || s.roles.length !== s.count) return null;
    return s;
  } catch (e) { return null; }
}

function startDeal(count, roles) {
  lastCount = count;
  state = { count: count, roles: roles || dealRoles(count), idx: 0, revealed: false };
  save();
  renderDeal();
  show('screen-deal');
}

function renderDeal() {
  var n = state.count;
  $('dealCount').textContent = n + '人局';
  $('playerLabel').textContent = (state.idx + 1) + '號玩家';
  $('progressLabel').textContent = '第 ' + (state.idx + 1) + ' / ' + n + ' 位玩家';
  var role = ROLES[state.roles[state.idx]];
  if (state.revealed) {
    $('stepLabel').textContent = '記住你的角色，再交給下一位玩家';
    $('cardBack').hidden = true;
    var face = $('cardFace');
    face.hidden = false;
    face.className = 'av-card-face side-' + role.side;
    $('roleSide').textContent = role.side === 'good' ? '好人陣營' : '壞人陣營';
    $('roleName').textContent = role.name;
    $('roleDesc').textContent = role.desc;
    $('roleHint').textContent = hintFor(state.roles, state.idx);
    $('revealBtn').hidden = true;
    $('nextBtn').hidden = false;
    $('nextBtn').textContent = state.idx === n - 1 ? '記住了（發牌完成）' : '記住了';
  } else {
    $('stepLabel').textContent = '輪到你了，請確認四周沒人偷看';
    $('cardBack').hidden = false;
    $('cardFace').hidden = true;
    $('revealBtn').hidden = false;
    $('nextBtn').hidden = true;
  }
}

function nextPlayer() {
  if (state.idx >= state.count - 1) {
    state = null;
    save();
    show('screen-done');
    return;
  }
  state.idx += 1;
  state.revealed = false;
  save();
  renderDeal();
}

function quitToHome() {
  if (state && !window.confirm('還沒發完牌，確定要離開嗎？發牌記錄會清除。')) return;
  state = null;
  save();
  refreshResume();
  show('screen-home');
}

function refreshResume() {
  var s = loadSaved();
  var btn = $('resumeBtn');
  if (s && s.idx < s.count) {
    btn.hidden = false;
    btn.textContent = '繼續上局發牌（' + s.count + '人局，第 ' + (s.idx + 1) + ' 號玩家）';
    btn.onclick = function () {
      state = { count: s.count, roles: s.roles, idx: s.idx, revealed: false };
      save();
      renderDeal();
      show('screen-deal');
    };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
}

function init() {
  document.querySelectorAll('.av-count').forEach(function (b) {
    b.addEventListener('click', function () {
      startDeal(parseInt(b.getAttribute('data-count'), 10));
    });
  });
  $('revealBtn').addEventListener('click', function () {
    state.revealed = true;
    save();
    renderDeal();
  });
  $('nextBtn').addEventListener('click', nextPlayer);
  $('quitBtn').addEventListener('click', quitToHome);
  $('againBtn').addEventListener('click', function () {
    startDeal(lastCount);
  });
  $('homeBtn').addEventListener('click', function () {
    state = null;
    save();
    refreshResume();
    show('screen-home');
  });
  refreshResume();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

/* 供 Node 單元測試 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dealRoles: dealRoles, hintFor: hintFor, ROLES: ROLES, SETUPS: SETUPS, shuffle: shuffle };
}
