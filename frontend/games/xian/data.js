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
            skills:['slash','piercing','windBlade'],
            desc:'身負天命，持金箍棒踏上除妖之路，傳承齊天大聖意志的孤勇者。' },
  linger: { id:'linger', name:'土地',   title:'山神使者', color:0x80c040, shape:'mage',
            hp:80,  mp:120, atk:10, def:8,  spd:18, luk:15,
            skills:['fireball','iceArrow','heal','thunder'],
            desc:'主管一方的山神土地，法術精通，感應天命而主動加入除妖行列。' },
  yuehua: { id:'yuehua', name:'楊嬋',   title:'天神弓手', color:0x60c8ff, shape:'archer',
            hp:90,  mp:60,  atk:20, def:10, spd:20, luk:20,
            skills:['shoot','multiShot','poisonArrow','moonLight'],
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
  ancientJade: { name:'混天綾',     cat:'eq',  slot:'ac', def:12, luk:20, price:800, desc:'+12防禦，+20幸運，哪吒法寶。' },
};

const SHOP_STOCK = {
  village: ['herb','elixir','ironSword','ironBow','woodStaff','leatherArmor'],
  forest:  ['herb','elixir','redPotion','steelSword','ironArmor'],
  castle:  ['redPotion','fullElixir','revive','jadeSword','moonBow','crystalStaff','silkRobe','jade'],
  cave:    ['redPotion','fullElixir','revive','elixir','ironArmor'],
  shrine:  ['fullElixir','revive','spiritBlade','moonStaff','starBow','dragonArmor','ancientJade'],
};

const ENEMIES = {
  wolf:     { name:'黑熊精', hp:60,  atk:12, def:5,  spd:14, exp:30,  gold:15, color:0x302018, sz:28, acts:['bite','bite','howl'],        drops:[{id:'herb',r:0.4}] },
  bandit:   { name:'山賊頭', hp:80,  atk:15, def:8,  spd:11, exp:45,  gold:30, color:0x7a2810, sz:28, acts:['slash','slash','rob'],        drops:[{id:'herb',r:0.3},{id:'elixir',r:0.1}] },
  skeleton: { name:'冥兵',   hp:100, atk:18, def:12, spd:8,  exp:60,  gold:25, color:0xb0a888, sz:28, acts:['slash','boneCrush','slash'],  drops:[{id:'herb',r:0.2}], undead:true },
  snake:    { name:'蛇蟒精', hp:120, atk:20, def:10, spd:18, exp:80,  gold:40, color:0x205010, sz:28, acts:['bite','poisonSpray','bite'],  drops:[{id:'herb',r:0.5},{id:'elixir',r:0.2}] },
  ghost:    { name:'怨靈',   hp:90,  atk:22, def:6,  spd:20, exp:90,  gold:35, color:0x7040c0, sz:28, acts:['curse','drain','curse'],      drops:[{id:'elixir',r:0.3}] },
  demon:    { name:'妖兵',   hp:140, atk:25, def:15, spd:12, exp:110, gold:55, color:0xb01010, sz:32, acts:['slash','slam','slash'],       drops:[{id:'redPotion',r:0.2}] },
  dragon:   { name:'虎先鋒', hp:200, atk:32, def:20, spd:10, exp:180, gold:100,color:0xe06010, sz:40, acts:['bite','fireBreath','tail'],   drops:[{id:'redPotion',r:0.4},{id:'fullElixir',r:0.3}] },
  boss:     { name:'黃眉大王',hp:400, atk:40, def:25, spd:8,  exp:0,   gold:0,  color:0xc09010, sz:48, acts:['slam','curse','aoe','slam'],  drops:[], boss:true },
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
  fireBreath: { name:'虎嘯火焰', pow:1.6, type:'atk', tgt:'all',    elem:'fire' },
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
      { x:2, y:2, id:'v1', gold:80 },
      { x:17,y:2, id:'v2', item:'herb' },
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
      { x:5,y:2,  name:'老猴子', dlg:['你可是那天命之人？', '黃眉大王橫行各地，妖氣漫天，', '此劫非你不能解！'] },
      { x:14,y:2, name:'行商',   dlg:['老夫走遍山河，你要些什麼？'], shop:'village' },
      { x:9, y:9, name:'土地廟', dlg:['〔石碑刻字〕', '幽竹林中有位山神土地，', '他知曉除妖之道，可助天命人。'] },
      { x:14,y:7, name:'客棧掌柜',dlg:['旅人辛苦了，住一晚50靈石，', '讓你精力恢復，明日繼續征途。'], inn:50 },
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
      { x:10,y:7, name:'土地', dlg:['吾乃此地山神土地。', '天命之人！我感應到你的到來，', '願隨你共討黃眉大王！'], join:'linger' },
      { x:5, y:7, name:'仙使', dlg:['楊嬋仙姑在竹林更深處。', '她說天命之人終有一天會來。'] },
      { x:14,y:7, name:'楊嬋', dlg:['天命之人！終於找到你了！', '我楊嬋下凡便是為此，', '讓我助你征討黃眉大王！'], join:'yuehua' },
    ],
    startX:9, startY:1,
  },
  castle: {
    name:'黃風嶺', music:'castle',
    exits:[
      { x:1,y:7,  to:'village', toX:17, toY:7, msg:'返回黑山村' },
    ],
    chests:[
      { x:18,y:1, id:'c1', gold:200 },
      { x:18,y:13,id:'c2', item:'redPotion' },
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
      { x:5, y:6,  name:'行商',     dlg:['這風沙太大了！你還好嗎？', '我有最好的裝備，快來看！'], shop:'castle' },
      { x:14,y:6,  name:'老僧',     dlg:['黃眉大王就在嶺上最深處。', '他竊取如來佛寶物，擅自稱王，', '天命之人，此乃你的使命！'] },
      { x:10,y:1,  name:'黃眉大王', dlg:['哈哈哈！天命之人終於來了！', '本大王乃彌勒佛座下弟子，', '今日便讓你見識佛法真威！'], boss:'boss', trigger:'flags.defeatedDragon' },
    ],
    startX:2, startY:7,
  },
  cave: {
    name:'盤絲洞', music:'dungeon',
    exits:[
      { x:19,y:7, to:'forest',  toX:1,  toY:7, msg:'返回幽竹林' },
      { x:9, y:14,to:'shrine',  toX:9,  toY:1, msg:'進入小西天' },
    ],
    chests:[
      { x:5, y:11,id:'ca1', item:'fullElixir' },
      { x:14,y:3, id:'ca2', gold:300 },
    ],
    enc:{ rate:0.25, enemies:['ghost','demon','dragon'] },
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
      { x:5, y:7, name:'被困僧人', dlg:['此乃蜘蛛精盤絲洞…', '往南面有通往小西天之路！', '天命之人，快去吧！'] },
      { x:14,y:7, name:'石壁刻文', dlg:['〔壁上刻著〕', '蜘蛛精盤踞於此，妖氣沖天。', '南門通往小西天，彌勒道場所在。'] },
      { x:9, y:3, name:'行商',     dlg:['這鬼地方真嚇人…', '最後一批貨，你要的話快買！'], shop:'cave' },
    ],
    startX:18, startY:7,
  },
  shrine: {
    name:'小西天', music:'shrine',
    exits:[
      { x:9, y:0, to:'cave', toX:9, toY:13, msg:'返回盤絲洞' },
    ],
    chests:[
      { x:2, y:12,id:'sh1', item:'revive' },
      { x:17,y:12,id:'sh2', item:'ancientJade' },
      { x:9, y:7, id:'sh3', gold:500 },
    ],
    enc:{ rate:0.22, enemies:['demon','dragon','skeleton'] },
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
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    ],
    npcs:[
      { x:9, y:7,  name:'金身羅漢', dlg:['此乃彌勒佛道場小西天。', '黃眉大王反出師門，竊取佛寶，', '天命之人，此劫靠你解決！'] },
      { x:5, y:7,  name:'阿羅漢',   dlg:['黃眉大王法力高強，', '其禪杖能震碎山嶽，禪定珠能困縛萬物。', '做好萬全準備再去決戰！'] },
      { x:14,y:7,  name:'掌寶人',   dlg:['你已有足夠的力量！', '贈你此神器，可助你斬妖除魔！'], shop:'shrine' },
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
