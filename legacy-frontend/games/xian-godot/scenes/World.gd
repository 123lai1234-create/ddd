extends Node2D

const TS := Data.TILE_SIZE  # 24 px per tile

var _map: Dictionary = {}
var _font: Font
var _t := 0.0
var _step_timer := 0.0

# Player state
var _px := 0
var _py := 0
var _facing := "down"  # up/down/left/right
var _move_cooldown := 0.0
const MOVE_CD := 0.15

# UI state
var _phase := "world"  # world / dialog / shop / menu / confirm_exit
var _dialog_npc: Dictionary = {}
var _dialog_page := 0
var _shop_cursor := 0
var _shop_items: Array = []
var _menu_cursor := 0
var _menu_items: Array = []
var _message := ""
var _message_timer := 0.0

# Sub-menu state
var _sub_phase := ""   # "item"/"item_tgt"/"equip"/"equip_tgt"/"status"/"status_detail"
var _sub_cursor := 0
var _sub_cursor2 := 0
var _sub_list: Array = []
var _sub_pending := ""

# Walk animation
var _walk_frame := 0
var _walk_anim := 0.0

func _ready() -> void:
	_font = ThemeDB.fallback_font
	_load_map()

func _load_map() -> void:
	_map = Data.MAPS.get(GS.map_id, {})
	_px = GS.player_pos.x
	_py = GS.player_pos.y
	Sound.bgm(_map.get("music", "village"))
	queue_redraw()

func _process(delta: float) -> void:
	_t += delta
	_step_timer += delta
	if _message_timer > 0.0:
		_message_timer -= delta
		if _message_timer <= 0.0:
			_message = ""
			queue_redraw()

	if _phase == "world":
		_handle_world_input(delta)

	_walk_anim += delta
	queue_redraw()

func _handle_world_input(delta: float) -> void:
	_move_cooldown = max(0.0, _move_cooldown - delta)
	if _move_cooldown > 0.0:
		return

	var dx := 0
	var dy := 0
	if Input.is_action_pressed("ui_up"):    dy = -1; _facing = "up"
	elif Input.is_action_pressed("ui_down"): dy = 1;  _facing = "down"
	elif Input.is_action_pressed("ui_left"): dx = -1; _facing = "left"
	elif Input.is_action_pressed("ui_right"):dx = 1;  _facing = "right"

	if dx != 0 or dy != 0:
		var nx = _px + dx
		var ny = _py + dy
		if _can_move(nx, ny):
			_px = nx; _py = ny
			GS.player_pos = Vector2i(_px, _py)
			_move_cooldown = MOVE_CD
			_walk_frame = (_walk_frame + 1) % 4
			if _step_timer > 0.3:
				Sound.play("step"); _step_timer = 0.0
			_check_exit()
			_check_encounter()
		queue_redraw()

func _input(event: InputEvent) -> void:
	match _phase:
		"dialog":
			if event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel"):
				Sound.play("menuSelect")
				_dialog_page += 1
				var dlg: Array = _dialog_npc.get("dlg", [])
				if _dialog_page >= dlg.size():
					_finish_dialog()
				queue_redraw()
		"shop":
			_handle_shop_input(event)
		"menu":
			_handle_menu_input(event)
		"world":
			if event.is_action_pressed("ui_accept"):
				_try_interact()
			elif event.is_action_pressed("ui_cancel"):
				_open_menu()

func _can_move(x: int, y: int) -> bool:
	var tiles: Array = _map.get("tiles", [])
	if y < 0 or y >= tiles.size() or x < 0 or x >= (tiles[0].size() if tiles.size() > 0 else 0):
		return false
	var t: int = tiles[y][x]
	return t == 0 or t == 5 or t == 6 or t == 2  # passable: path, floor, door, grass

func _check_exit() -> void:
	var exits: Array = _map.get("exits", [])
	for ex in exits:
		if ex.x == _px and ex.y == _py:
			_show_message(ex.get("msg", ""))
			await get_tree().create_timer(0.3).timeout
			GS.map_id = ex.to
			GS.player_pos = Vector2i(ex.to_x, ex.to_y)
			_fade_to_scene("res://scenes/World.tscn")
			return

func _check_encounter() -> void:
	var enc: Dictionary = _map.get("enc", {})
	var rate: float = enc.get("rate", 0.0)
	if rate <= 0.0:
		return
	GS.enc_step += 1
	if GS.enc_step >= 10 and randf() < rate:
		GS.enc_step = 0
		var enemies := Data.random_enemy_group(GS.map_id)
		if enemies.is_empty():
			return
		GS.battle_data = {"enemies": enemies, "is_boss": false}
		await get_tree().create_timer(0.1).timeout
		_fade_to_scene("res://scenes/Battle.tscn")

func _try_interact() -> void:
	# Check adjacent tile for NPC
	var check_positions := []
	match _facing:
		"up":    check_positions = [Vector2i(_px, _py - 1)]
		"down":  check_positions = [Vector2i(_px, _py + 1)]
		"left":  check_positions = [Vector2i(_px - 1, _py)]
		"right": check_positions = [Vector2i(_px + 1, _py)]
	# Also check same tile
	check_positions.append(Vector2i(_px, _py))

	for pos in check_positions:
		var npc := _npc_at(pos.x, pos.y)
		if not npc.is_empty():
			_start_dialog(npc)
			return

func _npc_at(x: int, y: int) -> Dictionary:
	for npc in _map.get("npcs", []):
		if npc.x == x and npc.y == y:
			return npc
	return {}

func _start_dialog(npc: Dictionary) -> void:
	# Handle boss trigger
	if npc.has("boss") and not GS.flags.get("defeated_" + npc.boss, false):
		_phase = "dialog"
		_dialog_npc = npc
		_dialog_page = 0
		# After dialog, start boss battle
		Sound.play("menuSelect")
		queue_redraw()
		return
	# Handle join
	if npc.has("join"):
		var join_id: String = npc.join
		if GS.get_member(join_id).is_empty():
			GS.add_member(join_id)
			var char_name: String = Data.CHARS.get(join_id, {}).get("name", join_id)
			_show_message(char_name + " 加入了隊伍！")
			Sound.play("levelUp")
	# Handle shop
	if npc.has("shop"):
		_phase = "dialog"
		_dialog_npc = npc
		_dialog_page = 0
		queue_redraw()
		return
	# Handle inn
	if npc.has("inn"):
		_phase = "dialog"
		_dialog_npc = npc
		_dialog_page = 0
		queue_redraw()
		return
	# Normal dialog
	_phase = "dialog"
	_dialog_npc = npc
	_dialog_page = 0
	Sound.play("menuSelect")
	queue_redraw()

func _finish_dialog() -> void:
	var npc := _dialog_npc
	# After dialog ends, handle special actions
	if npc.has("shop"):
		_open_shop(npc.shop)
		return
	if npc.has("inn"):
		_offer_inn(npc.inn)
		return
	if npc.has("boss"):
		var boss_id: String = npc.boss
		var enemies := [Data.ENEMIES[boss_id].duplicate(true)]
		enemies[0]["id"] = boss_id
		enemies[0]["max_hp"] = enemies[0]["hp"]
		enemies[0]["status"] = []
		enemies[0]["dead"] = false
		GS.battle_data = {"enemies": enemies, "is_boss": true}
		_fade_to_scene("res://scenes/Battle.tscn")
		return
	_phase = "world"
	_dialog_npc = {}
	queue_redraw()

func _offer_inn(cost: int) -> void:
	if GS.gold >= cost:
		GS.gold -= cost
		GS.restore_party_hp()
		_show_message("好好休息了一晚！全員生命值已恢復。")
		Sound.play("inn")
	else:
		_show_message("靈石不足，無法住宿。")
	_phase = "world"
	_dialog_npc = {}

func _open_shop(shop_id: String) -> void:
	_phase = "shop"
	_shop_items = Data.SHOP_STOCK.get(shop_id, [])
	_shop_cursor = 0
	queue_redraw()

func _handle_shop_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_up"):
		_shop_cursor = max(0, _shop_cursor - 1); Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_down"):
		_shop_cursor = min(_shop_items.size() - 1, _shop_cursor + 1); Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_accept"):
		_try_buy(); queue_redraw()
	elif event.is_action_pressed("ui_cancel"):
		_phase = "world"; _dialog_npc = {}; Sound.play("menuMove"); queue_redraw()

func _try_buy() -> void:
	if _shop_items.is_empty():
		return
	var item_id: String = _shop_items[_shop_cursor]
	var item: Dictionary = Data.ITEMS.get(item_id, {})
	var price: int = item.get("price", 0)
	if GS.gold >= price:
		GS.gold -= price
		GS.add_item(item_id)
		_show_message("購買了 " + item.get("name", "?") + "！")
		Sound.play("shopBuy")
	else:
		_show_message("靈石不足！")

func _open_menu() -> void:
	_phase = "menu"
	_sub_phase = ""
	_menu_cursor = 0
	_menu_items = ["道具", "裝備", "狀態", "存檔", "返回"]
	Sound.play("openMenu")
	queue_redraw()

func _handle_menu_input(event: InputEvent) -> void:
	if _sub_phase != "":
		_handle_sub_input(event); return
	if event.is_action_pressed("ui_up"):
		_menu_cursor = max(0, _menu_cursor - 1); Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_down"):
		_menu_cursor = min(_menu_items.size() - 1, _menu_cursor + 1); Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_accept"):
		Sound.play("menuSelect")
		match _menu_cursor:
			0: _open_item_sub()
			1: _open_equip_sub()
			2: _open_status_sub()
			3: _sub_phase = "save_slot"; _sub_cursor2 = 0; queue_redraw()
			4: _phase = "world"; queue_redraw()
	elif event.is_action_pressed("ui_cancel"):
		_phase = "world"; Sound.play("menuMove"); queue_redraw()

func _open_item_sub() -> void:
	_sub_list = []
	for id in GS.inventory:
		if GS.inventory[id] > 0 and Data.ITEMS.get(id, {}).get("cat", "") == "use":
			_sub_list.append(id)
	_sub_cursor = 0; _sub_phase = "item"; queue_redraw()

func _open_equip_sub() -> void:
	_sub_list = []
	for id in GS.inventory:
		if GS.inventory[id] > 0 and Data.ITEMS.get(id, {}).get("cat", "") == "eq":
			_sub_list.append(id)
	_sub_cursor = 0; _sub_phase = "equip"; queue_redraw()

func _open_status_sub() -> void:
	_sub_cursor = 0; _sub_phase = "status"; queue_redraw()

func _handle_sub_input(event: InputEvent) -> void:
	match _sub_phase:
		"item":
			var n := max(1, _sub_list.size())
			if event.is_action_pressed("ui_up"):   _sub_cursor = (_sub_cursor-1+n)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_down"): _sub_cursor = (_sub_cursor+1)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_cancel"): _sub_phase = ""; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_accept") and not _sub_list.is_empty():
				Sound.play("menuSelect"); _sub_pending = _sub_list[_sub_cursor]; _sub_cursor2 = 0; _sub_phase = "item_tgt"; queue_redraw()
		"item_tgt":
			var n := max(1, GS.party.size())
			if event.is_action_pressed("ui_up"):   _sub_cursor2 = (_sub_cursor2-1+n)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_down"): _sub_cursor2 = (_sub_cursor2+1)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_cancel"): _sub_phase = "item"; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_accept"):
				Sound.play("menuSelect"); _use_item_on(_sub_pending, _sub_cursor2); _sub_phase = ""; _phase = "world"; queue_redraw()
		"equip":
			var n := max(1, _sub_list.size())
			if event.is_action_pressed("ui_up"):   _sub_cursor = (_sub_cursor-1+n)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_down"): _sub_cursor = (_sub_cursor+1)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_cancel"): _sub_phase = ""; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_accept") and not _sub_list.is_empty():
				Sound.play("menuSelect"); _sub_pending = _sub_list[_sub_cursor]; _sub_cursor2 = 0; _sub_phase = "equip_tgt"; queue_redraw()
		"equip_tgt":
			var it = Data.ITEMS.get(_sub_pending, {})
			var who: String = it.get("who", "")
			var targets := GS.party.filter(func(m): return who == "" or m.id == who)
			var n := max(1, targets.size())
			if event.is_action_pressed("ui_up"):   _sub_cursor2 = (_sub_cursor2-1+n)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_down"): _sub_cursor2 = (_sub_cursor2+1)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_cancel"): _sub_phase = "equip"; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_accept") and not targets.is_empty():
				Sound.play("menuSelect")
				_equip_item(_sub_pending, GS.party.find(targets[_sub_cursor2]))
				_sub_phase = ""; _phase = "world"; queue_redraw()
		"status":
			var n := max(1, GS.party.size())
			if event.is_action_pressed("ui_up"):   _sub_cursor = (_sub_cursor-1+n)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_down"): _sub_cursor = (_sub_cursor+1)%n; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_cancel"): _sub_phase = ""; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_accept"): Sound.play("menuSelect"); _sub_phase = "status_detail"; queue_redraw()
		"status_detail":
			if event.is_action_pressed("ui_cancel") or event.is_action_pressed("ui_accept"):
				_sub_phase = "status"; Sound.play("menuMove"); queue_redraw()
		"save_slot":
			if event.is_action_pressed("ui_up"):   _sub_cursor2 = (_sub_cursor2-1+3)%3; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_down"): _sub_cursor2 = (_sub_cursor2+1)%3; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_cancel"): _sub_phase = ""; Sound.play("menuMove"); queue_redraw()
			elif event.is_action_pressed("ui_accept"):
				Sound.play("menuSelect"); GS.save_game(_sub_cursor2)
				_show_message("遊戲已存檔至槽 %d！" % (_sub_cursor2+1))
				_sub_phase = ""; _phase = "world"; queue_redraw()

func _use_item_on(item_id: String, mi: int) -> void:
	var it = Data.ITEMS.get(item_id, {})
	if it.is_empty() or mi >= GS.party.size(): return
	var m = GS.party[mi]
	var msg := ""
	if it.has("hp") and not m.get("dead", false):
		m.hp = min(m.max_hp, m.hp + it.hp); msg = m.name + " 恢復了 " + str(it.hp) + " HP！"
	if it.has("mp") and not m.get("dead", false):
		var st := Data.calc_stats(m); m.mp = min(st.max_mp, m.mp + it.mp)
		if msg == "": msg = m.name + " 恢復了靈力！"
	if it.has("revive") and m.get("dead", false):
		m.dead = false; m.hp = int(m.max_hp * it.revive / 100.0); msg = m.name + " 復活了！"
	GS.remove_item(item_id)
	_show_message(msg if msg != "" else "使用了 " + it.get("name", "?") + "！")
	Sound.play("heal")

func _equip_item(item_id: String, mi: int) -> void:
	var it = Data.ITEMS.get(item_id, {})
	if it.is_empty() or mi >= GS.party.size(): return
	var m = GS.party[mi]
	var slot: String = it.get("slot", "")
	if slot == "": return
	var old: String = m.equip.get(slot, "")
	if old != "": GS.add_item(old)
	m.equip[slot] = item_id
	GS.remove_item(item_id)
	_show_message(m.name + " 裝備了 " + it.get("name", "?") + "！")
	Sound.play("shopBuy")

func _fade_to_scene(path: String) -> void:
	var tw := create_tween()
	tw.tween_method(func(v): modulate.a = 1.0 - v, 0.0, 1.0, 0.35)
	tw.tween_callback(func(): get_tree().change_scene_to_file(path))

func _show_message(msg: String) -> void:
	_message = msg
	_message_timer = 2.5
	queue_redraw()

# ── Drawing ───────────────────────────────────────────────────
func _draw() -> void:
	var vp := get_viewport_rect()
	var W := vp.size.x
	var H := vp.size.y
	var map_w: int = _map.get("w", 20)
	var map_h_val: int = _map.get("h", 15)
	var tiles: Array = _map.get("tiles", [])

	# Camera offset — center on player
	var cam_x := _px * TS - W * 0.5 + TS * 0.5
	var cam_y := _py * TS - H * 0.42 + TS * 0.5
	cam_x = clampf(cam_x, 0, max(0, map_w * TS - W))
	cam_y = clampf(cam_y, 0, max(0, map_h_val * TS - H))

	# Draw tiles
	for row in tiles.size():
		for col in tiles[row].size():
			var tile: int = tiles[row][col]
			var tx = col * TS - cam_x
			var ty = row * TS - cam_y
			if tx + TS < 0 or tx > W or ty + TS < 0 or ty > H:
				continue
			var col_val: Color = Data.TILE_COLORS.get(tile, Color("#333"))
			draw_rect(Rect2(tx, ty, TS, TS), col_val)
			# Tile details
			match tile:
				1:  # Wall — add shadow edge
					draw_rect(Rect2(tx, ty + TS - 3, TS, 3), Color(0,0,0,0.3))
				3:  # Tree — draw canopy dot
					draw_circle(Vector2(tx + TS*0.5, ty + TS*0.38), TS*0.32, Color("#1e4a0c"))
					draw_circle(Vector2(tx + TS*0.5, ty + TS*0.28), TS*0.22, Color("#264d10"))
				4:  # Water — animated shimmer
					var wv := sin(_t * 2.0 + col * 0.7) * 0.15 + 0.15
					draw_rect(Rect2(tx + 2, ty + TS*0.4, TS - 4, TS*0.2), Color(0.3, 0.6, 0.9, wv))
				6:  # Door — gold frame
					draw_rect(Rect2(tx + 2, ty + 2, TS - 4, TS - 4), Color("#8b6914", 0.8), false)

	# Grid lines (subtle)
	for row in range(int(cam_y / TS), int((cam_y + H) / TS) + 2):
		var ty = row * TS - cam_y
		draw_line(Vector2(0, ty), Vector2(W, ty), Color(0, 0, 0, 0.08), 0.5)
	for col in range(int(cam_x / TS), int((cam_x + W) / TS) + 2):
		var tx = col * TS - cam_x
		draw_line(Vector2(tx, 0), Vector2(tx, H), Color(0, 0, 0, 0.08), 0.5)

	# NPCs
	for npc in _map.get("npcs", []):
		var nx = npc.x * TS - cam_x + TS * 0.5
		var ny = npc.y * TS - cam_y + TS * 0.5
		if nx < -TS or nx > W + TS or ny < -TS or ny > H + TS:
			continue
		_draw_npc(Vector2(nx, ny), npc)

	# Player
	var ppx := _px * TS - cam_x + TS * 0.5
	var ppy := _py * TS - cam_y + TS * 0.5
	_draw_player(Vector2(ppx, ppy))

	# Map name (top left)
	var map_name: String = _map.get("name", "")
	draw_rect(Rect2(0, 0, W, 32), Color(0, 0, 0, 0.55))
	_draw_text(map_name, Vector2(10, 22), 18, Color("#e8c060"))

	# Gold (top right)
	var gold_str := "💰 %d" % GS.gold
	_draw_text_right(gold_str, Vector2(W - 10, 22), 16, Color("#ffd700"))

	# Message bar
	if _message != "":
		var msg_h := 36
		var msg_y := H - msg_h - 4
		draw_rect(Rect2(0, msg_y, W, msg_h), Color(0, 0, 0, 0.78))
		draw_rect(Rect2(0, msg_y, W, msg_h), Color("#7a5c1e", 0.6), false)
		_draw_text_centered(_message, Vector2(W * 0.5, msg_y + msg_h * 0.62), 15, Color("#f0e6c8"))

	# Dialog box
	if _phase == "dialog":
		_draw_dialog()
	elif _phase == "shop":
		_draw_shop()
	elif _phase == "menu":
		_draw_game_menu()

	# Mini-map (bottom right corner)
	_draw_minimap(W, H, cam_x, cam_y)

func _draw_player(pos: Vector2) -> void:
	var s := 9.0
	var bob := sin(_t * 8.0) * 1.5 if _move_cooldown > 0.0 else 0.0
	var p := pos + Vector2(0, bob)
	# Shadow
	draw_ellipse_filled(p + Vector2(0, s*0.1), s*1.1, s*0.25, Color(0,0,0,0.3))
	# Legs
	var leg_off := sin(_walk_anim * 12.0) * 2.0 if _move_cooldown > 0.08 else 0.0
	draw_rect(Rect2(p.x - s*0.45, p.y - s*0.8, s*0.38, s*0.8), Color("#4a9eff", 0.65))
	draw_rect(Rect2(p.x + s*0.07, p.y - s*0.8, s*0.38, s*0.8), Color("#4a9eff", 0.65))
	# Robe
	var pts := PackedVector2Array([p+Vector2(-s*0.6,-s*0.8), p+Vector2(s*0.6,-s*0.8), p+Vector2(s*0.44,-s*2.1), p+Vector2(-s*0.44,-s*2.1)])
	draw_polygon(pts, [Color("#4a9eff")])
	# Head
	draw_circle(p + Vector2(0, -s*2.7), s*0.6, Color("#d4a078"))
	# Hair
	draw_circle(p + Vector2(0, -s*3.0), s*0.6, Color("#1c0c08"))
	# Eyes
	draw_circle(p + Vector2(-s*0.22, -s*2.65), s*0.11, Color("#0c0808"))
	draw_circle(p + Vector2( s*0.22, -s*2.65), s*0.11, Color("#0c0808"))
	# Direction indicator
	var dir_offset := Vector2.ZERO
	match _facing:
		"up":    dir_offset = Vector2(0, -s*0.5)
		"down":  dir_offset = Vector2(0,  s*0.2)
		"left":  dir_offset = Vector2(-s*0.5, -s*1.5)
		"right": dir_offset = Vector2( s*0.5, -s*1.5)
	draw_circle(p + dir_offset + Vector2(0, -s*1.5), 2.0, Color("#ffd700", 0.7))

func _draw_npc(pos: Vector2, npc: Dictionary) -> void:
	var s := 8.0
	var bob := sin(_t * 2.5 + pos.x * 0.01) * 1.2
	var p := pos + Vector2(0, bob)
	# Shadow
	draw_ellipse_filled(p + Vector2(0, s*0.15), s*0.9, s*0.22, Color(0,0,0,0.25))
	# Body
	var col := Color("#d4b060")
	if npc.has("boss"):
		col = Color("#d020d0")
	elif npc.has("join"):
		var char_id: String = npc.get("join", "")
		col = Data.CHARS.get(char_id, {}).get("color", Color("#d4b060"))
	elif npc.has("shop"):
		col = Color("#50c878")
	elif npc.has("inn"):
		col = Color("#5080e8")
	draw_circle(p + Vector2(0, -s*2.2), s*0.6, Color("#d4a078"))  # head
	var body_pts := PackedVector2Array([p+Vector2(-s*0.5,-s*0.7), p+Vector2(s*0.5,-s*0.7), p+Vector2(s*0.4,-s*1.9), p+Vector2(-s*0.4,-s*1.9)])
	draw_polygon(body_pts, [col])
	# Name label
	_draw_text_centered(npc.name, p + Vector2(0, -s*3.5), 11, Color("#e8c060", 0.9))

func _draw_dialog() -> void:
	var vp := get_viewport_rect()
	var W := vp.size.x
	var H := vp.size.y
	var dh := H * 0.28
	var dy := H - dh - 4
	# Panel
	draw_rect(Rect2(0, dy, W, dh), Color("#050410", 0.96))
	draw_rect(Rect2(0, dy, W, dh), Color("#7a5c1e", 0.8), false)
	draw_rect(Rect2(2, dy+2, W-4, dh-4), Color("#3a2a0c", 0.5), false)
	# NPC name
	var npc_name: String = _dialog_npc.get("name", "")
	draw_rect(Rect2(12, dy + 8, _font.get_string_size(npc_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 16, 24), Color("#3a2a08", 0.9))
	_draw_text(npc_name, Vector2(20, dy + 23), 15, Color("#ffd700"))
	# Dialog text
	var dlg: Array = _dialog_npc.get("dlg", [])
	if _dialog_page < dlg.size():
		var text: String = dlg[_dialog_page]
		_draw_text_wrap(text, Vector2(16, dy + 44), W - 32, 15, Color("#f0e6c8"))
	# Advance indicator
	var blink := sin(_t * 5.0) > 0.0
	if blink:
		_draw_text_right("▼", Vector2(W - 16, dy + dh - 10), 16, Color("#ffd700", 0.9))

func _draw_shop() -> void:
	var vp := get_viewport_rect()
	var W := vp.size.x
	var H := vp.size.y
	var panel_w := W * 0.88
	var panel_h := H * 0.72
	var px := (W - panel_w) * 0.5
	var py := (H - panel_h) * 0.5
	draw_rect(Rect2(px, py, panel_w, panel_h), Color("#080612", 0.97))
	draw_rect(Rect2(px, py, panel_w, panel_h), Color("#7a5c1e", 0.8), false)
	_draw_text_centered("商店", Vector2(W * 0.5, py + 24), 18, Color("#ffd700"))
	_draw_text("💰 " + str(GS.gold), Vector2(px + 12, py + 24), 14, Color("#ffd700"))
	var row_h := min(44.0, (panel_h - 48) / max(1, _shop_items.size()))
	var list_y := py + 42.0
	for i in _shop_items.size():
		var item_id: String = _shop_items[i]
		var item: Dictionary = Data.ITEMS.get(item_id, {})
		var sel = i == _shop_cursor
		var iy = list_y + i * row_h
		if sel:
			draw_rect(Rect2(px + 4, iy, panel_w - 8, row_h - 3), Color("#9a7828", 0.25))
		var col := Color("#ffd700") if sel else Color("#c8a060")
		var prefix := "▶ " if sel else "  "
		_draw_text(prefix + item.get("name", "?"), Vector2(px + 18, iy + row_h * 0.52), 15, col)
		_draw_text_right("%d 靈石" % item.get("price", 0), Vector2(px + panel_w - 12, iy + row_h * 0.52), 14, Color("#a0c8ff"))
		# Stat hint for equipment
		if item.get("cat","") == "eq":
			var hint := ""
			if item.has("atk"): hint += "ATK+%d " % item.atk
			if item.has("def"): hint += "DEF+%d " % item.def
			if item.has("mp"):  hint += "MP+%d " % item.mp
			if item.has("luk"): hint += "LUK+%d" % item.luk
			if item.has("who"): hint += " [%s]" % Data.CHARS.get(item.who, {}).get("name", item.who)
			_draw_text(hint.strip_edges(), Vector2(px + 30, iy + row_h * 0.85), 11, Color("#88aacc", 0.85))
		elif item.has("hp") or item.has("mp"):
			var hint := ""
			if item.has("hp"): hint += "HP+%d " % item.hp
			if item.has("mp"): hint += "MP+%d" % item.mp
			if item.has("revive"): hint = "復活%d%%" % item.revive
			_draw_text(hint.strip_edges(), Vector2(px + 30, iy + row_h * 0.85), 11, Color("#88cc88", 0.85))
	_draw_text_centered("Z/Enter 購買   X/Esc 離開", Vector2(W * 0.5, py + panel_h - 14), 12, Color("#9a8060", 0.8))

func _draw_game_menu() -> void:
	var vp := get_viewport_rect()
	var W := vp.size.x
	var H := vp.size.y
	if _sub_phase in ["item", "item_tgt"]:
		_draw_item_panel(W, H); return
	if _sub_phase in ["equip", "equip_tgt"]:
		_draw_equip_panel(W, H); return
	if _sub_phase in ["status", "status_detail"]:
		_draw_status_screen(W, H); return
	if _sub_phase == "save_slot":
		_draw_save_slot_panel(W, H); return
	var pw := W * 0.55
	var ph := H * 0.48
	var mx := W - pw - 8
	var my := 38.0
	draw_rect(Rect2(mx, my, pw, ph), Color("#080612", 0.97))
	draw_rect(Rect2(mx, my, pw, ph), Color("#7a5c1e", 0.8), false)
	_draw_text_centered("選單", Vector2(mx + pw * 0.5, my + 24), 16, Color("#ffd700"))
	var row_h := ph / (_menu_items.size() + 0.5)
	for i in _menu_items.size():
		var sel = i == _menu_cursor
		var iy = my + 36 + i * row_h
		if sel:
			draw_rect(Rect2(mx + 4, iy - 4, pw - 8, row_h - 2), Color("#9a7828", 0.25))
		var col := Color("#ffd700") if sel else Color("#c8a060")
		_draw_text(("▶ " if sel else "  ") + _menu_items[i], Vector2(mx + 18, iy + 16), 15, col)

func _draw_item_panel(W: float, H: float) -> void:
	var pw := W * 0.88; var ph := H * 0.72
	var px := (W - pw) * 0.5; var py := (H - ph) * 0.5
	draw_rect(Rect2(px, py, pw, ph), Color("#080612", 0.97))
	draw_rect(Rect2(px, py, pw, ph), Color("#7a5c1e", 0.8), false)
	_draw_text_centered("道具", Vector2(px + pw * 0.5, py + 24), 17, Color("#ffd700"))
	if _sub_list.is_empty():
		_draw_text_centered("── 無道具 ──", Vector2(px + pw*0.5, py + ph*0.5), 15, Color("#555"))
	else:
		var rh = min(38.0, (ph - 48) / _sub_list.size())
		for i in _sub_list.size():
			var id: String = _sub_list[i]
			var it = Data.ITEMS.get(id, {})
			var sel = i == _sub_cursor and _sub_phase == "item"
			var iy = py + 40 + i * rh
			if sel: draw_rect(Rect2(px + 4, iy, pw - 8, rh - 3), Color("#9a7828", 0.22))
			_draw_text(("▶ " if sel else "  ") + it.get("name", "?"), Vector2(px + 18, iy + rh * 0.68), 15, Color("#ffd700") if sel else Color("#c8a060"))
			var desc := ""
			if it.has("hp"): desc = "HP+%d" % it.hp
			if it.has("mp"): desc += ("  " if desc else "") + "MP+%d" % it.mp
			if it.has("revive"): desc = "復活%d%%" % it.revive
			_draw_text_right(desc + "  ×%d" % GS.inventory.get(id, 0), Vector2(px + pw - 12, iy + rh * 0.68), 13, Color("#a0c8ff"))
	if _sub_phase == "item_tgt":
		_draw_member_picker(W, H, false)
	else:
		_draw_text_centered("Z 使用   X 返回", Vector2(px + pw * 0.5, py + ph - 14), 12, Color("#9a8060", 0.8))

func _draw_equip_panel(W: float, H: float) -> void:
	var pw := W * 0.88; var ph := H * 0.72
	var px := (W - pw) * 0.5; var py := (H - ph) * 0.5
	draw_rect(Rect2(px, py, pw, ph), Color("#080612", 0.97))
	draw_rect(Rect2(px, py, pw, ph), Color("#7a5c1e", 0.8), false)
	_draw_text_centered("裝備", Vector2(px + pw * 0.5, py + 24), 17, Color("#ffd700"))
	if _sub_list.is_empty():
		_draw_text_centered("── 無裝備道具 ──", Vector2(px + pw*0.5, py + ph*0.5), 15, Color("#555"))
	else:
		var rh = min(38.0, (ph - 48) / _sub_list.size())
		for i in _sub_list.size():
			var id: String = _sub_list[i]
			var it = Data.ITEMS.get(id, {})
			var sel = i == _sub_cursor and _sub_phase == "equip"
			var iy = py + 40 + i * rh
			if sel: draw_rect(Rect2(px + 4, iy, pw - 8, rh - 3), Color("#9a7828", 0.22))
			var label = it.get("name", "?")
			if it.has("who"): label += "  [%s]" % Data.CHARS.get(it.who, {}).get("name", it.who)
			_draw_text(("▶ " if sel else "  ") + label, Vector2(px + 18, iy + rh * 0.68), 15, Color("#ffd700") if sel else Color("#c8a060"))
			var stat := ""
			if it.has("atk"): stat += "ATK+%d " % it.atk
			if it.has("def"): stat += "DEF+%d " % it.def
			if it.has("mp"):  stat += "MP+%d" % it.mp
			_draw_text_right(stat.strip_edges(), Vector2(px + pw - 12, iy + rh * 0.68), 12, Color("#88ccff"))
	if _sub_phase == "equip_tgt":
		var it = Data.ITEMS.get(_sub_pending, {})
		var who: String = it.get("who", "")
		var targets := GS.party.filter(func(m): return who == "" or m.id == who)
		_draw_member_picker_list(W, H, targets, false)
	else:
		_draw_text_centered("Z 裝備   X 返回", Vector2(px + pw * 0.5, py + ph - 14), 12, Color("#9a8060", 0.8))

func _draw_member_picker(W: float, H: float, equip_mode: bool) -> void:
	_draw_member_picker_list(W, H, GS.party, equip_mode)

func _draw_member_picker_list(W: float, H: float, members: Array, _equip_mode: bool) -> void:
	var pw := W * 0.6; var ph := members.size() * 48 + 36
	var px := (W - pw) * 0.5; var py := (H - ph) * 0.5
	draw_rect(Rect2(px, py, pw, ph), Color("#0a0818", 0.98))
	draw_rect(Rect2(px, py, pw, ph), Color("#7a5c1e", 0.9), false)
	_draw_text_centered("選擇對象", Vector2(px + pw * 0.5, py + 22), 14, Color("#ffd700"))
	for i in members.size():
		var m = members[i]
		var sel = i == _sub_cursor2
		var iy = py + 32 + i * 48
		if sel: draw_rect(Rect2(px + 4, iy, pw - 8, 44), Color("#9a7828", 0.25))
		var col := Color("#ffd700") if sel else Color("#c8a060")
		var dead_tag := "  [陣亡]" if m.get("dead", false) else ""
		_draw_text(("▶ " if sel else "  ") + m.name + dead_tag, Vector2(px + 18, iy + 18), 15, col)
		_draw_text("HP %d/%d  MP %d" % [m.hp, m.max_hp, m.mp], Vector2(px + 18, iy + 36), 11, Color("#a0a0c0"))

func _draw_status_screen(W: float, H: float) -> void:
	if _sub_phase == "status_detail":
		_draw_status_detail(W, H); return
	var pw := W * 0.88; var ph := H * 0.72
	var px := (W - pw) * 0.5; var py := (H - ph) * 0.5
	draw_rect(Rect2(px, py, pw, ph), Color("#080612", 0.97))
	draw_rect(Rect2(px, py, pw, ph), Color("#7a5c1e", 0.8), false)
	_draw_text_centered("隊伍狀態", Vector2(px + pw * 0.5, py + 24), 17, Color("#ffd700"))
	var rh = (ph - 48.0) / max(1, GS.party.size())
	for i in GS.party.size():
		var m = GS.party[i]
		var st = Data.calc_stats(m)
		var sel = i == _sub_cursor
		var iy = py + 40 + i * rh
		if sel: draw_rect(Rect2(px + 4, iy, pw - 8, rh - 3), Color("#9a7828", 0.22))
		var col := Color("#ffd700") if sel else (Color("#555") if m.get("dead", false) else Color("#c8a060"))
		_draw_text(("▶ " if sel else "  ") + m.name + "  Lv." + str(m.lv) + "  " + m.title, Vector2(px + 18, iy + rh * 0.3), 15, col)
		_draw_text("HP %d/%d   MP %d/%d   ATK %d   DEF %d" % [m.hp, m.max_hp, m.mp, st.max_mp, st.atk, st.def], Vector2(px + 28, iy + rh * 0.65), 12, Color("#a0c0e0"))
	_draw_text_centered("Z 詳細   X 返回", Vector2(px + pw * 0.5, py + ph - 14), 12, Color("#9a8060", 0.8))

func _draw_status_detail(W: float, H: float) -> void:
	if _sub_cursor >= GS.party.size(): return
	var m = GS.party[_sub_cursor]
	var st = Data.calc_stats(m)
	var exp_next := Data.exp_for_level(m.lv)
	var pw := W * 0.92; var ph := H * 0.88
	var px := (W - pw) * 0.5; var py := (H - ph) * 0.5
	draw_rect(Rect2(px, py, pw, ph), Color("#080612", 0.97))
	draw_rect(Rect2(px, py, pw, ph), Color("#7a5c1e", 0.8), false)
	# Header
	_draw_text_centered(m.name + "  " + m.title, Vector2(px + pw * 0.5, py + 26), 16, Color("#ffd700"))
	draw_line(Vector2(px + 8, py + 34), Vector2(px + pw - 8, py + 34), Color("#5a3e10", 0.7), 1.0)
	# Level & EXP
	_draw_text("Lv.%d    EXP %d / %d" % [m.lv, m.exp, exp_next], Vector2(px + 16, py + 54), 14, Color("#c8e0f0"))
	var exp_bar_w := (pw - 32) * clampf(float(m.exp) / max(1, exp_next), 0.0, 1.0)
	draw_rect(Rect2(px + 16, py + 60, pw - 32, 6), Color(0, 0, 0, 0.5))
	draw_rect(Rect2(px + 16, py + 60, exp_bar_w, 6), Color("#40c070"))
	# Stats
	var col_w := pw * 0.5
	var stats_y := py + 80.0
	var stats := [["HP", str(m.hp)+"/"+str(m.max_hp)], ["MP", str(m.mp)+"/"+str(st.max_mp)], ["ATK", str(st.atk)], ["DEF", str(st.def)], ["SPD", str(st.spd)], ["LUK", str(st.luk)]]
	for i in stats.size():
		var sx := px + 16 + (i % 2) * col_w
		var sy := stats_y + int(i / 2) * 28
		_draw_text(stats[i][0], Vector2(sx, sy), 13, Color("#a0c0e0"))
		_draw_text_right(stats[i][1], Vector2(sx + col_w * 0.4, sy), 13, Color("#f0e8c0"))
	# Equipment
	var eq_y := stats_y + 86.0
	draw_line(Vector2(px + 8, eq_y - 8), Vector2(px + pw - 8, eq_y - 8), Color("#5a3e10", 0.5), 1.0)
	_draw_text("裝備", Vector2(px + 16, eq_y + 4), 13, Color("#ffd700"))
	var slots := [["wp","武器"], ["ar","防具"], ["ac","飾品"]]
	for i in slots.size():
		var slot_id: String = slots[i][0]; var slot_name: String = slots[i][1]
		var eq_id: String = m.equip.get(slot_id, "")
		var eq_name = Data.ITEMS.get(eq_id, {}).get("name", "── 未裝備 ──") if eq_id != "" else "── 未裝備 ──"
		_draw_text(slot_name + "：" + eq_name, Vector2(px + 16, eq_y + 22 + i * 24), 13, Color("#c8b080") if eq_id != "" else Color("#555"))
	# Skills
	var sk_y := eq_y + 100.0
	draw_line(Vector2(px + 8, sk_y - 8), Vector2(px + pw - 8, sk_y - 8), Color("#5a3e10", 0.5), 1.0)
	_draw_text("技能", Vector2(px + 16, sk_y + 4), 13, Color("#ffd700"))
	var skills: Array = m.get("skills", [])
	for i in skills.size():
		var sk = Data.SKILLS.get(skills[i], {})
		if sk.is_empty(): continue
		var sx2 := px + 16 + (i % 2) * col_w
		var sy2 := sk_y + 22 + int(i / 2) * 22
		_draw_text(sk.name + "  MP:" + str(sk.get("mp", 0)), Vector2(sx2, sy2), 12, Color("#a0b8e0"))
	_draw_text_centered("Z/X 返回", Vector2(px + pw * 0.5, py + ph - 14), 12, Color("#9a8060", 0.8))

func _draw_save_slot_panel(W: float, H: float) -> void:
	var pw := W * 0.82; var ph := 3 * 52.0 + 56
	var px := (W-pw)*0.5; var py := (H-ph)*0.5
	draw_rect(Rect2(px,py,pw,ph), Color("#080612",0.97))
	draw_rect(Rect2(px,py,pw,ph), Color("#7a5c1e",0.8), false)
	_draw_text_centered("選擇存檔槽", Vector2(W*0.5, py+26), 15, Color("#ffd700"))
	for i in 3:
		var sel = i == _sub_cursor2
		var iy = py + 44 + i * 52
		if sel: draw_rect(Rect2(px+4, iy, pw-8, 48), Color("#9a7828",0.25))
		var info := _get_slot_info(i)
		var col := Color("#ffd700") if sel else Color("#c8a060")
		_draw_text(("▶ " if sel else "  ") + "存檔 %d" % (i+1), Vector2(px+18, iy+20), 15, col)
		_draw_text(info, Vector2(px+28, iy+40), 12, Color("#a0b8d0") if GS.has_save(i) else Color("#555"))
	_draw_text_centered("X/Esc 取消", Vector2(W*0.5, py+ph-12), 12, Color("#9a8060",0.8))

func _get_slot_info(slot: int) -> String:
	if not GS.has_save(slot): return "── 空存檔 ──"
	var path := "user://save_%d.json" % slot
	var file := FileAccess.open(path, FileAccess.READ)
	if not file: return "── 空存檔 ──"
	var data = JSON.parse_string(file.get_as_text())
	if not data is Dictionary: return "── 空存檔 ──"
	var map_name: String = Data.MAPS.get(data.get("map_id",""), {}).get("name","?")
	var party: Array = data.get("party", [])
	var lv: int = party[0].get("lv", 1) if not party.is_empty() else 1
	var gold: int = data.get("gold", 0)
	var cleared: bool = data.get("flags", {}).get("game_cleared", false)
	return "%s  Lv.%d  %d靈石%s" % [map_name, lv, gold, "  ★通關" if cleared else ""]

func _draw_minimap(W: float, H: float, cam_x: float, cam_y: float) -> void:
	var tiles: Array = _map.get("tiles", [])
	if tiles.is_empty():
		return
	var mw = tiles[0].size()
	var mh = tiles.size()
	var cell := 4.0
	var mm_w = mw * cell
	var mm_h = mh * cell
	var mm_x = W - mm_w - 6
	var mm_y = H - mm_h - 6
	draw_rect(Rect2(mm_x - 2, mm_y - 2, mm_w + 4, mm_h + 4), Color(0,0,0,0.55))
	for row in mh:
		for col in mw:
			var t: int = tiles[row][col]
			var tc: Color = Data.TILE_COLORS.get(t, Color("#333"))
			draw_rect(Rect2(mm_x + col*cell, mm_y + row*cell, cell, cell), Color(tc.r, tc.g, tc.b, 0.8))
	# Player dot
	draw_rect(Rect2(mm_x + _px*cell, mm_y + _py*cell, cell, cell), Color("#ffd700"))

# ── Draw helpers ─────────────────────────────────────────────
func _draw_text(text: String, pos: Vector2, size: int, color: Color) -> void:
	if _font: draw_string(_font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text_centered(text: String, pos: Vector2, size: int, color: Color) -> void:
	if not _font: return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos - Vector2(sw*0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text_right(text: String, pos: Vector2, size: int, color: Color) -> void:
	if not _font: return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos - Vector2(sw, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text_wrap(text: String, pos: Vector2, max_w: float, size: int, color: Color) -> void:
	if not _font: return
	# Simple line-by-line wrap
	var line_h := size + 5
	var lines := text.split("\n")
	var y := pos.y
	for line in lines:
		draw_string(_font, Vector2(pos.x, y), line, HORIZONTAL_ALIGNMENT_LEFT, int(max_w), size, color)
		y += line_h

func draw_ellipse_filled(center: Vector2, rx: float, ry: float, color: Color) -> void:
	var pts := PackedVector2Array()
	var n := 20
	for i in n:
		var a := float(i) / n * TAU
		pts.append(center + Vector2(cos(a)*rx, sin(a)*ry))
	draw_polygon(pts, [color])
