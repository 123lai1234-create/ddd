extends Node2D

var _font: Font
var _t := 0.0
var _stars: Array = []
var _scroll := 0.0
var _flash_alpha := 0.0

func _ready() -> void:
	_font = ThemeDB.fallback_font
	var vp := get_viewport_rect()
	for _i in 80:
		_stars.append({"x": randf()*vp.size.x, "y": randf()*vp.size.y*0.6,
			"r": randf_range(0.4,1.5), "phase": randf()*TAU, "speed": randf_range(0.02,0.05)})
	Sound.bgm("village")
	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, 1.4)
	# Fanfare flash
	get_tree().create_timer(0.3).timeout.connect(func():
		_flash_alpha = 0.6
		var tw2 := create_tween()
		tw2.tween_method(func(v): _flash_alpha = v; queue_redraw(), 0.6, 0.0, 0.5)
	)

func _process(delta: float) -> void:
	_t += delta
	_scroll += delta * 24.0
	queue_redraw()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept") or event.is_action_pressed("ui_cancel"):
		Sound.play("menuSelect")
		var tw := create_tween()
		tw.tween_property(self, "modulate:a", 0.0, 0.5)
		tw.tween_callback(func(): GS.init(); get_tree().change_scene_to_file("res://scenes/Title.tscn"))

func _draw() -> void:
	if not _font: return
	var W := get_viewport_rect().size.x
	var H := get_viewport_rect().size.y
	var gy := H * 0.55

	# Sky
	draw_rect(Rect2(0,0,W,H*0.5), Color("#0c0418"))
	draw_rect(Rect2(0,H*0.5,W,H*0.5), Color("#060316"))

	# Moon glow + moon
	for rm in [3.5, 2.5, 1.8]:
		draw_circle(Vector2(W*0.5,H*0.12), H*0.06*rm, Color(1,0.9,0.6,0.04))
	draw_circle(Vector2(W*0.5,H*0.12), H*0.06, Color("#ffd4a0"))
	draw_circle(Vector2(W*0.515,H*0.112), H*0.052, Color("#0c0418"))

	# Stars
	for s in _stars:
		var a := 0.3 + sin(_t*s.speed+s.phase)*0.4+0.3
		draw_circle(Vector2(s.x,s.y), s.r, Color(1,0.97,0.88,clampf(a,0.05,1.0)))

	# Mountains
	var mpts := PackedVector2Array()
	for p in [[0,0.75],[0.1,0.5],[0.25,0.65],[0.4,0.42],[0.55,0.58],[0.7,0.38],[0.85,0.52],[1.0,0.44],[1.0,1.0],[0,1.0]]:
		mpts.append(Vector2(p[0]*W, p[1]*gy))
	draw_polygon(mpts, [Color("#1e1030")])
	draw_rect(Rect2(0,gy,W,H-gy), Color("#0e0806"))
	draw_line(Vector2(0,gy), Vector2(W,gy), Color("#b07828",0.65), 2.0)

	# Scrolling credits
	var lines := _build_credits()
	var cy := H*0.82 - _scroll
	for ln in lines:
		var text: String = ln[0]; var sz: int = ln[1]; var col: Color = ln[2]
		if text != "" and sz > 0:
			var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			var fa := clampf((cy-H*0.52)/36.0,0,1)*clampf((H*0.9-cy)/28.0,0,1)
			draw_string(_font, Vector2(W*0.5-sw*0.5,cy), text, HORIZONTAL_ALIGNMENT_LEFT,-1,sz, Color(col.r,col.g,col.b,fa))
		cy += 34.0 if sz > 20 else (24.0 if sz > 0 else 12.0)

	# Flash overlay
	if _flash_alpha > 0.0:
		draw_rect(Rect2(0,0,W,H), Color(1,0.9,0.5,_flash_alpha))

	# Bottom hint
	var blink := 0.55 + sin(_t*2.8)*0.45
	var hint := "按任意鍵返回標題"
	var hw := _font.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT,-1,13).x
	draw_string(_font, Vector2(W*0.5-hw*0.5,H*0.935), hint, HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color(0.8,0.7,0.4,blink))

func _build_credits() -> Array:
	var lines: Array = [
		["仙境傳說", 36, Color("#ffd700")],
		["", 0, Color.WHITE],
		["── 魔君已倒，天下太平 ──", 16, Color("#ff88ff")],
		["", 0, Color.WHITE],
		["", 0, Color.WHITE],
		["隊伍成員", 18, Color("#ffd700")],
		["", 0, Color.WHITE],
	]
	for m in GS.party:
		var st := Data.calc_stats(m)
		lines.append(["%s  Lv.%d   HP %d / %d   MP %d" % [m.name, m.lv, m.hp, m.max_hp, m.mp],
			14, m.get("color", Color("#c8c8c8"))])
	lines.append(["", 0, Color.WHITE])
	lines.append(["持有靈石  %d" % GS.gold, 15, Color("#ffd700")])
	lines.append(["", 0, Color.WHITE])
	lines.append(["", 0, Color.WHITE])
	lines.append(["", 0, Color.WHITE])
	lines.append(["感　謝　遊　玩", 26, Color("#ffd700")])
	lines.append(["", 0, Color.WHITE])
	lines.append(["仙俠 RPG 冒險", 15, Color("#c8a060")])
	lines.append(["", 0, Color.WHITE])
	lines.append(["", 0, Color.WHITE])
	return lines
