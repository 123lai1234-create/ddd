/* 不說農場 — 香菇柯基的種田小遊戲
   純前端、零對外請求，進度存 localStorage。
   玩法為原創實作，角色與美術皆為本站自有（香菇柯基與原創村民）。 */
(function () {
  'use strict';

  /* ---------- 資料 ---------- */
  var CROPS = {
    cabbage:    { name: '白菜',   emoji: '🥬', days: 2, seed: 10, sell: 22 },
    carrot:     { name: '紅蘿蔔', emoji: '🥕', days: 3, seed: 15, sell: 38 },
    corn:       { name: '玉米',   emoji: '🌽', days: 3, seed: 20, sell: 48 },
    tomato:     { name: '番茄',   emoji: '🍅', days: 4, seed: 25, sell: 60 },
    strawberry: { name: '草莓',   emoji: '🍓', days: 4, seed: 35, sell: 85 },
    pumpkin:    { name: '南瓜',   emoji: '🎃', days: 5, seed: 40, sell: 95 }
  };
  var CROP_KEYS = Object.keys(CROPS);

  /* 30 種昆蟲（原創圖鑑名單，皆為台灣常見昆蟲） */
  var BUGS = [
    { id: 'bf1', name: '白粉蝶', emoji: '🦋', rarity: 'common', place: '草地' },
    { id: 'bf2', name: '黃蝶', emoji: '🦋', rarity: 'common', place: '草地' },
    { id: 'bf3', name: '青斑蝶', emoji: '🦋', rarity: 'uncommon', place: '草地' },
    { id: 'bf4', name: '紫斑蝶', emoji: '🦋', rarity: 'uncommon', place: '花叢' },
    { id: 'bf5', name: '大鳳蝶', emoji: '🦋', rarity: 'rare', place: '花叢' },
    { id: 'bf6', name: '枯葉蝶', emoji: '🍂', rarity: 'rare', place: '樹下' },
    { id: 'bf7', name: '閃蝶', emoji: '🦋', rarity: 'legendary', place: '花叢' },
    { id: 'gh1', name: '蚱蜢', emoji: '🦗', rarity: 'common', place: '草地' },
    { id: 'gh2', name: '螽斯', emoji: '🦗', rarity: 'uncommon', place: '草地' },
    { id: 'gh3', name: '蟋蟀', emoji: '🦗', rarity: 'common', place: '田邊' },
    { id: 'bt1', name: '獨角仙', emoji: '🪲', rarity: 'rare', place: '樹下' },
    { id: 'bt2', name: '鍬形蟲', emoji: '🪲', rarity: 'uncommon', place: '樹下' },
    { id: 'bt3', name: '金龜子', emoji: '🪲', rarity: 'common', place: '花叢' },
    { id: 'bt4', name: '天牛', emoji: '🪲', rarity: 'rare', place: '樹下' },
    { id: 'bt5', name: '彩虹鍬形蟲', emoji: '🪲', rarity: 'legendary', place: '樹下' },
    { id: 'lb1', name: '瓢蟲', emoji: '🐞', rarity: 'common', place: '田邊' },
    { id: 'lb2', name: '七星瓢蟲', emoji: '🐞', rarity: 'uncommon', place: '田邊' },
    { id: 'fw1', name: '螢火蟲', emoji: '✨', rarity: 'rare', place: '池塘邊' },
    { id: 'cc1', name: '蟬', emoji: '🪰', rarity: 'common', place: '樹下' },
    { id: 'df1', name: '紅蜻蜓', emoji: '🪰', rarity: 'common', place: '池塘邊' },
    { id: 'df2', name: '豆娘', emoji: '🦋', rarity: 'uncommon', place: '池塘邊' },
    { id: 'be1', name: '蜜蜂', emoji: '🐝', rarity: 'common', place: '花叢' },
    { id: 'be2', name: '熊蜂', emoji: '🐝', rarity: 'uncommon', place: '花叢' },
    { id: 'at1', name: '螞蟻', emoji: '🐜', rarity: 'common', place: '田邊' },
    { id: 'at2', name: '紅螞蟻', emoji: '🐜', rarity: 'common', place: '田邊' },
    { id: 'sp1', name: '蜘蛛', emoji: '🕷️', rarity: 'uncommon', place: '草地' },
    { id: 'sn1', name: '蝸牛', emoji: '🐌', rarity: 'common', place: '田邊' },
    { id: 'ct1', name: '毛毛蟲', emoji: '🐛', rarity: 'common', place: '田邊' },
    { id: 'ct2', name: '菜蟲', emoji: '🐛', rarity: 'common', place: '田邊' },
    { id: 'mt1', name: '螳螂', emoji: '🌿', rarity: 'rare', place: '草地' }
  ];
  var BUG_BY_ID = {};
  BUGS.forEach(function (b) { BUG_BY_ID[b.id] = b; });
  var RARITY_LABEL = { common: '常見', uncommon: '少見', rare: '稀有', legendary: '傳說' };
  var RARITY_CHANCE = { common: 1.0, uncommon: 0.8, rare: 0.6, legendary: 0.4 };
  var RARITY_GOLD = { common: 5, uncommon: 12, rare: 30, legendary: 80 };

  /* 10 種台灣魚 */
  var FISH = [
    { id: 'tilapia', name: '吳郭魚', emoji: '🐟', rarity: 'common', diff: 1, price: 18 },
    { id: 'carp', name: '鯉魚', emoji: '🐟', rarity: 'common', diff: 2, price: 25 },
    { id: 'crucian', name: '鯽魚', emoji: '🐟', rarity: 'common', diff: 2, price: 22 },
    { id: 'grasscarp', name: '草魚', emoji: '🐟', rarity: 'uncommon', diff: 3, price: 40 },
    { id: 'eel', name: '鰻魚', emoji: '🐟', rarity: 'rare', diff: 4, price: 90 },
    { id: 'grouper', name: '石斑', emoji: '🐟', rarity: 'rare', diff: 4, price: 110 },
    { id: 'milkfish', name: '虱目魚', emoji: '🐟', rarity: 'uncommon', diff: 3, price: 55 },
    { id: 'taiwandia', name: '台灣鯛', emoji: '🐟', rarity: 'common', diff: 2, price: 28 },
    { id: 'shiner', name: '溪哥', emoji: '🐟', rarity: 'uncommon', diff: 3, price: 48 },
    { id: 'ayu', name: '香魚', emoji: '🐟', rarity: 'legendary', diff: 5, price: 180 }
  ];
  var FISH_BY_ID = {};
  FISH.forEach(function (f) { FISH_BY_ID[f.id] = f; });

  var NPCS = [
    {
      id: 'chunhua', name: '春花阿婆', avatar: '👵', role: '村裡最會種菜的阿婆',
      lines: [
        '白菜長得快，兩天就能收，新手先種白菜準沒錯。',
        '菜要天天澆水，乾著是不會長大的喔。',
        '看到田裡有菜蟲要馬上抓掉，不然整株都會被吃光。',
        '我年輕的時候，一天能收二十顆南瓜呢。'
      ],
      task: { label: '交 3 顆白菜', need: function (s) { return (s.bag.cabbage || 0) >= 3; },
        pay: function (s) { s.bag.cabbage -= 3; }, gold: 120, xp: 30,
        doneText: '阿婆笑著收下白菜：「好新鮮！這是給你的謝禮。」' }
    },
    {
      id: 'aming', name: '阿明', avatar: '🎣', role: '池塘邊的釣魚達人',
      lines: [
        '釣魚要等浮標沉下去、心裡數到三再收竿，太急魚就跑了。',
        '吳郭魚最不挑，池塘裡到處都是，練手就釣牠。',
        '香魚只在水最清的時候出現，竿子不夠好很難釣到。',
        '昨晚我釣到一條好大的石斑，差點把竿子拖走。'
      ],
      task: { label: '交 1 條吳郭魚', need: function (s) { return (s.fishCounts.tilapia || 0) >= 1; },
        pay: function (s) { s.fishCounts.tilapia -= 1; }, gold: 100, xp: 20,
        doneText: '阿明豎起大拇指：「這條吳郭魚夠肥！拿去買新魚餌吧。」' }
    },
    {
      id: 'xiaodou', name: '小豆', avatar: '🧒', role: '最愛抓蟲的村裡小孩',
      lines: [
        '我昨天抓到一隻獨角仙！超大隻的！',
        '蝴蝶都在花叢那邊，草地比較多蚱蜢。',
        '你抓到閃蝶的話，一定要先給我看！',
        '長大以後我要當昆蟲學家，抓遍全世界的蟲！'
      ],
      task: { label: '今天捕到 2 隻昆蟲', need: function (s) { return s.bugsToday >= 2; },
        pay: function () {}, gold: 80, xp: 20,
        doneText: '小豆開心地跳起來：「你好厲害！我也要加油抓蟲！」' }
    }
  ];
  var CHAMPION = { name: '阿哲', avatar: '🏆', role: '村裡的競賽冠軍' };

  var CONTESTS = [
    { id: 'fish', name: '釣魚大賽', emoji: '🎣', scoreLabel: '今天釣到的魚',
      score: function (s) { return s.fishToday; }, base: 3, spread: 3 },
    { id: 'bugs', name: '捕蟲大賽', emoji: '🦋', scoreLabel: '今天捕到的昆蟲',
      score: function (s) { return s.bugsToday; }, base: 3, spread: 3 },
    { id: 'harvest', name: '豐收大賽', emoji: '🌾', scoreLabel: '今天收成的作物',
      score: function (s) { return s.harvestToday; }, base: 4, spread: 4 }
  ];

  var UPGRADES = {
    net: { name: '捕蟲網', max: 3, costs: [0, 150, 320], desc: '捕捉成功率每級 +10%' },
    shovel: { name: '鏟子', max: 3, costs: [0, 120, 280], desc: '每日可挖掘次數每級 +1' },
    rod: { name: '釣竿', max: 3, costs: [0, 180, 380], desc: '釣魚命中圈每級加寬' }
  };

  var SAVE_KEY = 'farmGameV1';
  var BUG_SPOTS = [
    { x: 8, y: 12 }, { x: 34, y: 26 }, { x: 58, y: 10 },
    { x: 74, y: 34 }, { x: 20, y: 52 }, { x: 46, y: 58 }, { x: 68, y: 62 }
  ];

  /* ---------- 狀態 ---------- */
  function defaultState() {
    return {
      gold: 100, xp: 0, level: 1, day: 1,
      plots: Array.from({ length: 12 }, function () { return { crop: null, growth: 0, watered: false, pest: false }; }),
      seeds: { cabbage: 2, carrot: 1, corn: 0, tomato: 0, strawberry: 0, pumpkin: 0 },
      bag: {},
      fertilizer: 0,
      tools: { net: 1, shovel: 1, rod: 1 },
      bugsCaught: {}, fishCaught: {}, fishCounts: {},
      fieldBugs: [],
      digSpots: [],
      digsLeft: 3,
      fishToday: 0, bugsToday: 0, harvestToday: 0,
      trophies: 0, contestDone: false,
      npcDone: {},
      todayEvent: null,
      eventLog: []
    };
  }
  var state = defaultState();
  var selectedSeed = 'cabbage';
  var activeTab = 'farm';
  var npcLineIdx = {};
  var fishing = { phase: 'idle', fish: null, zoneStart: 30, zoneWidth: 30, marker: 0, raf: 0, waitTimer: 0, startT: 0 };

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      var fresh = defaultState();
      for (var k in fresh) if (saved[k] !== undefined) fresh[k] = saved[k];
      state = fresh;
    } catch (e) { /* 存檔損壞就用新局 */ }
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function pickWeighted(items, weightFn) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += weightFn(items[i]);
    var r = Math.random() * total;
    for (i = 0; i < items.length; i++) { r -= weightFn(items[i]); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function logEvent(text) {
    state.eventLog.unshift('第 ' + state.day + ' 天：' + text);
    if (state.eventLog.length > 12) state.eventLog.length = 12;
  }
  function addXp(n) {
    state.xp += n;
    var need = state.level * 100;
    if (state.xp >= need) {
      state.xp -= need;
      state.level += 1;
      state.gold += 50;
      toast('升級了！現在是 Lv.' + state.level + '，獎勵 50 金幣 🎉');
    }
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /* ---------- 昆蟲生成 ---------- */
  function spawnBugs(count) {
    var present = {};
    state.fieldBugs.forEach(function (id) { present[id] = true; });
    var pool = BUGS.filter(function (b) { return !present[b.id]; });
    var guard = 0;
    while (state.fieldBugs.length < 5 && pool.length > 0 && guard++ < 40) {
      var b = pickWeighted(pool, function (x) {
        var w = x.rarity === 'common' ? 5 : x.rarity === 'uncommon' ? 3 : x.rarity === 'rare' ? 1.5 : 0.6;
        if (!state.bugsCaught[x.id]) w *= 1.6;
        return w;
      });
      state.fieldBugs.push(b.id);
      pool = pool.filter(function (x) { return x.id !== b.id; });
    }
  }

  /* ---------- 挖寶 ---------- */
  function rollDigReward() {
    var r = Math.random();
    if (r < 0.45) { var g = 30 + rand(91); return { type: 'gold', amount: g, label: '挖到 ' + g + ' 金幣！🪙' }; }
    if (r < 0.70) { var c = CROP_KEYS[rand(CROP_KEYS.length)]; return { type: 'seed', crop: c, amount: 2, label: '挖到 ' + CROPS[c].name + '種子 ×2！🌱' }; }
    if (r < 0.85) { return { type: 'fertilizer', amount: 1, label: '挖到肥料 ×1！💩' }; }
    return { type: 'stone', amount: 0, label: '只挖到一顆石頭……🪨' };
  }
  function newDigSpots() {
    state.digSpots = [0, 1, 2].map(function () { return { dug: false, reward: rollDigReward() }; });
    state.digsLeft = 2 + state.tools.shovel;
  }

  /* ---------- 渲染 ---------- */
  function renderTop() {
    $('goldVal').textContent = state.gold;
    $('dayVal').textContent = '第 ' + state.day + ' 天';
    $('xpVal').textContent = state.xp + '/' + (state.level * 100);
    $('lvBadge').textContent = 'Lv.' + state.level;
    var bar = $('eventBar');
    if (state.todayEvent) {
      bar.hidden = false;
      bar.textContent = state.todayEvent.text;
      bar.className = 'fm-event ' + (state.todayEvent.good ? 'good' : 'bad');
    } else {
      bar.hidden = true;
      bar.className = 'fm-event';
    }
  }

  function plotEmoji(p) {
    if (!p.crop) return '🕳️';
    var c = CROPS[p.crop];
    if (p.growth >= c.days) return c.emoji;
    if (p.growth === 0) return '🌱';
    if (p.growth < c.days / 2) return '🌿';
    return '🌾';
  }
  function plotLabel(p) {
    if (!p.crop) return '空地';
    var c = CROPS[p.crop];
    if (p.growth >= c.days) return c.name + '・可收成';
    return c.name + ' ' + p.growth + '/' + c.days + ' 天' + (p.watered ? '・已澆水' : '・缺水');
  }

  function renderFarm() {
    var el = $('tab-farm');
    var plotsHtml = state.plots.map(function (p, i) {
      var cls = 'fm-plot' + (p.watered ? ' watered' : '') + (p.crop && p.growth >= CROPS[p.crop].days ? ' ready' : '') + (p.pest ? ' pest' : '');
      return '<button type="button" class="' + cls + '" data-plot="' + i + '" aria-label="田地 ' + (i + 1) + ' ' + esc(plotLabel(p)) + '">' +
        '<span>' + plotEmoji(p) + '</span>' +
        '<span class="fm-plot-label">' + esc(plotLabel(p)) + '</span>' +
        (p.pest ? '<span class="fm-pest">🐛</span>' : '') + '</button>';
    }).join('');
    var seedsHtml = CROP_KEYS.map(function (k) {
      var c = CROPS[k];
      return '<button type="button" class="fm-seed' + (selectedSeed === k ? ' sel' : '') + '" data-seed="' + k + '">' +
        c.emoji + ' ' + c.name + '<br>種子 ' + c.seed + ' 金・持有 ' + (state.seeds[k] || 0) + '<br>生長 ' + c.days + ' 天・售價 ' + c.sell + ' 金</button>';
    }).join('');
    var bagItems = Object.keys(state.bag).filter(function (k) { return state.bag[k] > 0; });
    var bagHtml = bagItems.length
      ? bagItems.map(function (k) { return '<span class="fm-chip">' + CROPS[k].emoji + ' ' + CROPS[k].name + ' ×' + state.bag[k] + '</span>'; }).join('')
      : '<span class="fm-chip">背包是空的，收成後作物會放在這裡</span>';
    var bagValue = bagItems.reduce(function (sum, k) { return sum + state.bag[k] * CROPS[k].sell; }, 0);
    el.innerHTML =
      '<h2>🌱 農田</h2>' +
      '<p class="fm-sub">點空地播種，點作物澆水，長好就點收成。每天記得澆水才會長大，看到菜蟲要馬上點掉。</p>' +
      '<div class="fm-card"><div class="fm-row">' +
      '<button type="button" class="fm-btn blue" data-action="water-all">💧 全部澆水</button>' +
      '<button type="button" class="fm-btn gold" data-action="fertilize">💩 施肥（持有 ' + state.fertilizer + '）</button>' +
      '<button type="button" class="fm-btn" data-action="end-day">🌙 結束今天 → 第 ' + (state.day + 1) + ' 天</button>' +
      '</div></div>' +
      '<div class="fm-plots">' + plotsHtml + '</div>' +
      '<div class="fm-card" style="margin-top:12px"><h3>🌾 選種子播種</h3><div class="fm-seed-picker">' + seedsHtml + '</div>' +
      '<p class="fm-sub">沒種子就去商店買。肥料可以讓一株長最慢的作物立刻長大 1 天。</p></div>' +
      '<div class="fm-card"><h3>🎒 背包</h3><div class="fm-bag">' + bagHtml + '</div>' +
      '<div class="fm-row" style="margin-top:10px"><button type="button" class="fm-btn gold" data-action="sell-all" ' + (bagValue <= 0 ? 'disabled' : '') + '>💰 全部賣出（' + bagValue + ' 金）</button></div></div>' +
      '<div class="fm-card"><h3>📜 事件紀錄</h3><ul class="fm-log">' +
      (state.eventLog.length ? state.eventLog.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li>還沒有事件發生，結束今天後可能會遇到突發事件。</li>') +
      '</ul></div>';
  }

  function renderBugs() {
    var el = $('tab-bugs');
    var caught = Object.keys(state.bugsCaught).length;
    var spots = state.fieldBugs.map(function (id, i) {
      var b = BUG_BY_ID[id];
      var pos = BUG_SPOTS[i % BUG_SPOTS.length];
      return '<button type="button" class="fm-critter" style="left:' + pos.x + '%;top:' + pos.y + '%" data-bug="' + id + '" aria-label="捕捉' + esc(b.name) + '">' + b.emoji + '</button>';
    }).join('');
    el.innerHTML =
      '<h2>🦋 捕蟲</h2>' +
      '<p class="fm-sub">昆蟲出現在草地上了，點一下就能用捕蟲網抓。圖鑑已收集 ' + caught + ' / 30 種，稀有昆蟲比較難抓，升級捕蟲網可以提高成功率。</p>' +
      '<div class="fm-field">' + (spots || '<p style="padding:20px">草地靜悄悄的……</p>') + '</div>' +
      '<div class="fm-row" style="margin-top:10px">' +
      '<button type="button" class="fm-btn" data-action="reshuffle-bugs">🔄 換一批昆蟲</button>' +
      '<span class="fm-chip">今天已捕 ' + state.bugsToday + ' 隻</span>' +
      '<span class="fm-chip">捕蟲網 Lv.' + state.tools.net + '</span>' +
      '</div>';
  }

  function renderFish() {
    var el = $('tab-fish');
    var caught = Object.keys(state.fishCaught).length;
    var body = '';
    if (fishing.phase === 'idle') {
      body = '<div class="fm-fishwait">🐟💦<br>池塘很平靜……</div>' +
        '<button type="button" class="fm-btn blue" data-action="cast">🎣 拋竿釣魚</button>';
    } else if (fishing.phase === 'waiting') {
      body = '<div class="fm-fishwait">🎣<br>等待魚上鉤……</div>' +
        '<button type="button" class="fm-btn ghost" data-action="cancel-fish">放棄</button>';
    } else {
      body = '<div class="fm-fishwait">❗有魚上鉤了！<br><small>紅色標記進到綠色區間時按收竿</small></div>' +
        '<div class="fm-fishbar"><div class="fm-fishzone" id="fishZone" style="left:' + fishing.zoneStart + '%;width:' + fishing.zoneWidth + '%"></div>' +
        '<div class="fm-fishmark" id="fishMark" style="left:' + fishing.marker + '%"></div></div>' +
        '<button type="button" class="fm-btn blue" data-action="reel">🎣 收竿！</button>';
    }
    el.innerHTML =
      '<h2>🎣 釣魚</h2>' +
      '<p class="fm-sub">拋竿後等魚上鉤，紅色標記進綠區就收竿。魚圖鑑已收集 ' + caught + ' / 10 種，今天已釣 ' + state.fishToday + ' 條，釣竿 Lv.' + state.tools.rod + '。</p>' +
      '<div class="fm-field pond"><div class="fm-card" style="margin:12px">' + body + '</div></div>';
  }

  function renderDig() {
    var el = $('tab-dig');
    var mounds = state.digSpots.map(function (s, i) {
      var pos = [{ x: 8, y: 18 }, { x: 40, y: 40 }, { x: 68, y: 16 }][i];
      if (s.dug) return '<div class="fm-mound" style="left:' + pos.x + '%;top:' + pos.y + '%">🕳️<small>' + esc(s.reward.label) + '</small></div>';
      return '<button type="button" class="fm-mound" style="left:' + pos.x + '%;top:' + pos.y + '%" data-dig="' + i + '" aria-label="挖掘藏寶點 ' + (i + 1) + '">⛰️<small>挖挖看</small></button>';
    }).join('');
    el.innerHTML =
      '<h2>⛏️ 挖寶藏</h2>' +
      '<p class="fm-sub">每天會出現 3 個藏寶點，今天還能挖 ' + state.digsLeft + ' 次。可能挖到金幣、稀有種子或肥料，也可能只是一顆石頭。鏟子升級可以增加每日次數。</p>' +
      '<div class="fm-field dig">' + mounds + '</div>';
  }

  function renderNpc() {
    var el = $('tab-npc');
    var contest = CONTESTS[state.day % CONTESTS.length];
    var npcHtml = NPCS.map(function (n) {
      var done = !!state.npcDone[n.id];
      var canDo = n.task.need(state);
      var idx = npcLineIdx[n.id] || 0;
      return '<div class="fm-card"><div class="fm-npc">' +
        '<div class="fm-npc-avatar">' + n.avatar + '</div>' +
        '<div class="fm-npc-body"><h3>' + esc(n.name) + '</h3><div class="fm-role">' + esc(n.role) + '</div>' +
        '<div class="fm-npc-say">「' + esc(n.lines[idx % n.lines.length]) + '」</div>' +
        '<div class="fm-row"><button type="button" class="fm-btn ghost small" data-talk="' + n.id + '">💬 聊天</button>' +
        '<button type="button" class="fm-btn small" data-task="' + n.id + '" ' + (done || !canDo ? 'disabled' : '') + '>' +
        (done ? '✅ 今天已完成' : '🎁 ' + esc(n.task.label) + '（獎勵 ' + n.task.gold + ' 金）') + '</button></div>' +
        '</div></div></div>';
    }).join('');
    el.innerHTML =
      '<h2>🧑‍🌾 村民</h2>' +
      '<p class="fm-sub">跟村民聊天拿提示，每天可以各完成一次小任務。每天還有一場競賽，跟冠軍阿哲比成績。</p>' +
      npcHtml +
      '<div class="fm-card"><h3>' + CHAMPION.avatar + ' ' + esc(CHAMPION.name) + '・' + esc(CHAMPION.role) + '</h3>' +
      '<p class="fm-sub">今天的競賽：' + contest.emoji + contest.name + '（比' + contest.scoreLabel + '，目前你今天是 ' + contest.score(state) + '）</p>' +
      '<div class="fm-row"><button type="button" class="fm-btn gold" data-action="contest" ' + (state.contestDone ? 'disabled' : '') + '>' +
      (state.contestDone ? '✅ 今天已比過了' : '🏆 參加' + contest.name) + '</button>' +
      '<span class="fm-chip">獎盃 ×' + state.trophies + '</span></div>' +
      '<p class="fm-sub">贏了得 150 金幣＋1 座獎盃，輸了也有 20 金幣安慰獎。</p></div>';
  }

  function renderDex() {
    var el = $('tab-dex');
    var bugsCaught = Object.keys(state.bugsCaught).length;
    var fishCaught = Object.keys(state.fishCaught).length;
    var bugHtml = BUGS.map(function (b) {
      var got = !!state.bugsCaught[b.id];
      return '<div class="fm-dex-item' + (got ? '' : ' locked') + '"><span class="fm-dex-emoji">' + (got ? b.emoji : '❓') + '</span>' +
        (got ? esc(b.name) : '???') + '<br><span class="fm-rarity' + (b.rarity === 'rare' || b.rarity === 'legendary' ? ' ' + b.rarity : '') + '">' +
        RARITY_LABEL[b.rarity] + '・' + esc(b.place) + '</span></div>';
    }).join('');
    var fishHtml = FISH.map(function (f) {
      var n = state.fishCounts[f.id] || 0;
      var got = n > 0;
      return '<div class="fm-dex-item' + (got ? '' : ' locked') + '"><span class="fm-dex-emoji">' + (got ? f.emoji : '❓') + '</span>' +
        (got ? esc(f.name) + ' ×' + n : '???') + '<br><span class="fm-rarity' + (f.rarity === 'rare' || f.rarity === 'legendary' ? ' ' + f.rarity : '') + '">' +
        RARITY_LABEL[f.rarity] + '・售價 ' + f.price + ' 金</span></div>';
    }).join('');
    el.innerHTML =
      '<h2>📖 圖鑑</h2>' +
      '<p class="fm-sub">昆蟲圖鑑 ' + bugsCaught + ' / 30・魚圖鑑 ' + fishCaught + ' / 10・獎盃 ' + state.trophies + ' 座・等級 Lv.' + state.level + '</p>' +
      '<div class="fm-card"><h3>🦋 昆蟲圖鑑</h3><div class="fm-dex">' + bugHtml + '</div></div>' +
      '<div class="fm-card"><h3>🐟 魚圖鑑</h3><div class="fm-dex">' + fishHtml + '</div></div>' +
      '<div class="fm-card"><h3>📜 事件紀錄</h3><ul class="fm-log">' +
      (state.eventLog.length ? state.eventLog.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li>還沒有事件紀錄。</li>') +
      '</ul></div>';
  }

  function renderTab() {
    document.querySelectorAll('.fm-bottom button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === activeTab);
    });
    document.querySelectorAll('.fm-tab').forEach(function (s) {
      s.hidden = s.getAttribute('data-tab') !== activeTab;
    });
    if (activeTab === 'farm') renderFarm();
    else if (activeTab === 'bugs') renderBugs();
    else if (activeTab === 'fish') renderFish();
    else if (activeTab === 'dig') renderDig();
    else if (activeTab === 'npc') renderNpc();
    else if (activeTab === 'dex') renderDex();
  }
  function renderAll() { renderTop(); renderTab(); }

  /* ---------- 農田操作 ---------- */
  function plotClick(i) {
    var p = state.plots[i];
    if (p.pest) {
      p.pest = false;
      addXp(5);
      toast('抓掉菜蟲了！作物保住了 🐛');
      save(); renderAll();
      return;
    }
    if (p.crop && p.growth >= CROPS[p.crop].days) {
      var c = CROPS[p.crop];
      var amount = (state.todayEvent && state.todayEvent.kind === 'harvest') ? 2 : 1;
      state.bag[p.crop] = (state.bag[p.crop] || 0) + amount;
      state.harvestToday += amount;
      addXp(5);
      toast('收成 ' + c.name + ' ×' + amount + '！' + (amount > 1 ? '今天是豐收日，收成加倍！' : ''));
      p.crop = null; p.growth = 0; p.watered = false;
      save(); renderAll();
      return;
    }
    if (!p.crop) {
      if ((state.seeds[selectedSeed] || 0) <= 0) { toast('沒有' + CROPS[selectedSeed].name + '種子了，去商店買吧 🛒'); return; }
      state.seeds[selectedSeed] -= 1;
      p.crop = selectedSeed; p.growth = 0; p.watered = false;
      toast('播下' + CROPS[selectedSeed].name + '種子 🌱');
      save(); renderAll();
      return;
    }
    if (!p.watered) {
      p.watered = true;
      toast('澆水了 💧（結束今天時會長大 1 天）');
      save(); renderAll();
      return;
    }
    toast('已經澆過水了，等結束今天就會長大 🌱');
  }
  function waterAll() {
    var n = 0;
    state.plots.forEach(function (p) { if (p.crop && !p.watered) { p.watered = true; n++; } });
    toast(n > 0 ? '全部澆水完成 💧（' + n + ' 株）' : '沒有需要澆水的作物');
    save(); renderAll();
  }
  function fertilize() {
    if (state.fertilizer <= 0) { toast('沒有肥料了，挖寶或商店可以取得 💩'); return; }
    var target = null;
    state.plots.forEach(function (p) {
      if (p.crop && p.growth < CROPS[p.crop].days && (!target || p.growth < target.growth)) target = p;
    });
    if (!target) { toast('沒有正在生長的作物可以施肥'); return; }
    state.fertilizer -= 1;
    target.growth += 1;
    toast('施肥了！' + CROPS[target.crop].name + '立刻長大 1 天 💩');
    save(); renderAll();
  }
  function sellAll() {
    var total = 0;
    Object.keys(state.bag).forEach(function (k) { total += (state.bag[k] || 0) * CROPS[k].sell; state.bag[k] = 0; });
    if (total <= 0) { toast('背包是空的，沒東西可賣'); return; }
    state.gold += total;
    addXp(5);
    toast('賣出作物，賺了 ' + total + ' 金幣！💰');
    save(); renderAll();
  }

  /* ---------- 捕蟲 ---------- */
  function catchBug(id) {
    var b = BUG_BY_ID[id];
    if (!b) return;
    var chance = RARITY_CHANCE[b.rarity] + (state.tools.net - 1) * 0.1;
    if (chance > 0.95) chance = 0.95;
    if (Math.random() > chance) {
      state.fieldBugs = state.fieldBugs.filter(function (x) { return x !== id; });
      spawnBugs(0);
      toast(b.name + '跑掉了……（成功率 ' + Math.round(chance * 100) + '%）💨');
      save(); renderAll();
      return;
    }
    var first = !state.bugsCaught[id];
    state.bugsCaught[id] = true;
    state.bugsToday += 1;
    state.gold += RARITY_GOLD[b.rarity];
    addXp(b.rarity === 'legendary' ? 15 : b.rarity === 'rare' ? 10 : 5);
    state.fieldBugs = state.fieldBugs.filter(function (x) { return x !== id; });
    spawnBugs(0);
    toast((first ? '新發現！' : '') + '抓到' + b.name + '！＋' + RARITY_GOLD[b.rarity] + ' 金幣 ' + b.emoji);
    save(); renderAll();
  }

  /* ---------- 釣魚 ---------- */
  function stopFishingTimers() {
    clearTimeout(fishing.waitTimer);
    cancelAnimationFrame(fishing.raf);
  }
  function startFishing() {
    if (fishing.phase !== 'idle') return;
    fishing.phase = 'waiting';
    renderTab();
    fishing.waitTimer = setTimeout(function () {
      if (fishing.phase !== 'waiting') return;
      fishing.phase = 'bite';
      var fish = pickWeighted(FISH, function (f) {
        return f.rarity === 'common' ? 5 : f.rarity === 'uncommon' ? 3 : f.rarity === 'rare' ? 1.5 : 0.6;
      });
      fishing.fish = fish;
      fishing.zoneWidth = Math.max(14, 34 - fish.diff * 3 + (state.tools.rod - 1) * 6);
      fishing.zoneStart = 8 + rand(Math.max(1, 84 - fishing.zoneWidth));
      fishing.startT = performance.now();
      renderTab();
      var tick = function () {
        if (fishing.phase !== 'bite') return;
        var t = (performance.now() - fishing.startT) / 1000;
        var speed = 1.1 + fish.diff * 0.35;
        fishing.marker = 50 + 46 * Math.sin(t * speed * Math.PI);
        var mark = $('fishMark');
        if (mark) mark.style.left = fishing.marker + '%';
        fishing.raf = requestAnimationFrame(tick);
      };
      fishing.raf = requestAnimationFrame(tick);
    }, 1200 + rand(2200));
  }
  function reelIn() {
    if (fishing.phase !== 'bite') return;
    stopFishingTimers();
    var m = fishing.marker;
    var ok = m >= fishing.zoneStart && m <= fishing.zoneStart + fishing.zoneWidth;
    var fish = fishing.fish;
    fishing.phase = 'idle';
    if (ok && fish) {
      state.fishCaught[fish.id] = true;
      state.fishCounts[fish.id] = (state.fishCounts[fish.id] || 0) + 1;
      state.fishToday += 1;
      state.gold += fish.price;
      addXp(fish.rarity === 'legendary' ? 15 : fish.rarity === 'rare' ? 10 : 5);
      toast('釣到' + fish.name + '！賣了 ' + fish.price + ' 金幣 🎣' + (fish.rarity === 'legendary' ? '（傳說！）' : ''));
    } else {
      toast('魚跑掉了……再試一次！🐟');
    }
    save(); renderAll();
  }
  function cancelFishing() {
    stopFishingTimers();
    fishing.phase = 'idle';
    renderTab();
  }

  /* ---------- 挖寶 ---------- */
  function digSpot(i) {
    var s = state.digSpots[i];
    if (!s || s.dug) return;
    if (state.digsLeft <= 0) { toast('今天的挖掘次數用完了，明天再來 ⛏️'); return; }
    state.digsLeft -= 1;
    s.dug = true;
    var r = s.reward;
    if (r.type === 'gold') state.gold += r.amount;
    if (r.type === 'seed') state.seeds[r.crop] = (state.seeds[r.crop] || 0) + r.amount;
    if (r.type === 'fertilizer') state.fertilizer += r.amount;
    addXp(5);
    logEvent('挖寶：' + r.label);
    toast(r.label);
    save(); renderAll();
  }

  /* ---------- NPC 與競賽 ---------- */
  function talkNpc(id) {
    npcLineIdx[id] = (npcLineIdx[id] || 0) + 1;
    renderTab();
  }
  function completeTask(id) {
    var n = NPCS.find(function (x) { return x.id === id; });
    if (!n || state.npcDone[id] || !n.task.need(state)) return;
    n.task.pay(state);
    state.npcDone[id] = true;
    state.gold += n.task.gold;
    addXp(n.task.xp);
    toast(n.task.doneText + '（＋' + n.task.gold + ' 金幣）');
    save(); renderAll();
  }
  function enterContest() {
    if (state.contestDone) return;
    var contest = CONTESTS[state.day % CONTESTS.length];
    var mine = contest.score(state);
    var champ = contest.base + rand(contest.spread + 1) + Math.floor(state.level / 2);
    state.contestDone = true;
    if (mine >= champ) {
      state.trophies += 1;
      state.gold += 150;
      addXp(20);
      logEvent(contest.name + '獲勝！' + mine + ' 比 ' + champ + '，贏得獎盃 🏆');
      toast('🏆 ' + contest.name + '獲勝！' + mine + ' 比 ' + champ + '，＋150 金幣＋1 獎盃！');
    } else {
      state.gold += 20;
      logEvent(contest.name + '落敗，' + mine + ' 比 ' + champ + '，阿哲獲勝');
      toast(contest.name + '落敗……' + mine + ' 比 ' + champ + '，安慰獎 20 金幣，再接再厲！');
    }
    save(); renderAll();
  }

  /* ---------- 突發事件與換天 ---------- */
  function rollEvent() {
    if (Math.random() > 0.3) { state.todayEvent = null; return; }
    var r = Math.random();
    if (r < 0.4) {
      var planted = state.plots.map(function (p, i) { return p.crop ? i : -1; }).filter(function (i) { return i >= 0; });
      if (planted.length > 0) {
        var idx = planted[rand(planted.length)];
        state.plots[idx].pest = true;
        state.todayEvent = { kind: 'pest', good: false, text: '🐛 突發事件：菜蟲偷吃作物！第 ' + (idx + 1) + ' 號田的' + CROPS[state.plots[idx].crop].name + '被菜蟲盯上了，快點那格田把蟲抓掉，不然明天就枯掉了！' };
        logEvent('菜蟲偷吃作物（第 ' + (idx + 1) + ' 號田）');
        return;
      }
    }
    if (r < 0.6) {
      state.todayEvent = { kind: 'harvest', good: true, text: '🌞 突發事件：今天是豐收日！今天收成的作物全部加倍！' };
      logEvent('豐收日：收成加倍');
      return;
    }
    if (r < 0.8) {
      var gift = 60;
      state.gold += gift;
      state.todayEvent = { kind: 'visitor', good: true, text: '🎁 突發事件：路過的旅人很喜歡你的農場，送了你 ' + gift + ' 金幣！' };
      logEvent('訪客送禮 ＋' + gift + ' 金幣');
      return;
    }
    state.plots.forEach(function (p) { if (p.crop) p.watered = true; });
    state.todayEvent = { kind: 'rain', good: true, text: '🌧️ 突發事件：午後下了一場雨，所有作物都澆好水了！' };
    logEvent('午後陣雨：全部作物已澆水');
  }
  function endDay() {
    cancelFishing();
    var withered = 0, grown = 0;
    state.plots.forEach(function (p) {
      if (p.pest) { p.crop = null; p.growth = 0; p.pest = false; p.watered = false; withered++; return; }
      if (p.crop && p.watered) { p.growth = Math.min(CROPS[p.crop].days, p.growth + 1); grown++; }
      p.watered = false;
    });
    state.day += 1;
    state.fishToday = 0; state.bugsToday = 0; state.harvestToday = 0;
    state.contestDone = false;
    state.npcDone = {};
    state.todayEvent = null;
    spawnBugs(0);
    newDigSpots();
    rollEvent();
    var summary = '第 ' + state.day + ' 天開始了！';
    if (grown > 0) summary += ' ' + grown + ' 株作物長大了。';
    if (withered > 0) summary += ' ' + withered + ' 株作物被菜蟲吃枯了……';
    if (state.todayEvent) summary += ' ' + state.todayEvent.text;
    toast(summary);
    save(); renderAll();
  }

  /* ---------- 商店與說明 ---------- */
  function openModal(html) {
    $('modalRoot').innerHTML = '<div class="fm-modal-backdrop"><div class="fm-modal">' + html + '</div></div>';
    var backdrop = $('modalRoot').firstChild;
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
    backdrop.firstChild.addEventListener('click', handleModalClick);
  }
  function handleModalClick(e) {
    var t = e.target.closest('[data-buy-seed],[data-buy-upgrade],[data-buy-fertilizer],[data-action]');
    if (!t) return;
    if (t.hasAttribute('data-buy-seed')) {
      var k = t.getAttribute('data-buy-seed');
      if (state.gold < CROPS[k].seed) { toast('金幣不夠'); return; }
      state.gold -= CROPS[k].seed;
      state.seeds[k] = (state.seeds[k] || 0) + 1;
      save(); showShop(); renderTop();
      toast('買了' + CROPS[k].name + '種子 🌱');
      return;
    }
    if (t.hasAttribute('data-buy-upgrade')) {
      var u = t.getAttribute('data-buy-upgrade');
      var lv = state.tools[u];
      var cost = UPGRADES[u].costs[lv];
      if (state.gold < cost) { toast('金幣不夠'); return; }
      state.gold -= cost;
      state.tools[u] = lv + 1;
      if (u === 'shovel') state.digsLeft += 1;
      save(); showShop(); renderTop();
      toast(UPGRADES[u].name + '升到 Lv.' + state.tools[u] + '！🔧');
      return;
    }
    if (t.hasAttribute('data-buy-fertilizer')) {
      if (state.gold < 25) { toast('金幣不夠'); return; }
      state.gold -= 25;
      state.fertilizer += 1;
      save(); showShop(); renderTop();
      toast('買了肥料 ×1 💩');
      return;
    }
    if (t.getAttribute('data-action') === 'close-modal') closeModal();
  }
  function closeModal() { $('modalRoot').innerHTML = ''; }
  function showShop() {
    var seedHtml = CROP_KEYS.map(function (k) {
      var c = CROPS[k];
      return '<div class="fm-shop-item"><div class="fm-shop-info"><b>' + c.emoji + ' ' + c.name + '種子</b><small>生長 ' + c.days + ' 天・收成售價 ' + c.sell + ' 金・持有 ' + (state.seeds[k] || 0) + '</small></div>' +
        '<button type="button" class="fm-btn small" data-buy-seed="' + k + '"' + (state.gold < c.seed ? ' disabled' : '') + '>' + c.seed + ' 金買 1 顆</button></div>';
    }).join('');
    var upHtml = Object.keys(UPGRADES).map(function (k) {
      var u = UPGRADES[k];
      var lv = state.tools[k];
      if (lv >= u.max) return '<div class="fm-shop-item"><div class="fm-shop-info"><b>' + u.name + ' Lv.' + lv + '（已滿級）</b><small>' + u.desc + '</small></div></div>';
      var cost = u.costs[lv];
      return '<div class="fm-shop-item"><div class="fm-shop-info"><b>' + u.name + ' Lv.' + lv + ' → Lv.' + (lv + 1) + '</b><small>' + u.desc + '</small></div>' +
        '<button type="button" class="fm-btn small" data-buy-upgrade="' + k + '"' + (state.gold < cost ? ' disabled' : '') + '>' + cost + ' 金升級</button></div>';
    }).join('');
    openModal('<h2>🛒 商店</h2><p class="fm-sub">金幣：' + state.gold + ' 🪙・肥料持有 ' + state.fertilizer + '</p>' +
      '<h3>🌱 種子</h3>' + seedHtml +
      '<h3>🧰 工具升級</h3>' + upHtml +
      '<div class="fm-shop-item"><div class="fm-shop-info"><b>💩 肥料</b><small>讓一株長最慢的作物立刻長大 1 天</small></div>' +
      '<button type="button" class="fm-btn small" data-buy-fertilizer ' + (state.gold < 25 ? 'disabled' : '') + '>25 金買 1 包</button></div>' +
      '<div class="fm-row" style="margin-top:14px"><button type="button" class="fm-btn ghost" data-action="close-modal">關閉</button></div>');
  }
  function showHelp() {
    openModal('<h2>❓ 怎麼玩</h2>' +
      '<p><b>🌱 種田：</b>點空地播種，點作物澆水，結束今天後澆過水的作物長大 1 天，長好點一下收成，背包賣出換金幣。</p>' +
      '<p><b>🦋 捕蟲：</b>點草地上的昆蟲就能抓，稀有昆蟲成功率較低，升級捕蟲網可提高成功率，抓到的會進圖鑑。</p>' +
      '<p><b>🎣 釣魚：</b>拋竿等魚上鉤，紅色標記進綠區時收竿。魚有 10 種，越難釣的越值錢。</p>' +
      '<p><b>⛏️ 挖寶：</b>每天 3 個藏寶點，點了就挖，可能挖到金幣、種子或肥料。</p>' +
      '<p><b>🧑‍🌾 村民：</b>每天可找三位村民各完成一次小任務；每天一場競賽，跟冠軍阿哲比今天的成績。</p>' +
      '<p><b>⚠️ 突發事件：</b>換天時可能遇到菜蟲偷吃（當天點掉田裡的蟲就沒事）、豐收日、訪客送禮或午後陣雨。</p>' +
      '<p>進度會自動存在瀏覽器裡，關掉再開還在。</p>' +
      '<div class="fm-row"><button type="button" class="fm-btn" data-action="close-modal">知道了</button></div>');
  }

  /* ---------- 事件綁定 ---------- */
  function bind() {
    $('shopBtn').addEventListener('click', showShop);
    $('helpBtn').addEventListener('click', showHelp);
    $('titleBtn').addEventListener('click', function () { switchTab('farm'); });
    $('resetBtn').addEventListener('click', function () {
      if (window.confirm('確定要重開新局嗎？現在的進度會全部清除。')) {
        localStorage.removeItem(SAVE_KEY);
        state = defaultState();
        spawnBugs(5);
        newDigSpots();
        save(); renderAll();
        toast('新的農場開始了！🌱');
      }
    });
    document.querySelectorAll('.fm-bottom button').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });
    $('main').addEventListener('click', function (e) {
      var t = e.target.closest('[data-plot],[data-seed],[data-action],[data-bug],[data-dig],[data-talk],[data-task]');
      if (!t) return;
      if (t.hasAttribute('data-plot')) { plotClick(parseInt(t.getAttribute('data-plot'), 10)); return; }
      if (t.hasAttribute('data-seed')) {
        selectedSeed = t.getAttribute('data-seed');
        renderTab();
        return;
      }
      if (t.hasAttribute('data-bug')) { catchBug(t.getAttribute('data-bug')); return; }
      if (t.hasAttribute('data-dig')) { digSpot(parseInt(t.getAttribute('data-dig'), 10)); return; }
      if (t.hasAttribute('data-talk')) { talkNpc(t.getAttribute('data-talk')); return; }
      if (t.hasAttribute('data-task')) { completeTask(t.getAttribute('data-task')); return; }
      var a = t.getAttribute('data-action');
      if (a === 'water-all') waterAll();
      else if (a === 'fertilize') fertilize();
      else if (a === 'sell-all') sellAll();
      else if (a === 'end-day') endDay();
      else if (a === 'reshuffle-bugs') { state.fieldBugs = []; spawnBugs(5); save(); renderAll(); toast('草地上的昆蟲換了一批 🦋'); }
      else if (a === 'cast') startFishing();
      else if (a === 'reel') reelIn();
      else if (a === 'cancel-fish') cancelFishing();
      else if (a === 'contest') enterContest();
      else if (a === 'close-modal') closeModal();
    });
  }
  function switchTab(name) {
    activeTab = name;
    renderAll();
  }

  /* ---------- 對外測試介面（不影響玩法） ---------- */
  window.Farm = {
    state: function () { return state; },
    CROPS: CROPS, BUGS: BUGS, FISH: FISH,
    switchTab: switchTab, plotClick: plotClick, catchBug: catchBug,
    startFishing: startFishing, reelIn: reelIn, digSpot: digSpot,
    completeTask: completeTask, enterContest: enterContest,
    endDay: endDay, rollEvent: rollEvent, spawnBugs: spawnBugs,
    fishing: function () { return fishing; }
  };
  window.__farm = window.Farm;

  /* ---------- 啟動 ---------- */
  load();
  if (!state.fieldBugs.length) spawnBugs(5);
  if (!state.digSpots.length) newDigSpots();
  else if (state.digsLeft === undefined) state.digsLeft = 3;
  bind();
  renderAll();
})();
