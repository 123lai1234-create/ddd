'use strict';
// ── Palette ────────────────────────────────────────────────
const C = {
  bg:'#08060e', panel:'#100c1e', border:'#7a5c1e', border2:'#3a2a0e',
  gold:'#e8c060', gold2:'#ffd700', text:'#f0e6c8', muted:'#9a8060', dim:'#5a4a2a',
  red:'#e05050', blue:'#5080e8', green:'#50c878', purple:'#c050e8',
  hp:'#e05050', mp:'#5080e8', exp:'#50c878',
  teal:'#3ad8e0',
  grass:'#2a5218', tree:'#193810', water:'#1a3468', path:'#7a6545',
  wall:'#3c2d1e', floor:'#2a1e12', door:'#8b6914', npc:'#d4b060',
};

// ── Characters ─────────────────────────────────────────────
const CHAR_BASE = {
  yunyi:  { id:'yunyi',  name:'雲逸',  title:'青雲劍客', color:0x4a9eff, shape:'sword',
            hp:120, mp:40,  atk:18, def:12, spd:15, luk:10,
            skills:['slash','piercing','windBlade'],
            desc:'青雲村少年，習得雲霄劍法，立志斬妖除魔。' },
  linger: { id:'linger', name:'靈兒',  title:'靈族後裔', color:0xe050c8, shape:'mage',
            hp:80,  mp:120, atk:10, def:8,  spd:18, luk:15,
            skills:['fireball','iceArrow','heal','thunder'],
            desc:'神秘靈族少女，天生通靈，精通五行法術。' },
  yuehua: { id:'yuehua', name:'月華',  title:'飛羽弓手', color:0x50e8a0, shape:'archer',
            hp:90,  mp:60,  atk:20, def:10, spd:20, luk:20,
            skills:['shoot','multiShot','poisonArrow','moonLight'],
            desc:'出身獵戶之家，箭術無雙，身法輕盈如飛燕。' },
};

const SKILLS = {
  slash:       { name:'雲霄斬',   mp:0,  pow:1.2, type:'atk', tgt:'single', elem:'none',    desc:'基本斬擊，必中。' },
  piercing:    { name:'穿雲刺',   mp:8,  pow:1.8, type:'atk', tgt:'single', elem:'none',  pierce:0.4, desc:'無視40%防禦的貫穿一擊。' },
  windBlade:   { name:'旋風劍舞', mp:16, pow:1.3, type:'atk', tgt:'all',    elem:'wind',    desc:'揮出風刃斬擊所有敵人。' },
  fireball:    { name:'火球術',   mp:10, pow:1.6, type:'atk', tgt:'single', elem:'fire',    desc:'召喚火球轟擊敵人。' },
  iceArrow:    { name:'冰矢術',   mp:10, pow:1.3, type:'atk', tgt:'single', elem:'ice',   debuff:{slow:2}, desc:'命中有機率使敵人行動遲緩。' },
  heal:        { name:'靈光術',   mp:12, pow:1.4, type:'heal', tgt:'single', elem:'light',  desc:'恢復一位夥伴的生命值。' },
  thunder:     { name:'雷鳴術',   mp:20, pow:2.0, type:'atk', tgt:'all',    elem:'thunder', desc:'召喚天雷轟擊所有敵人。' },
  shoot:       { name:'飛羽箭',   mp:0,  pow:1.3, type:'atk', tgt:'single', elem:'none',    desc:'精準射擊。' },
  multiShot:   { name:'連珠箭',   mp:12, pow:0.8, type:'atk', tgt:'all',    elem:'none',  hits:3, desc:'連射三箭攻擊所有敵人。' },
  poisonArrow: { name:'毒箭',     mp:8,  pow:1.2, type:'atk', tgt:'single', elem:'none',  debuff:{poison:3}, desc:'命中令敵人中毒。' },
  moonLight:   { name:'月華照',   mp:18, pow:1.2, type:'heal', tgt:'all',    elem:'light',  desc:'月光降臨，恢復全體夥伴生命值。' },
};

const ITEMS = {
  herb:        { name:'草藥',        cat:'use', hp:80,    price:30,  desc:'恢復80點生命值。' },
  elixir:      { name:'靈露',        cat:'use', mp:50,    price:50,  desc:'恢復50點靈力。' },
  redPotion:   { name:'大還丹',      cat:'use', hp:200,   price:120, desc:'恢復200點生命值。' },
  fullElixir:  { name:'天靈露',      cat:'use', mp:100,   price:150, desc:'恢復100點靈力。' },
  revive:      { name:'起死回生丹',  cat:'use', revive:50,price:250, desc:'救活昏迷夥伴並恢復50%生命值。' },
  ironSword:   { name:'鐵劍',        cat:'eq',  slot:'wp', who:'yunyi',  atk:10, price:80,  desc:'+10攻擊力。' },
  steelSword:  { name:'精鋼劍',      cat:'eq',  slot:'wp', who:'yunyi',  atk:22, price:250, desc:'+22攻擊力。' },
  jadeSword:   { name:'玉靈劍',      cat:'eq',  slot:'wp', who:'yunyi',  atk:40, price:600, desc:'+40攻擊力。' },
  woodStaff:   { name:'木靈杖',      cat:'eq',  slot:'wp', who:'linger', atk:5,  mp:20, price:80,  desc:'+5攻擊，+20靈力上限。' },
  crystalStaff:{ name:'水晶法杖',    cat:'eq',  slot:'wp', who:'linger', atk:12, mp:40, price:280, desc:'+12攻擊，+40靈力上限。' },
  ironBow:     { name:'鐵弓',        cat:'eq',  slot:'wp', who:'yuehua', atk:12, price:90,  desc:'+12攻擊力。' },
  moonBow:     { name:'月牙弓',      cat:'eq',  slot:'wp', who:'yuehua', atk:28, price:300, desc:'+28攻擊力，提升暴擊率。' },
  leatherArmor:{ name:'皮甲',        cat:'eq',  slot:'ar', def:8,  price:60,  desc:'+8防禦力。' },
  ironArmor:   { name:'鐵甲',        cat:'eq',  slot:'ar', def:18, price:200, desc:'+18防禦力。' },
  silkRobe:    { name:'靈絲袍',      cat:'eq',  slot:'ar', def:10, mp:30, price:180, desc:'+10防禦，+30靈力上限。' },
  jade:        { name:'翡翠玉佩',    cat:'eq',  slot:'ac', def:5,  luk:10, price:150, desc:'+5防禦，+10幸運。' },
};

const SHOP_STOCK = {
  village: ['herb','elixir','ironSword','ironBow','woodStaff','leatherArmor'],
  forest:  ['herb','elixir','redPotion','steelSword','ironArmor'],
  castle:  ['redPotion','fullElixir','revive','jadeSword','moonBow','crystalStaff','silkRobe','jade'],
};

const ENEMIES = {
  wolf:     { name:'野狼',   hp:60,  atk:12, def:5,  spd:14, exp:30,  gold:15, color:0x8b7355, sz:28, acts:['bite','bite','howl'],        drops:[{id:'herb',r:0.4}] },
  bandit:   { name:'山賊',   hp:80,  atk:15, def:8,  spd:11, exp:45,  gold:30, color:0x8b3030, sz:28, acts:['slash','slash','rob'],        drops:[{id:'herb',r:0.3},{id:'elixir',r:0.1}] },
  skeleton: { name:'骷髏兵', hp:100, atk:18, def:12, spd:8,  exp:60,  gold:25, color:0xc8b89a, sz:28, acts:['slash','boneCrush','slash'],  drops:[{id:'herb',r:0.2}], undead:true },
  snake:    { name:'毒蛇妖', hp:120, atk:20, def:10, spd:18, exp:80,  gold:40, color:0x40b840, sz:28, acts:['bite','poisonSpray','bite'],  drops:[{id:'herb',r:0.5},{id:'elixir',r:0.2}] },
  ghost:    { name:'厲鬼',   hp:90,  atk:22, def:6,  spd:20, exp:90,  gold:35, color:0x8060c8, sz:28, acts:['curse','drain','curse'],      drops:[{id:'elixir',r:0.3}] },
  demon:    { name:'妖兵',   hp:140, atk:25, def:15, spd:12, exp:110, gold:55, color:0xc82020, sz:32, acts:['slash','slam','slash'],       drops:[{id:'redPotion',r:0.2}] },
  dragon:   { name:'蛟龍',   hp:200, atk:32, def:20, spd:10, exp:180, gold:100,color:0x20a0c8, sz:40, acts:['bite','fireBreath','tail'],   drops:[{id:'redPotion',r:0.4},{id:'fullElixir',r:0.3}] },
  boss:     { name:'魔君',   hp:400, atk:40, def:25, spd:8,  exp:0,   gold:0,  color:0xd020d0, sz:48, acts:['slam','curse','aoe','slam'],  drops:[], boss:true },
};

const ENEMY_ACTS = {
  bite:       { name:'撕咬',   pow:1.1, type:'atk', tgt:'single' },
  slash:      { name:'斬擊',   pow:1.0, type:'atk', tgt:'single' },
  howl:       { name:'嚎叫',   pow:0,   type:'buff', buff:'atkUp' },
  boneCrush:  { name:'碎骨擊', pow:1.5, type:'atk', tgt:'single' },
  rob:        { name:'搶奪',   pow:0.8, type:'atk', tgt:'single' },
  curse:      { name:'詛咒',   pow:0.9, type:'atk', tgt:'single', debuff:{poison:2} },
  drain:      { name:'吸命',   pow:1.0, type:'drain',tgt:'single' },
  poisonSpray:{ name:'毒霧',   pow:0.8, type:'atk', tgt:'all',    debuff:{poison:3} },
  slam:       { name:'重錘',   pow:1.4, type:'atk', tgt:'single' },
  aoe:        { name:'衝擊波', pow:1.0, type:'atk', tgt:'all' },
  tail:       { name:'尾擊',   pow:1.2, type:'atk', tgt:'all' },
  fireBreath: { name:'噴火',   pow:1.6, type:'atk', tgt:'all',    elem:'fire' },
};

// ── Maps ───────────────────────────────────────────────────
// Tile types: 0=path 1=wall 2=grass 3=tree 4=water 5=floor 6=door
const MAPS = {
  village: {
    name:'青雲村', music:'village',
    exits:[
      { x:9, y:0,  to:'forest',  toX:9,  toY:13, msg:'前往幽林森林' },
      { x:18,y:7,  to:'castle',  toX:1,  toY:7,  msg:'前往千魔城' },
    ],
    enc:{ rate:0, enemies:[] },
    w:20, h:15,
    tiles:[
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,5,5,5,5,1,2,2,0,0,2,2,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,2,0,0,0,0,2,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,0,0,0,0,0,0,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,0,0,3,3,0,0,1,5,5,5,5,5,1],
      [1,5,5,6,5,5,0,0,0,3,3,0,0,0,5,5,6,5,5,1],
      [1,1,1,0,1,1,0,0,0,0,0,0,0,0,1,1,0,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,1],
      [1,0,3,0,3,0,0,2,2,0,0,2,2,0,0,3,0,3,0,1],
      [1,0,0,0,0,0,0,2,4,4,4,4,2,0,0,0,0,0,0,1],
      [1,0,3,0,3,0,0,2,4,4,4,4,2,0,0,3,0,3,0,1],
      [1,0,0,0,0,0,0,2,2,0,0,2,2,0,0,0,0,0,0,1],
      [1,2,2,0,2,2,0,0,0,0,0,0,0,0,2,2,0,2,2,1],
      [1,2,2,2,2,2,0,0,0,0,0,0,0,0,2,2,2,2,2,1],
      [1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1],
    ],
    npcs:[
      { x:5,y:2,  name:'村長',  dlg:['歡迎來到青雲村！','傳說千魔城深處住著魔君，'+'\n'+'近來妖魔作亂，需要勇士相助。'] },
      { x:14,y:2, name:'商人',  dlg:['我這裡有上好的武器和藥品！'], shop:'village' },
      { x:9, y:9, name:'老者',  dlg:['此去幽林，妖獸橫行，多加小心。','傳說林中有古老的靈脈，可加入新夥伴。'] },
      { x:14,y:7, name:'旅館主',dlg:['歡迎光臨！住一晚只需50靈石，可以恢復體力。'], inn:50 },
    ],
    startX:9, startY:7,
  },
  forest: {
    name:'幽林森林', music:'forest',
    exits:[
      { x:9,y:14, to:'village', toX:9, toY:1, msg:'返回青雲村' },
    ],
    enc:{ rate:0.15, enemies:['wolf','bandit','snake','ghost'] },
    w:20, h:15,
    tiles:[
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,2,2,2,3,3,2,2,0,0,0,0,2,2,3,3,2,2,2,3],
      [3,2,0,0,0,3,0,0,0,3,3,0,0,0,3,0,0,0,2,3],
      [3,2,0,3,0,0,0,3,0,0,0,0,3,0,0,0,3,0,2,3],
      [3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3],
      [3,2,3,0,3,0,3,0,0,0,0,0,0,3,0,3,0,3,2,3],
      [3,0,0,0,0,0,0,0,3,0,0,3,0,0,0,0,0,0,0,3],
      [0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0],
      [3,0,0,0,0,3,0,0,0,0,0,0,0,0,3,0,0,0,0,3],
      [3,2,0,3,0,0,0,3,0,0,0,0,3,0,0,0,3,0,2,3],
      [3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3],
      [3,2,0,0,3,0,0,0,0,3,3,0,0,0,0,3,0,0,2,3],
      [3,2,2,0,0,0,3,0,0,0,0,0,0,3,0,0,0,2,2,3],
      [3,3,2,2,3,0,0,0,0,0,0,0,0,0,0,3,2,2,3,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
    ],
    npcs:[
      { x:10,y:7, name:'靈兒', dlg:['你就是傳說中的青雲劍客嗎？','我願意加入你的隊伍，一同討伐魔君！'], join:'linger' },
      { x:5, y:7, name:'弓手', dlg:['月華在更深的森林裡，她需要你的幫助。'] },
      { x:14,y:7, name:'月華', dlg:['終於等到你了！我早就想除掉魔君了，算我一份！'], join:'yuehua' },
    ],
    startX:9, startY:1,
  },
  castle: {
    name:'千魔城', music:'castle',
    exits:[
      { x:1,y:7,  to:'village', toX:17, toY:7, msg:'返回青雲村' },
    ],
    enc:{ rate:0.2, enemies:['skeleton','demon','dragon'] },
    w:20, h:15,
    tiles:[
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,1,1,5,1,1,5,5,5,5,5,5,1,1,5,1,1,5,1],
      [1,5,1,5,5,5,1,5,5,5,5,5,5,1,5,5,5,1,5,1],
      [1,5,5,5,1,5,5,5,5,1,1,5,5,5,5,1,5,5,5,1],
      [1,5,1,5,5,5,1,5,5,1,1,5,5,1,5,5,5,1,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [6,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,1,5,5,5,1,5,5,1,1,5,5,1,5,5,5,1,5,1],
      [1,5,5,5,1,5,5,5,5,1,1,5,5,5,5,1,5,5,5,1],
      [1,5,1,5,5,5,1,5,5,5,5,5,5,1,5,5,5,1,5,1],
      [1,5,1,1,5,1,1,5,5,5,5,5,5,1,1,5,1,1,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    npcs:[
      { x:5, y:6,  name:'商人', dlg:['能在這裡看到活人真是難得！我這有最好的裝備。'], shop:'castle' },
      { x:14,y:6,  name:'祭司', dlg:['魔君就在城堡最深處。','他擁有強大的黑暗力量，請務必做好準備。'] },
      { x:10,y:1,  name:'魔君', dlg:['哼！終於有人敢來送死！','我乃千年魔君，爾等螻蟻！'], boss:'boss', trigger:'flags.defeatedDragon' },
    ],
    startX:2, startY:7,
  },
};

// ── Stat helpers ───────────────────────────────────────────
const GROWTH = {
  yunyi:  { hp:12, mp:3,  atk:2, def:2, spd:1, luk:1 },
  linger: { hp:6,  mp:12, atk:1, def:1, spd:1, luk:2 },
  yuehua: { hp:8,  mp:5,  atk:2, def:1, spd:2, luk:2 },
};

function expForLevel(lv) { return Math.floor(100 * Math.pow(lv, 1.5)); }

function calcStats(m) {
  let atk = m.baseAtk, def = m.baseDef, spd = m.baseSpd, luk = m.baseLuk, maxMp = m.maxMp;
  for (const slot of ['wp','ar','ac']) {
    const it = m.equip[slot] ? ITEMS[m.equip[slot]] : null;
    if (!it) continue;
    atk += it.atk||0; def += it.def||0; spd += it.spd||0; luk += it.luk||0; maxMp += it.mp||0;
  }
  if (m.status.includes('atkDown')) atk = Math.max(1, atk - 8);
  if (m.status.includes('slow'))    spd = Math.max(1, Math.floor(spd * 0.6));
  return { atk, def, spd, luk, maxMp };
}

function makePartyMember(id) {
  const b = CHAR_BASE[id];
  return {
    id, name:b.name, title:b.title, color:b.color, shape:b.shape,
    lv:1, exp:0,
    maxHp:b.hp, hp:b.hp, maxMp:b.mp, mp:b.mp,
    baseAtk:b.atk, baseDef:b.def, baseSpd:b.spd, baseLuk:b.luk,
    skills:[...b.skills],
    equip:{ wp:null, ar:null, ac:null },
    status:[], dead:false,
  };
}

// ── Save ───────────────────────────────────────────────────
const Save = {
  KEY: 'xianxia_rpg_v2',
  slots() { try { return JSON.parse(localStorage.getItem(this.KEY)) || [null,null,null]; } catch(e) { return [null,null,null]; } },
  write(slot, data) { const s = this.slots(); s[slot] = data; localStorage.setItem(this.KEY, JSON.stringify(s)); },
  read(slot) { return this.slots()[slot]; },
};

// ── Global State ───────────────────────────────────────────
const GS = {
  map:'village', player:{ x:9, y:7, facing:'down' },
  party:[], gold:150, flags:{}, inventory:{}, defeated:{}, encStep:0,
  battleData:null,

  init() {
    this.party = [makePartyMember('yunyi')];
    this.gold = 150; this.flags = {}; this.inventory = { herb:3 };
    this.defeated = {}; this.encStep = 0;
    this.map = 'village'; this.player = { x:9, y:7, facing:'down' };
  },

  addItem(id, n=1) { this.inventory[id] = (this.inventory[id]||0) + n; },
  removeItem(id, n=1) {
    this.inventory[id] = Math.max(0, (this.inventory[id]||0) - n);
    if (!this.inventory[id]) delete this.inventory[id];
  },
  hasItem(id) { return (this.inventory[id]||0) > 0; },
  getMember(id) { return this.party.find(m => m.id === id); },

  addMember(id) {
    if (this.party.find(m => m.id === id)) return;
    const m = makePartyMember(id);
    const lv = Math.max(1, this.party[0]?.lv || 1);
    for (let i = 1; i < lv; i++) {
      const g = GROWTH[id] || { hp:8, mp:4, atk:2, def:1, spd:1, luk:1 };
      m.maxHp += g.hp; m.hp = m.maxHp; m.maxMp += g.mp; m.mp = m.maxMp;
      m.baseAtk += g.atk; m.baseDef += g.def; m.baseSpd += g.spd; m.baseLuk += g.luk;
    }
    m.lv = lv;
    this.party.push(m);
  },

  levelUp(m) {
    const g = GROWTH[m.id] || { hp:8, mp:4, atk:2, def:1, spd:1, luk:1 };
    m.lv++; m.exp = 0;
    m.maxHp += g.hp; m.hp = Math.min(m.hp + g.hp, m.maxHp);
    m.maxMp += g.mp; m.mp = Math.min(m.mp + g.mp, m.maxMp);
    m.baseAtk += g.atk; m.baseDef += g.def; m.baseSpd += g.spd; m.baseLuk += g.luk;
  },

  save(slot) {
    Save.write(slot, {
      map:this.map, player:{...this.player},
      party:JSON.parse(JSON.stringify(this.party)),
      gold:this.gold, flags:{...this.flags},
      inventory:{...this.inventory}, defeated:{...this.defeated},
    });
  },

  load(slot) {
    const d = Save.read(slot); if (!d) return false;
    Object.assign(this, {
      map:d.map, player:{...d.player},
      party:d.party, gold:d.gold,
      flags:d.flags||{}, inventory:d.inventory||{}, defeated:d.defeated||{}, encStep:0,
    });
    return true;
  },
};
