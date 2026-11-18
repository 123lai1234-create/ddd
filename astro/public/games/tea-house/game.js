'use strict';
/* ============================================================
   我的小茶坊 — 採茶製茶經營小遊戲
   純前端、免登入、免付費、無後端；進度存在 localStorage。
   玩法致敬「採茶→製茶→販售→抽設備」的經營迴圈，
   程式、文字、名稱、美術全部自寫，未使用原站任何程式碼或圖片。
   ============================================================ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => Math.round(n).toLocaleString('en-US');
const todayStr = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── 章節與關卡（5 章 39 關，海拔遞增） ── */
const CHAPTER_DEFS = [
  { name: '春芽初採', sub: '山腳茶園', count: 5, altFrom: 150, altTo: 320, costFrom: 4, costTo: 8, budsFrom: 21, budsTo: 28, chest: { tickets: 3, coins: 2000, outfit: '格紋圍裙' } },
  { name: '半山茶園', sub: '半山腰', count: 8, altFrom: 420, altTo: 950, costFrom: 6, costTo: 9, budsFrom: 24, budsTo: 30, chest: { tickets: 5, coins: 5000 } },
  { name: '高山雲霧', sub: '雲霧繚繞', count: 9, altFrom: 1050, altTo: 1800, costFrom: 7, costTo: 10, budsFrom: 26, budsTo: 34, chest: { tickets: 5, coins: 8000, outfit: '竹編斗笠' } },
  { name: '雲海之巔', sub: '雲海之上', count: 9, altFrom: 1900, altTo: 2350, costFrom: 8, costTo: 11, budsFrom: 28, budsTo: 36, chest: { tickets: 8, coins: 12000 } },
  { name: '登頂大禹嶺', sub: '最高峰', count: 8, altFrom: 2400, altTo: 2500, costFrom: 9, costTo: 12, budsFrom: 30, budsTo: 38, chest: { tickets: 10, coins: 20000 } },
];
const LEVELS = [];
CHAPTER_DEFS.forEach((ch, ci) => {
  for (let i = 0; i < ch.count; i++) {
    const t = ch.count === 1 ? 0 : i / (ch.count - 1);
    LEVELS.push({
      id: (ci + 1) + '-' + (i + 1),
      chapter: ci + 1,
      alt: Math.round(ch.altFrom + (ch.altTo - ch.altFrom) * t),
      cost: Math.round(ch.costFrom + (ch.costTo - ch.costFrom) * t),
      buds: Math.round(ch.budsFrom + (ch.budsTo - ch.budsFrom) * t),
      groups: 4 + Math.floor(i / 3),
    });
  }
});
function originOf(alt) {
  if (alt < 400) return '一般茶菁';
  if (alt < 1000) return '著涎茶菁';
  if (alt < 1500) return '阿里山茶菁';
  if (alt < 2000) return '梨山茶菁';
  return '大禹嶺茶菁';
}

/* ── 茶（12 種） need: 槽位代號；origin: 指定葉菁產地（null 表通用） ── */
const TEAS = [
  { id: 'biluochun', name: '台灣碧螺春', en: 'Biluochun', ferment: '不發酵', shape: '條形', color: '綠', price: 16, icon: '🍃', recipe: ['採嫩芽', '炒菁', '揉成螺', '乾燥'], need: ['fry', 'knead'], origin: null, desc: '採收高海拔嫩芽，揉成螺形，清香淡雅。' },
  { id: 'baozhong', name: '包種茶', en: 'Baozhong', ferment: '輕發酵', shape: '條形', color: '青', price: 11, icon: '🌿', recipe: ['採嫩芽', '浪菁', '炒菁', '揉捻', '乾燥'], need: ['wither', 'fry', 'knead'], origin: null, desc: '花香清揚，滋味甘醇，是入門的好選擇。' },
  { id: 'taiwan-oolong', name: '台灣烏龍茶', en: 'Taiwan Oolong', ferment: '半發酵', shape: '球形', color: '青', price: 10, icon: '🫖', recipe: ['採嫩芽', '浪菁', '炒菁', '包揉', '乾燥'], need: ['wither', 'ball'], origin: null, desc: '半發酵的代表，香氣與滋味取得平衡。' },
  { id: 'dongding', name: '凍頂烏龍茶', en: 'Dongding Oolong', ferment: '半發酵', shape: '球形', color: '青', price: 16, icon: '⛰️', recipe: ['採嫩芽', '浪菁', '炒菁', '包揉', '烘焙'], need: ['wither', 'ball'], origin: null, desc: '烘焙帶出熟果香，喉韻深長。' },
  { id: 'tieguanyin', name: '熟香鐵觀音', en: 'Tieguanyin', ferment: '全發酵', shape: '球形', color: '黑', price: 26, icon: '🖤', recipe: ['採嫩芽', '晒菁', '浪菁', '炒菁', '包揉', '烘焙'], need: ['wither', 'ball'], origin: null, desc: '重烘焙的熟香，濃郁厚實。' },
  { id: 'sunmoon', name: '日月潭紅茶', en: 'Sun Moon Lake Black', ferment: '全發酵', shape: '條形', color: '紅', price: 16, icon: '🌅', recipe: ['採嫩芽', '浪菁', '揉捻', '發酵', '乾燥'], need: ['wither', 'fry'], origin: null, desc: '紅茶特有的蜜香與果香。' },
  { id: 'jinxuan', name: '上品金萱茶', en: 'Jinxuan', ferment: '半發酵', shape: '球形', color: '青', price: 15, icon: '🌼', recipe: ['採嫩芽', '晒菁', '浪菁', '炒菁', '揉捻', '乾燥'], need: ['wither', 'knead'], origin: null, desc: '淡淡奶香，柔順好入口。' },
  { id: 'oriental', name: '東方美人茶', en: 'Oriental Beauty', ferment: '輕發酵', shape: '條形', color: '青', price: 45, icon: '🦋', recipe: ['採嫩芽', '晒菁', '浪菁', '揉捻', '乾燥'], need: ['wither', 'knead'], origin: '著涎茶菁', desc: '需用著涎茶菁，帶天然蜜香的高價茶。' },
  { id: 'alishan-oolong', name: '阿里山烏龍茶', en: 'Alishan Oolong', ferment: '半發酵', shape: '球形', color: '青', price: 24, icon: '🌫️', recipe: ['採嫩芽', '浪菁', '炒菁', '包揉', '乾燥'], need: ['wither', 'ball'], origin: '阿里山茶菁', desc: '高山雲霧孕育，香氣清高。' },
  { id: 'lishan-oolong', name: '梨山烏龍茶', en: 'Lishan Oolong', ferment: '半發酵', shape: '球形', color: '青', price: 30, icon: '🏔️', recipe: ['採嫩芽', '浪菁', '炒菁', '包揉', '乾燥'], need: ['wither', 'ball'], origin: '梨山茶菁', desc: '高冷山區出品，滋味甘甜。' },
  { id: 'dayuling-oolong', name: '大禹嶺烏龍茶', en: 'Dayuling Oolong', ferment: '半發酵', shape: '球形', color: '青', price: 42, icon: '❄️', recipe: ['採嫩芽', '浪菁', '炒菁', '包揉', '乾燥'], need: ['wither', 'ball'], origin: '大禹嶺茶菁', desc: '最高海拔的茶，香氣細緻冷冽。' },
  { id: 'alishan-jinxuan', name: '阿里山金萱茶', en: 'Alishan Jinxuan', ferment: '半發酵', shape: '球形', color: '青', price: 23, icon: '🌸', recipe: ['採嫩芽', '晒菁', '浪菁', '炒菁', '揉捻', '乾燥'], need: ['wither', 'knead'], origin: '阿里山茶菁', desc: '高山金萱，奶香更顯。' },
];

/* ── 設備槽位與設備池（一般 42 台＋專用傳說 4 台＋神話 18 台） ── */
const SLOT_DEFS = [
  { id: 'basket', name: '茶簍', dim: '香氣', icon: '🧺' },
  { id: 'wither', name: '萎凋', dim: '發酵', icon: '🍃' },
  { id: 'fry', name: '炒菁', dim: '滋味', icon: '🍳' },
  { id: 'knead', name: '揉捻', dim: '外觀', icon: '👐' },
  { id: 'ball', name: '布球揉捻', dim: '外觀', icon: '⚪' },
  { id: 'roast', name: '焙籠', dim: '焙火', icon: '🔥' },
  { id: 'harvester', name: '採茶機', dim: '自動採茶', icon: '🛒' },
];
const RARITY_VALUE = { '普通': 50, '精緻': 65, '稀有': 80, '傳說': 95, '神話': 110 };
const EQUIP_NAMES = {
  basket: [['竹茶簍', '普通'], ['藤編茶簍', '普通'], ['木茶簍', '普通'], ['透氣竹簍', '精緻'], ['檜木茶簍', '精緻'], ['紫砂茶簍', '稀有']],
  wither: [['竹編萎凋架', '普通'], ['木製萎凋床', '普通'], ['草蓆萎凋架', '普通'], ['通風萎凋棚', '精緻'], ['檜木萎凋架', '精緻'], ['陶土萎凋房', '稀有']],
  fry: [['鐵炒鍋', '普通'], ['鑄鐵炒鍋', '普通'], ['銅炒鍋', '普通'], ['厚底炒鍋', '精緻'], ['雙耳炒鍋', '精緻'], ['紫銅炒鍋', '稀有']],
  knead: [['手揉桌', '普通'], ['木揉捻台', '普通'], ['竹揉捻桌', '普通'], ['檜木揉捻台', '精緻'], ['石面揉捻桌', '精緻'], ['紫檀揉捻台', '稀有']],
  ball: [['布包揉捻器', '普通'], ['棉布揉捻包', '普通'], ['麻布揉捻包', '普通'], ['雙層布球器', '精緻'], ['竹編布球機', '精緻'], ['電動布球機', '稀有']],
  roast: [['竹焙籠', '普通'], ['木炭焙籠', '普通'], ['陶土焙籠', '普通'], ['雙層焙籠', '精緻'], ['檜木焙籠', '精緻'], ['紫砂焙籠', '稀有']],
  harvester: [['手推採茶機', '普通'], ['背式採茶機', '普通'], ['單人採茶機', '普通'], ['雙人採茶機', '精緻'], ['電動採茶機', '精緻'], ['履帶採茶機', '稀有']],
};
const LEGENDARY_EQUIP = [
  { name: '阿里山雲霧茶簍', slot: 'basket' },
  { name: '梨山晨霧萎凋棚', slot: 'wither' },
  { name: '大禹嶺雪芽焙籠', slot: 'roast' },
  { name: '膨風茶手工揉捻台', slot: 'knead' },
];
const MYTHIC_EQUIP = [
  { name: '星河茶簍', slot: 'basket' }, { name: '月桂揉捻機', slot: 'knead' },
  { name: '朝露萎凋架', slot: 'wither' }, { name: '熔岩焙火爐', slot: 'roast' },
  { name: '雲端採茶機', slot: 'harvester' }, { name: '極光揉捻機', slot: 'knead' },
  { name: '銀月茶簍', slot: 'basket' }, { name: '山嵐炒鍋', slot: 'fry' },
  { name: '流星焙籠', slot: 'roast' }, { name: '翡翠萎凋房', slot: 'wither' },
  { name: '金烏炒菁鍋', slot: 'fry' }, { name: '白露布球機', slot: 'ball' },
  { name: '紫藤茶簍', slot: 'basket' }, { name: '赤焰焙火爐', slot: 'roast' },
  { name: '冰晶萎凋架', slot: 'wither' }, { name: '雷鳴揉捻器', slot: 'ball' },
  { name: '彩虹茶簍', slot: 'basket' }, { name: '永晝採茶機', slot: 'harvester' },
];
const EQUIP = [];
Object.keys(EQUIP_NAMES).forEach(slot => {
  EQUIP_NAMES[slot].forEach(([name, rarity], i) => {
    EQUIP.push({ id: 'eq-' + slot + '-' + i, name, slot, rarity, value: RARITY_VALUE[rarity], special: false });
  });
});
LEGENDARY_EQUIP.forEach((e, i) => EQUIP.push({ id: 'eq-leg-' + i, name: e.name, slot: e.slot, rarity: '傳說', value: 95, special: true }));
MYTHIC_EQUIP.forEach((e, i) => EQUIP.push({ id: 'eq-myth-' + i, name: e.name, slot: e.slot, rarity: '神話', value: 110, special: true }));
const equipById = id => EQUIP.find(e => e.id === id);
const equipByName = name => EQUIP.find(e => e.name === name);
function equipValue(eq, stars) {
  if (!eq) return 0;
  return eq.value + (stars || 1) * 6;
}

/* ── 芽圖鑑（30 款：少見 12／稀有 10／傳說 6／夢幻 2） ── */
const BUDS = [];
['春芽', '嫩綠芽', '山霧芽', '朝露芽', '青芽', '單芯芽', '雙葉芽', '細芽', '圓芽', '尖芽', '柔芽', '早芽']
  .forEach((n, i) => BUDS.push({ id: 'bud-c' + i, name: n, rarity: '少見', icon: '🌱' }));
['琥珀芽', '紫玉芽', '銀針芽', '翠玉芽', '香櫞芽', '珊瑚芽', '翡翠芽', '珍珠芽', '瑪瑙芽', '琉璃芽']
  .forEach((n, i) => BUDS.push({ id: 'bud-r' + i, name: n, rarity: '稀有', icon: '🌿' }));
['星辰芽', '龍珠芽', '鳳凰芽', '麒麟芽', '仙露芽', '瓊漿芽']
  .forEach((n, i) => BUDS.push({ id: 'bud-e' + i, name: n, rarity: '傳說', icon: '✨' }));
['虹光芽', '幻彩芽'].forEach((n, i) => BUDS.push({ id: 'bud-m' + i, name: n, rarity: '夢幻', icon: '💎' }));

/* ── 獎章（22 枚） ── */
const MEDALS = [
  { id: 'm-first-cut', name: '第一把剪刀', desc: '採下第一棵茶芽' },
  { id: 'm-full-basket', name: '滿簍而歸', desc: '一局採到 20 棵茶芽以上' },
  { id: 'm-combo10', name: '連擊新手', desc: '單局連擊達到 10' },
  { id: 'm-combo25', name: '連擊高手', desc: '單局連擊達到 25' },
  { id: 'm-full-combo', name: '全數採下', desc: '單局沒有漏採（全連擊）' },
  { id: 'm-all-perfect', name: '顆顆完美', desc: '單局全部 PERFECT' },
  { id: 'm-golden', name: '金芽獵手', desc: '採到金色茶芽' },
  { id: 'm-thousand', name: '千斤茶菁', desc: '累計收成 100 斤茶菁' },
  { id: 'm-first-good', name: '第一批好茶', desc: '做出第一批好茶以上' },
  { id: 'm-good10', name: '好茶達人', desc: '累計做出 10 批好茶以上' },
  { id: 'm-excellent', name: '極品茶人', desc: '做出一批極品茶' },
  { id: 'm-legend', name: '傳說之茶', desc: '做出一批傳說茶' },
  { id: 'm-all-teas', name: '十二味全通', desc: '12 種茶都做過' },
  { id: 'm-oriental', name: '東方美人初成', desc: '做出東方美人茶' },
  { id: 'm-rich', name: '小富翁', desc: '累計財富達到 10 萬銅板' },
  { id: 'm-tycoon', name: '大茶商', desc: '累計財富達到 100 萬銅板' },
  { id: 'm-bud10', name: '芽圖鑑入門', desc: '收集 10 款芽' },
  { id: 'm-bud30', name: '芽圖鑑大師', desc: '收集全部 30 款芽' },
  { id: 'm-equip20', name: '設備收藏家', desc: '擁有 20 台設備' },
  { id: 'm-ch1', name: '春芽初採', desc: '通關第 1 章' },
  { id: 'm-ch3', name: '高山雲霧', desc: '通關第 3 章' },
  { id: 'm-ch5', name: '登頂大禹嶺', desc: '通關第 5 章' },
];

/* ── 衣櫃（8 套） ── */
const OUTFITS = [
  { id: '青衫茶農', icon: '🧑‍🌾', unlock: '一開始就有' },
  { id: '格紋圍裙', icon: '👨‍🍳', unlock: '第 1 章寶箱' },
  { id: '貓耳茶農', icon: '🐱', unlock: '等級 8' },
  { id: '竹編斗笠', icon: '🎋', unlock: '第 3 章寶箱' },
  { id: '奶茶店員', icon: '🧋', unlock: '獎章「好茶達人」' },
  { id: '星空茶農', icon: '🌌', unlock: '等級 12' },
  { id: '霓虹茶農', icon: '🌃', unlock: '等級 15' },
  { id: '雲霧茶仙', icon: '🧝', unlock: '等級 18' },
];

/* ── 任務 ── */
const DAILY_TASKS = [
  { id: 'make5', text: '做茶 5 批', reward: { coins: 1000 }, goal: 5, metric: 'batchesToday' },
  { id: 'good1', text: '做出 1 批好茶以上', reward: { coins: 2000 }, goal: 1, metric: 'goodToday' },
  { id: 'kinds3', text: '做出 3 種不同茶', reward: { coins: 1500 }, goal: 3, metric: 'kindsToday' },
];
const NEWBIE_TASKS = [
  { id: 'nb-first-bud', text: '採下第 1 棵茶芽', reward: { tickets: 5 } },
  { id: 'nb-10-batches', text: '做 10 批茶', reward: { coins: 3000 } },
  { id: 'nb-get-banana', text: '取得 1 根香蕉', reward: { tickets: 5 } },
  { id: 'nb-eat-banana', text: '吃下 1 根香蕉', reward: { tickets: 5 } },
  { id: 'nb-biluochun', text: '做 1 批台灣碧螺春', reward: { coins: 1000 } },
  { id: 'nb-good', text: '做 1 批好茶以上', reward: { tickets: 10 } },
  { id: 'nb-ch1', text: '通關第 1 章', reward: { tickets: 10 } },
  { id: 'nb-buds5', text: '收集 5 款芽', reward: { tickets: 5 } },
];
const RANK_DEMO_TEA = [
  { name: '山間茶屋', score: 812.4 }, { name: '霧峰茶莊', score: 640.2 },
  { name: '阿山茶園', score: 598.7 }, { name: '雲霧茶舍', score: 551.3 },
];
const RANK_DEMO_WEALTH = [
  { name: '山間茶屋', score: 300 }, { name: '霧峰茶莊', score: 160 },
  { name: '阿山茶園', score: 87 }, { name: '雲霧茶舍', score: 55 },
];

/* ── 存檔 ── */
const SAVE_KEY = 'teaHouseSaveV1';
const WAREHOUSE_MAX = 12;
const HARVESTER_MAX = 5;
let basketSeq = 1;
function defaultState() {
  const st = {
    v: 1, coins: 3000, tickets: 0, fragments: 0, bananas: 0,
    stamina: 50, staminaMax: 50, staminaTs: Date.now(),
    level: 1, wealth: 0,
    warehouse: [
      { id: 'b0-1', liang: 80, quality: 55, alt: 150, origin: '一般茶菁' },
      { id: 'b0-2', liang: 80, quality: 55, alt: 150, origin: '一般茶菁' },
      { id: 'b0-3', liang: 80, quality: 55, alt: 150, origin: '一般茶菁' },
    ],
    harvester: { count: 0, ts: Date.now() },
    teas: {}, stars: {},
    equipOwned: {}, equipped: {},
    draws: 0, pity: 0,
    buds: [], budRewards: {},
    medals: [],
    tasks: { dailyDate: '', daily: {}, newbie: {}, starClaimed: {} },
    ledger: { date: '', sold: 0, spent: 0, entries: [] },
    tutorial: 0, outfitsOwned: ['青衫茶農'], outfit: '青衫茶農',
    stats: { harvests: 0, bestCombo: 0, fullCombos: 0, allPerfects: 0, golden: 0, batches: 0, totalLiang: 0, grades: { '失手': 0, '普通': 0, '好茶': 0, '極品': 0, '傳說': 0 } },
    daily: { date: '', batches: 0, good: 0, kinds: [] },
    lastLogin: '', chests: {},
  };
  // 初始設備：竹茶簍、鐵炒鍋、手揉桌、竹焙籠、手推採茶機（皆 1★）
  ['竹茶簍', '鐵炒鍋', '手揉桌', '竹焙籠', '手推採茶機'].forEach(name => {
    const eq = equipByName(name);
    if (eq) { st.equipOwned[eq.id] = 1; st.equipped[eq.slot] = eq.id; }
  });
  return st;
}
let S = defaultState();
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return;
    S = Object.assign(defaultState(), data);
    S.stats = Object.assign(defaultState().stats, data.stats || {});
    S.tasks = Object.assign(defaultState().tasks, data.tasks || {});
    S.ledger = Object.assign(defaultState().ledger, data.ledger || {});
    S.daily = Object.assign(defaultState().daily, data.daily || {});
    S.harvester = Object.assign({ count: 0, ts: Date.now() }, data.harvester || {});
  } catch (e) { /* 存檔壞了就用新檔 */ }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ }
}
function levelOf(wealth) {
  // 等級門檻：累計財富 1000 起，每級約 ×1.6
  let lv = 1, need = 1000;
  while (wealth >= need) { lv++; need = Math.round(need * 1.6); }
  return lv;
}
function applyLevel() {
  const lv = levelOf(S.wealth);
  if (lv > S.level) {
    S.staminaMax = 50 + (lv - 1) * 2;
    S.stamina = S.staminaMax;
    S.staminaTs = Date.now();
    S.level = lv;
    toast('升級了！Lv.' + lv + '，體力補滿、上限＋2');
  } else {
    S.level = lv;
    S.staminaMax = 50 + (lv - 1) * 2;
  }
}
function regenStamina() {
  const now = Date.now();
  if (S.stamina >= S.staminaMax) { S.staminaTs = now; return; }
  const gained = Math.floor((now - S.staminaTs) / 240000);
  if (gained > 0) {
    S.stamina = Math.min(S.staminaMax, S.stamina + gained);
    S.staminaTs += gained * 240000;
    if (S.stamina >= S.staminaMax) S.staminaTs = now;
  }
}
function harvesterTick() {
  const now = Date.now();
  const produced = Math.floor((now - S.harvester.ts) / 900000);
  if (produced > 0) {
    const add = Math.min(HARVESTER_MAX - S.harvester.count, produced);
    if (add > 0) {
      S.harvester.count += add;
      S.harvester.ts += add * 900000;
    } else {
      S.harvester.ts = now;
    }
  }
}
function resetDailyIfNeeded() {
  const t = todayStr();
  if (S.daily.date !== t) {
    S.daily = { date: t, batches: 0, good: 0, kinds: [] };
    S.tasks.daily = {};
  }
  if (S.ledger.date !== t) {
    S.ledger = { date: t, sold: 0, spent: 0, entries: [] };
  }
}
function totalStars() { return Object.values(S.stars).reduce((a, b) => a + b, 0); }
function chapterStars(ch) {
  return LEVELS.filter(l => l.chapter === ch).reduce((a, l) => a + (S.stars[l.id] || 0), 0);
}
function levelUnlocked(lv) {
  const idx = LEVELS.findIndex(l => l.id === lv.id);
  if (idx === 0) return true;
  return (S.stars[LEVELS[idx - 1].id] || 0) >= 1;
}
function chapterCleared(ch) {
  return LEVELS.filter(l => l.chapter === ch).every(l => (S.stars[l.id] || 0) >= 1);
}

/* ── 小工具 UI ── */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
function openModal(html) {
  const root = $('#modalRoot');
  root.innerHTML = '<div class="th-modal-back"><div class="th-modal">' + html + '</div></div>';
  const back = $('.th-modal-back', root);
  back.addEventListener('click', e => { if (e.target === back) closeModal(); });
  return $('.th-modal', root);
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function confirmModal(text, okLabel, onOk) {
  const m = openModal('<h3>確認</h3><p>' + esc(text) + '</p><div class="th-actions"><button class="th-btn ghost" id="cfCancel" type="button">取消</button><button class="th-btn" id="cfOk" type="button">' + esc(okLabel) + '</button></div>');
  $('#cfCancel', m).onclick = closeModal;
  $('#cfOk', m).onclick = () => { closeModal(); onOk(); };
}

/* ── 頂部列 ── */
function renderTop() {
  regenStamina();
  $('#shopLv').textContent = 'Lv.' + S.level;
  $('#shopIcon').textContent = (OUTFITS.find(o => o.id === S.outfit) || OUTFITS[0]).icon;
  $('#staminaVal').textContent = S.stamina + '/' + S.staminaMax;
  let timer = '';
  if (S.stamina < S.staminaMax) {
    const ms = 240000 - (Date.now() - S.staminaTs);
    const mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
    timer = '下 1 點 ' + mm + ':' + String(ss).padStart(2, '0');
  }
  $('#staminaTimer').textContent = timer;
  const claimable = dailyClaimable() || newbieClaimable() || starClaimable();
  $('#taskDot').hidden = !claimable;
}
function switchTab(name) {
  $$('.th-bottom button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.th-tab').forEach(t => { t.hidden = t.dataset.tab !== name; });
  renderTab(name);
  window.scrollTo(0, 0);
}
function renderTab(name) {
  if (name === 'map') renderMap();
  else if (name === 'make') renderMake();
  else if (name === 'gacha') renderGacha();
  else if (name === 'equip') renderEquip();
  else if (name === 'cabinet') renderCabinet();
  else if (name === 'rank') renderRank();
  renderTop();
}

/* ── 茶菁（地圖） ── */
function renderMap() {
  const el = $('#tab-map');
  const wh = S.warehouse;
  const totalLiang = wh.reduce((a, b) => a + b.liang, 0);
  const avgQ = wh.length ? Math.round(wh.reduce((a, b) => a + b.quality, 0) / wh.length) : 0;
  harvesterTick();
  let html = '<h2>🌿 茶菁地圖</h2><p class="th-sub">沿著山路往上採，海拔越高，茶菁越稀有。採滿 50% 就開下一關。</p>';
  html += '<div class="th-card th-warehouse"><div class="th-row between"><b>🧺 茶菁倉</b><span>' + wh.length + ' / ' + WAREHOUSE_MAX + ' 簍・' + fmt(Math.floor(totalLiang / 16)) + ' 斤' + (totalLiang % 16 ? ' ' + (totalLiang % 16) + ' 兩' : '') + '・品質 ' + avgQ + '</span></div>';
  if (!wh.length) html += '<p class="th-muted">倉庫是空的，先去手採一局吧。</p>';
  html += '</div>';
  html += '<div class="th-card"><div class="th-row between"><b>🛒 採茶機（掛機）</b><span>' + S.harvester.count + ' / ' + HARVESTER_MAX + ' 簍</span></div>'
    + '<p class="th-muted">每 15 分鐘自動裝滿 1 簍（5 斤、品質 60），點收成領進茶菁倉。</p>'
    + '<div class="th-row"><button class="th-btn small" id="harvestBtn" type="button" ' + (S.harvester.count === 0 ? 'disabled' : '') + '>收成 ' + S.harvester.count + ' 簍</button>'
    + '<span class="th-small">下 1 簍約 ' + harvesterNextText() + '</span></div></div>';
  html += '<div class="th-card"><div class="th-row between"><b>👘 衣櫃</b><span>穿戴中：' + esc(S.outfit) + '</span></div>'
    + '<div class="th-row" style="margin-top:8px">' + OUTFITS.map(o => {
      const owned = S.outfitsOwned.includes(o.id);
      return '<button class="th-btn small ' + (S.outfit === o.id ? '' : 'ghost') + '" data-outfit="' + esc(o.id) + '" type="button" ' + (owned ? '' : 'disabled') + '>' + o.icon + ' ' + esc(o.id) + (owned ? '' : ' 🔒') + '</button>';
    }).join('') + '</div><p class="th-small" style="margin-top:6px">未解鎖的裝扮：' + OUTFITS.filter(o => !S.outfitsOwned.includes(o.id)).map(o => esc(o.id) + '（' + esc(o.unlock) + '）').join('、') + '</p></div>';
  CHAPTER_DEFS.forEach((ch, ci) => {
    const chNum = ci + 1;
    const levels = LEVELS.filter(l => l.chapter === chNum);
    const cleared = chapterCleared(chNum);
    const chestClaimed = !!S.chests[chNum];
    html += '<div class="th-chapter"><div class="th-chapter-head"><h3>第 ' + chNum + ' 章・' + esc(ch.name) + ' <span class="th-alt">' + esc(ch.sub) + '</span></h3><span class="th-chip">' + chapterStars(chNum) + '★</span></div>';
    html += '<div class="th-levels">';
    levels.forEach(lv => {
      const unlocked = levelUnlocked(lv);
      const st = S.stars[lv.id] || 0;
      html += '<button class="th-level ' + (unlocked ? '' : 'locked') + '" data-level="' + lv.id + '" type="button" ' + (unlocked ? '' : 'disabled') + '>'
        + '<b>' + lv.id + '・' + lv.alt + 'm</b>'
        + '<span class="th-alt">體力 -' + lv.cost + '・茶芽 ' + lv.buds + ' 個</span>'
        + '<span class="stars">' + (st ? '★'.repeat(st) + '☆'.repeat(4 - st) : '尚未挑戰') + '</span>'
        + (unlocked ? '' : '<span class="th-small">上一關採滿 50% 解鎖</span>')
        + '</button>';
    });
    html += '</div>';
    if (cleared && !chestClaimed) {
      html += '<button class="th-btn gold" data-chest="' + chNum + '" type="button" style="margin-top:8px">🎁 領取第 ' + chNum + ' 章寶箱</button>';
    } else if (cleared) {
      html += '<p class="th-small" style="margin-top:6px">🎁 第 ' + chNum + ' 章寶箱已領取</p>';
    }
    html += '</div>';
  });
  el.innerHTML = html;
  $('#harvestBtn', el).onclick = collectHarvester;
  $$('[data-outfit]', el).forEach(b => b.onclick = () => {
    S.outfit = b.dataset.outfit; save(); renderTop(); renderMap(); toast('換上「' + S.outfit + '」了');
  });
  $$('[data-level]', el).forEach(b => b.onclick = () => openLevel(b.dataset.level));
  $$('[data-chest]', el).forEach(b => b.onclick = () => claimChest(+b.dataset.chest));
}
function harvesterNextText() {
  if (S.harvester.count >= HARVESTER_MAX) return '已滿';
  const ms = 900000 - (Date.now() - S.harvester.ts);
  const mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
  return mm + ':' + String(ss).padStart(2, '0');
}
function collectHarvester() {
  harvesterTick();
  if (S.harvester.count === 0) { toast('採茶機還沒裝滿'); return; }
  if (S.warehouse.length + S.harvester.count > WAREHOUSE_MAX) { toast('茶菁倉放不下，先去製茶清掉一些'); return; }
  for (let i = 0; i < S.harvester.count; i++) {
    S.warehouse.push({ id: 'b-h' + Date.now() + '-' + i, liang: 80, quality: 60, alt: 150, origin: '一般茶菁' });
  }
  toast('收成 ' + S.harvester.count + ' 簍茶菁進倉');
  S.harvester.count = 0;
  S.harvester.ts = Date.now();
  save(); renderMap();
}
function claimChest(chNum) {
  if (!chapterCleared(chNum) || S.chests[chNum]) return;
  const chest = CHAPTER_DEFS[chNum - 1].chest;
  S.chests[chNum] = true;
  S.tickets += chest.tickets || 0;
  S.coins += chest.coins || 0;
  addLedger(0, 0, '第 ' + chNum + ' 章寶箱');
  let msg = '第 ' + chNum + ' 章寶箱：抽籤券 ×' + (chest.tickets || 0) + '、銅板 +' + fmt(chest.coins || 0);
  if (chest.outfit && !S.outfitsOwned.includes(chest.outfit)) {
    S.outfitsOwned.push(chest.outfit);
    msg += '、衣櫃「' + chest.outfit + '」';
  }
  save(); checkMedals(); renderMap();
  toast(msg);
}
function openLevel(levelId) {
  const lv = LEVELS.find(l => l.id === levelId);
  if (!lv || !levelUnlocked(lv)) return;
  if (S.warehouse.length >= WAREHOUSE_MAX) { toast('茶菁倉滿了（12 簍），先去製茶清掉一些再來採'); return; }
  if (S.stamina < lv.cost) { toast('體力不夠（需要 ' + lv.cost + ' 點），等體力回復或吃香蕉'); return; }
  const origin = originOf(lv.alt);
  const m = openModal('<h3>' + lv.id + '・海拔 ' + lv.alt + ' 公尺</h3>'
    + '<div class="th-kv"><span>茶菁產地</span><b>' + origin + '</b></div>'
    + '<div class="th-kv"><span>茶芽數量</span><b>' + lv.buds + ' 個（分 ' + lv.groups + ' 組）</b></div>'
    + '<div class="th-kv"><span>過關條件</span><b>採到 50% 以上</b></div>'
    + '<div class="th-kv"><span>體力消耗</span><b>-' + lv.cost + ' 點</b></div>'
    + '<p class="th-muted" style="margin-top:8px">往上拉茶芽，發亮時拉是 PERFECT（＋100 分）。金色茶芽＋500 分。'
    + (lv.chapter >= 2 ? '第 2 章起有蟲子，拉到蟲子算漏採、連擊中斷。' : '')
    + '猴子出現時點一下拿香蕉。</p>'
    + '<div class="th-actions"><button class="th-btn ghost" id="lvCancel" type="button">取消</button><button class="th-btn" id="lvStart" type="button">開始手採（-' + lv.cost + ' ⚡）</button></div>');
  $('#lvCancel', m).onclick = closeModal;
  $('#lvStart', m).onclick = () => { closeModal(); startHarvest(lv); };
}

/* ── 採茶小遊戲 ── */
let HV = null;
function startHarvest(lv) {
  S.stamina -= lv.cost;
  save(); renderTop();
  const overlay = $('#harvestOverlay');
  const grid = $('#hvGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('div');
    b.className = 'th-bush'; b.dataset.bush = i;
    grid.appendChild(b);
  }
  $('#hvLevel').textContent = lv.id + '・' + lv.alt + 'm';
  $('#hvScore').textContent = '0 分';
  $('#hvCombo').textContent = '';
  $('#hvTime').textContent = '60';
  $('#hvProgress').style.width = '100%';
  $('#hvHint').textContent = '茶芽冒出來、發亮時，往上拉起來！點按不算喔。';
  $('#hvMonkey').hidden = true;
  overlay.hidden = false;
  // 生成出芽計畫
  const spawns = [];
  const perGroup = Math.ceil(lv.buds / lv.groups);
  let budIdx = 0;
  for (let g = 0; g < lv.groups; g++) {
    const n = Math.min(perGroup, lv.buds - budIdx);
    for (let k = 0; k < n; k++) {
      spawns.push({ at: 1500 + g * Math.floor(46000 / lv.groups) + k * 380, kind: 'bud', idx: budIdx++ });
    }
  }
  // 金色茶芽：一局一棵
  if (spawns.length) pick(spawns).kind = 'golden';
  // 特殊芽：約 10% 機率是圖鑑芽
  spawns.forEach(s => {
    if (s.kind === 'bud' && Math.random() < 0.10) {
      s.kind = 'special';
      s.budId = pick(BUDS).id;
    }
  });
  // 蟲子（第 2 章起）：額外出現，拉到算漏採
  if (lv.chapter >= 2) {
    const nInsect = Math.max(2, Math.floor(lv.buds * 0.15));
    for (let i = 0; i < nInsect; i++) {
      spawns.push({ at: randi(8000, 52000), kind: 'insect', idx: -1 });
    }
  }
  spawns.sort((a, b) => a.at - b.at);
  HV = {
    lv, spawns, spawnPtr: 0, active: new Map(),
    score: 0, pulled: 0, perfects: 0, misses: 0, combo: 0, maxCombo: 0,
    liang: 0, qualitySum: 0, goldenGot: false, specialGot: [],
    startAt: performance.now(), pausedTotal: 0, pauseStart: 0, paused: false,
    monkeyAt: Math.random() < 0.35 ? randi(15000, 40000) : -1, monkeyShown: false,
    done: false, timer: null, drag: null,
  };
  HV.timer = setInterval(harvestTick, 100);
  $('#hvPause').onclick = toggleHarvestPause;
}
function hvElapsed() {
  return performance.now() - HV.startAt - HV.pausedTotal - (HV.paused ? performance.now() - HV.pauseStart : 0);
}
function toggleHarvestPause() {
  if (!HV || HV.done) return;
  if (!HV.paused) { HV.paused = true; HV.pauseStart = performance.now(); $('#hvPause').textContent = '▶'; $('#hvHint').textContent = '已暫停，按 ▶ 繼續。'; }
  else {
    HV.pausedTotal += performance.now() - HV.pauseStart;
    HV.paused = false; $('#hvPause').textContent = '⏸'; $('#hvHint').textContent = '茶芽冒出來、發亮時，往上拉起來！';
  }
}
function harvestTick() {
  if (!HV || HV.done) return;
  if (HV.paused) return;
  const el = hvElapsed();
  const timeLeft = Math.max(0, 60 - el / 1000);
  $('#hvTime').textContent = Math.ceil(timeLeft);
  $('#hvProgress').style.width = (timeLeft / 60 * 100) + '%';
  // 出芽
  while (HV.spawnPtr < HV.spawns.length && HV.spawns[HV.spawnPtr].at <= el) {
    spawnSprout(HV.spawns[HV.spawnPtr++]);
  }
  // 猴子
  if (HV.monkeyAt > 0 && !HV.monkeyShown && el >= HV.monkeyAt) {
    HV.monkeyShown = true;
    const mk = $('#hvMonkey');
    mk.hidden = false;
    setTimeout(() => { mk.hidden = true; }, 5000);
  }
  // 生長與枯萎
  const now = performance.now();
  HV.active.forEach((sp, id) => {
    const age = now - sp.bornAt - HV.pausedTotal - (HV.paused ? now - HV.pauseStart : 0);
    if (age >= 1300 && age < 1900 && !sp.el.classList.contains('perfect')) {
      sp.el.classList.add('perfect');
    } else if (age >= 1900 && !sp.el.classList.contains('old')) {
      sp.el.classList.remove('perfect');
      sp.el.classList.add('old');
    }
    if (age >= 3400) {
      // 枯萎＝漏採
      HV.misses++; HV.combo = 0;
      removeSprout(id);
      floatText(sp.el.parentElement, '漏採', false);
    }
  });
  updateHarvestHud();
  if (timeLeft <= 0 || (HV.spawnPtr >= HV.spawns.length && HV.active.size === 0 && el > 5000)) {
    finishHarvest();
  }
}
function updateHarvestHud() {
  $('#hvScore').textContent = HV.score + ' 分';
  $('#hvCombo').textContent = HV.combo >= 3 ? '🔥 COMBO ×' + HV.combo : '';
}
function spawnSprout(plan) {
  const grid = $('#hvGrid');
  const bushes = $$('.th-bush', grid).filter(b => !b.querySelector('.th-bud-sprout'));
  if (!bushes.length) return;
  const bush = pick(bushes);
  const el = document.createElement('span');
  el.className = 'th-bud-sprout';
  const id = 'sp' + Math.random().toString(36).slice(2, 8);
  el.dataset.sprout = id;
  if (plan.kind === 'insect') { el.textContent = '🐛'; el.classList.add('insect'); }
  else if (plan.kind === 'golden') { el.textContent = '🌟'; el.classList.add('golden'); }
  else if (plan.kind === 'special') {
    const bud = BUDS.find(b => b.id === plan.budId);
    el.textContent = bud ? bud.icon : '🌱';
    el.dataset.budId = plan.budId;
  } else { el.textContent = '🌱'; }
  bush.appendChild(el);
  HV.active.set(id, { el, plan, bornAt: performance.now(), kind: plan.kind });
  el.addEventListener('pointerdown', e => {
    if (!HV || HV.done || HV.paused) return;
    HV.drag = { id, startY: e.clientY };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (!HV || !HV.drag || HV.drag.id !== id) return;
    if (HV.drag.startY - e.clientY >= 28) { HV.drag = null; pullSprout(id); }
  });
  el.addEventListener('pointerup', e => {
    if (!HV || !HV.drag || HV.drag.id !== id) return;
    if (HV.drag.startY - e.clientY >= 28) pullSprout(id);
    HV.drag = null;
  });
  el.addEventListener('pointercancel', () => { if (HV && HV.drag && HV.drag.id === id) HV.drag = null; });
}
function removeSprout(id) {
  const sp = HV.active.get(id);
  if (!sp) return;
  HV.active.delete(id);
  if (sp.el.parentElement) sp.el.parentElement.removeChild(sp.el);
}
function floatText(container, text, good) {
  if (!container) return;
  const f = document.createElement('span');
  f.className = 'th-float' + (good ? ' good' : '');
  f.textContent = text;
  container.appendChild(f);
  setTimeout(() => { if (f.parentElement) f.parentElement.removeChild(f); }, 850);
}
function pullSprout(id) {
  const sp = HV.active.get(id);
  if (!sp || !HV || HV.done) return;
  const age = performance.now() - sp.bornAt - HV.pausedTotal;
  const parent = sp.el.parentElement;
  if (sp.kind === 'insect') {
    HV.misses++; HV.combo = 0;
    floatText(parent, '蟲子！', false);
    removeSprout(id);
    updateHarvestHud();
    return;
  }
  let pts = 0, q = 0, label = '';
  if (age >= 1300 && age < 1900) { pts = 100; q = 95; label = 'PERFECT'; HV.perfects++; }
  else if (age >= 600 && age < 1300) { pts = 60; q = 70; label = '稍早'; }
  else if (age >= 1900 && age < 2600) { pts = 40; q = 50; label = '稍老'; }
  else { pts = 25; q = 40; label = '太早了'; }
  if (sp.kind === 'golden') { pts += 500; HV.goldenGot = true; label += ' 金芽＋500'; }
  if (sp.kind === 'special' && sp.plan.budId) {
    HV.specialGot.push(sp.plan.budId);
    label += ' 特殊芽！';
  }
  HV.score += pts;
  HV.pulled++;
  HV.combo++; HV.maxCombo = Math.max(HV.maxCombo, HV.combo);
  HV.liang += pts >= 100 ? 14 : (pts >= 60 ? 10 : 7);
  HV.qualitySum += q;
  sp.el.classList.add('pulled');
  floatText(parent, label + ' ＋' + pts, true);
  setTimeout(() => removeSprout(id), 280);
  updateHarvestHud();
}
function finishHarvest() {
  if (!HV || HV.done) return;
  HV.done = true;
  clearInterval(HV.timer);
  $('#hvMonkey').hidden = true;
  const lv = HV.lv;
  const total = lv.buds;
  const pct = total ? HV.pulled / total : 0;
  let stars = 0;
  if (pct >= 0.9) stars = 3;
  else if (pct >= 0.7) stars = 2;
  else if (pct >= 0.5) stars = 1;
  const allPerfect = HV.pulled === total && total > 0 && HV.perfects === HV.pulled;
  if (stars === 3 && allPerfect) stars = 4;
  const passed = stars >= 1;
  const quality = HV.pulled ? Math.round(HV.qualitySum / HV.pulled) : 0;
  const liang = Math.max(HV.pulled ? HV.liang : 0, 0);
  // 特殊芽收藏
  const newBuds = [];
  HV.specialGot.forEach(bid => {
    if (!S.buds.includes(bid)) { S.buds.push(bid); newBuds.push(bid); }
  });
  // 統計
  S.stats.harvests++;
  S.stats.maxPulled = Math.max(S.stats.maxPulled || 0, HV.pulled);
  S.stats.bestCombo = Math.max(S.stats.bestCombo, HV.maxCombo);
  if (HV.misses === 0 && HV.pulled > 0) S.stats.fullCombos++;
  if (allPerfect) S.stats.allPerfects++;
  if (HV.goldenGot) S.stats.golden++;
  if (passed && (!S.stars[lv.id] || S.stars[lv.id] < stars)) S.stars[lv.id] = stars;
  // 收成進倉
  let basketNote = '';
  if (HV.pulled > 0) {
    if (S.warehouse.length < WAREHOUSE_MAX) {
      S.warehouse.push({ id: 'b-' + Date.now(), liang, quality, alt: lv.alt, origin: originOf(lv.alt) });
      S.stats.totalLiang += liang;
      basketNote = '收成 ' + fmt(Math.floor(liang / 16)) + ' 斤' + (liang % 16 ? ' ' + (liang % 16) + ' 兩' : '') + '・品質 ' + quality + '・' + originOf(lv.alt) + '，已裝成 1 簍進倉。';
    } else {
      const coins = liang * 1;
      S.coins += coins; S.wealth += coins;
      basketNote = '茶菁倉滿了，收成改以 ' + fmt(coins) + ' 銅板就地賣出。';
    }
  } else {
    basketNote = '這局一棵都沒採到，沒有收成。';
  }
  save();
  checkMedals();
  const overlay = $('#harvestOverlay');
  overlay.hidden = true;
  const starText = stars ? '★'.repeat(stars) + '☆'.repeat(4 - stars) : '未過關';
  const m = openModal('<h3>' + (passed ? '✅ 挑戰成功！' : '❌ 挑戰失敗') + '</h3>'
    + '<div class="th-score-big">' + HV.score + ' 分 <small>／採到 ' + HV.pulled + ' / ' + total + '（' + Math.round(pct * 100) + '%）</small></div>'
    + '<p style="text-align:center">' + starText + (allPerfect ? '　神手！' : '') + '</p>'
    + '<div class="th-kv"><span>PERFECT</span><b>' + HV.perfects + ' 個</b></div>'
    + '<div class="th-kv"><span>最高連擊</span><b>' + HV.maxCombo + '</b></div>'
    + '<div class="th-kv"><span>漏採</span><b>' + HV.misses + ' 個</b></div>'
    + (HV.goldenGot ? '<div class="th-kv"><span>金色茶芽</span><b>＋500 分 ✓</b></div>' : '')
    + (newBuds.length ? '<div class="th-kv"><span>新收集的芽</span><b>' + newBuds.map(id => esc((BUDS.find(b => b.id === id) || {}).name || '')).join('、') + '</b></div>' : '')
    + '<p class="th-muted" style="margin-top:8px">' + esc(basketNote) + '</p>'
    + '<div class="th-actions"><button class="th-btn ghost" id="hvBack" type="button">回地圖</button><button class="th-btn" id="hvAgain" type="button">再玩一次</button></div>');
  $('#hvBack', m).onclick = () => { closeModal(); switchTab('map'); afterHarvestTutorial(); };
  $('#hvAgain', m).onclick = () => { closeModal(); openLevel(lv.id); };
  if (S.tutorial === 2) { S.tutorial = 3; save(); }
  renderTop();
}

/* ── 製茶 ── */
let makeSel = { tea: 'biluochun', baskets: null, fine: false };
function teaLockReason(tea) {
  const missing = tea.need.filter(slot => !S.equipped[slot]).map(slot => SLOT_DEFS.find(s => s.id === slot).name);
  if (missing.length) return '缺「' + missing.join('／') + '」設備';
  return null;
}
function batchStats(baskets) {
  const totalLiang = baskets.reduce((a, b) => a + b.liang, 0);
  const avgQ = totalLiang ? Math.round(baskets.reduce((a, b) => a + b.quality * b.liang, 0) / totalLiang) : 0;
  const origin = baskets.length ? baskets[0].origin : '—';
  return { totalLiang, avgQ, origin };
}
function dimScores(tea, baskets) {
  const { avgQ } = batchStats(baskets);
  const eq = slot => S.equipped[slot] ? equipById(S.equipped[slot]) : null;
  const eqStars = slot => S.equipped[slot] ? (S.equipOwned[S.equipped[slot]] || 1) : 0;
  const lookSlot = tea.need.includes('ball') ? 'ball' : 'knead';
  const dims = [
    { name: '香氣', slot: 'basket', weight: 0.35, base: eq('basket') ? 300 + avgQ * 4 + equipValue(eq('basket'), eqStars('basket')) * 1.2 : 150 },
    { name: '外觀', slot: lookSlot, weight: 0.25, base: eq(lookSlot) ? 300 + avgQ * 4 + equipValue(eq(lookSlot), eqStars(lookSlot)) * 1.2 : 150 },
    { name: '滋味', slot: 'fry', weight: 0.25, base: eq('fry') ? 300 + avgQ * 4 + equipValue(eq('fry'), eqStars('fry')) * 1.2 : 150 },
    { name: '發酵', slot: 'wither', weight: 0.10, base: eq('wither') ? 300 + avgQ * 4 + equipValue(eq('wither'), eqStars('wither')) * 1.2 : 150 },
    { name: '焙火', slot: 'roast', weight: 0.05, base: eq('roast') ? 300 + avgQ * 4 + equipValue(eq('roast'), eqStars('roast')) * 1.2 : 150 },
  ];
  dims.forEach(d => { d.score = clamp(Math.round(d.base + rand(-20, 20)), 0, 1000); });
  let total = dims.reduce((a, d) => a + d.score * d.weight, 0);
  if (tea.origin && baskets.length && baskets.every(b => b.origin === tea.origin)) total += 50;
  if (dims.every(d => d.base > 150)) total += 20;
  return { dims, total: clamp(Math.round(total), 0, 1000) };
}
function gradeOf(score) {
  if (score < 400) return '失手';
  if (score < 600) return '普通';
  if (score < 750) return '好茶';
  if (score < 900) return '極品';
  return '傳說';
}
const GRADE_MULT = { '失手': 0.5, '普通': 1, '好茶': 1.2, '極品': 1.5, '傳說': 2 };
function renderMake() {
  const el = $('#tab-make');
  const wh = S.warehouse;
  if (!makeSel.baskets) makeSel.baskets = wh.slice(0, 3).map(b => b.id);
  const selected = wh.filter(b => makeSel.baskets.includes(b.id));
  const tea = TEAS.find(t => t.id === makeSel.tea) || TEAS[0];
  const lock = teaLockReason(tea);
  const bs = batchStats(selected);
  const estYield = Math.round(bs.totalLiang * 0.2);
  let html = '<h2>🍵 製茶</h2><p class="th-sub">選茶、選茶菁，按「做茶」開始。成品立即按單價賣出換銅板。</p>';
  html += '<div class="th-card"><b>🧺 茶菁倉（' + wh.length + ' / ' + WAREHOUSE_MAX + ' 簍）</b>';
  if (!wh.length) html += '<p class="th-muted">倉庫是空的，先去手採或等採茶機收成。</p>';
  else {
    html += '<div class="th-row" style="margin:8px 0"><button class="th-btn small ' + (makeSel.fine ? 'ghost' : '') + '" id="fineOff" type="button">自動選 3 簍</button><button class="th-btn small ' + (makeSel.fine ? '' : 'ghost') + '" id="fineOn" type="button">細選（合併多簍）</button></div>';
    wh.forEach(b => {
      const sel = makeSel.baskets.includes(b.id);
      html += '<label class="th-basket ' + (sel ? 'sel' : '') + '"><span><input type="checkbox" data-basket="' + b.id + '" ' + (sel ? 'checked' : '') + '> ' + b.origin + '・' + fmt(Math.floor(b.liang / 16)) + ' 斤' + (b.liang % 16 ? ' ' + (b.liang % 16) + ' 兩' : '') + '</span><span>品質 ' + b.quality + '・' + b.alt + 'm</span></label>';
    });
    html += '<p class="th-small" style="margin-top:6px">已選 ' + selected.length + ' 簍・共 ' + fmt(bs.totalLiang) + ' 兩・平均品質 ' + bs.avgQ + '・預估產出約 ' + estYield + ' 兩乾茶</p>';
  }
  html += '</div>';
  html += '<div class="th-card"><b>📜 茶單（12 種）</b><div style="margin-top:8px">';
  TEAS.forEach(t => {
    const lk = teaLockReason(t);
    const made = S.teas[t.id];
    html += '<button class="th-tea ' + (makeSel.tea === t.id ? 'sel' : '') + ' ' + (lk ? 'locked' : '') + '" data-tea="' + t.id + '" type="button">'
      + '<span class="th-tea-icon">' + t.icon + '</span><span class="th-tea-body"><b>' + t.name + '</b> <span class="th-chip">' + t.price + ' 銅板／兩</span>'
      + (made ? ' <span class="th-chip gold">已做 ' + made.made + ' 批・最佳 ' + made.best + ' 分</span>' : '')
      + '<br><span class="th-muted">' + t.ferment + '・' + t.shape + '・' + t.color + '</span>'
      + '<br><span class="th-recipe">' + t.recipe.join(' ＞ ') + '</span>'
      + (lk ? '<br><span class="th-chip lock">' + lk + '，抽籤取得後才能做</span>' : '')
      + (t.origin ? '<br><span class="th-small">需要「' + t.origin + '」的茶菁</span>' : '')
      + '</span></button>';
  });
  html += '</div></div>';
  const canMake = !lock && selected.length > 0 && (!tea.origin || selected.some(b => b.origin === tea.origin));
  let warn = '';
  if (lock) warn = lock + '，還不能做這款茶。';
  else if (!selected.length) warn = '請先選至少 1 簍茶菁。';
  else if (tea.origin && !selected.some(b => b.origin === tea.origin)) warn = '這款茶需要「' + tea.origin + '」的茶菁，請在上方勾選。';
  html += '<button class="th-btn" id="makeBtn" type="button" style="width:100%;padding:13px;font-size:16px" ' + (canMake ? '' : 'disabled') + '>做茶：' + tea.name + '</button>';
  if (warn) html += '<p class="th-muted" style="margin-top:8px;text-align:center">' + warn + '</p>';
  el.innerHTML = html;
  $('#fineOff', el).onclick = () => { makeSel.fine = false; makeSel.baskets = wh.slice(0, 3).map(b => b.id); renderMake(); };
  $('#fineOn', el).onclick = () => { makeSel.fine = true; renderMake(); };
  $$('[data-basket]', el).forEach(cb => cb.onchange = () => {
    const id = cb.dataset.basket;
    if (cb.checked) { if (!makeSel.baskets.includes(id)) makeSel.baskets.push(id); }
    else makeSel.baskets = makeSel.baskets.filter(x => x !== id);
    renderMake();
  });
  $$('[data-tea]', el).forEach(b => b.onclick = () => { makeSel.tea = b.dataset.tea; renderMake(); });
  const mb = $('#makeBtn', el);
  if (mb) mb.onclick = () => doMakeTea(tea, selected);
}
function doMakeTea(tea, selected) {
  const steps = ['炒菁中……', '揉捻中……', '乾燥中……', '慢慢來，茶香需要時間……'];
  let i = 0;
  const m = openModal('<h3>正在做「' + tea.name + '」</h3><p style="text-align:center;font-size:18px" id="makeStep">炒菁中……</p><div class="th-bar" style="margin-top:12px"><i id="makeBar" style="width:10%"></i></div>');
  const iv = setInterval(() => {
    i++;
    if (i >= steps.length) {
      clearInterval(iv);
      finishMakeTea(tea, selected);
      return;
    }
    $('#makeStep', m).textContent = steps[i];
    $('#makeBar', m).style.width = ((i + 1) / steps.length * 100) + '%';
  }, 650);
}
function finishMakeTea(tea, selected) {
  const { dims, total } = dimScores(tea, selected);
  const grade = gradeOf(total);
  const bs = batchStats(selected);
  const yieldLiang = Math.max(1, Math.round(bs.totalLiang * 0.2));
  const price = Math.round(tea.price * GRADE_MULT[grade]);
  const coins = yieldLiang * price;
  // 消耗茶菁
  S.warehouse = S.warehouse.filter(b => !selected.some(s => s.id === b.id));
  makeSel.baskets = null;
  // 紀錄
  const rec = S.teas[tea.id] || { made: 0, best: 0 };
  rec.made++; rec.best = Math.max(rec.best, total);
  S.teas[tea.id] = rec;
  S.coins += coins; S.wealth += coins;
  S.stats.batches++;
  S.stats.grades[grade] = (S.stats.grades[grade] || 0) + 1;
  S.daily.batches++;
  if (grade === '好茶' || grade === '極品' || grade === '傳說') S.daily.good++;
  if (!S.daily.kinds.includes(tea.id)) S.daily.kinds.push(tea.id);
  addLedger(coins, 0, tea.name + '・' + grade + ' ' + total + ' 分');
  applyLevel();
  save();
  checkMedals();
  const gradeTip = grade === '傳說' ? '傳說茶！' : (grade === '極品' ? '極品！' : (grade === '好茶' ? '好茶！' : ''));
  const m = openModal('<h3>☕ ' + tea.name + '・' + grade + ' ' + gradeTip + '</h3>'
    + '<div class="th-score-big">' + total + ' <small>分／1000</small></div>'
    + dims.map(d => '<div class="th-dim"><div class="th-row between"><span>' + d.name + '（' + (SLOT_DEFS.find(s => s.id === d.slot) || {}).name + '）</span><b>' + d.score + '</b></div><div class="th-bar"><i style="width:' + (d.score / 10) + '%"></i></div></div>').join('')
    + '<div class="th-kv" style="margin-top:8px"><span>產出</span><b>' + yieldLiang + ' 兩 × ' + price + ' 銅板</b></div>'
    + '<div class="th-kv"><span>賣出</span><b>＋' + fmt(coins) + ' 銅板</b></div>'
    + '<p class="th-muted" style="margin-top:8px">要做傳說茶，請升級設備、提高葉菁品質，並用對產地的茶菁。</p>'
    + '<div class="th-actions"><button class="th-btn" id="mkDone" type="button">收下</button></div>');
  $('#mkDone', m).onclick = () => { closeModal(); renderTop(); renderMake(); afterMakeTutorial(); };
}

/* ── 抽籤 ── */
function rollRarity() {
  const r = Math.random();
  if (r < 0.0001) return '神話';
  if (r < 0.0081) return '傳說';
  if (r < 0.1081) return '稀有';
  if (r < 0.4081) return '精緻';
  return '普通';
}
function poolByRarity(rarity) {
  if (rarity === '傳說') return EQUIP.filter(e => e.rarity === '傳說');
  if (rarity === '神話') return EQUIP.filter(e => e.rarity === '神話');
  return EQUIP.filter(e => e.rarity === rarity && !e.special);
}
function doDrawOne(forceRarity) {
  let rarity = forceRarity || rollRarity();
  if (!forceRarity && S.pity >= 149) rarity = '傳說';
  const eq = pick(poolByRarity(rarity));
  S.draws++;
  let isNew = false, stars = 0, convert = null;
  if (rarity === '傳說' || rarity === '神話') S.pity = 0; else S.pity++;
  if (!S.equipOwned[eq.id]) {
    S.equipOwned[eq.id] = 1; isNew = true; stars = 1;
  } else if (S.equipOwned[eq.id] < 5) {
    S.equipOwned[eq.id]++; stars = S.equipOwned[eq.id];
  } else {
    if (rarity === '普通' || rarity === '精緻') { S.coins += 200; convert = '＋200 銅板'; }
    else if (rarity === '稀有') { S.fragments += 1; convert = '＋神話碎片 1'; }
    else if (rarity === '傳說') { S.fragments += 10; convert = '＋神話碎片 10'; }
    else { S.coins += 2000; convert = '＋2000 銅板'; }
    stars = 5;
  }
  return { eq, rarity, isNew, stars, convert };
}
function renderGacha() {
  const el = $('#tab-gacha');
  const ownedCount = Object.keys(S.equipOwned).length;
  let html = '<h2>🎲 抽籤</h2><p class="th-sub">抽籤券抽設備，設備越好、茶分越高。重複設備升星（最高 5★）。</p>';
  html += '<div class="th-card"><div class="th-row between"><b>🎫 抽籤券 ×' + S.tickets + '</b><span>神話碎片 ×' + S.fragments + '（2000 可兌一台神話）</span></div>'
    + '<div class="th-kv"><span>累計抽籤</span><b>' + S.draws + ' 次</b></div>'
    + '<div class="th-kv"><span>傳說保底</span><b>' + (150 - Math.min(S.pity, 150)) + ' 抽內必出傳說</b></div>'
    + '<div class="th-kv"><span>已擁有設備</span><b>' + ownedCount + ' / ' + EQUIP.length + ' 台</b></div></div>';
  html += '<div class="th-card"><div class="th-row" style="gap:10px">'
    + '<button class="th-btn" id="draw1" type="button" ' + (S.tickets < 1 ? 'disabled' : '') + '>抽一支（1 張券）</button>'
    + '<button class="th-btn gold" id="draw10" type="button" ' + (S.tickets < 3 || S.coins < 6300 ? 'disabled' : '') + '>抽十支（3 張券＋6300 銅板）</button>'
    + '</div><p class="th-small" style="margin-top:8px">十連保證至少 1 件稀有以上。'
    + (S.tickets < 1 ? '抽籤券不夠，每日登入送 3 張、做任務也能拿。' : '')
    + (S.coins < 6300 ? '銅板不夠 6300。' : '') + '</p>'
    + '<div class="th-row" style="margin-top:8px"><button class="th-btn small ghost" id="probBtn" type="button">機率說明</button>'
    + '<button class="th-btn small ghost" id="redeemBtn" type="button" ' + (S.fragments < 2000 ? 'disabled' : '') + '>用 2000 碎片兌神話</button></div></div>';
  html += '<div class="th-card"><b>🎖️ 近期抽到的示範名單（示範）</b><p class="th-muted">阿山茶園 抽中稀有炒鍋・霧峰茶莊 抽中精緻茶簍・山間茶屋 抽中傳說焙籠</p></div>';
  el.innerHTML = html;
  $('#draw1', el).onclick = () => {
    if (S.tickets < 1) return;
    S.tickets--;
    const res = [doDrawOne()];
    addLedger(0, 0, '抽籤 1 次');
    save(); checkMedals(); showDrawResults(res); renderGacha();
  };
  $('#draw10', el).onclick = () => {
    if (S.tickets < 3 || S.coins < 6300) return;
    S.tickets -= 3; S.coins -= 6300;
    addLedger(0, 6300, '抽籤十連');
    const res = [];
    for (let i = 0; i < 10; i++) res.push(doDrawOne());
    if (!res.some(r => r.rarity === '稀有' || r.rarity === '傳說' || r.rarity === '神話')) {
      res[9] = doDrawOne('稀有');
    }
    save(); checkMedals(); showDrawResults(res); renderGacha();
  };
  $('#probBtn', el).onclick = () => openModal('<h3>抽籤機率</h3>'
    + '<div class="th-kv"><span>神話</span><b>0.01%</b></div>'
    + '<div class="th-kv"><span>傳說</span><b>0.8%</b></div>'
    + '<div class="th-kv"><span>稀有</span><b>10%</b></div>'
    + '<div class="th-kv"><span>精緻</span><b>30%</b></div>'
    + '<div class="th-kv"><span>普通</span><b>約 59%</b></div>'
    + '<p class="th-muted" style="margin-top:8px">每 150 抽內必出傳說設備。十連保證至少 1 件稀有以上。重複滿星後轉換：普通／精緻→200 銅板、稀有→神話碎片 1、傳說→神話碎片 10、神話→2000 銅板。2000 碎片可直接兌換一台神話設備。</p>'
    + '<div class="th-actions"><button class="th-btn" onclick="document.querySelector(\'#modalRoot\').innerHTML=\'\'" type="button">知道了</button></div>');
  $('#redeemBtn', el).onclick = () => {
    const unowned = EQUIP.filter(e => e.rarity === '神話' && !S.equipOwned[e.id]);
    if (!unowned.length) { toast('神話設備都抽齊了'); return; }
    const eq = unowned[0];
    S.fragments -= 2000;
    S.equipOwned[eq.id] = 1;
    save(); toast('兌換到神話設備「' + eq.name + '」！');
    renderGacha();
  };
}
function showDrawResults(res) {
  const m = openModal('<h3>🎲 抽籤結果</h3>'
    + res.map(r => '<div class="th-kv"><span><b class="th-rarity ' + r.rarity + '">' + r.rarity + '</b> ' + esc(r.eq.name) + '（' + (SLOT_DEFS.find(s => s.id === r.eq.slot) || {}).name + '）</span><b>' + (r.isNew ? '新取得！' : '★' + r.stars + (r.convert ? '・' + r.convert : '')) + '</b></div>').join('')
    + '<div class="th-actions"><button class="th-btn" id="drDone" type="button">收下</button></div>');
  $('#drDone', m).onclick = closeModal;
}

/* ── 設備 ── */
let equipSlot = 'basket';
function renderEquip() {
  const el = $('#tab-equip');
  const ownedCount = Object.keys(S.equipOwned).length;
  let html = '<h2>🧰 設備</h2><p class="th-sub">設備決定茶的分數上限。點槽位看擁有的設備、更換裝備。已擁有 ' + ownedCount + ' / ' + EQUIP.length + ' 台。</p>';
  html += '<div class="th-tabs">' + SLOT_DEFS.map(s => '<button type="button" data-slot="' + s.id + '" class="' + (equipSlot === s.id ? 'active' : '') + '">' + s.icon + ' ' + s.name + '</button>').join('') + '</div>';
  const slot = SLOT_DEFS.find(s => s.id === equipSlot);
  const owned = EQUIP.filter(e => e.slot === equipSlot && S.equipOwned[e.id]);
  const equippedId = S.equipped[equipSlot];
  const equipped = equippedId ? equipById(equippedId) : null;
  html += '<div class="th-card"><b>裝備中：' + (equipped ? esc(equipped.name) + ' <span class="th-rarity ' + equipped.rarity + '">' + equipped.rarity + '</span> ★' + S.equipOwned[equipped.id] + '（評分值 ' + equipValue(equipped, S.equipOwned[equipped.id]) + '）' : '尚未擁有此槽位設備') + '</b>'
    + '<p class="th-muted">對應評分維度：' + slot.dim + '。升級需滿 5★（重複抽到同一台升星）。</p></div>';
  if (!owned.length) html += '<p class="th-muted">這個槽位還沒有設備，去抽籤抽一台吧。</p>';
  owned.forEach(eq => {
    const stars = S.equipOwned[eq.id];
    html += '<button class="th-equip ' + (equippedId === eq.id ? 'sel' : '') + '" data-eq="' + eq.id + '" type="button"><span><b class="th-rarity ' + eq.rarity + '">' + eq.rarity + '</b> ' + esc(eq.name) + ' ★' + stars + '</span><span>' + (equippedId === eq.id ? '裝備中 ✓' : '更換') + '・評分值 ' + equipValue(eq, stars) + '</span></button>';
  });
  const totalInSlot = EQUIP.filter(e => e.slot === equipSlot).length;
  html += '<p class="th-small">此槽位共 ' + totalInSlot + ' 台，已擁有 ' + owned.length + ' 台。</p>';
  el.innerHTML = html;
  $$('[data-slot]', el).forEach(b => b.onclick = () => { equipSlot = b.dataset.slot; renderEquip(); });
  $$('[data-eq]', el).forEach(b => b.onclick = () => {
    const eq = equipById(b.dataset.eq);
    if (!eq) return;
    S.equipped[eq.slot] = eq.id;
    save(); renderEquip(); toast('裝備「' + eq.name + '」');
  });
}

/* ── 茶櫃 ── */
let cabinetTab = 'tea';
function renderCabinet() {
  const el = $('#tab-cabinet');
  let html = '<h2>🗄️ 茶櫃</h2><p class="th-sub">收集做過的茶與採到的芽，集滿有抽籤券獎勵。</p>';
  html += '<div class="th-tabs"><button type="button" data-ct="tea" class="' + (cabinetTab === 'tea' ? 'active' : '') + '">茶罐（' + Object.keys(S.teas).length + '/12）</button><button type="button" data-ct="buds" class="' + (cabinetTab === 'buds' ? 'active' : '') + '">芽圖鑑（' + S.buds.length + '/30）</button></div>';
  if (cabinetTab === 'tea') {
    html += '<div class="th-grid2">';
    TEAS.forEach(t => {
      const rec = S.teas[t.id];
      html += '<div class="th-bud ' + (rec ? '' : 'locked') + '"><div class="th-bud-icon">' + (rec ? t.icon : '❓') + '</div><b>' + t.name + '</b><br><span class="th-small">' + (rec ? '已做 ' + rec.made + ' 批・最佳 ' + rec.best + ' 分' : '尚未做出') + '</span><br><span class="th-small">約 ' + t.price + ' 銅板／兩</span></div>';
    });
    html += '</div>';
  } else {
    [10, 20, 30].forEach(n => {
      const claimed = !!S.budRewards[n];
      const ok = S.buds.length >= n;
      html += '<div class="th-row between" style="margin-bottom:6px"><span>收集 ' + n + ' 款芽 → 抽籤券 ×' + (n === 10 ? 10 : n === 20 ? 20 : 50) + '</span><button class="th-btn small" data-budreward="' + n + '" type="button" ' + (ok && !claimed ? '' : 'disabled') + '>' + (claimed ? '已領取' : ok ? '領取' : '未達成') + '</button></div>';
    });
    html += '<div class="th-grid2" style="margin-top:8px">';
    BUDS.forEach(b => {
      const got = S.buds.includes(b.id);
      html += '<div class="th-bud ' + (got ? '' : 'locked') + '"><div class="th-bud-icon">' + (got ? b.icon : '❓') + '</div><b>' + (got ? b.name : '？？') + '</b><br><span class="th-small">' + b.rarity + '</span></div>';
    });
    html += '</div><p class="th-small" style="margin-top:8px">手採時，有機會在茶芽上看到不同品種的芽，採下就能收藏。季節依真實月份變化。</p>';
  }
  el.innerHTML = html;
  $$('[data-ct]', el).forEach(b => b.onclick = () => { cabinetTab = b.dataset.ct; renderCabinet(); });
  $$('[data-budreward]', el).forEach(b => b.onclick = () => {
    const n = +b.dataset.budreward;
    if (S.buds.length < n || S.budRewards[n]) return;
    S.budRewards[n] = true;
    S.tickets += n === 10 ? 10 : n === 20 ? 20 : 50;
    save(); renderCabinet(); toast('領取抽籤券 ×' + (n === 10 ? 10 : n === 20 ? 20 : 50));
  });
}

/* ── 排行（本地榜＋示範對手） ── */
let rankTab = 'tea';
function renderRank() {
  const el = $('#tab-rank');
  const bestTea = Math.max(0, ...Object.values(S.teas).map(t => t.best || 0));
  let html = '<h2>🏆 排行</h2><p class="th-sub">本站沒有後端，這是本地榜：你的最佳紀錄＋幾位示範茶坊的分數（示範）。</p>';
  html += '<div class="th-tabs"><button type="button" data-rt="tea" class="' + (rankTab === 'tea' ? 'active' : '') + '">茶葉榜</button><button type="button" data-rt="wealth" class="' + (rankTab === 'wealth' ? 'active' : '') + '">財富榜</button></div>';
  if (rankTab === 'tea') {
    const rows = RANK_DEMO_TEA.map(r => ({ name: r.name, score: r.score, demo: true }));
    rows.push({ name: '我的小茶坊（你）', score: bestTea, me: true });
    rows.sort((a, b) => b.score - a.score);
    html += '<div class="th-card">' + rows.map((r, i) => '<div class="th-rank-row ' + (r.me ? 'me' : '') + '"><span>' + (i + 1) + '　' + esc(r.name) + (r.demo ? '（示範）' : '') + '</span><b>' + r.score.toFixed(1) + ' 分</b></div>').join('') + '</div>';
    html += '<p class="th-small">茶葉榜取你做過的茶裡最高分的一批。還沒做茶就還沒有排名。</p>';
  } else {
    const rows = RANK_DEMO_WEALTH.map(r => ({ name: r.name, score: r.score, demo: true }));
    rows.push({ name: '我的小茶坊（你）', score: Math.floor(S.wealth / 10000), me: true });
    rows.sort((a, b) => b.score - a.score);
    html += '<div class="th-card">' + rows.map((r, i) => '<div class="th-rank-row ' + (r.me ? 'me' : '') + '"><span>' + (i + 1) + '　' + esc(r.name) + (r.demo ? '（示範）' : '') + '</span><b>' + r.score + ' 萬</b></div>').join('') + '</div>';
    html += '<p class="th-small">財富榜以累計財富計（你的累計財富 ' + fmt(S.wealth) + ' 銅板）。</p>';
  }
  el.innerHTML = html;
  $$('[data-rt]', el).forEach(b => b.onclick = () => { rankTab = b.dataset.rt; renderRank(); });
}

/* ── 任務 ── */
function dailyProgress(t) {
  if (t.metric === 'batchesToday') return S.daily.batches;
  if (t.metric === 'goodToday') return S.daily.good;
  if (t.metric === 'kindsToday') return S.daily.kinds.length;
  return 0;
}
function dailyClaimable() {
  resetDailyIfNeeded();
  return DAILY_TASKS.some(t => dailyProgress(t) >= t.goal && !S.tasks.daily[t.id]);
}
function newbieDone(id) {
  switch (id) {
    case 'nb-first-bud': return S.stats.totalLiang > 0;
    case 'nb-10-batches': return S.stats.batches >= 10;
    case 'nb-get-banana': return (S.stats.bananasGot || 0) > 0;
    case 'nb-eat-banana': return (S.stats.bananasEaten || 0) > 0;
    case 'nb-biluochun': return (S.teas.biluochun || {}).made > 0;
    case 'nb-good': return (S.stats.grades['好茶'] || 0) + (S.stats.grades['極品'] || 0) + (S.stats.grades['傳說'] || 0) > 0;
    case 'nb-ch1': return chapterCleared(1);
    case 'nb-buds5': return S.buds.length >= 5;
    default: return false;
  }
}
function newbieClaimable() { return NEWBIE_TASKS.some(t => newbieDone(t.id) && !S.tasks.newbie[t.id]); }
function starClaimable() {
  for (let ch = 1; ch <= 5; ch++) {
    for (const th of [10, 15, 20]) {
      if (chapterStars(ch) >= th && !S.tasks.starClaimed[ch + '-' + th]) return true;
    }
  }
  return false;
}
function checkMedals() {
  const owned = new Set(S.medals);
  const grant = id => {
    if (!owned.has(id)) {
      owned.add(id);
      S.medals.push(id);
      const m = MEDALS.find(x => x.id === id);
      if (m) toast('🏅 獲得獎章「' + m.name + '」！');
    }
  };
  const st = S.stats;
  if (st.totalLiang > 0) grant('m-first-cut');
  if ((st.maxPulled || 0) >= 20) grant('m-full-basket');
  if (st.bestCombo >= 10) grant('m-combo10');
  if (st.bestCombo >= 25) grant('m-combo25');
  if (st.fullCombos > 0) grant('m-full-combo');
  if (st.allPerfects > 0) grant('m-all-perfect');
  if (st.golden > 0) grant('m-golden');
  if (st.totalLiang >= 1600) grant('m-thousand');
  if ((st.grades['好茶'] || 0) > 0) grant('m-first-good');
  if ((st.grades['好茶'] || 0) >= 10) grant('m-good10');
  if ((st.grades['極品'] || 0) > 0) grant('m-excellent');
  if ((st.grades['傳說'] || 0) > 0) grant('m-legend');
  if (Object.keys(S.teas).length >= 12) grant('m-all-teas');
  if ((S.teas.oriental || {}).made > 0) grant('m-oriental');
  if (S.wealth >= 100000) grant('m-rich');
  if (S.wealth >= 1000000) grant('m-tycoon');
  if (S.buds.length >= 10) grant('m-bud10');
  if (S.buds.length >= 30) grant('m-bud30');
  if (Object.keys(S.equipOwned).length >= 20) grant('m-equip20');
  if (chapterCleared(1)) grant('m-ch1');
  if (chapterCleared(3)) grant('m-ch3');
  if (chapterCleared(5)) grant('m-ch5');
  // 衣櫃解鎖
  const unlockOutfit = name => { if (!S.outfitsOwned.includes(name)) { S.outfitsOwned.push(name); toast('👘 解鎖裝扮「' + name + '」！'); } };
  if (S.level >= 8) unlockOutfit('貓耳茶農');
  if (S.level >= 12) unlockOutfit('星空茶農');
  if (S.level >= 15) unlockOutfit('霓虹茶農');
  if (S.level >= 18) unlockOutfit('雲霧茶仙');
  if (owned.has('m-good10')) unlockOutfit('奶茶店員');
  save();
}
let taskTab = 'daily';
function openTasks() {
  renderTasksModal();
}
function renderTasksModal() {
  resetDailyIfNeeded();
  let body = '<h3>📋 今日任務</h3><div class="th-tabs">'
    + ['daily', 'newbie', 'stars', 'medals'].map(t => '<button type="button" data-tt="' + t + '" class="' + (taskTab === t ? 'active' : '') + '">' + ({ daily: '每日', newbie: '新手', stars: '集星', medals: '獎章' }[t]) + '</button>').join('')
    + '</div>';
  if (taskTab === 'daily') {
    body += DAILY_TASKS.map(t => {
      const p = dailyProgress(t), done = p >= t.goal, claimed = !!S.tasks.daily[t.id];
      return '<div class="th-row between" style="margin-bottom:8px"><span>' + t.text + '（' + Math.min(p, t.goal) + '/' + t.goal + '）＋' + (t.reward.coins ? fmt(t.reward.coins) + ' 銅板' : '') + '</span><button class="th-btn small" data-daily="' + t.id + '" type="button" ' + (done && !claimed ? '' : 'disabled') + '>' + (claimed ? '已領取' : done ? '領取' : '未完成') + '</button></div>';
    }).join('');
    const allClaimed = DAILY_TASKS.every(t => S.tasks.daily[t.id]);
    body += '<p class="th-muted">全部完成額外＋抽籤券 ×5。' + (allClaimed ? (S.tasks.dailyBonus ? '額外獎勵已領取。' : '額外獎勵待領取。') : '') + '</p>';
    if (allClaimed && !S.tasks.dailyBonus) body += '<button class="th-btn gold" id="dailyBonusBtn" type="button">領取額外抽籤券 ×5</button>';
    body += '<p class="th-small" style="margin-top:8px">每日 0:00 重置。每日登入即可獲得 3 張抽籤券。</p>';
  } else if (taskTab === 'newbie') {
    body += NEWBIE_TASKS.map(t => {
      const done = newbieDone(t.id), claimed = !!S.tasks.newbie[t.id];
      const rw = t.reward.coins ? fmt(t.reward.coins) + ' 銅板' : '抽籤券 ×' + t.reward.tickets;
      return '<div class="th-row between" style="margin-bottom:8px"><span>' + t.text + '（＋' + rw + '）</span><button class="th-btn small" data-newbie="' + t.id + '" type="button" ' + (done && !claimed ? '' : 'disabled') + '>' + (claimed ? '已領取' : done ? '領取' : '未完成') + '</button></div>';
    }).join('');
  } else if (taskTab === 'stars') {
    for (let ch = 1; ch <= 5; ch++) {
      body += '<h4 style="margin:10px 0 4px">第 ' + ch + ' 章・' + CHAPTER_DEFS[ch - 1].name + '（' + chapterStars(ch) + '★）</h4>';
      [10, 15, 20].forEach(th => {
        const claimed = !!S.tasks.starClaimed[ch + '-' + th];
        const ok = chapterStars(ch) >= th;
        body += '<div class="th-row between" style="margin-bottom:6px"><span>集滿 ' + th + ' 星 → 抽籤券 ×' + (th === 10 ? 5 : th === 15 ? 10 : 20) + '</span><button class="th-btn small" data-star="' + ch + '-' + th + '" type="button" ' + (ok && !claimed ? '' : 'disabled') + '>' + (claimed ? '已領取' : ok ? '領取' : '未達成') + '</button></div>';
      });
    }
  } else {
    body += '<p class="th-muted">獎章 ' + S.medals.length + ' / ' + MEDALS.length + ' 枚</p><div style="margin-top:8px">';
    MEDALS.forEach(md => {
      const got = S.medals.includes(md.id);
      body += '<div class="th-row between" style="margin-bottom:6px"><span>' + (got ? '🏅 ' : '🔒 ') + esc(md.name) + ' <span class="th-small">— ' + esc(md.desc) + '</span></span></div>';
    });
    body += '</div>';
  }
  body += '<div class="th-actions"><button class="th-btn" id="taskClose" type="button">關閉</button></div>';
  const m = openModal(body);
  $$('[data-tt]', m).forEach(b => b.onclick = () => { taskTab = b.dataset.tt; renderTasksModal(); });
  $('#taskClose', m).onclick = () => { closeModal(); renderTop(); };
  $$('[data-daily]', m).forEach(b => b.onclick = () => {
    const t = DAILY_TASKS.find(x => x.id === b.dataset.daily);
    if (!t || dailyProgress(t) < t.goal || S.tasks.daily[t.id]) return;
    S.tasks.daily[t.id] = true;
    S.coins += t.reward.coins || 0;
    save(); renderTasksModal(); renderTop();
  });
  const bonusBtn = $('#dailyBonusBtn', m);
  if (bonusBtn) bonusBtn.onclick = () => {
    S.tasks.dailyBonus = true; S.tickets += 5;
    save(); renderTasksModal(); renderTop(); toast('領取抽籤券 ×5');
  };
  $$('[data-newbie]', m).forEach(b => b.onclick = () => {
    const t = NEWBIE_TASKS.find(x => x.id === b.dataset.newbie);
    if (!t || !newbieDone(t.id) || S.tasks.newbie[t.id]) return;
    S.tasks.newbie[t.id] = true;
    S.coins += t.reward.coins || 0;
    S.tickets += t.reward.tickets || 0;
    save(); renderTasksModal(); renderTop();
  });
  $$('[data-star]', m).forEach(b => b.onclick = () => {
    const [ch, th] = b.dataset.star.split('-').map(Number);
    if (chapterStars(ch) < th || S.tasks.starClaimed[ch + '-' + th]) return;
    S.tasks.starClaimed[ch + '-' + th] = true;
    S.tickets += th === 10 ? 5 : th === 15 ? 10 : 20;
    save(); renderTasksModal(); renderTop();
  });
}

/* ── 帳本 ── */
function addLedger(sold, spent, note) {
  resetDailyIfNeeded();
  S.ledger.sold += sold;
  S.ledger.spent += spent;
  S.ledger.entries.unshift({ time: new Date().toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' }), note, sold, spent });
  if (S.ledger.entries.length > 30) S.ledger.entries.length = 30;
}
function openLedger() {
  resetDailyIfNeeded();
  const L = S.ledger;
  const m = openModal('<h3>📒 我的帳本</h3>'
    + '<div class="th-kv"><span>今日賣出</span><b>＋' + fmt(L.sold) + ' 銅板</b></div>'
    + '<div class="th-kv"><span>今日支出</span><b>－' + fmt(L.spent) + ' 銅板</b></div>'
    + '<div class="th-kv"><span>帳面餘額</span><b>' + fmt(S.coins) + ' 銅板</b></div>'
    + '<div class="th-kv"><span>抽籤券</span><b>×' + S.tickets + '</b></div>'
    + '<h4 style="margin:12px 0 4px">明細</h4>'
    + (L.entries.length ? L.entries.map(e => '<div class="th-kv"><span>' + e.time + '・' + esc(e.note) + '</span><b>' + (e.sold ? '＋' + fmt(e.sold) : e.spent ? '－' + fmt(e.spent) : '—') + '</b></div>').join('') : '<p class="th-muted">今天還沒有收支紀錄。</p>')
    + '<div class="th-actions"><button class="th-btn" id="ledClose" type="button">關閉</button></div>');
  $('#ledClose', m).onclick = closeModal;
}

/* ── 成績單 ── */
function openScorecard() {
  const st = S.stats;
  const nextNeed = (() => { let need = 1000; while (S.wealth >= need) need = Math.round(need * 1.6); return need; })();
  const m = openModal('<h3>🍵 我的小茶坊・成績單</h3>'
    + '<div class="th-kv"><span>等級</span><b>Lv.' + S.level + '（累計財富 ' + fmt(S.wealth) + '／' + fmt(nextNeed) + '）</b></div>'
    + '<div class="th-kv"><span>體力</span><b>' + S.stamina + ' / ' + S.staminaMax + '</b></div>'
    + '<div class="th-kv"><span>香蕉</span><b>🍌 ×' + S.bananas + '（吃一根補體力 10 點）</b></div>'
    + '<div class="th-kv"><span>已通關</span><b>' + LEVELS.filter(l => (S.stars[l.id] || 0) >= 1).length + ' / ' + LEVELS.length + ' 關</b></div>'
    + '<div class="th-kv"><span>星星</span><b>' + totalStars() + ' / ' + (LEVELS.length * 4) + '</b></div>'
    + '<div class="th-kv"><span>採茶局數／最高連擊</span><b>' + st.harvests + ' 局／' + st.bestCombo + '</b></div>'
    + '<div class="th-kv"><span>全連擊／ALL PERFECT／黃金芽</span><b>' + st.fullCombos + '／' + st.allPerfects + '／' + st.golden + '</b></div>'
    + '<div class="th-kv"><span>製茶批數／最高收入</span><b>' + st.batches + ' 批</b></div>'
    + '<div class="th-kv"><span>品級統計</span><b>傳說 ' + (st.grades['傳說'] || 0) + '／極品 ' + (st.grades['極品'] || 0) + '／好茶 ' + (st.grades['好茶'] || 0) + '／普通 ' + (st.grades['普通'] || 0) + '／失手 ' + (st.grades['失手'] || 0) + '</b></div>'
    + '<div class="th-kv"><span>獎章</span><b>' + S.medals.length + ' / ' + MEDALS.length + '</b></div>'
    + '<div class="th-actions"><button class="th-btn ghost" id="eatBanana" type="button" ' + (S.bananas > 0 ? '' : 'disabled') + '>🍌 吃香蕉（補體力 10）</button><button class="th-btn" id="scClose" type="button">關閉</button></div>');
  $('#scClose', m).onclick = closeModal;
  $('#eatBanana', m).onclick = () => {
    if (S.bananas <= 0) return;
    S.bananas--;
    S.stats.bananasEaten = (S.stats.bananasEaten || 0) + 1;
    S.stamina = Math.min(S.staminaMax, S.stamina + 10);
    save(); closeModal(); renderTop(); toast('吃了一根香蕉，體力＋10');
  };
}

/* ── 設定 ── */
function openSettings() {
  const m = openModal('<h3>⚙️ 設定</h3>'
    + '<p class="th-muted">我的小茶坊：單人採茶製茶經營小遊戲。純前端、免登入、免付費，進度只存在這台裝置的瀏覽器裡（localStorage），不會上傳到任何伺服器。</p>'
    + '<div class="th-kv"><span>版本</span><b>完整版 v1</b></div>'
    + '<div class="th-kv"><span>存檔</span><b>' + (S.stats.harvests + S.stats.batches > 0 ? '已有遊玩紀錄' : '新開張') + '</b></div>'
    + '<div class="th-actions"><button class="th-btn danger" id="resetSave" type="button">重新開始（清除存檔）</button><button class="th-btn" id="setClose" type="button">關閉</button></div>');
  $('#setClose', m).onclick = closeModal;
  $('#resetSave', m).onclick = () => confirmModal('確定要清除全部進度、重新開一間茶坊嗎？這個動作無法復原。', '確定清除', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
    location.reload();
  });
}

/* ── 新手教學（9 步，阿公嚮導） ── */
const TUTORIAL = [
  { face: '🧑‍🌾', text: '你好，我是阿公，歡迎回來接手這間小茶坊。先帶你走一遍：上山採茶菁、回來做茶，再把第一批茶賣出去。' },
  { face: '🌿', text: '看到那片茶園了嗎？要先「手採」。在茶菁地圖點一關，再點「開始手採」。', tab: 'map' },
  { face: '🌱', text: '茶芽冒出來、發亮的時候，往上拉！抓到 PERFECT 分數最高。記得：點按不算，一定要拖曳拉起來。', action: 'harvest' },
  { face: '🧺', text: '採下來的茶菁會裝成一簍進茶菁倉，看看重量和品質。', tab: 'map' },
  { face: '🍵', text: '接著去「製茶」，挑一款茶、選 3 簍茶菁。', tab: 'make' },
  { face: '🍃', text: '先試著做「台灣碧螺春」吧！用茶菁倉裡的茶菁，點「做茶」試試。', tab: 'make' },
  { face: '☕', text: '製茶看五維評分：香氣最重要，再來是外觀和滋味。分數越高，賣得越貴。', tab: 'make' },
  { face: '💰', text: '做好了馬上賣出換銅板。按「收下」，第一批茶就賣出去了！', action: 'made' },
  { face: '🎉', text: '第一批茶賣出去啦！銅板可以去抽籤，抽更好的設備，做出更高分的茶。下一關等著你，慢慢玩。', done: true },
];
function showTutorial(step) {
  if (step < 0 || step >= TUTORIAL.length) { S.tutorial = 9; save(); return; }
  S.tutorial = step;
  save();
  const t = TUTORIAL[step];
  if (t.tab) switchTab(t.tab);
  let btns = '';
  if (t.action === 'harvest') btns = '<button class="th-btn" id="tuGo" type="button">去挑戰 1-1</button>';
  else if (t.action === 'made') btns = '<button class="th-btn" id="tuGo" type="button">去做茶</button>';
  else if (t.done) btns = '<button class="th-btn" id="tuNext" type="button">好，開始玩</button>';
  else btns = '<button class="th-btn" id="tuNext" type="button">下一步</button>';
  const m = openModal('<div class="th-tutor-face">' + t.face + '</div><div class="th-tutor-text">阿公：「' + esc(t.text) + '」</div>'
    + '<p class="th-small" style="text-align:center">新手教學 ' + (step + 1) + ' / 9</p>'
    + '<div class="th-actions"><button class="th-btn ghost" id="tuSkip" type="button">跳過教學</button>' + btns + '</div>');
  $('#tuSkip', m).onclick = () => { S.tutorial = 9; save(); closeModal(); };
  const next = $('#tuNext', m);
  if (next) next.onclick = () => { closeModal(); showTutorial(step + 1); };
  const go = $('#tuGo', m);
  if (go) go.onclick = () => {
    closeModal();
    if (t.action === 'harvest') openLevel('1-1');
    else if (t.action === 'made') switchTab('make');
  };
}
function afterHarvestTutorial() {
  if (S.tutorial === 3) showTutorial(3);
}
function afterMakeTutorial() {
  if (S.tutorial === 7) showTutorial(8);
}

/* ── 啟動 ── */
function init() {
  load();
  resetDailyIfNeeded();
  regenStamina();
  harvesterTick();
  applyLevel();
  save();
  // 頂部按鈕
  $('#shopBtn').onclick = openScorecard;
  $('#taskBtn').onclick = openTasks;
  $('#ledgerBtn').onclick = openLedger;
  $('#settingsBtn').onclick = openSettings;
  $$('.th-bottom button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  $('#hvMonkey').onclick = () => {
    S.bananas++;
    S.stats.bananasGot = (S.stats.bananasGot || 0) + 1;
    $('#hvMonkey').hidden = true;
    save();
    toast('抓到猴子的香蕉了！🍌＋1（吃香蕉補體力 10 點）');
  };
  switchTab('map');
  setInterval(() => { renderTop(); }, 1000);
  // 每日登入獎勵
  const today = todayStr();
  if (S.lastLogin !== today) {
    S.lastLogin = today;
    S.tickets += 3;
    save();
    const m = openModal('<h3>☀️ 每日登入獎勵</h3><p style="text-align:center;font-size:18px">本日簽到，得抽籤券 ×3</p><div class="th-actions"><button class="th-btn" id="dlOk" type="button">領取</button></div>');
    $('#dlOk', m).onclick = () => {
      closeModal();
      if (S.tutorial === 0) showTutorial(0);
    };
  } else if (S.tutorial === 0) {
    showTutorial(0);
  }
  // 本機測試用（僅 localhost）：讓自動化檢查能驅動流程
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__teaHouse = {
      state: () => S,
      startHarvest,
      openLevel,
      levels: LEVELS,
      hv: () => HV,
      skipHarvestToEnd: () => { if (HV && !HV.done) HV.startAt -= 61000; },
    };
  }
}
document.addEventListener('DOMContentLoaded', init);
