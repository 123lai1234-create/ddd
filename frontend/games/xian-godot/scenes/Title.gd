extends Node2D

const MENU_ITEMS := ["新遊戲", "繼續遊戲", "說明"]

var _cursor := 0
var _t := 0.0
var _stars: Array = []
var _font: Font

# Tween for title animation
var _title_alpha := 0.0
var _title_scale := 0.6
var _ready_done := false

func _ready() -> void:
	_font = ThemeDB.fallback_font
	# Generate stars
	var vp := get_viewport_rect()
	for _i in 80:
		_stars.append({
			"x": randf() * vp.size.x,
			"y": randf() * vp.size.y * 0.65,
			"r": randf_range(0.5, 2.0),
			"phase": randf() * TAU,
			"speed": randf_range(0.02, 0.06),
		})
	# Title entrance tween
	var tw := create_tween()
	tw.tween_method(func(v): _title_alpha = v; _title_scale = 0.6 + v * 0.4; queue_redraw(), 0.0, 1.0, 0.8)
	tw.tween_callback(func(): _ready_done = true)
	Sound.bgm("village")

func _process(delta: float) -> void:
	_t += delta
	queue_redraw()

func _input(event: InputEvent) -> void:
	if not _ready_done:
		return
	if event.is_action_pressed("ui_up"):
		_cursor = (_cursor - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		Sound.play("menuMove")
	elif event.is_action_pressed("ui_down"):
		_cursor = (_cursor + 1) % MENU_ITEMS.size()
		Sound.play("menuMove")
	elif event.is_action_pressed("ui_accept"):
		Sound.play("menuSelect")
		_on_select()

func _on_select() -> void:
	match _cursor:
		0:  # New game
			GS.init()
			_fade_to("res://scenes/World.tscn")
		1:  # Continue
			if GS.has_save(0):
				GS.load_game(0)
				_fade_to("res://scenes/World.tscn")
			else:
				# Flash "no save" message — just go new game
				GS.init()
				_fade_to("res://scenes/World.tscn")
		2:  # Info — do nothing for now
			pass

func _fade_to(scene_path: String) -> void:
	var tw := create_tween()
	tw.tween_method(func(v): modulate.a = 1.0 - v, 0.0, 1.0, 0.4)
	tw.tween_callback(func(): get_tree().change_scene_to_file(scene_path))

func _draw() -> void:
	var W := get_viewport_rect().size.x
	var H := get_viewport_rect().size.y
	var ground_y := H * 0.58

	# Background gradient (draw as two rects)
	draw_rect(Rect2(0, 0, W, H * 0.5), Color("#0c0418"))
	draw_rect(Rect2(0, H * 0.5, W, H * 0.5), Color("#060316"))

	# Moon glow + moon
	_draw_circle_alpha(Vector2(W * 0.82, H * 0.13), H * 0.13, Color("#fff4d0"), 0.06)
	draw_circle(Vector2(W * 0.82, H * 0.13), H * 0.048, Color("#ffd4a0"))
	draw_circle(Vector2(W * 0.836, H * 0.12), H * 0.042, Color("#0c0418"))

	# Stars (twinkling)
	for s in _stars:
		var a := 0.25 + sin(_t * s.speed + s.phase) * 0.38 + 0.35
		draw_circle(Vector2(s.x, s.y), s.r, Color(1.0, 0.97, 0.88, clampf(a, 0.05, 1.0)))

	# Mountains back
	var m1_pts := PackedVector2Array()
	for p in [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38],[1.0,1.0],[0.0,1.0]]:
		m1_pts.append(Vector2(p[0]*W, p[1]*ground_y))
	draw_polygon(m1_pts, [Color("#180c2a")])

	# Mountains front
	var m2_pts := PackedVector2Array()
	for p in [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52],[1.0,1.0],[0.0,1.0]]:
		m2_pts.append(Vector2(p[0]*W, p[1]*ground_y))
	draw_polygon(m2_pts, [Color("#1e1030")])

	# Ground
	draw_rect(Rect2(0, ground_y, W, H - ground_y), Color("#0e0806"))
	draw_line(Vector2(0, ground_y), Vector2(W, ground_y), Color("#b07828", 0.65), 2.0)

	# Title
	var ts := int(H * 0.09)
	var title_pos := Vector2(W * 0.5, H * 0.28)
	var title_color := Color(0.93, 0.85, 0.38, _title_alpha)
	# Glow
	for r in [20.0, 14.0, 9.0]:
		_draw_text_centered("仙境傳說", title_pos + Vector2(0, 2), ts, Color(1.0, 0.6, 0.0, _title_alpha * 0.15 * (20.0 / r)))
	_draw_text_centered("仙境傳說", title_pos, ts, title_color)
	# Subtitle
	_draw_text_centered("仙俠 RPG 冒險", Vector2(W * 0.5, H * 0.36), int(H * 0.028), Color(0.75, 0.65, 0.45, _title_alpha * 0.9))

	# Separator
	if _title_alpha > 0.5:
		var sep_a := (_title_alpha - 0.5) * 2.0
		draw_line(Vector2(W * 0.2, H * 0.41), Vector2(W * 0.8, H * 0.41), Color(0.6, 0.45, 0.15, sep_a * 0.6), 1.0)

	# Menu items
	if _ready_done:
		var menu_y := H * 0.48
		var row_h := H * 0.072
		for i in MENU_ITEMS.size():
			var sel := i == _cursor
			var by := menu_y + i * row_h
			if sel:
				# Highlight box
				draw_rect(Rect2(W * 0.28, by - row_h * 0.45, W * 0.44, row_h * 0.9), Color(0.6, 0.47, 0.12, 0.22))
				draw_rect(Rect2(W * 0.28, by - row_h * 0.45, W * 0.44, row_h * 0.9), Color(0.7, 0.56, 0.18, 0.5), false)
			var blink := 1.0 if not sel else (0.7 + sin(_t * 5.0) * 0.3)
			var col := Color(1.0, 0.87, 0.25, blink) if sel else Color(0.85, 0.68, 0.38, 0.9)
			var prefix := "▶ " if sel else "   "
			_draw_text_centered(prefix + MENU_ITEMS[i], Vector2(W * 0.5, by), int(row_h * 0.55), col)

	# Bottom hint
	_draw_text_centered("↑↓ 選擇   Z/Enter 確認", Vector2(W * 0.5, H * 0.93), int(H * 0.022), Color(0.5, 0.4, 0.25, 0.7))

# ── Draw helpers ─────────────────────────────────────────────
func _draw_text_centered(text: String, pos: Vector2, size: int, color: Color) -> void:
	if _font == null:
		return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos - Vector2(sw * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_circle_alpha(center: Vector2, radius: float, color: Color, alpha: float) -> void:
	draw_circle(center, radius, Color(color.r, color.g, color.b, alpha))
