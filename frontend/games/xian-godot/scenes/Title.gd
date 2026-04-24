extends Node2D

const MENU_ITEMS := ["新遊戲", "繼續遊戲", "說明"]

var _cursor := 0
var _t := 0.0
var _stars: Array = []
var _font: Font
var _title_alpha := 0.0
var _title_scale := 0.6
var _ready_done := false

var _sub_mode := ""   # "slot_new" / "slot_continue" / "help"
var _slot_cursor := 0
var _msg := ""
var _msg_timer := 0.0

func _ready() -> void:
	_font = ThemeDB.fallback_font
	var vp := get_viewport_rect()
	for _i in 80:
		_stars.append({
			"x": randf() * vp.size.x,
			"y": randf() * vp.size.y * 0.65,
			"r": randf_range(0.5, 2.0),
			"phase": randf() * TAU,
			"speed": randf_range(0.02, 0.06),
		})
	var tw := create_tween()
	tw.tween_method(func(v): _title_alpha = v; _title_scale = 0.6 + v * 0.4; queue_redraw(), 0.0, 1.0, 0.8)
	tw.tween_callback(func(): _ready_done = true)
	Sound.bgm("village")

func _process(delta: float) -> void:
	_t += delta
	if _msg_timer > 0.0:
		_msg_timer -= delta
		if _msg_timer <= 0.0: _msg = ""
	queue_redraw()

func _input(event: InputEvent) -> void:
	if not _ready_done: return
	if _sub_mode != "":
		_handle_sub_input(event); return
	if event.is_action_pressed("ui_up"):
		_cursor = (_cursor - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		Sound.play("menuMove")
	elif event.is_action_pressed("ui_down"):
		_cursor = (_cursor + 1) % MENU_ITEMS.size()
		Sound.play("menuMove")
	elif event.is_action_pressed("ui_accept"):
		Sound.play("menuSelect")
		match _cursor:
			0: _sub_mode = "slot_new";      _slot_cursor = 0; queue_redraw()
			1: _sub_mode = "slot_continue"; _slot_cursor = 0; queue_redraw()
			2: _sub_mode = "help";                            queue_redraw()

func _handle_sub_input(event: InputEvent) -> void:
	if _sub_mode == "help":
		if event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel"):
			Sound.play("menuMove"); _sub_mode = ""; queue_redraw()
		return
	if event.is_action_pressed("ui_up"):
		_slot_cursor = (_slot_cursor - 1 + 3) % 3; Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_down"):
		_slot_cursor = (_slot_cursor + 1) % 3; Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_cancel"):
		_sub_mode = ""; Sound.play("menuMove"); queue_redraw()
	elif event.is_action_pressed("ui_accept"):
		Sound.play("menuSelect")
		if _sub_mode == "slot_new":
			GS.init()
			GS.save_game(_slot_cursor)
			_fade_to("res://scenes/World.tscn")
		elif _sub_mode == "slot_continue":
			if GS.has_save(_slot_cursor):
				GS.load_game(_slot_cursor)
				_fade_to("res://scenes/World.tscn")
			else:
				_msg = "此存檔槽為空！"; _msg_timer = 1.5; queue_redraw()

func _fade_to(scene_path: String) -> void:
	var tw := create_tween()
	tw.tween_method(func(v): modulate.a = 1.0 - v, 0.0, 1.0, 0.4)
	tw.tween_callback(func(): get_tree().change_scene_to_file(scene_path))

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
	var tag := "  ★通關" if cleared else ""
	return "%s  Lv.%d  %d靈石%s" % [map_name, lv, gold, tag]

func _draw() -> void:
	var W := get_viewport_rect().size.x
	var H := get_viewport_rect().size.y
	var ground_y := H * 0.58

	draw_rect(Rect2(0, 0, W, H * 0.5), Color("#0c0418"))
	draw_rect(Rect2(0, H * 0.5, W, H * 0.5), Color("#060316"))

	_draw_circle_alpha(Vector2(W * 0.82, H * 0.13), H * 0.13, Color("#fff4d0"), 0.06)
	draw_circle(Vector2(W * 0.82, H * 0.13), H * 0.048, Color("#ffd4a0"))
	draw_circle(Vector2(W * 0.836, H * 0.12), H * 0.042, Color("#0c0418"))

	for s in _stars:
		var a := 0.25 + sin(_t * s.speed + s.phase) * 0.38 + 0.35
		draw_circle(Vector2(s.x, s.y), s.r, Color(1.0, 0.97, 0.88, clampf(a, 0.05, 1.0)))

	var m1_pts := PackedVector2Array()
	for p in [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38],[1.0,1.0],[0.0,1.0]]:
		m1_pts.append(Vector2(p[0]*W, p[1]*ground_y))
	draw_polygon(m1_pts, [Color("#180c2a")])

	var m2_pts := PackedVector2Array()
	for p in [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52],[1.0,1.0],[0.0,1.0]]:
		m2_pts.append(Vector2(p[0]*W, p[1]*ground_y))
	draw_polygon(m2_pts, [Color("#1e1030")])

	draw_rect(Rect2(0, ground_y, W, H - ground_y), Color("#0e0806"))
	draw_line(Vector2(0, ground_y), Vector2(W, ground_y), Color("#b07828", 0.65), 2.0)

	# Title
	var ts := int(H * 0.09)
	var title_pos := Vector2(W * 0.5, H * 0.28)
	var title_color := Color(0.93, 0.85, 0.38, _title_alpha)
	for r in [20.0, 14.0, 9.0]:
		_draw_text_centered("仙境傳說", title_pos + Vector2(0, 2), ts, Color(1.0, 0.6, 0.0, _title_alpha * 0.15 * (20.0 / r)))
	_draw_text_centered("仙境傳說", title_pos, ts, title_color)
	_draw_text_centered("仙俠 RPG 冒險", Vector2(W * 0.5, H * 0.36), int(H * 0.028), Color(0.75, 0.65, 0.45, _title_alpha * 0.9))

	if _title_alpha > 0.5:
		var sep_a := (_title_alpha - 0.5) * 2.0
		draw_line(Vector2(W * 0.2, H * 0.41), Vector2(W * 0.8, H * 0.41), Color(0.6, 0.45, 0.15, sep_a * 0.6), 1.0)

	# Main menu (dim when sub_mode active)
	if _ready_done:
		var menu_alpha := 0.35 if _sub_mode != "" else 1.0
		var menu_y := H * 0.48
		var row_h := H * 0.072
		for i in MENU_ITEMS.size():
			var sel = i == _cursor and _sub_mode == ""
			var by := menu_y + i * row_h
			if sel:
				draw_rect(Rect2(W * 0.28, by - row_h * 0.45, W * 0.44, row_h * 0.9), Color(0.6, 0.47, 0.12, 0.22))
				draw_rect(Rect2(W * 0.28, by - row_h * 0.45, W * 0.44, row_h * 0.9), Color(0.7, 0.56, 0.18, 0.5), false)
			var has_save := i == 1 and not GS.has_save(0) and not GS.has_save(1) and not GS.has_save(2)
			var blink := 1.0 if not sel else (0.7 + sin(_t * 5.0) * 0.3)
			var col := Color(0.5, 0.4, 0.25, menu_alpha * 0.55) if has_save else (Color(1.0, 0.87, 0.25, blink * menu_alpha) if sel else Color(0.85, 0.68, 0.38, 0.9 * menu_alpha))
			var prefix := "▶ " if sel else "   "
			_draw_text_centered(prefix + MENU_ITEMS[i], Vector2(W * 0.5, by), int(row_h * 0.55), col)

	# Sub-mode overlays
	if _sub_mode in ["slot_new", "slot_continue"]:
		_draw_slot_picker(W, H)
	elif _sub_mode == "help":
		_draw_help(W, H)

	# Message
	if _msg != "":
		var mw = _font.get_string_size(_msg, HORIZONTAL_ALIGNMENT_LEFT,-1,14).x if _font else 100
		draw_rect(Rect2(W*0.5-mw*0.5-12, H*0.72, mw+24, 28), Color(0,0,0,0.82))
		_draw_text_centered(_msg, Vector2(W*0.5, H*0.735), 14, Color("#ff8888"))

	_draw_text_centered("↑↓ 選擇   Z/Enter 確認", Vector2(W * 0.5, H * 0.93), int(H * 0.022), Color(0.5, 0.4, 0.25, 0.7))

func _draw_slot_picker(W: float, H: float) -> void:
	var title := "選擇存檔槽 — 新遊戲" if _sub_mode == "slot_new" else "選擇讀取存檔"
	var pw := W * 0.82; var ph := 3 * 52.0 + 56
	var px := (W - pw) * 0.5; var py := (H - ph) * 0.5
	draw_rect(Rect2(px, py, pw, ph), Color("#080612", 0.97))
	draw_rect(Rect2(px, py, pw, ph), Color("#7a5c1e", 0.8), false)
	_draw_text_centered(title, Vector2(W*0.5, py+26), 15, Color("#ffd700"))
	for i in 3:
		var sel = i == _slot_cursor
		var iy = py + 44 + i * 52
		if sel: draw_rect(Rect2(px+4, iy, pw-8, 48), Color("#9a7828", 0.25))
		var info := _get_slot_info(i)
		var col := Color("#ffd700") if sel else Color("#c8a060")
		_draw_text(("▶ " if sel else "  ") + "存檔 %d" % (i+1), Vector2(px+18, iy+20), 15, col)
		_draw_text(info, Vector2(px+28, iy+40), 12, Color("#a0b8d0") if GS.has_save(i) else Color("#555"))
	_draw_text_centered("X/Esc 返回", Vector2(W*0.5, py+ph-12), 12, Color("#9a8060",0.8))

func _draw_help(W: float, H: float) -> void:
	var pw := W * 0.86; var ph := H * 0.62
	var px := (W-pw)*0.5; var py := (H-ph)*0.5
	draw_rect(Rect2(px,py,pw,ph), Color("#080612",0.97))
	draw_rect(Rect2(px,py,pw,ph), Color("#7a5c1e",0.8), false)
	_draw_text_centered("說明", Vector2(W*0.5, py+26), 17, Color("#ffd700"))
	draw_line(Vector2(px+8,py+36), Vector2(px+pw-8,py+36), Color("#5a3e10",0.6), 1.0)
	var lines := [
		["移動", "方向鍵 ↑↓←→"],
		["確認 / 攻擊", "Z 或 Enter"],
		["取消 / 選單", "X 或 Esc"],
		["", ""],
		["戰鬥選項", "攻擊 / 技能 / 道具 / 防禦 / 逃跑"],
		["世界探索", "靠近 NPC 按確認對話"],
		["", ""],
		["目標", "擊倒千魔城的魔君"],
	]
	var lh := (ph - 56) / lines.size()
	for i in lines.size():
		var ln = lines[i]
		if ln[0] == "": continue
		_draw_text(ln[0], Vector2(px+20, py+50+i*lh), 13, Color("#ffd700"))
		_draw_text_right(ln[1], Vector2(px+pw-16, py+50+i*lh), 13, Color("#c8e0f0"))
	_draw_text_centered("Z/X 關閉", Vector2(W*0.5, py+ph-14), 12, Color("#9a8060",0.8))

# ── Draw helpers ─────────────────────────────────────────────
func _draw_text_centered(text: String, pos: Vector2, size: int, color: Color) -> void:
	if _font == null: return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos - Vector2(sw * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text(text: String, pos: Vector2, size: int, color: Color) -> void:
	if _font: draw_string(_font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text_right(text: String, pos: Vector2, size: int, color: Color) -> void:
	if not _font: return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos-Vector2(sw,0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_circle_alpha(center: Vector2, radius: float, color: Color, alpha: float) -> void:
	draw_circle(center, radius, Color(color.r, color.g, color.b, alpha))
