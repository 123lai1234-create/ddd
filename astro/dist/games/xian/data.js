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
  yunyi:  { id:'yunyi',  name:'天命人', title:'齊天後裔', color:0xf0a010, shape:'mage',
            hp:120, mp:40,  atk:18, def:12, spd:15, luk:10,
            skills:['slash','piercing','windBlade','thunderStomp','dragonStrike','focus'],
            desc:'身負天命，持金箍棒踏上除妖之路，傳承齊天大聖意志的孤勇者。' },
  linger: { id:'linger', name:'土地',   title:'山神使者', color:0x80c040, shape:'mage',
            hp:80,  mp:120, atk:10, def:8,  spd:18, luk:15,
            skills:['fireball','iceArrow','heal','thunder','earthBind','soulMend','barrier','purify'],
            desc:'主管一方的山神土地，法術精通，感應天命而主動加入除妖行列。' },
  yuehua: { id:'yuehua', name:'楊嬋',   title:'天神弓手', color:0x60c8ff, shape:'archer',
            hp:90,  mp:60,  atk:20, def:10, spd:20, luk:20,
            skills:['shoot','multiShot','poisonArrow','moonLight','moonRain','moonSeal'],
            desc:'天宮仙姬，箭術絕倫，為斬妖除魔之大義毅然下凡相助天命人。' },
};

const SKILLS = {
  slash:       { name:'棍掃千軍', mp:0,  pow:1.2, type:'atk', tgt:'single', elem:'none',    desc:'金箍棒橫掃，力道千鈞。' },
  piercing:    { name:'金針穿雲', mp:8,  pow:1.8, type:'atk', tgt:'single', elem:'none',  pierce:0.4, desc:'以毫毛化金針，穿透防禦。' },
  windBlade:   { name:'毫毛術',   mp:16, pow:1.3, type:'atk', tgt:'all',    elem:'wind',    desc:'拔毫毛一吹，化作無數棍影。' },
  fireball:    { name:'火眼金睛', mp:10, pow:1.6, type:'atk', tgt:'single', elem:'fire',    desc:'以火眼金睛凝聚真火轟擊。' },
  iceArrow:    { name:'定身術',   mp:10, pow:1.3, type:'atk', tgt:'single', elem:'ice',   debuff:{slow:2}, desc:'施展定身法術，使敵人行動遲緩。' },
  heal:        { name:'回春術',   mp:12, pow:1.4, type:'heal', tgt:'single', elem:'light',  desc:'以神力回春，恢復夥伴生命。' },
  thunder:     { name:'天雷法',   mp:20, pow:2.0, type:'atk', tgt:'all',    elem:'thunder', desc:'呼喚天雷降臨，轟擊所有妖物。' },
  shoot:       { name:'蓮花箭',   mp:0,  pow:1.3, type:'atk', tgt:'single', elem:'none',    desc:'蓮花化箭，精準無誤。' },
  multiShot:   { name:'三連箭',   mp:12, pow:0.8, type:'atk', tgt:'all',    elem:'none',  hits:3, desc:'連發三矢，貫穿敵陣。' },
  poisonArrow: { name:'罡風箭',   mp:8,  pow:1.2, type:'atk', tgt:'single', elem:'none',  debuff:{poison:3}, desc:'罡風箭矢附帶毒氣，侵蝕妖體。' },
  moonLight:   { name:'仙光照',   mp:18, pow:1.2, type:'heal', tgt:'all',    elem:'light',  desc:'仙光普照，恢復全體夥伴生命值。' },
  thunderStomp:{ name:'雷震九天', mp:22, pow:2.2, type:'atk', tgt:'all',    elem:'thunder', desc:'召喚九天神雷，轟擊所有妖物。' },
  earthBind:   { name:'縛妖索',   mp:14, pow:0.6, type:'atk', tgt:'all',    elem:'none', debuff:{slow:3}, desc:'以法力化索縛住所有妖物，令其行動遲緩。' },
  moonRain:    { name:'月雨千箭', mp:20, pow:0.9, type:'atk', tgt:'all',    elem:'none', hits:4, desc:'引月光化千矢，貫穿妖陣，連擊四次。' },
  dragonStrike:{ name:'龍紋震天', mp:28, pow:2.5, type:'atk', tgt:'all',    elem:'thunder', desc:'運天命之力，龍紋雷霆轟擊所有妖物。' },
  soulMend:    { name:'靈魂救療', mp:20, pow:1.8, type:'heal', tgt:'all',   elem:'light',   desc:'以神力療癒全隊，令所有夥伴生命恢復。' },
  focus:       { name:'氣貫長虹', mp:10, pow:0, type:'buff', tgt:'self', buff:'atkUp', turns:3, desc:'凝氣蓄力，自身攻擊力大幅提升3回合。' },
  barrier:     { name:'神光護體', mp:12, pow:0, type:'buff', tgt:'self', buff:'defUp', turns:3, desc:'以法力結界護體，自身防禦力大幅提升3回合。' },
  purify:      { name:'淨化靈光', mp:18, pow:0, type:'cleanse', tgt:'all', elem:'light', desc:'神光淨化全體夥伴，解除毒、燒、緩、昏等異常狀態。' },
  moonSeal:    { name:'月魄封印', mp:14, pow:1.4, type:'atk', tgt:'single', elem:'light', debuff:{atkDown:2}, desc:'以月魄封印敵人，造成傷害並降低其攻擊力2回合。' },
};

const ITEMS = {
  herb:        { name:'靈芝',       cat:'use', hp:80,    price:30,  desc:'上古靈芝，恢復80點生命值。' },
  elixir:      { name:'仙丹',       cat:'use', mp:50,    price:50,  desc:'煉丹師秘製，恢復50點法力。' },
  redPotion:   { name:'九轉金丹',   cat:'use', hp:200,   price:120, desc:'九轉煉製，恢復200點生命值。' },
  fullElixir:  { name:'太乙救苦丹', cat:'use', mp:100,   price:150, desc:'太乙真人所製，恢復100點法力。' },
  revive:      { name:'靈珠',       cat:'use', revive:50,price:250, desc:'救活昏迷夥伴並恢復50%生命值。' },
  ironSword:   { name:'鐵棍',       cat:'eq',  slot:'wp', who:'yunyi',  atk:10, price:80,  desc:'鐵打金箍棒，+10攻擊力。' },
  steelSword:  { name:'精金棍',     cat:'eq',  slot:'wp', who:'yunyi',  atk:22, price:250, desc:'精金打造，+22攻擊力。' },
  jadeSword:   { name:'玉棍',       cat:'eq',  slot:'wp', who:'yunyi',  atk:40, price:600, desc:'和田玉製，+40攻擊力。' },
  woodStaff:   { name:'桃木法杖',   cat:'eq',  slot:'wp', who:'linger', atk:5,  mp:20, price:80,  desc:'+5攻擊，+20法力上限。' },
  crystalStaff:{ name:'七彩琉璃杖', cat:'eq',  slot:'wp', who:'linger', atk:12, mp:40, price:280, desc:'+12攻擊，+40法力上限。' },
  ironBow:     { name:'鐵弓',       cat:'eq',  slot:'wp', who:'yuehua', atk:12, price:90,  desc:'+12攻擊力。' },
  moonBow:     { name:'月白神弓',   cat:'eq',  slot:'wp', who:'yuehua', atk:28, price:300, desc:'+28攻擊力，天神賜弓。' },
  leatherArmor:{ name:'獸皮甲',     cat:'eq',  slot:'ar', def:8,  price:60,  desc:'野獸皮革，+8防禦力。' },
  ironArmor:   { name:'玄鐵甲',     cat:'eq',  slot:'ar', def:18, price:200, desc:'玄鐵鍛造，+18防禦力。' },
  silkRobe:    { name:'觀音錦袍',   cat:'eq',  slot:'ar', def:10, mp:30, price:180, desc:'+10防禦，+30法力上限。' },
  jade:        { name:'護身玉',     cat:'eq',  slot:'ac', def:5,  luk:10, price:150, desc:'+5防禦，+10幸運。' },
  spiritBlade: { name:'金箍棒',     cat:'eq',  slot:'wp', who:'yunyi',  atk:65, price:1200, desc:'如意金箍棒，+65攻擊力，大聖神器。' },
  moonStaff:   { name:'太乙法杖',   cat:'eq',  slot:'wp', who:'linger', atk:30, mp:80, price:1200, desc:'+30攻擊，+80法力上限。' },
  starBow:     { name:'天神弓',     cat:'eq',  slot:'wp', who:'yuehua', atk:50, price:1200, desc:'+50攻擊力，天宮神弓。' },
  dragonArmor: { name:'龍鱗甲',     cat:'eq',  slot:'ar', def:35, price:1000, desc:'+35防禦力，龍鱗護體。' },
  ancientJade:  { name:'混天綾',     cat:'eq',  slot:'ac', def:12, luk:20, price:800, desc:'+12防禦，+20幸運，哪吒法寶。' },
  dragonPearl:  { name:'龍珠',       cat:'use', hp:300, mp:80,  price:2000, desc:'東海龍王之寶，恢復300HP與80MP。' },
  seaDragonArmor:{ name:'海龍甲',    cat:'eq',  slot:'ar', def:50, price:2000, desc:'+50防禦力，東海龍鱗鍛造。' },
  waterStaff:   { name:'水晶仙杖',   cat:'eq',  slot:'wp', who:'linger', atk:45, mp:100, price:2200, desc:'+45攻擊，+100法力上限。' },
  dragonBow:    { name:'龍骨神弓',   cat:'eq',  slot:'wp', who:'yuehua', atk:65, price:2200, desc:'+65攻擊力，龍骨所制。' },
  goldenPill:   { name:'金丹',       cat:'use', hp:200, mp:60,  price:800,  desc:'太上老君煉丹，恢復200HP與60MP。' },
  divineRobe:   { name:'神衣',       cat:'eq',  slot:'ar', def:18, mp:15,  price:3000, desc:'+18防禦，+15法力上限，天庭神衣。' },
  celestialJade:{ name:'天靈玉',     cat:'eq',  slot:'ac', atk:8, spd:8, luk:12, price:4000, desc:'+8攻擊+8速+12幸，蘊含仙氣。' },
  jadeToken:    { name:'靈霄令牌',   cat:'use', hp:0, mp:0, price:99999, desc:'玉皇大帝的令牌，傳說中的寶物。' },
};

const SHOP_STOCK = {
  village: ['herb','elixir','ironSword','ironBow','woodStaff','leatherArmor'],
  forest:  ['herb','elixir','redPotion','steelSword','ironArmor'],
  castle:  ['redPotion','fullElixir','revive','jadeSword','moonBow','crystalStaff','silkRobe','jade'],
  cave:    ['redPotion','fullElixir','revive','elixir','ironArmor'],
  shrine:       ['fullElixir','revive','spiritBlade','moonStaff','starBow','dragonArmor','ancientJade'],
  dragonPalace: ['dragonPearl','seaDragonArmor','waterStaff','dragonBow','redPotion','fullElixir','revive'],
  lingxiao:     ['goldenPill','divineRobe','celestialJade','fullElixir','revive','dragonPearl'],
};

const ENEMIES = {
  wolf:     { name:'黑熊精', hp:60,  atk:12, def:5,  spd:14, exp:30,  gold:15, color:0x302018, sz:28, acts:['bite','bite','howl'],        drops:[{id:'herb',r:0.4}] },
  bandit:   { name:'山賊頭', hp:80,  atk:15, def:8,  spd:11, exp:45,  gold:30, color:0x7a2810, sz:28, acts:['slash','slash','rob'],        drops:[{id:'herb',r:0.3},{id:'elixir',r:0.1}] },
  skeleton: { name:'冥兵',   hp:100, atk:18, def:12, spd:8,  exp:60,  gold:25, color:0xb0a888, sz:28, acts:['slash','boneCrush','slash'],  drops:[{id:'herb',r:0.2}], undead:true },
  snake:    { name:'蛇蟒精', hp:120, atk:20, def:10, spd:18, exp:80,  gold:40, color:0x205010, sz:28, acts:['bite','poisonSpray','bite'],  drops:[{id:'herb',r:0.5},{id:'elixir',r:0.2}] },
  ghost:    { name:'怨靈',   hp:90,  atk:22, def:6,  spd:20, exp:90,  gold:35, color:0x7040c0, sz:28, acts:['curse','drain','curse'],      drops:[{id:'elixir',r:0.3}] },
  demon:    { name:'妖兵',   hp:140, atk:25, def:15, spd:12, exp:110, gold:55, color:0xb01010, sz:32, acts:['slash','slam','slash'],       drops:[{id:'redPotion',r:0.2}] },
  dragon:   { name:'虎先鋒', hp:200, atk:32, def:20, spd:10, exp:180, gold:100,color:0xe06010, sz:40, acts:['bite','fireBreath','tail'],   acts2:['fireBreath','enrageSlam','tail','fireBreath','enrageSlam'], drops:[{id:'redPotion',r:0.4},{id:'fullElixir',r:0.3}], weak:['ice'] },
  boss:       { name:'黃眉大王',hp:400, atk:40, def:25, spd:8,  exp:0,   gold:0,  color:0xc09010, sz:48, acts:['slam','curse','vortex','aoe','slam'],  acts2:['enrageSlam','sacredBlast','slam','soulScream','enrageSlam'], drops:[], boss:true, weak:['wind'] },
  spider:     { name:'蜘蛛精', hp:110, atk:16, def:8,  spd:18, exp:75,  gold:35, color:0x501840, sz:28, acts:['bite','webTrap','bite','poisonSpray'],   drops:[{id:'elixir',r:0.3}], weak:['fire'] },
  yasha:      { name:'夜叉',   hp:135, atk:22, def:14, spd:14, exp:98,  gold:48, color:0x203060, sz:30, acts:['slash','curse','drain','slash'],          drops:[{id:'redPotion',r:0.15}], weak:['light'] },
  goldenEagle:{ name:'大鵬金翅',hp:185, atk:28, def:18, spd:22, exp:155, gold:85, color:0xd0a010, sz:36, acts:['claw','diveBomb','claw','aoe'],           drops:[{id:'redPotion',r:0.3},{id:'fullElixir',r:0.2}], weak:['thunder'] },
  silverKing:  { name:'銀角大王', hp:380, atk:38, def:24, spd:9,  exp:0,   gold:0,  color:0xc0c8f0, sz:48, acts:['slam','soulDrain','aoe','slam','curse'],  acts2:['enrageSlam','sacredBlast','soulScream','enrageSlam','soulDrain'], drops:[], boss:true, weak:['fire'] },
  fireSpirit:  { name:'火靈精',  hp:130, atk:28, def:8,  spd:20, exp:120, gold:60, color:0xff4010, sz:28, acts:['fireFlare','bite','fireFlare','howl'],           drops:[{id:'elixir',r:0.3}], weak:['ice'], resist:['fire'] },
  iceScorp:    { name:'冰蠍',    hp:145, atk:22, def:16, spd:12, exp:105, gold:55, color:0x40b0e0, sz:28, acts:['frostClaw','frostClaw','iceBlast','bite'],        drops:[{id:'herb',r:0.2},{id:'elixir',r:0.2}], weak:['fire'], resist:['ice'] },
  dragonGuard: { name:'龍族守衛',hp:200, atk:30, def:22, spd:10, exp:160, gold:80, color:0x2090c0, sz:32, acts:['slash','waterBlast','slam','scaleDash'],          drops:[{id:'redPotion',r:0.25}], weak:['thunder'] },
  dragonKing:  { name:'東海龍王',hp:600, atk:48, def:30, spd:7,  exp:0,   gold:0,  color:0x0090ff, sz:52, acts:['waterBlast','scaleDash','tideCall','scaleDash','waterBlast'], acts2:['dragonErupt','tideSurge','scaleDash','tideSurge','dragonErupt'], drops:[], boss:true, weak:['thunder'], resist:['ice','wind'] },
  celestial:   { name:'天兵衛',  hp:260, atk:46, def:26, spd:24, exp:200, gold:100,color:0xd0a030, sz:30, acts:['divineStrike','slash','celestialEdict','slash'], drops:[{id:'goldenPill',r:0.18},{id:'elixir',r:0.4}], weak:['wind'] },
  phoenix:     { name:'鳳凰精',  hp:210, atk:52, def:18, spd:32, exp:220, gold:110,color:0xff6020, sz:30, acts:['fireBreath','bite','fireFlare','fireBreath'],     drops:[{id:'redPotion',r:0.35},{id:'fullElixir',r:0.15}], weak:['ice'], resist:['fire'] },
  jadeKing:    { name:'玉皇大帝',hp:2400,atk:68, def:50, spd:30, exp:0,   gold:0,  color:0xffd040, sz:56, acts:['divineStrike','celestialEdict','heavenlyPunish','divineStrike','celestialEdict'], acts2:['divineWrath','celestialEdict','heavenlyPunish','divineWrath','divineStrike'], drops:[{id:'jadeToken',r:1.0}], boss:true, weak:['wind','ice'], resist:['thunder','fire'] },
};

const ENEMY_ACTS = {
  bite:       { name:'撕咬',     pow:1.1, type:'atk', tgt:'single' },
  slash:      { name:'刀斬',     pow:1.0, type:'atk', tgt:'single' },
  howl:       { name:'虎嘯',     pow:0,   type:'buff', buff:'atkUp' },
  boneCrush:  { name:'冥刀',     pow:1.5, type:'atk', tgt:'single' },
  rob:        { name:'劫奪',     pow:0.8, type:'atk', tgt:'single' },
  curse:      { name:'詛咒',     pow:0.9, type:'atk', tgt:'single', debuff:{poison:2} },
  drain:      { name:'吸魂',     pow:1.0, type:'drain',tgt:'single' },
  poisonSpray:{ name:'蛇毒霧',   pow:0.8, type:'atk', tgt:'all',    debuff:{poison:3} },
  slam:       { name:'禪杖重擊', pow:1.4, type:'atk', tgt:'single' },
  aoe:        { name:'禪杖揮舞', pow:1.0, type:'atk', tgt:'all' },
  tail:       { name:'虎尾橫掃', pow:1.2, type:'atk', tgt:'all' },
  fireBreath: { name:'虎嘯火焰', pow:1.6, type:'atk', tgt:'all',    elem:'fire', debuff:{burn:2} },
  webTrap:    { name:'蜘蛛絲',   pow:0,   type:'debuff',tgt:'single', debuff:{slow:2} },
  claw:       { name:'金爪撕裂', pow:1.3, type:'atk',   tgt:'single' },
  diveBomb:   { name:'俯衝重擊', pow:1.8, type:'atk',   tgt:'single' },
  soulDrain:  { name:'攝魂術',   pow:1.1, type:'drain',  tgt:'single' },
  waterBlast: { name:'水龍衝擊', pow:1.4, type:'atk',   tgt:'all' },
  scaleDash:  { name:'鱗甲突進', pow:2.0, type:'atk',   tgt:'single' },
  tideCall:   { name:'召喚潮水', pow:0.8, type:'atk',   tgt:'all',    debuff:{slow:2} },
  fireFlare:  { name:'火焰爆裂', pow:1.5, type:'atk',   tgt:'single', elem:'fire', debuff:{burn:2} },
  vortex:     { name:'混沌漩渦', pow:0.8, type:'atk',   tgt:'all', debuff:{stun:1} },
  frostClaw:  { name:'冰霜爪',   pow:1.2, type:'atk',   tgt:'single', debuff:{slow:2} },
  iceBlast:   { name:'冰霜爆',   pow:0.9, type:'atk',   tgt:'all',    debuff:{slow:1} },
  enrageSlam: { name:'狂怒猛擊', pow:2.2, type:'atk',   tgt:'single' },
  sacredBlast:{ name:'禪杖聖爆', pow:1.5, type:'atk',   tgt:'all', debuff:{burn:2} },
  soulScream: { name:'魂力爆嘯', pow:1.4, type:'atk',   tgt:'all', debuff:{stun:1} },
  tideSurge:  { name:'龍王怒濤', pow:1.6, type:'atk',   tgt:'all', debuff:{slow:3} },
  dragonErupt:{ name:'龍氣爆發', pow:2.5, type:'atk',   tgt:'single', elem:'thunder' },
  divineStrike:  { name:'天雷降擊', pow:2.2, type:'atk', tgt:'single', elem:'thunder' },
  celestialEdict:{ name:'天威敕令', pow:1.1, type:'atk', tgt:'all',    elem:'thunder', debuff:{stun:1} },
  heavenlyPunish:{ name:'天罰神火', pow:1.4, type:'atk', tgt:'all',    elem:'fire',    debuff:{burn:2} },
  divineWrath:   { name:'萬道天威', pow:3.2, type:'atk', tgt:'single', elem:'thunder' },
};

// ── Maps ───────────────────────────────────────────────────
// Tile types: 0=path 1=wall 2=grass 3=tree 4=water 5=floor 6=door
const MAPS = {
  village: {
    name:'黑山村', music:'village',
    exits:[
      { x:9, y:0,  to:'forest',  toX:9,  toY:13, msg:'前往幽竹林' },
      { x:18,y:7,  to:'castle',  toX:1,  toY:7,  msg:'前往黃風嶺' },
    ],
    chests:[
      { x:2, y:2,  id:'v1', gold:80 },
      { x:17,y:2,  id:'v2', item:'herb' },
      { x:3, y:12, id:'v3', item:'elixir' },
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
      { x:5, y:2,  name:'老猴子',  dlg:['你可是那天命之人？', '黃眉大王橫行各地，妖氣漫天，', '此劫非你不能解！', '先往北出村，去幽竹林找山神土地吧。'], dlgNG:['又回來了！天命之路從不止息。', '二周目的妖王更強了——他記住你了！', '同樣的天命，卻是全新的試煉。', '加油！你已是身經百戰的天命人。'] },
      { x:14,y:2,  name:'行商',    dlg:['老夫走遍山河，見過世面。', '天命之人，備齊草藥再出發！'], shop:'village' },
      { x:9, y:9,  name:'土地廟',  dlg:['〔石碑刻字〕', '幽竹林中有位山神土地，', '他知曉除妖之道，可助天命人。', '出村北行，入竹林向內探索即可尋得。'] },
      { x:14,y:7,  name:'客棧掌柜',dlg:['旅人辛苦了，住一晚50靈石。', '休息好了才有力氣除妖！', '最近黃眉大王的妖兵橫行，出門多加小心！'], inn:50 },
      { x:3, y:7,  name:'村婦',    dlg:['村子裡的青壯年都逃跑了…', '只剩我們老弱婦孺留守家園。', '天命之人，拜託你一定要除掉那妖王！'] },
    ],
    startX:9, startY:7,
  },
  forest: {
    name:'幽竹林', music:'forest',
    exits:[
      { x:9,y:14, to:'village', toX:9, toY:1, msg:'返回黑山村' },
      { x:0, y:7, to:'cave',    toX:18, toY:7, msg:'進入盤絲洞' },
    ],
    chests:[
      { x:2, y:2, id:'f1', item:'elixir' },
      { x:17,y:2, id:'f2', gold:120 },
      { x:10,y:11,id:'f3', item:'ironSword' },
    ],
    enc:{ rate:0.15, enemies:['wolf','bandit','snake','ghost','spider'] },
    w:20, h:15,
    tiles:[
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,2,2,2,3,3,2,2,0,0,0,0,2,2,3,3,2,2,2,3],
      [3,2,0,0,0,3,0,0,0,3,3,0,0,0,3,0,0,0,2,3],
      [3,2,0,3,0,0,0,3,0,0,0,0,3,0,0,0,3,0,2,3],
      [3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3],
      [3,2,3,0,3,0,3,0,0,0,0,0,0,3,0,3,0,3,2,3],
      [3,0,0,0,0,0,0,0,3,0,0,3,0,0,0,0,0,0,0,3],
      [6,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0],
      [3,0,0,0,0,3,0,0,0,0,0,0,0,0,3,0,0,0,0,3],
      [3,2,0,3,0,0,0,3,0,0,0,0,3,0,0,0,3,0,2,3],
      [3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3],
      [3,2,0,0,3,0,0,0,0,3,3,0,0,0,0,3,0,0,2,3],
      [3,2,2,0,0,0,3,0,0,0,0,0,0,3,0,0,0,2,2,3],
      [3,3,2,2,3,0,0,0,0,0,0,0,0,0,0,3,2,2,3,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
    ],
    npcs:[
      { x:10,y:7,  name:'土地',    dlg:['吾乃此地山神土地。', '天命之人！我感應到你的到來，', '願隨你共討黃眉大王！'], join:'linger' },
      { x:5, y:7,  name:'仙使',    dlg:['楊嬋仙姑在竹林更深處，向東尋去。', '她已等候天命之人許久。', '此路妖獸橫行，多加小心！'] },
      { x:14,y:7,  name:'楊嬋',    dlg:['天命之人！終於找到你了！', '我楊嬋下凡便是為此，', '讓我助你征討黃眉大王！'], join:'yuehua' },
      { x:16,y:5,  name:'竹林石碑',dlg:['〔碑文殘存〕', '此林乃上古仙地，妖氣漸重。', '蜘蛛精盤絲洞在西方深處，', '入林者需備足草藥方可深入。'] },
    ],
    startX:9, startY:1,
  },
  castle: {
    name:'黃風嶺', music:'castle',
    exits:[
      { x:1,y:7,  to:'village', toX:17, toY:7, msg:'返回黑山村' },
    ],
    chests:[
      { x:18,y:1,  id:'c1', gold:200 },
      { x:18,y:13, id:'c2', item:'redPotion' },
      { x:1, y:3,  id:'c3', gold:250 },
    ],
    enc:{ rate:0.2, enemies:['skeleton','demon','yasha','goldenEagle'] },
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
      { x:5, y:6,  name:'行商',     dlg:['這風沙太大了！你還好嗎？', '我有最好的裝備，快來看！', '深入黃風嶺前記得備好還魂藥！'], shop:'castle' },
      { x:14,y:6,  name:'老僧',     dlg:['黃眉大王就在嶺上最深處。', '他竊取如來佛寶物，擅自稱王，', '天命之人，此乃你的使命！', '記住：風系技能乃黃眉大王的剋星！'] },
      { x:10,y:1,  name:'黃眉大王', dlg:['哈哈哈！天命之人終於來了！', '本大王乃彌勒佛座下弟子，', '今日便讓你見識佛法真威！'], dlgNG:['哼！你竟敢再次挑戰本大王！', '上次的失敗，本王已重修佛法百倍！', '二周目的本大王，豈是你可以撼動的？！', '今日你必敗！！！'], boss:'boss', trigger:'flags.defeatedDragon' },
    ],
    startX:2, startY:7,
  },
  cave: {
    name:'盤絲洞', music:'dungeon',
    exits:[
      { x:19,y:7, to:'forest',       toX:1,  toY:7, msg:'返回幽竹林' },
      { x:9, y:14,to:'dragonPalace', toX:9,  toY:1, msg:'前往東海龍宮' },
    ],
    chests:[
      { x:5, y:11,id:'ca1', item:'fullElixir' },
      { x:14,y:3, id:'ca2', gold:300 },
    ],
    enc:{ rate:0.25, enemies:['spider','yasha','ghost','demon','goldenEagle','fireSpirit','iceScorp'] },
    w:20, h:15,
    tiles:[
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,5,5,5,1,5,5,5,5,5,5,5,5,1,5,5,5,5,1],
      [1,5,4,4,5,5,5,1,5,5,5,5,1,5,5,5,4,4,5,1],
      [1,5,4,4,5,1,5,5,5,1,1,5,5,5,1,5,4,4,5,1],
      [1,5,5,5,5,1,5,5,5,5,5,5,5,5,1,5,5,5,5,1],
      [1,1,5,1,1,1,5,1,1,5,5,1,1,5,1,1,1,5,1,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,6],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,1,5,1,1,1,5,1,1,5,5,1,1,5,1,1,1,5,1,1],
      [1,5,5,5,5,1,5,5,5,5,5,5,5,5,1,5,5,5,5,1],
      [1,5,4,4,5,1,5,5,5,1,1,5,5,5,1,5,4,4,5,1],
      [1,5,4,4,5,5,5,1,5,5,5,5,1,5,5,5,4,4,5,1],
      [1,5,5,5,5,1,5,5,5,5,5,5,5,5,1,5,5,5,5,1],
      [1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1],
    ],
    npcs:[
      { x:5, y:7, name:'被困僧人', dlg:['此乃蜘蛛精盤絲洞…', '我已被困多日，幸好天命之人你來了！', '火系技能能克制蜘蛛精！', '往南走，虎先鋒在盤絲洞最南端把守，冰系技能可破之。'] },
      { x:14,y:7, name:'石壁刻文', dlg:['〔壁上刻著〕', '蜘蛛精盤踞於此，妖氣沖天。', '南門通往東海龍宮，黃眉大王腹地。', '更南端有虎先鋒駐守，冰系技能可破之。'] },
      { x:7, y:3, name:'行商',     dlg:['這鬼地方真嚇人…', '最後一批貨，你要的話快買！', '備好還魂藥，這洞裡的妖怪特別兇！'], shop:'cave' },
      { x:4, y:4, name:'銀角大王', dlg:['哈哈哈！天命之人！', '本王乃太上老君弟子，奉命鎮守此地！', '要想通過，先過本王這一關！'], dlgNG:['又來了！上次敗得好慘！', '本王已修煉新法術，今日你別想輕易過關！', '二周目……好，本王也全力以赴！'], boss:'silverKing' },
      { x:9, y:12,name:'虎先鋒',   dlg:['吼！！', '本先鋒奉命鎮守此處，守衛南路！', '要想繼續南行，先打敗本先鋒！'], dlgNG:['吼！！又是你！', '上次被你打得好慘……', '本先鋒已脫胎換骨，再來一戰！'], boss:'dragon' },
    ],
    startX:18, startY:7,
  },
  shrine: {
    name:'小西天', music:'shrine',
    exits:[
      { x:9, y:0,  to:'dragonPalace', toX:18, toY:7, msg:'返回東海龍宮' },
      { x:9, y:14, to:'lingxiao',     toX:9,  toY:1,  msg:'進入靈霄殿' },
    ],
    chests:[
      { x:2, y:12,id:'sh1', item:'revive' },
      { x:17,y:12,id:'sh2', item:'ancientJade' },
      { x:10,y:8, id:'sh3', gold:500 },
    ],
    enc:{ rate:0.22, enemies:['demon','goldenEagle','skeleton','yasha'] },
    w:20, h:15,
    tiles:[
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,5,1,1,5,5,1,1,5,5,5,5,1,1,5,5,1,1,5,3],
      [3,5,1,5,5,5,5,1,5,5,5,5,1,5,5,5,5,1,5,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,5,5,1,5,5,5,5,5,5,5,5,5,5,5,1,5,5,5,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,5,5,1,5,5,5,5,5,5,5,5,5,5,5,1,5,5,5,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,5,1,5,5,5,5,1,5,5,5,5,1,5,5,5,5,1,5,3],
      [3,5,1,1,5,5,1,1,5,5,5,5,1,1,5,5,1,1,5,3],
      [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
    ],
    npcs:[
      { x:9, y:7,  name:'金身羅漢', dlg:['此乃彌勒佛道場小西天。', '黃眉大王反出師門，竊取佛寶，', '天命之人，你歷盡磨難，天命所歸！', '佛法庇佑，必能斬妖除魔！'] },
      { x:5, y:7,  name:'阿羅漢',   dlg:['黃眉大王法力高強，', '其禪杖能震碎山嶽，禪定珠能困縛萬物。', '以風系技能攻擊乃其弱點！', '做好萬全準備再去決戰！'] },
      { x:14,y:7,  name:'掌寶人',   dlg:['你已有足夠的力量！', '此乃小西天最後珍藏。', '拿去吧，助你斬妖除魔！'], shop:'shrine' },
      { x:9, y:13, name:'靈霄天門', dlg:['〔天門刻字〕', '此門通往靈霄殿，玉皇大帝居所。', '非二周目天命人不得入內。', '歷盡三界磨難者，方能問鼎天庭。'] },
    ],
    startX:9, startY:1,
  },
  dragonPalace: {
    name:'東海龍宮', music:'dragonPalace',
    exits:[
      { x:9, y:0,  to:'cave',   toX:9,  toY:13, msg:'返回盤絲洞' },
      { x:19,y:7,  to:'shrine', toX:1,  toY:7,  msg:'進入小西天' },
    ],
    chests:[
      { x:2, y:2,  id:'dp1', gold:800 },
      { x:17,y:2,  id:'dp2', item:'dragonBow' },
      { x:9, y:5,  id:'dp3', item:'waterStaff' },
    ],
    enc:{ rate:0.28, enemies:['dragonGuard','fireSpirit','iceScorp','yasha'] },
    w:20, h:15,
    tiles:[
      [1,1,1,1,1,1,1,1,1,6,1,1,1,1,1,1,1,1,1,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,4,4,5,5,1,5,5,5,5,5,5,1,5,5,4,4,5,1],
      [1,5,4,4,5,5,5,5,5,1,1,5,5,5,5,5,4,4,5,1],
      [1,5,5,5,5,1,5,5,5,5,5,5,5,5,1,5,5,5,5,1],
      [1,5,5,1,5,5,5,5,4,4,4,4,5,5,5,5,1,5,5,1],
      [1,5,5,5,5,5,5,5,4,4,4,4,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,4,4,4,4,5,5,5,5,5,5,5,6],
      [1,5,5,5,5,5,5,5,4,4,4,4,5,5,5,5,5,5,5,1],
      [1,5,5,1,5,5,5,5,4,4,4,4,5,5,5,5,1,5,5,1],
      [1,5,5,5,5,1,5,5,5,5,5,5,5,5,1,5,5,5,5,1],
      [1,5,4,4,5,5,5,5,5,1,1,5,5,5,5,5,4,4,5,1],
      [1,5,4,4,5,5,1,5,5,5,5,5,5,1,5,5,4,4,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    npcs:[
      { x:12,y:7,  name:'東海龍王', dlg:['哈哈哈！何方神聖，竟敢闖入朕之龍宮！', '朕乃東海之主，法力無邊！', '今日便讓你見識水龍之威！'], dlgNG:['你……還敢再來！', '朕已感悟龍道真諦，今非昔比！', '二周目天命之人——朕要讓你見識真正的龍威！', '翻騰吧，東海之怒！！'], boss:'dragonKing' },
      { x:5, y:7,  name:'海靈使者', dlg:['此乃東海龍宮，', '龍王以水法攻擊，雷系技能乃其剋星！', '龍王憤怒時還能召喚潮水衝擊全隊，', '備好回復道具，速戰速決！'] },
      { x:14,y:7,  name:'龍宮行商', dlg:['龍宮秘寶盡在此！', '這可是最後的補給機會了！', '決戰龍王前，務必補滿所有藥品！'], shop:'dragonPalace' },
      { x:5, y:3,  name:'龍柱石刻', dlg:['〔古龍文〕', '東海龍王鎮守海疆，水法通天。', '雷霆乃水之剋，以雷攻水，事半功倍。', '龍王之怒可引潮汐淹沒眾生，需速戰速決！'] },
    ],
    startX:9, startY:1,
  },
  lingxiao: {
    name:'靈霄殿', music:'shrine',
    exits:[
      { x:9, y:14, to:'shrine', toX:9, toY:13, msg:'返回小西天' },
    ],
    chests:[
      { x:4,  y:2,  id:'lx1', item:'divineRobe' },
      { x:15, y:2,  id:'lx2', item:'celestialJade' },
      { x:10, y:12, id:'lx3', gold:2000 },
    ],
    enc:{ rate:0.25, enemies:['celestial','phoenix','demon','yasha'] },
    w:20, h:15,
    tiles:[
      [1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,1,1,5,5,5,5,5,5,5,5,5,5,5,5,1,1,5,1],
      [1,5,1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,4,4,4,4,5,5,5,5,5,5,5,1],
      [1,5,1,5,5,5,5,5,4,4,4,4,5,5,5,5,5,1,5,1],
      [1,5,5,5,5,5,5,5,4,4,4,4,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,4,4,4,4,5,5,5,5,5,5,5,1],
      [1,5,1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1],
    ],
    npcs:[
      { x:10,y:3,  name:'玉皇大帝', dlg:['哈哈哈！凡人竟敢闖入靈霄殿！', '朕乃天帝，掌管三界萬靈！', '你歷盡苦難抵達此處，確有幾分本事。', '但天命也有極限——今日便讓你見識真正的天威！'], dlgNG:['你又來了！', '朕的天威你已領教過一次！', '今日朕動用萬道天威，毫不手軟！', '準備好迎接天庭最終試煉！'], boss:'jadeKing' },
      { x:5, y:11, name:'天庭使者', dlg:['此乃靈霄殿，三界最高天庭。', '玉皇大帝法力通天，歷經萬古。', '冰系與風系技能是其剋星！', '其相位二形態更為兇猛，準備萬全方可應戰！'] },
      { x:14,y:11, name:'天庭行商', dlg:['天宮最後一家舖子！', '玉皇大帝身邊的物資，可都是頂級貨。', '備足補給，全力迎戰天帝！'], shop:'lingxiao' },
    ],
    startX:9, startY:1,
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

// ── Supabase config ────────────────────────────────────────
const _SUPA_URL = 'https://wbamdjgcoezevimohlcb.supabase.co';
const _SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW1kamdjb2V6ZXZpbW9obGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mzk1NDQsImV4cCI6MjA5MTExNTU0NH0.0YZUVDiCFYVDMDo20aG4sSBcON8SXoET6vEiX5NCEbs';

// ── Auth (Supabase Google OAuth) ───────────────────────────
const Auth = {
  AUTH_KEY: 'xianxia_auth_v1',
  _session: null,

  async init() {
    // Check URL hash for OAuth callback tokens (#access_token=...&type=signup)
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const p = new URLSearchParams(hash.slice(1));
      const token = p.get('access_token');
      const refresh = p.get('refresh_token');
      if (token) {
        history.replaceState(null, '', window.location.pathname);
        await this._setToken(token, refresh);
        return;
      }
    }
    // Restore from localStorage
    try {
      const raw = localStorage.getItem(this.AUTH_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        // Verify token is still valid (not expired)
        if (s?.access_token && s?.expires_at && Date.now() < s.expires_at * 1000) {
          this._session = s;
          return;
        }
        // Try refresh token
        if (s?.refresh_token) {
          await this._refresh(s.refresh_token);
          return;
        }
      }
    } catch {}
    this._session = null;
  },

  async _setToken(token, refresh) {
    try {
      const r = await fetch(`${_SUPA_URL}/auth/v1/user`, {
        headers: { 'apikey': _SUPA_KEY, 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) { this._session = null; return; }
      const user = await r.json();
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      this._session = { access_token: token, refresh_token: refresh, user, expires_at: payload.exp };
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(this._session));
    } catch { this._session = null; }
  },

  async _refresh(refreshToken) {
    try {
      const r = await fetch(`${_SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': _SUPA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!r.ok) { this._session = null; localStorage.removeItem(this.AUTH_KEY); return; }
      const d = await r.json();
      await this._setToken(d.access_token, d.refresh_token);
    } catch { this._session = null; }
  },

  // Send 6-digit OTP to email (no redirect needed)
  async sendOtp(email) {
    try {
      const r = await fetch(`${_SUPA_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: { 'apikey': _SUPA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, create_user: true }),
      });
      return r.ok || r.status === 429;  // 429 = already sent recently, still ok UX-wise
    } catch { return false; }
  },

  // Verify the 6-digit code → returns true and sets session on success
  async verifyOtp(email, token) {
    try {
      const r = await fetch(`${_SUPA_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'apikey': _SUPA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, type: 'email' }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      if (!d.access_token) return false;
      await this._setToken(d.access_token, d.refresh_token);
      return true;
    } catch { return false; }
  },

  async signOut() {
    if (this._session?.access_token) {
      await fetch(`${_SUPA_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': _SUPA_KEY, 'Authorization': `Bearer ${this._session.access_token}` },
      }).catch(() => {});
    }
    this._session = null;
    localStorage.removeItem(this.AUTH_KEY);
  },

  isLoggedIn() { return !!(this._session?.user?.id); },
  userId()    { return this._session?.user?.id || null; },
  email()     { return this._session?.user?.email || null; },
  displayName() {
    const m = this._session?.user?.user_metadata;
    return m?.full_name || m?.name || this.email() || null;
  },
  token()     { return this._session?.access_token || _SUPA_KEY; },
};

// ── Save ───────────────────────────────────────────────────
const Save = {
  LOCAL_KEY:   'xianxia_rpg_v2',
  SESSION_KEY: 'xianxia_session_id',

  // When logged in use Google user ID; otherwise use anonymous UUID
  _sid() {
    if (Auth.isLoggedIn()) return Auth.userId();
    let id = localStorage.getItem(this.SESSION_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(this.SESSION_KEY, id); }
    return id;
  },
  _headers() {
    return {
      'apikey':        _SUPA_KEY,
      'Authorization': `Bearer ${Auth.token()}`,
      'Content-Type':  'application/json',
    };
  },
  _local() {
    try { return JSON.parse(localStorage.getItem(this.LOCAL_KEY)) || [null,null,null]; }
    catch(e) { return [null,null,null]; }
  },
  _saveLocal(slots) { localStorage.setItem(this.LOCAL_KEY, JSON.stringify(slots)); },

  read(slot)  { return this._local()[slot]; },

  write(slot, data) {
    const slots = this._local();
    slots[slot] = data;
    this._saveLocal(slots);
    fetch(`${_SUPA_URL}/rest/v1/game_saves?on_conflict=session_id,slot`, {
      method:  'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ session_id: this._sid(), slot, data, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  },

  async syncFromCloud() {
    try {
      const r = await fetch(
        `${_SUPA_URL}/rest/v1/game_saves?session_id=eq.${this._sid()}&select=slot,data&order=slot`,
        { headers: this._headers() }
      );
      if (!r.ok) return false;
      const rows = await r.json();
      if (!rows.length) return false;
      const slots = this._local();
      rows.forEach(({ slot, data }) => { slots[slot] = data; });
      this._saveLocal(slots);
      return true;
    } catch(e) { return false; }
  },
};

// ── Achievements ──────────────────────────────────────────
const ACHIEVEMENTS = {
  first_blood:  { name:'初見殺',     icon:'⚔️',  desc:'贏得第一場戰鬥。' },
  boss_slayer:  { name:'天命得成',   icon:'👑',  desc:'擊敗黃眉大王，完成天命。' },
  full_party:   { name:'三人聚義',   icon:'🧙',  desc:'召集土地與楊嬋加入隊伍。' },
  gold_100:     { name:'靈石積累',   icon:'💰',  desc:'持有 100 靈石。' },
  gold_1000:    { name:'腰纏萬貫',   icon:'💎',  desc:'持有 1000 靈石。' },
  level_5:      { name:'初窺法力',   icon:'⭐',  desc:'任意角色升到 5 級。' },
  level_10:     { name:'棍驚天地',   icon:'🌟',  desc:'任意角色升到 10 級。' },
  all_maps:     { name:'踏遍山河',   icon:'🗺️',  desc:'探訪三張地圖。' },
  survivor:     { name:'九死一生',   icon:'❤️',  desc:'以 1 HP 存活贏得戰鬥。' },
  shop_addict:  { name:'行商常客',   icon:'🛒',  desc:'累計購物 5 次。' },
  healer:       { name:'妙手回春',   icon:'💚',  desc:'使用 10 次治療技能。' },
  ngplus:       { name:'二周目',     icon:'★',   desc:'開始新遊戲+，重踏征途。' },
  silver_king:  { name:'降魔伏妖',   icon:'⚡',  desc:'擊敗盤絲洞的銀角大王。' },
  no_damage:    { name:'銅牆鐵壁',   icon:'🛡️', desc:'全員滿HP贏得一場戰鬥。' },
  poisoner:     { name:'毒手',       icon:'☠️', desc:'以毒擊倒妖物。' },
  dragon_king:  { name:'制霸龍宮',   icon:'🐉',  desc:'擊敗東海龍王，取得龍珠。' },
  completionist:{ name:'除妖大功德', icon:'🌠',  desc:'擊敗四位Boss，除妖功德圓滿。' },
  level_max:    { name:'通天境界',   icon:'💫',  desc:'任意角色達到 15 級。' },
  speed_run:    { name:'天命神速',   icon:'🚀',  desc:'在 30 分鐘內完成天命。' },
  all_chests:   { name:'尋寶達人',   icon:'📦',  desc:'開啟 5 個隱藏寶箱。' },
  big_spender:  { name:'一擲千金',   icon:'💸',  desc:'累計消費 1000 靈石。' },
  pacifist:     { name:'慈悲為懷',   icon:'🕊️', desc:'累計逃跑 5 次。' },
  chain_master: { name:'元素共鳴師', icon:'🔥',  desc:'觸發 3 次元素連鎖反應。' },
  limit_breaker:{ name:'極限突破者', icon:'💥',  desc:'使用必殺技 3 次。' },
  purifier:     { name:'神光淨化者', icon:'✨',  desc:'使用淨化靈光解除異常狀態。' },
  jade_king:    { name:'破天之人',   icon:'⚡',  desc:'擊敗靈霄殿玉皇大帝，問鼎天庭。' },
  all_realms:   { name:'三界無敵',   icon:'🌟',  desc:'擊敗所有Boss包括玉皇大帝。' },
};

const Achieve = {
  KEY: 'xianxia_ach_v1',

  _load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch(e) { return {}; }
  },
  _save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },

  isUnlocked(id) { return !!this._load()[id]; },

  unlock(id) {
    if (!ACHIEVEMENTS[id]) return;
    const data = this._load();
    if (data[id]) return;
    data[id] = new Date().toISOString();
    this._save(data);
    // Push to Supabase if logged in
    if (Auth.isLoggedIn()) {
      fetch(`${_SUPA_URL}/rest/v1/achievements`, {
        method: 'POST',
        headers: {
          'apikey': _SUPA_KEY, 'Authorization': `Bearer ${Auth.token()}`,
          'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({ user_id: Auth.userId(), achievement_id: id, unlocked_at: data[id] }),
      }).catch(() => {});
    }
    // Fire notification event
    window.dispatchEvent(new CustomEvent('xian:achievement', { detail: ACHIEVEMENTS[id] }));
  },

  getAll() {
    const unlocked = this._load();
    return Object.entries(ACHIEVEMENTS).map(([id, ach]) => ({
      id, ...ach, unlocked: !!unlocked[id], at: unlocked[id] || null,
    }));
  },

  async syncFromCloud() {
    if (!Auth.isLoggedIn()) return;
    try {
      const r = await fetch(
        `${_SUPA_URL}/rest/v1/achievements?user_id=eq.${Auth.userId()}&select=achievement_id`,
        { headers: { 'apikey': _SUPA_KEY, 'Authorization': `Bearer ${Auth.token()}` } }
      );
      if (!r.ok) return;
      const rows = await r.json();
      const data = this._load();
      rows.forEach(({ achievement_id }) => { if (!data[achievement_id]) data[achievement_id] = true; });
      this._save(data);
    } catch(e) {}
  },
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

// ── Quest definitions ────────────────────────────────────
const QUESTS = [
  { id:'q1', name:'黑山村的呼喚', desc:'到達黑山村，了解妖亂起源。',
    done: () => true },
  { id:'q2', name:'三人同行',     desc:'在幽竹林招募靈兒與月華。',
    done: () => GS.party.length >= 3 },
  { id:'q3', name:'穿越黃風嶺',   desc:'深入黃風嶺探查妖兵動向。',
    done: () => ['castle','dungeon','shrine'].includes(GS.map) || !!GS.flags.visitedCastle },
  { id:'q4', name:'降服虎先鋒',   desc:'擊敗守衛盤絲洞的虎先鋒。',
    done: () => !!GS.flags.defeatedDragon },
  { id:'q5', name:'討伐黃眉大王', desc:'前往小西天，終結黃眉大王之禍。',
    done: () => !!GS.flags.defeated_boss },
  { id:'q6', name:'東海龍宮',     desc:'進入龍宮，擊敗東海龍王，取得龍珠。',
    done: () => !!GS.flags.defeated_dragonKing },
  { id:'q7', name:'除妖大功德',   desc:'四大Boss盡皆伏誅，天下太平。',
    done: () => ['defeated_boss','defeated_silverKing','defeated_dragonKing'].every(f=>GS.flags[f]) && !!GS.flags.defeatedDragon },
  { id:'q8', name:'尋寶獵人',     desc:'在各地圖中找到隱藏寶箱。',
    done: () => Object.keys(GS.flags?.chests||{}).length >= 3 },
  { id:'q9', name:'靈石富翁',     desc:'累積持有 500 靈石以上。',
    done: () => (GS.gold||0) >= 500 },
  { id:'q10',name:'修行有成',     desc:'全隊伍任意角色達到 8 級以上。',
    done: () => GS.party.some(m=>(m.lv||1)>=8) },
  { id:'q11',name:'見識百妖',     desc:'遭遇六種以上的妖物。',
    done: () => Object.keys(GS.flags?._enemySeen||{}).length >= 6 },
  { id:'q12',name:'元素相剋',     desc:'發現並觸發元素連鎖反應。',
    done: () => (GS.flags?._chainCount||0) >= 1 },
  { id:'q13',name:'必殺三連',     desc:'使用必殺技三次。',
    done: () => (GS.flags?._limitCount||0) >= 3 },
  { id:'q14',name:'淨化之道',     desc:'以淨化靈光解除隊友異常狀態。',
    done: () => (GS.flags?._purifyCount||0) >= 1 },
];
