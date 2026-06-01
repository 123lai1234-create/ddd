extends Node
# All static game data — ported from data.js

# ── Characters ──────────────────────────────────────────────
const CHARS := {
	"yunyi": {
		"id": "yunyi", "name": "雲逸", "title": "青雲劍客",
		"color": Color("#4a9eff"), "shape": "sword",
		"hp": 120, "mp": 40, "atk": 18, "def": 12, "spd": 15, "luk": 10,
		"skills": ["slash", "piercing", "windBlade"],
		"desc": "青雲村少年，習得雲霄劍法，立志斬妖除魔。",
	},
	"linger": {
		"id": "linger", "name": "靈兒", "title": "靈族後裔",
		"color": Color("#e050c8"), "shape": "mage",
		"hp": 80, "mp": 120, "atk": 10, "def": 8, "spd": 18, "luk": 15,
		"skills": ["fireball", "iceArrow", "heal", "thunder"],
		"desc": "神秘靈族少女，天生通靈，精通五行法術。",
	},
	"yuehua": {
		"id": "yuehua", "name": "月華", "title": "飛羽弓手",
		"color": Color("#50e8a0"), "shape": "archer",
		"hp": 90, "mp": 60, "atk": 20, "def": 10, "spd": 20, "luk": 20,
		"skills": ["shoot", "multiShot", "poisonArrow", "moonLight"],
		"desc": "出身獵戶之家，箭術無雙，身法輕盈如飛燕。",
	},
}

const GROWTH := {
	"yunyi":  {"hp": 12, "mp": 3,  "atk": 2, "def": 2, "spd": 1, "luk": 1},
	"linger": {"hp": 6,  "mp": 12, "atk": 1, "def": 1, "spd": 1, "luk": 2},
	"yuehua": {"hp": 8,  "mp": 5,  "atk": 2, "def": 1, "spd": 2, "luk": 2},
}

# ── Skills ───────────────────────────────────────────────────
const SKILLS := {
	"slash":       {"name": "雲霄斬",   "mp": 0,  "pow": 1.2, "type": "atk", "tgt": "single"},
	"piercing":    {"name": "穿雲刺",   "mp": 8,  "pow": 1.8, "type": "atk", "tgt": "single", "pierce": 0.4},
	"windBlade":   {"name": "旋風劍舞", "mp": 16, "pow": 1.3, "type": "atk", "tgt": "all"},
	"fireball":    {"name": "火球術",   "mp": 10, "pow": 1.6, "type": "atk", "tgt": "single"},
	"iceArrow":    {"name": "冰矢術",   "mp": 10, "pow": 1.3, "type": "atk", "tgt": "single", "debuff": {"slow": 2}},
	"heal":        {"name": "靈光術",   "mp": 12, "pow": 1.4, "type": "heal","tgt": "single"},
	"thunder":     {"name": "雷鳴術",   "mp": 20, "pow": 2.0, "type": "atk", "tgt": "all"},
	"shoot":       {"name": "飛羽箭",   "mp": 0,  "pow": 1.3, "type": "atk", "tgt": "single"},
	"multiShot":   {"name": "連珠箭",   "mp": 12, "pow": 0.8, "type": "atk", "tgt": "all"},
	"poisonArrow": {"name": "毒箭",     "mp": 8,  "pow": 1.2, "type": "atk", "tgt": "single", "debuff": {"poison": 3}},
	"moonLight":   {"name": "月華照",   "mp": 18, "pow": 1.2, "type": "heal","tgt": "all"},
}

# ── Items ────────────────────────────────────────────────────
const ITEMS := {
	"herb":         {"name": "草藥",       "cat": "use", "hp": 80,           "price": 30},
	"elixir":       {"name": "靈露",       "cat": "use", "mp": 50,           "price": 50},
	"redPotion":    {"name": "大還丹",     "cat": "use", "hp": 200,          "price": 120},
	"fullElixir":   {"name": "天靈露",     "cat": "use", "mp": 100,          "price": 150},
	"revive":       {"name": "起死回生丹", "cat": "use", "revive": 50,       "price": 250},
	"ironSword":    {"name": "鐵劍",       "cat": "eq",  "slot": "wp", "who": "yunyi",  "atk": 10, "price": 80},
	"steelSword":   {"name": "精鋼劍",     "cat": "eq",  "slot": "wp", "who": "yunyi",  "atk": 22, "price": 250},
	"jadeSword":    {"name": "玉靈劍",     "cat": "eq",  "slot": "wp", "who": "yunyi",  "atk": 40, "price": 600},
	"woodStaff":    {"name": "木靈杖",     "cat": "eq",  "slot": "wp", "who": "linger", "atk": 5,  "mp": 20, "price": 80},
	"crystalStaff": {"name": "水晶法杖",   "cat": "eq",  "slot": "wp", "who": "linger", "atk": 12, "mp": 40, "price": 280},
	"ironBow":      {"name": "鐵弓",       "cat": "eq",  "slot": "wp", "who": "yuehua", "atk": 12, "price": 90},
	"moonBow":      {"name": "月牙弓",     "cat": "eq",  "slot": "wp", "who": "yuehua", "atk": 28, "price": 300},
	"leatherArmor": {"name": "皮甲",       "cat": "eq",  "slot": "ar", "def": 8,  "price": 60},
	"ironArmor":    {"name": "鐵甲",       "cat": "eq",  "slot": "ar", "def": 18, "price": 200},
	"silkRobe":     {"name": "靈絲袍",     "cat": "eq",  "slot": "ar", "def": 10, "mp": 30, "price": 180},
	"jade":         {"name": "翡翠玉佩",   "cat": "eq",  "slot": "ac", "def": 5,  "luk": 10, "price": 150},
	"spiritBlade":  {"name": "靈魂神劍",   "cat": "eq",  "slot": "wp", "who": "yunyi",  "atk": 65, "price": 1200},
	"moonStaff":    {"name": "月靈法杖",   "cat": "eq",  "slot": "wp", "who": "linger", "atk": 30, "mp": 80, "price": 1200},
	"starBow":      {"name": "星辰弓",     "cat": "eq",  "slot": "wp", "who": "yuehua", "atk": 50, "price": 1200},
	"dragonArmor":  {"name": "蛟龍鱗甲",   "cat": "eq",  "slot": "ar", "def": 35, "price": 1000},
	"ancientJade":  {"name": "上古玉璽",   "cat": "eq",  "slot": "ac", "def": 12, "luk": 20, "price": 800},
}

const SHOP_STOCK := {
	"village": ["herb","elixir","ironSword","ironBow","woodStaff","leatherArmor"],
	"forest":  ["herb","elixir","redPotion","steelSword","ironArmor"],
	"castle":  ["redPotion","fullElixir","revive","jadeSword","moonBow","crystalStaff","silkRobe","jade"],
	"cave":    ["redPotion","fullElixir","revive","elixir","ironArmor"],
	"shrine":  ["fullElixir","revive","spiritBlade","moonStaff","starBow","dragonArmor","ancientJade"],
}

# ── Enemies ──────────────────────────────────────────────────
const ENEMIES := {
	"wolf":     {"name": "野狼",   "hp": 60,  "atk": 12, "def": 5,  "spd": 14, "exp": 30,  "gold": 15,  "color": Color("#8b7355"), "sz": 28, "acts": ["bite","bite","howl"],       "drops": [{"id":"herb","r":0.4}]},
	"bandit":   {"name": "山賊",   "hp": 80,  "atk": 15, "def": 8,  "spd": 11, "exp": 45,  "gold": 30,  "color": Color("#8b3030"), "sz": 28, "acts": ["slash","slash","rob"],       "drops": [{"id":"herb","r":0.3},{"id":"elixir","r":0.1}]},
	"skeleton": {"name": "骷髏兵", "hp": 100, "atk": 18, "def": 12, "spd": 8,  "exp": 60,  "gold": 25,  "color": Color("#c8b89a"), "sz": 28, "acts": ["slash","boneCrush","slash"], "drops": [{"id":"herb","r":0.2}]},
	"snake":    {"name": "毒蛇妖", "hp": 120, "atk": 20, "def": 10, "spd": 18, "exp": 80,  "gold": 40,  "color": Color("#40b840"), "sz": 28, "acts": ["bite","poisonSpray","bite"], "drops": [{"id":"herb","r":0.5},{"id":"elixir","r":0.2}]},
	"ghost":    {"name": "厲鬼",   "hp": 90,  "atk": 22, "def": 6,  "spd": 20, "exp": 90,  "gold": 35,  "color": Color("#8060c8"), "sz": 28, "acts": ["curse","drain","curse"],     "drops": [{"id":"elixir","r":0.3}]},
	"demon":    {"name": "妖兵",   "hp": 140, "atk": 25, "def": 15, "spd": 12, "exp": 110, "gold": 55,  "color": Color("#c82020"), "sz": 32, "acts": ["slash","slam","slash"],       "drops": [{"id":"redPotion","r":0.2}]},
	"dragon":   {"name": "蛟龍",   "hp": 200, "atk": 32, "def": 20, "spd": 10, "exp": 180, "gold": 100, "color": Color("#20a0c8"), "sz": 40, "acts": ["bite","fireBreath","tail"],   "drops": [{"id":"redPotion","r":0.4},{"id":"fullElixir","r":0.3}]},
	"boss":     {"name": "魔君",   "hp": 400, "atk": 40, "def": 25, "spd": 8,  "exp": 0,   "gold": 0,   "color": Color("#d020d0"), "sz": 48, "acts": ["slam","curse","aoe","slam"],  "drops": [], "boss": true},
}

const ENEMY_ACTS := {
	"bite":        {"name": "撕咬",   "pow": 1.1, "type": "atk"},
	"slash":       {"name": "斬擊",   "pow": 1.0, "type": "atk"},
	"howl":        {"name": "嚎叫",   "pow": 0.0, "type": "buff", "buff": "atkUp"},
	"boneCrush":   {"name": "碎骨擊", "pow": 1.5, "type": "atk"},
	"rob":         {"name": "搶奪",   "pow": 0.8, "type": "atk"},
	"curse":       {"name": "詛咒",   "pow": 0.9, "type": "atk", "debuff": {"poison": 2}},
	"drain":       {"name": "吸命",   "pow": 1.0, "type": "drain"},
	"poisonSpray": {"name": "毒霧",   "pow": 0.8, "type": "atk", "debuff": {"poison": 3}},
	"slam":        {"name": "重錘",   "pow": 1.4, "type": "atk"},
	"aoe":         {"name": "衝擊波", "pow": 1.0, "type": "atk", "tgt": "all"},
	"tail":        {"name": "尾擊",   "pow": 1.2, "type": "atk", "tgt": "all"},
	"fireBreath":  {"name": "噴火",   "pow": 1.6, "type": "atk", "tgt": "all"},
}

# ── Maps ─────────────────────────────────────────────────────
# Tile: 0=path 1=wall 2=grass 3=tree 4=water 5=floor 6=door
const MAPS := {
	"village": {
		"name": "青雲村", "music": "village",
		"exits": [
			{"x": 9,  "y": 0,  "to": "forest",  "to_x": 9,  "to_y": 13, "msg": "前往幽林森林"},
			{"x": 18, "y": 7,  "to": "castle",  "to_x": 1,  "to_y": 7,  "msg": "前往千魔城"},
		],
		"enc": {"rate": 0.0, "enemies": []},
		"w": 20, "h": 15,
		"tiles": [
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
		"npcs": [
			{"x": 5,  "y": 2, "name": "村長",   "dlg": ["歡迎來到青雲村！", "傳說千魔城深處住著魔君，近來妖魔作亂，需要勇士相助。"]},
			{"x": 14, "y": 2, "name": "商人",   "dlg": ["我這裡有上好的武器和藥品！"], "shop": "village"},
			{"x": 9,  "y": 9, "name": "老者",   "dlg": ["此去幽林，妖獸橫行，多加小心。", "傳說林中有古老的靈脈，可加入新夥伴。"]},
			{"x": 14, "y": 7, "name": "旅館主", "dlg": ["歡迎光臨！住一晚只需50靈石，可以恢復體力。"], "inn": 50},
		],
		"start_x": 9, "start_y": 7,
	},
	"forest": {
		"name": "幽林森林", "music": "forest",
		"exits": [
			{"x": 9, "y": 14, "to": "village", "to_x": 9, "to_y": 1,  "msg": "返回青雲村"},
			{"x": 0, "y": 7,  "to": "cave",    "to_x": 18,"to_y": 7,  "msg": "進入深淵秘窟"},
		],
		"enc": {"rate": 0.15, "enemies": ["wolf","bandit","snake","ghost"]},
		"w": 20, "h": 15,
		"tiles": [
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
		"npcs": [
			{"x": 10, "y": 7, "name": "靈兒", "dlg": ["你就是傳說中的青雲劍客嗎？", "我願意加入你的隊伍，一同討伐魔君！"], "join": "linger"},
			{"x": 5,  "y": 7, "name": "弓手", "dlg": ["月華在更深的森林裡，她需要你的幫助。"]},
			{"x": 14, "y": 7, "name": "月華", "dlg": ["終於等到你了！我早就想除掉魔君了，算我一份！"], "join": "yuehua"},
		],
		"start_x": 9, "start_y": 1,
	},
	"castle": {
		"name": "千魔城", "music": "castle",
		"exits": [
			{"x": 1, "y": 7, "to": "village", "to_x": 17, "to_y": 7, "msg": "返回青雲村"},
		],
		"enc": {"rate": 0.2, "enemies": ["skeleton","demon","dragon"]},
		"w": 20, "h": 15,
		"tiles": [
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
		"npcs": [
			{"x": 5,  "y": 6, "name": "商人", "dlg": ["能在這裡看到活人真是難得！我這有最好的裝備。"], "shop": "castle"},
			{"x": 14, "y": 6, "name": "祭司", "dlg": ["魔君就在城堡最深處。", "他擁有強大的黑暗力量，請務必做好準備。"]},
			{"x": 10, "y": 1, "name": "魔君", "dlg": ["哼！終於有人敢來送死！", "我乃千年魔君，爾等螻蟻！"], "boss": "boss"},
		],
		"start_x": 2, "start_y": 7,
	},
	"cave": {
		"name": "深淵秘窟", "music": "castle",
		"exits": [
			{"x": 19, "y": 7,  "to": "forest", "to_x": 1, "to_y": 7,  "msg": "返回幽林森林"},
			{"x": 9,  "y": 14, "to": "shrine", "to_x": 9, "to_y": 1,  "msg": "進入上古神殿"},
		],
		"enc": {"rate": 0.25, "enemies": ["ghost","demon","dragon"]},
		"w": 20, "h": 15,
		"tiles": [
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
		"npcs": [
			{"x": 5,  "y": 7, "name": "迷路探險家", "dlg": ["這洞穴深不見底…", "往南方的古殿裡有傳說中的寶物！"]},
			{"x": 14, "y": 7, "name": "石像",       "dlg": ["〔石像上刻著〕", "此窟乃上古戰場，萬鬼困於此。", "勇者可從南門通往神殿。"]},
			{"x": 9,  "y": 3, "name": "商人",       "dlg": ["沒想到還有人能活著進來！", "我這有最後的存貨，你要嗎？"], "shop": "cave"},
		],
		"start_x": 18, "start_y": 7,
	},
	"shrine": {
		"name": "上古神殿", "music": "forest",
		"exits": [
			{"x": 9, "y": 0, "to": "cave", "to_x": 9, "to_y": 13, "msg": "返回深淵秘窟"},
		],
		"enc": {"rate": 0.22, "enemies": ["demon","dragon","skeleton"]},
		"w": 20, "h": 15,
		"tiles": [
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
		"npcs": [
			{"x": 9,  "y": 7, "name": "神殿守護者", "dlg": ["此乃上古封印之地。", "汝若有足夠的力量，可取走神殿珍寶。", "小心妖魔守衛！"]},
			{"x": 5,  "y": 7, "name": "古代祭司",   "dlg": ["千年前，仙魔在此決戰。", "封印已漸鬆動，魔君之力正在復甦。"]},
			{"x": 14, "y": 7, "name": "寶物守護",   "dlg": ["你已有足夠的力量！", "贈你此神器，可助你斬妖除魔！"], "shop": "shrine"},
		],
		"start_x": 9, "start_y": 1,
	},
}

# ── Tile colors ──────────────────────────────────────────────
const TILE_COLORS := {
	0: Color("#7a6545"),  # path
	1: Color("#2a1e12"),  # wall
	2: Color("#2a5218"),  # grass
	3: Color("#193810"),  # tree
	4: Color("#1a3468"),  # water
	5: Color("#2e2018"),  # floor
	6: Color("#8b6914"),  # door
}

const TILE_SIZE := 24

# ── Helpers ──────────────────────────────────────────────────
func exp_for_level(lv: int) -> int:
	return int(100.0 * pow(lv, 1.5))

func calc_stats(m: Dictionary) -> Dictionary:
	var atk: Variant = m.base_atk
	var def: Variant = m.base_def
	var spd: Variant = m.base_spd
	var luk: Variant = m.base_luk
	var max_mp: Variant = m.max_mp
	for slot in ["wp", "ar", "ac"]:
		var eq_id: String = m.equip.get(slot, "")
		if eq_id == "":
			continue
		var it: Dictionary = ITEMS.get(eq_id, {})
		atk += it.get("atk", 0)
		def += it.get("def", 0)
		spd += it.get("spd", 0)
		luk += it.get("luk", 0)
		max_mp += it.get("mp", 0)
	if "atkDown" in m.status:
		atk = max(1, atk - 8)
	if "slow" in m.status:
		spd = max(1, int(spd * 0.6))
	return {"atk": atk, "def": def, "spd": spd, "luk": luk, "max_mp": max_mp}

func make_party_member(id: String) -> Dictionary:
	var b: Dictionary = CHARS[id]
	return {
		"id": id, "name": b.name, "title": b.title,
		"color": b.color, "shape": b.shape,
		"lv": 1, "exp": 0,
		"max_hp": b.hp, "hp": b.hp,
		"max_mp": b.mp, "mp": b.mp,
		"base_atk": b.atk, "base_def": b.def, "base_spd": b.spd, "base_luk": b.luk,
		"skills": b.skills.duplicate(),
		"equip": {"wp": "", "ar": "", "ac": ""},
		"status": [],
		"dead": false,
	}

func random_enemy_group(map_id: String) -> Array:
	var map_data: Dictionary = MAPS.get(map_id, {})
	var enc: Dictionary = map_data.get("enc", {})
	var pool: Array = enc.get("enemies", [])
	if pool.is_empty():
		return []
	var count := 1 if randf() < 0.6 else 2
	var result := []
	for _i in count:
		var eid: String = pool[randi() % pool.size()]
		var e: Dictionary = ENEMIES[eid].duplicate(true)
		e["id"] = eid
		e["max_hp"] = e["hp"]
		e["status"] = []
		e["dead"] = false
		result.append(e)
	return result
