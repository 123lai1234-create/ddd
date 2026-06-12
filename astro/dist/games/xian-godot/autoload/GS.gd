extends Node
# Global game state singleton

var map_id: String = "village"
var player_pos: Vector2i = Vector2i(9, 7)
var party: Array = []
var gold: int = 150
var flags: Dictionary = {}
var inventory: Dictionary = {}
var defeated: Dictionary = {}
var enc_step: int = 0
var battle_data: Dictionary = {}

func _ready() -> void:
	init()

func init() -> void:
	map_id = "village"
	player_pos = Vector2i(9, 7)
	party = [Data.make_party_member("yunyi")]
	gold = 150
	flags = {}
	inventory = {"herb": 3}
	defeated = {}
	enc_step = 0
	battle_data = {}

func add_item(id: String, n: int = 1) -> void:
	inventory[id] = inventory.get(id, 0) + n

func remove_item(id: String, n: int = 1) -> void:
	inventory[id] = max(0, inventory.get(id, 0) - n)
	if inventory.get(id, 0) == 0:
		inventory.erase(id)

func has_item(id: String) -> bool:
	return inventory.get(id, 0) > 0

func get_member(id: String) -> Dictionary:
	for m in party:
		if m.id == id:
			return m
	return {}

func add_member(id: String) -> void:
	if not get_member(id).is_empty():
		return
	var m := Data.make_party_member(id)
	var lv: int = max(1, party[0].lv if not party.is_empty() else 1)
	for _i in range(1, lv):
		level_up(m)
	party.append(m)

func level_up(m: Dictionary) -> void:
	var g: Dictionary = Data.GROWTH.get(m.id, {"hp": 8, "mp": 4, "atk": 2, "def": 1, "spd": 1, "luk": 1})
	m.lv += 1
	m.exp = 0
	m.max_hp += g.hp; m.hp = min(m.hp + g.hp, m.max_hp)
	m.max_mp += g.mp; m.mp = min(m.mp + g.mp, m.max_mp)
	m.base_atk += g.atk; m.base_def += g.def; m.base_spd += g.spd; m.base_luk += g.luk

func save_game(slot: int) -> void:
	var data := {
		"map_id": map_id,
		"player_pos": [player_pos.x, player_pos.y],
		"party": party.duplicate(true),
		"gold": gold,
		"flags": flags.duplicate(true),
		"inventory": inventory.duplicate(),
		"defeated": defeated.duplicate(),
	}
	var file := FileAccess.open("user://save_%d.json" % slot, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(data))

func load_game(slot: int) -> bool:
	var path := "user://save_%d.json" % slot
	if not FileAccess.file_exists(path):
		return false
	var file := FileAccess.open(path, FileAccess.READ)
	if not file:
		return false
	var data = JSON.parse_string(file.get_as_text())
	if data == null or not data is Dictionary:
		return false
	map_id = data.get("map_id", "village")
	var pp: Array = data.get("player_pos", [9, 7])
	player_pos = Vector2i(pp[0], pp[1])
	party = data.get("party", [Data.make_party_member("yunyi")])
	gold = data.get("gold", 150)
	flags = data.get("flags", {})
	inventory = data.get("inventory", {})
	defeated = data.get("defeated", {})
	enc_step = 0
	return true

func has_save(slot: int) -> bool:
	return FileAccess.file_exists("user://save_%d.json" % slot)

func restore_party_hp() -> void:
	for m in party:
		m.hp = m.max_hp
		var st := Data.calc_stats(m)
		m.mp = st.max_mp
		m.status = []
		m.dead = false
