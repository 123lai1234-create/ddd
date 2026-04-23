'use strict';
// ═══════════════════════════════════════════════════════
//  仙俠傳 · 完整回合制 RPG  (Part 1: Data)
// ═══════════════════════════════════════════════════════

const C = {
  bg:'#08060e', panel:'rgba(8,4,18,0.97)', panelBorder:'#7a5c1e',
  gold:'#e8c060', gold2:'#ffd700', text:'#f0e6c8', muted:'#9a8060',
  red:'#e05050', blue:'#5080e8', green:'#50c878', purple:'#c050e8',
  hp:'#e05050', mp:'#5080e8', exp:'#50c878',
  grass:'#2a5218', grass2:'#336622', tree:'#193810', tree2:'#224d14',
  water:'#1a3468', water2:'#1e3d78', path:'#7a6545', wall:'#3c2d1e',
  floor:'#2a1e12', door:'#8b6914', npc:'#d4b060',
};

// ── Characters ──────────────────────────────────────────
const CHAR_BASE = {
  yunyi:  { id:'yunyi',  name:'雲逸',  title:'青雲劍客', color:'#4a9eff', shape:'sword',
            hp:120,mp:40, atk:18,def:12,spd:15,luk:10,
            skills:['slash','piercing','windBlade'],
            desc:'青雲村少年，習得雲霄劍法，立志斬妖除魔。' },
  linger: { id:'linger', name:'靈兒',  title:'靈族後裔', color:'#e050c8', shape:'mage',
            hp:80, mp:120,atk:10,def:8, spd:18,luk:15,
            skills:['fireball','iceArrow','heal','thunder'],
            desc:'神秘靈族少女，天生通靈，精通五行法術。' },
  yuehua: { id:'yuehua', name:'月華',  title:'飛羽弓手', color:'#50e8a0', shape:'archer',
            hp:90, mp:60, atk:20,def:10,spd:20,luk:20,
            skills:['shoot','multiShot','poisonArrow','moonLight'],
            desc:'出身獵戶之家，箭術無雙，身法輕盈如飛燕。' },
};

const SKILLS = {
  slash:       {name:'雲霄斬',  mp:0,  pow:1.2, type:'atk', tgt:'single', elem:'none', desc:'基本斬擊，必中。'},
  piercing:    {name:'穿雲刺',  mp:8,  pow:1.8, type:'atk', tgt:'single', elem:'none', pierce:0.4, desc:'無視 40% 防禦的貫穿一擊。'},
  windBlade:   {name:'旋風劍舞',mp:16, pow:1.3, type:'atk', tgt:'all',    elem:'wind', desc:'揮出風刃斬擊所有敵人。'},
  fireball:    {name:'火球術',  mp:10, pow:1.6, type:'atk', tgt:'single', elem:'fire', desc:'召喚火球轟擊敵人。'},
  iceArrow:    {name:'冰矢術',  mp:10, pow:1.3, type:'atk', tgt:'single', elem:'ice',  debuff:{slow:2}, desc:'命中有機率使敵人行動遲緩。'},
  heal:        {name:'靈光術',  mp:12, pow:1.4, type:'heal',tgt:'single', elem:'light',desc:'恢復一位夥伴的生命值。'},
  thunder:     {name:'雷鳴術',  mp:20, pow:2.0, type:'atk', tgt:'all',    elem:'thunder',desc:'召喚天雷轟擊所有敵人。'},
  shoot:       {name:'飛羽箭',  mp:0,  pow:1.3, type:'atk', tgt:'single', elem:'none', desc:'精準射擊。'},
  multiShot:   {name:'連珠箭',  mp:12, pow:0.8, type:'atk', tgt:'all',    elem:'none', hits:3, desc:'連射三箭攻擊所有敵人。'},
  poisonArrow: {name:'毒箭',   mp:8,  pow:1.2, type:'atk', tgt:'single', elem:'none', debuff:{poison:3}, desc:'命中令敵人中毒。'},
  moonLight:   {name:'月華照',  mp:18, pow:1.2, type:'heal',tgt:'all',    elem:'light',desc:'月光降臨，恢復全體夥伴生命值。'},
};

const ITEMS = {
  herb:       {name:'草藥',      cat:'use', hp:80,   price:30,  desc:'恢復 80 點生命值。'},
  elixir:     {name:'靈露',      cat:'use', mp:50,   price:50,  desc:'恢復 50 點靈力。'},
  redPotion:  {name:'大還丹',    cat:'use', hp:200,  price:120, desc:'恢復 200 點生命值。'},
  fullElixir: {name:'天靈露',    cat:'use', mp:100,  price:150, desc:'恢復 100 點靈力。'},
  revive:     {name:'起死回生丹',cat:'use', revive:50,price:250,desc:'救活昏迷夥伴並恢復 50% 生命值。'},
  ironSword:  {name:'鐵劍',      cat:'eq',  slot:'wp',who:'yunyi', atk:10,price:80,  desc:'+10 攻擊力。'},
  steelSword: {name:'精鋼劍',    cat:'eq',  slot:'wp',who:'yunyi', atk:22,price:250, desc:'+22 攻擊力。'},
  jadeSword:  {name:'玉靈劍',    cat:'eq',  slot:'wp',who:'yunyi', atk:40,price:600, desc:'+40 攻擊力。'},
  woodStaff:  {name:'木靈杖',    cat:'eq',  slot:'wp',who:'linger',atk:5, mp:20,price:80,  desc:'+5 攻擊，+20 靈力上限。'},
  crystalStaff:{name:'水晶法杖', cat:'eq',  slot:'wp',who:'linger',atk:12,mp:40,price:280, desc:'+12 攻擊，+40 靈力上限。'},
  ironBow:    {name:'鐵弓',      cat:'eq',  slot:'wp',who:'yuehua',atk:12,price:90,  desc:'+12 攻擊力。'},
  moonBow:    {name:'月牙弓',    cat:'eq',  slot:'wp',who:'yuehua',atk:28,price:300, desc:'+28 攻擊力，提升暴擊率。'},
  leatherArmor:{name:'皮甲',     cat:'eq',  slot:'ar',            def:8, price:60,  desc:'+8 防禦力。'},
  ironArmor:  {name:'鐵甲',      cat:'eq',  slot:'ar',            def:18,price:200, desc:'+18 防禦力。'},
  silkRobe:   {name:'靈絲袍',    cat:'eq',  slot:'ar',            def:10,mp:30,price:180,desc:'+10 防禦，+30 靈力上限。'},
  jade:       {name:'翡翠玉佩',  cat:'eq',  slot:'ac',            def:5, luk:10,price:150,desc:'+5 防禦，+10 幸運。'},
};

const SHOP_STOCK = {
  village: ['herb','elixir','ironSword','ironBow','woodStaff','leatherArmor'],
  forest:  ['herb','elixir','redPotion','steelSword','ironArmor'],
  castle:  ['redPotion','fullElixir','revive','jadeSword','moonBow','crystalStaff','silkRobe','jade'],
};

// ── Enemies ──────────────────────────────────────────────
const ENEMIES = {
  wolf:     {name:'野狼',     hp:60, atk:12,def:5, spd:14,exp:30, gold:15, color:'#8b7355',sz:1,
             acts:['bite','bite','howl'], drops:[{id:'herb',r:0.4}]},
  bandit:   {name:'山賊',     hp:80, atk:15,def:8, spd:11,exp:45, gold:30, color:'#8b3030',sz:1.1,
             acts:['slash','slash','rob'], drops:[{id:'herb',r:0.3},{id:'elixir',r:0.1}]},
  skeleton: {name:'骷髏兵',   hp:100,atk:18,def:12,spd:8, exp:60, gold:25, color:'#c8b89a',sz:1.1,
             acts:['slash','boneCrush','slash'],drops:[{id:'herb',r:0.2}],undead:true},
  snake:    {name:'毒蛇妖',   hp:120,atk:20,def:10,spd:18,exp:80, gold:40, color:'#40b840',sz:1.2,
             acts:['bite','poisonSpray','bite'],drops:[{id:'herb',r:0.5},{id:'elixir',r:0.2}]},
  ghostFire:{name:'鬼火',     hp:90, atk:22,def:6, spd:20,exp:70, gold:35, color:'#8050ff',sz:0.9,
             acts:['shadowBolt','curse','shadowBolt'],drops:[{id:'elixir',r:0.3}]},
  demonSoldier:{name:'魔族士兵',hp:160,atk:28,def:18,spd:12,exp:120,gold:60,color:'#c83030',sz:1.3,
             acts:['demonSlash','slash','demonSlash'],drops:[{id:'redPotion',r:0.2},{id:'herb',r:0.4}]},
  snakeBoss:{name:'蛇妖首領', hp:400,atk:30,def:20,spd:16,exp:300,gold:150,color:'#30c830',sz:2,
             acts:['bite','poisonSpray','constrict','poisonSpray'],isBoss:true,
             drops:[{id:'fullElixir',r:1},{id:'moonBow',r:1}]},
  demonLord:{name:'魔王',     hp:800,atk:50,def:35,spd:18,exp:1000,gold:500,color:'#ff2020',sz:2.5,
             acts:['demonSlash','darkFlame','cursedBlast','demonRegen'],isBoss:true,drops:[]},
};

const ENEMY_ACTS = {
  bite:       {name:'撕咬',     pow:1.2,type:'atk',tgt:'single'},
  howl:       {name:'嚎叫',     pow:0,  type:'self',buff:{atk:5}},
  slash:      {name:'斬擊',     pow:1.3,type:'atk',tgt:'single'},
  rob:        {name:'搶劫',     pow:0.8,type:'atk',tgt:'single'},
  boneCrush:  {name:'骨擊',     pow:1.7,type:'atk',tgt:'single'},
  poisonSpray:{name:'毒霧噴射', pow:0.8,type:'atk',tgt:'all',debuff:{poison:3}},
  curse:      {name:'詛咒',     pow:0,  type:'debuff',tgt:'single',debuff:{atkDown:2}},
  shadowBolt: {name:'暗影衝擊', pow:1.8,type:'atk',tgt:'single'},
  demonSlash: {name:'魔刃斬',   pow:2.0,type:'atk',tgt:'single'},
  constrict:  {name:'絞殺',     pow:1.5,type:'atk',tgt:'single',debuff:{stun:1}},
  darkFlame:  {name:'黑炎衝擊', pow:2.2,type:'atk',tgt:'all'},
  cursedBlast:{name:'詛咒爆炎', pow:2.8,type:'atk',tgt:'single',debuff:{curse:3}},
  demonRegen: {name:'魔力回復', pow:0,  type:'selfheal',val:150},
};

// ── Maps ─────────────────────────────────────────────────
// Tile: 0=path 1=wall 2=grass 3=tree 4=water 5=floor 6=door
const MAPS = {
  village:{
    name:'青雲村', enc:0, music:'village',
    w:20,h:15,
    data:[
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
      [3,2,2,0,0,0,0,2,2,2,2,2,2,2,0,0,0,2,2,3],
      [3,2,2,0,1,1,0,2,2,2,2,2,2,2,0,1,1,0,2,3],
      [3,2,2,0,1,1,0,2,2,2,2,2,2,2,0,1,1,0,2,3],
      [3,2,2,0,6,0,0,2,2,2,2,2,2,2,0,6,1,0,2,3],
      [3,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3],
      [3,2,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,2,3],
      [3,2,2,1,1,1,1,2,2,0,0,2,2,1,1,1,1,2,2,3],
      [3,2,2,1,5,5,6,2,2,0,0,2,2,1,5,5,6,2,2,3],
      [3,2,2,1,5,5,1,2,2,0,0,2,2,1,5,5,1,2,2,3],
      [3,2,2,2,0,0,2,2,2,0,0,2,2,2,0,0,2,2,2,3],
      [3,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3],
      [3,2,2,2,2,2,2,2,4,4,4,4,4,2,2,2,2,2,2,3],
      [3,2,2,2,2,2,2,2,4,4,4,4,4,2,2,2,2,2,2,3],
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    ],
    start:{x:9,y:6},
    exits:[
      {x:9, y:0, to:'forest',tx:9, ty:13},
      {x:10,y:0, to:'forest',tx:10,ty:13},
    ],
    npcs:[
      {id:'elder',    x:10,y:6, name:'長老',    color:'#d4a017',dlg:'elder'},
      {id:'shop',     x:5, y:8, name:'藥材店',  color:'#8b6914',dlg:'shop',  isShop:true,  stock:'village'},
      {id:'inn',      x:15,y:8, name:'客棧',    color:'#6b8e6b',dlg:'inn',   isInn:true},
      {id:'villager', x:12,y:6, name:'村民',    color:'#9a8060',dlg:'villager1'},
    ],
  },
  forest:{
    name:'迷霧森林', enc:0.08, music:'forest',
    w:20,h:15,
    data:[
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,3,3,3,3,0,0,0,0,0,0,0,0,0,3,3,3,3,3,3],
      [3,3,3,3,0,0,3,3,3,3,3,3,3,0,0,3,3,3,3,3],
      [3,3,3,0,0,3,3,3,3,3,3,3,3,3,0,0,3,3,3,3],
      [3,3,3,0,3,3,3,4,4,4,4,4,3,3,3,0,3,3,3,3],
      [3,3,3,0,3,3,3,4,2,2,2,4,3,3,3,0,3,3,3,3],
      [3,3,3,0,3,3,3,4,2,2,2,4,3,3,3,0,3,3,3,3],
      [3,3,3,0,3,3,3,4,4,4,4,4,3,3,3,0,3,3,3,3],
      [3,3,3,3,0,0,3,3,3,3,3,3,3,0,0,3,3,3,3,3],
      [3,3,3,3,3,0,0,0,0,0,0,0,0,0,3,3,3,3,3,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,3,3,3,3,3,3,3,3,0,0,3,3,3,3,3,3,3,3,3],
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    ],
    start:{x:9,y:13},
    exits:[
      {x:9, y:14,to:'village',tx:9, ty:1},
      {x:10,y:14,to:'village',tx:10,ty:1},
      {x:9, y:0, to:'castle', tx:9, ty:13},
      {x:10,y:0, to:'castle', tx:10,ty:13},
    ],
    npcs:[
      {id:'linger', x:9,y:7, name:'靈兒', color:'#e050c8', dlg:'linger_meet', joinChar:'linger'},
      {id:'snakeBoss',x:9,y:2,name:'', dlg:'boss_snake', bossId:'snakeBoss'},
    ],
    enemies:['wolf','bandit','snake','ghostFire'],
  },
  castle:{
    name:'魔王城', enc:0.10, music:'castle',
    w:20,h:15,
    data:[
      [1,1,1,1,1,1,1,1,1,6,6,1,1,1,1,1,1,1,1,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,1,1,5,5,5,5,5,5,5,1,1,5,5,5,5,1],
      [1,5,5,5,1,1,5,5,5,5,5,5,5,1,1,5,5,5,5,1],
      [1,5,5,5,6,5,5,5,5,5,5,5,5,5,6,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,1,1,5,5,1,1,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,5,5,5,5,5,5,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,5,5,5,5,5,5,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,1,1,1,6,6,1,1,1,5,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,5,5,5,1,1,5,5,5,5,5,5,5,1,1,5,5,5,5,1],
      [1,5,5,5,1,1,5,5,5,5,5,5,5,1,1,5,5,5,5,1],
      [1,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,1],
      [1,1,1,1,1,1,1,1,1,6,6,1,1,1,1,1,1,1,1,1],
    ],
    start:{x:9,y:13},
    exits:[
      {x:9, y:14,to:'forest',tx:9, ty:1},
      {x:10,y:14,to:'forest',tx:10,ty:1},
    ],
    npcs:[
      {id:'yuehua',  x:5, y:10,name:'月華',  color:'#50e8a0',dlg:'yuehua_meet',joinChar:'yuehua'},
      {id:'shop2',   x:17,y:10,name:'神秘商人',color:'#d4a017',dlg:'shop',isShop:true,stock:'castle'},
      {id:'demonLord',x:9,y:1,name:'',dlg:'boss_demon',bossId:'demonLord'},
    ],
    enemies:['skeleton','demonSoldier','ghostFire'],
  },
};

// ── Dialogues ────────────────────────────────────────────
const DLGS = {
  elder:[
    {sp:'長老',t:'雲逸啊，你終於來了。魔族的黑氣已籠罩迷霧森林，村民們惶惶不安。'},
    {sp:'長老',t:'傳說森林深處有一蛇妖首領，正是一切禍端的根源，快去制止牠吧！'},
    {sp:'長老',t:'記得補充好物資再出發，客棧可以恢復體力，藥材店備有充足的藥品。'},
    {sp:'雲逸',t:'長老放心，我定會護衛青雲村的平安！'},
  ],
  shop:[{sp:'店主',t:'歡迎光臨！請問需要什麼？',isShop:true}],
  inn: [{sp:'客棧主人',t:'歡迎投宿！一宿 50 金幣，可完全恢復全隊的體力與靈力。',isInn:true}],
  villager1:[
    {sp:'村民',t:'英雄啊！聽說森林裡有妖邪作祟，您要多加小心啊！'},
    {sp:'雲逸',t:'（村子裡的人都很擔心。我一定要盡快解決這件事。）'},
  ],
  linger_meet:[
    {sp:'靈兒',t:'你…你是第一個能在迷霧中找到我的人。'},
    {sp:'雲逸',t:'妳沒事吧？這片森林危機四伏，一個人很危險。'},
    {sp:'靈兒',t:'我叫靈兒，靈族後裔。我在追查一股邪氣，和你的目標應該一樣。'},
    {sp:'靈兒',t:'讓我加入你的隊伍吧！我的法術可以對你很有助益。',isJoin:true,joinChar:'linger'},
  ],
  boss_snake:[
    {sp:'蛇妖首領',t:'嘶……人類竟敢入侵我的領地！'},
    {sp:'靈兒',t:'就是你在散布毒氣！還不快現出原形！'},
    {sp:'蛇妖首領',t:'魔王大人的意志豈是你們凡人能阻擋的！嘶——',isBattle:true,bossId:'snakeBoss'},
  ],
  yuehua_meet:[
    {sp:'月華',t:'喂！你是來對付魔王的嗎？我已被困在這城裡三天了！'},
    {sp:'雲逸',t:'妳是誰？怎麼會在魔王城裡？'},
    {sp:'月華',t:'我叫月華，是追蹤魔族到此的弓手。讓我一起去解決魔王！'},
    {sp:'月華',t:'我的箭術絕對是你的好幫手，就這麼說定了！',isJoin:true,joinChar:'yuehua'},
  ],
  boss_demon:[
    {sp:'魔王',t:'渺小的人類！你們竟然突破重重阻礙來到這裡！'},
    {sp:'雲逸',t:'為了青雲村，為了所有無辜的人——受死！'},
    {sp:'靈兒',t:'邪惡必將覆滅！'},
    {sp:'月華',t:'我的箭為正義而射！'},
    {sp:'魔王',t:'哈哈哈！那就讓你們嘗嘗真正的魔力！',isBattle:true,bossId:'demonLord'},
  ],
  after_snake:[
    {sp:'靈兒',t:'蛇妖首領已被擊敗！但根據我的感知，更大的邪氣來自更北方……'},
    {sp:'雲逸',t:'繼續前進！魔王城應該就在那邊。'},
  ],
  after_demon:[
    {sp:'雲逸',t:'魔王終於被消滅了！這場惡夢終於結束了。'},
    {sp:'靈兒',t:'邪氣已然散去，大地恢復了安寧。'},
    {sp:'月華',t:'大家辛苦了！等我回家告訴父親這個好消息！'},
    {sp:'雲逸',t:'（我們三個人的冒險，就在此刻劃下了完美的句點。）',isEnd:true},
  ],
};
