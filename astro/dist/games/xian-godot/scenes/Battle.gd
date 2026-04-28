extends Node2D

var _font: Font
var _t := 0.0
var W := 0.0
var H := 0.0
var _ground_y := 0.0

# Battle state
var _phase := "intro"  # intro/playerTurn/enemyTurn/win/lose
var _waiting := false
var _cursor := 0
var _sub_cursor := 0
var _sub_mode := ""     # ""/skill/item/target
var _target_list: Array = []
var _pending_skill := ""
var _pending_item := ""
var _actor_idx := 0

# Combat data (local copies)
var _party: Array = []
var _enemies: Array = []

# Sprite positions
var _enemy_pos: Array = []  # Vector2 per enemy
var _hero_pos: Array = []   # Vector2 per hero
var _enemy_offsets: Array = [] # animated offsets
var _hero_offsets: Array = []

# Log
var _log_text := ""

# Float texts
var _floats: Array = []  # {text, pos, color, size, age, max_age}

# Stars
var _stars: Array = []

# Screen shake
var _shake_x := 0.0
var _shake_y := 0.0
var _shake_dur := 0.0
var _shake_int := 0.0

# Screen flash
var _flash_alpha := 0.0
var _flash_col := Color.WHITE

# UI dims
var _log_y := 0.0
var _log_h := 0.0
var _ui_y := 0.0
var _ui_h := 0.0
var _split_x := 0.0

func _ready() -> void:
	_font = ThemeDB.fallback_font
	var vp := get_viewport_rect()
	W = vp.size.x; H = vp.size.y
	_ground_y = H * 0.56
	_log_y = _ground_y + 34
	_log_h = max(32.0, H * 0.065)
	_ui_y = _log_y + _log_h + 2
	_ui_h = H - _ui_y
	_split_x = W * 0.44

	# Copy battle data
	_party = GS.party.map(func(m): return m.duplicate(true))
	_enemies = GS.battle_data.get("enemies", []).map(func(e): return e.duplicate(true))

	# Compute resting positions
	var ec := _enemies.size()
	for i in ec:
		var ex := W * 0.22 if ec == 1 else W * (0.13 + i * 0.18)
		_enemy_pos.append(Vector2(ex, _ground_y))
		_enemy_offsets.append(Vector2.ZERO)
	for i in _party.size():
		_hero_pos.append(Vector2(W * (0.62 + i * 0.13), _ground_y))
		_hero_offsets.append(Vector2.ZERO)

	# Stars
	for _i in 90:
		_stars.append({"x": randf()*W, "y": randf()*_ground_y*0.92, "r": randf_range(0.3,1.3), "phase": randf()*TAU, "speed": randf_range(0.02,0.06)})

	Sound.bgm("battle")

	# Intro slide-in animation
	# enemies start off-screen right
	for i in _enemies.size():
		_enemy_offsets[i] = Vector2(W + 100, 0)
		var tw := create_tween()
		tw.tween_method(
			func(v): _enemy_offsets[i] = Vector2(lerp(W+100.0, 0.0, v), 0); queue_redraw(),
			0.0, 1.0, 0.5
		).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.08 * i)

	# heroes start off-screen left
	for i in _party.size():
		_hero_offsets[i] = Vector2(-100, 0)
		var tw := create_tween()
		tw.tween_method(
			func(v): _hero_offsets[i] = Vector2(lerp(-100.0, 0.0, v), 0); queue_redraw(),
			0.0, 1.0, 0.5
		).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.08 * i)

	# Fade in camera
	modulate.a = 0.0
	var tw_fade := create_tween()
	tw_fade.tween_property(self, "modulate:a", 1.0, 0.4)

	# Start player turn after intro
	get_tree().create_timer(0.9).timeout.connect(func():
		_phase = "playerTurn"
		_add_log("遭遇了 " + "、".join(_enemies.map(func(e): return e.name)) + "！")
		queue_redraw()
	)

func _process(delta: float) -> void:
	_t += delta
	# Update floats
	for f in _floats:
		f.age += delta
	_floats = _floats.filter(func(f): return f.age < f.max_age)
	# Shake decay
	if _shake_dur > 0.0:
		_shake_dur -= delta
		_shake_x = randf_range(-_shake_int, _shake_int)
		_shake_y = randf_range(-_shake_int, _shake_int)
		if _shake_dur <= 0.0:
			_shake_x = 0.0; _shake_y = 0.0
	queue_redraw()

func _input(event: InputEvent) -> void:
	if _waiting or _phase != "playerTurn": return
	var actor = _party[_actor_idx] if _actor_idx < _party.size() else {}
	if actor.is_empty() or actor.get("dead", false): return

	var up    := event.is_action_pressed("ui_up")
	var down  := event.is_action_pressed("ui_down")
	var ok    := event.is_action_pressed("ui_accept")
	var back  := event.is_action_pressed("ui_cancel")

	if _sub_mode == "":
		if up:   _cursor = (_cursor-1+5)%5; Sound.play("menuMove"); queue_redraw()
		elif down: _cursor = (_cursor+1)%5; Sound.play("menuMove"); queue_redraw()
		elif ok:
			Sound.play("menuSelect")
			match _cursor:
				0:  # Attack
					var alive = _enemies.filter(func(e): return not e.get("dead",false))
					if alive.size() == 1:
						_hero_act("attack", "", "", _enemies.find(alive[0]))
					else:
						_sub_mode = "target"; _sub_cursor = 0
						_target_list = alive.map(func(e): return {"is_enemy":true,"e":e})
						queue_redraw()
				1:  _sub_mode = "skill"; _sub_cursor = 0; queue_redraw()
				2:  _sub_mode = "item";  _sub_cursor = 0; queue_redraw()
				3:  _hero_act("defend")
				4:  _hero_act("flee")
	elif _sub_mode == "skill":
		var skills = actor.get("skills",[]).map(func(sk): return Data.SKILLS.get(sk,{})).filter(func(s): return not s.is_empty())
		if up:   _sub_cursor=(_sub_cursor-1+skills.size())%skills.size(); Sound.play("menuMove"); queue_redraw()
		elif down: _sub_cursor=(_sub_cursor+1)%skills.size(); Sound.play("menuMove"); queue_redraw()
		elif back: _sub_mode=""; queue_redraw()
		elif ok:
			var sk = skills[_sub_cursor]
			var sk_id: String = actor.skills[_sub_cursor]
			if actor.get("mp",0) < sk.get("mp",0): _add_log("靈力不足！"); return
			Sound.play("menuSelect")
			if sk.get("tgt","single") == "all":
				_hero_act("skill", sk_id, "", 0); _sub_mode = ""
			elif sk.get("type","") == "heal":
				_target_list = _party.filter(func(m): return not m.get("dead",false)).map(func(m): return {"is_enemy":false,"m":m})
				_sub_mode = "target"; _sub_cursor = 0; _pending_skill = sk_id; queue_redraw()
			else:
				var alive = _enemies.filter(func(e): return not e.get("dead",false))
				if alive.size() == 1:
					_hero_act("skill", sk_id, "", _enemies.find(alive[0])); _sub_mode = ""
				else:
					_target_list = alive.map(func(e): return {"is_enemy":true,"e":e})
					_sub_mode = "target"; _sub_cursor = 0; _pending_skill = sk_id; queue_redraw()
	elif _sub_mode == "item":
		var items := []
		for id in GS.inventory:
			if GS.inventory[id] > 0 and Data.ITEMS.get(id,{}).get("cat","") == "use":
				items.append(id)
		var n := max(1, items.size())
		if up:   _sub_cursor=(_sub_cursor-1+n)%n; Sound.play("menuMove"); queue_redraw()
		elif down: _sub_cursor=(_sub_cursor+1)%n; Sound.play("menuMove"); queue_redraw()
		elif back: _sub_mode=""; queue_redraw()
		elif ok and not items.is_empty():
			Sound.play("menuSelect")
			_pending_item = items[_sub_cursor]
			_target_list = _party.filter(func(m): return not m.get("dead",false)).map(func(m): return {"is_enemy":false,"m":m})
			_sub_mode = "target"; _sub_cursor = 0; queue_redraw()
	elif _sub_mode == "target":
		var n := max(1, _target_list.size())
		if up:   _sub_cursor=(_sub_cursor-1+n)%n; Sound.play("menuMove"); queue_redraw()
		elif down: _sub_cursor=(_sub_cursor+1)%n; Sound.play("menuMove"); queue_redraw()
		elif back:
			_sub_mode = "item" if _pending_item != "" else ("skill" if _pending_skill != "" else "")
			queue_redraw()
		elif ok:
			Sound.play("menuSelect")
			var tgt = _target_list[_sub_cursor]
			if _pending_skill != "":
				var idx := _enemies.find(tgt.e) if tgt.get("is_enemy",false) else _party.find(tgt.get("m",{}))
				_hero_act("skill", _pending_skill, "", idx); _pending_skill = ""; _sub_mode = ""
			elif _pending_item != "":
				var idx := _party.find(tgt.get("m",{}))
				_hero_act("item", "", _pending_item, idx); _pending_item = ""; _sub_mode = ""
			else:
				_hero_act("attack", "", "", _enemies.find(tgt.get("e",{}))); _sub_mode = ""

# ── Battle logic ──────────────────────────────────────────────
func _calc_dmg(atk: int, def_val: int, pow_val: float, pierce: float = 0.0) -> int:
	var eff_def := int(def_val * (1.0 - pierce))
	var dmg := max(1, int(atk * pow_val - eff_def * 0.7))
	return max(1, int(dmg * randf_range(0.85, 1.15)))

func _hero_act(cmd: String, skill_id: String = "", item_id: String = "", target_idx: int = 0) -> void:
	var actor = _party[_actor_idx]
	_waiting = true

	var do_after := func(msg: String):
		_add_log(msg)
		get_tree().create_timer(0.48).timeout.connect(func(): _waiting = false; _next_actor(); queue_redraw())
		queue_redraw()

	match cmd:
		"defend":
			actor.status.append("defend")
			do_after.call(actor.name + " 防禦！")
		"flee":
			if randf() < 0.5:
				_add_log("成功逃跑！")
				await get_tree().create_timer(0.4).timeout
				_fade_out("res://scenes/World.tscn")
			else:
				do_after.call("逃跑失敗！")
		"attack":
			var tgt = _enemies[target_idx]
			var st = Data.calc_stats(actor)
			var crit := randf() < 0.08
			var dmg := _calc_dmg(st.atk, tgt.get("def",0), 1.0)
			if crit: dmg = int(dmg * 1.5)
			var h_sp = _hero_pos[_actor_idx] if _actor_idx < _hero_pos.size() else Vector2(W*0.65, _ground_y)
			var e_sp = _enemy_pos[target_idx] if target_idx < _enemy_pos.size() else Vector2(W*0.22, _ground_y)
			_anim_hero_attack(_actor_idx, target_idx, func():
				tgt.hp = max(0, tgt.hp - dmg)
				if tgt.hp == 0: tgt.dead = true; Sound.play("enemyDead")
				else: Sound.play("hit")
				_shake(0.010 if crit else 0.005)
				var ey = e_sp.y - tgt.get("sz", 28) * 1.4
				if crit:
					_float_text("CRIT! %d" % dmg, Vector2(e_sp.x, ey), Color("#ffd700"), 22)
					_spawn_particles(Vector2(e_sp.x, ey + 20), Color("#ffd700"), 10, 55)
				else:
					_float_text(str(dmg), Vector2(e_sp.x, ey), Color("#ff7070"), 18)
					_spawn_particles(Vector2(e_sp.x, ey + 20), Color("#ff4040"), 6, 35)
				if tgt.dead:
					get_tree().create_timer(0.35).timeout.connect(func(): _spawn_particles(Vector2(e_sp.x, ey + 20), tgt.get("color", Color("#884422")), 14, 65))
				queue_redraw(),
			func():
				var msg = "會心一擊！對 %s 造成 %d 點傷害！" % [tgt.name, dmg] if crit else "%s 攻擊 %s，造成 %d 點傷害！" % [actor.name, tgt.name, dmg]
				do_after.call(msg))
		"skill":
			var sk = Data.SKILLS.get(skill_id, {})
			if sk.is_empty(): do_after.call("…"); return
			if actor.mp < sk.get("mp",0): _add_log("靈力不足！"); _waiting = false; return
			actor.mp = max(0, actor.mp - sk.get("mp",0))
			var st = Data.calc_stats(actor)
			var msg := ""
			if sk.get("type","") == "atk":
				Sound.play("magic")
				var is_aoe = sk.get("tgt","single") == "all"
				var targets = _enemies.filter(func(e): return not e.get("dead",false)) if is_aoe else [_enemies[target_idx]]
				if is_aoe:
					_screen_flash(Color("#6688ff"), 0.35, 0.28)
				var dmgs := []
				for tgt in targets:
					var d := _calc_dmg(st.atk, tgt.get("def",0), sk.get("pow",1.0), sk.get("pierce",0.0))
					tgt.hp = max(0, tgt.hp - d)
					if tgt.hp == 0: tgt.dead = true
					if sk.has("debuff"):
						for k in sk.debuff:
							for _j in sk.debuff[k]: tgt.status.append(k)
					dmgs.append(d)
					var ei := _enemies.find(tgt)
					var epos = _enemy_pos[ei] if ei < _enemy_pos.size() else Vector2(W*0.22, _ground_y)
					var ey = epos.y - tgt.get("sz",28)*1.4
					var ptcol = Color("#ffcc44") if is_aoe else Color("#8888ff")
					var ptcount = 12 if is_aoe else 7
					_float_text(str(d), Vector2(epos.x, ey), Color("#88aaff"), 18)
					_spawn_particles(Vector2(epos.x, ey+20), ptcol, ptcount, 50 if is_aoe else 40)
				_shake(0.008 if is_aoe else 0.006)
				msg = "%s 施展 %s，造成 %s 點傷害！" % [actor.name, sk.name, "/".join(dmgs.map(func(d): return str(d)))]
			elif sk.get("type","") == "heal":
				Sound.play("heal")
				var targets = _party.filter(func(m): return not m.get("dead",false)) if sk.get("tgt","single") == "all" else [_party[target_idx]]
				var heals := []
				for tgt in targets:
					var s2 = Data.calc_stats(tgt)
					var h := int(s2.atk * sk.get("pow",1.0) * randf_range(0.9,1.1))
					tgt.hp = min(tgt.max_hp, tgt.hp + h)
					var pi := _party.find(tgt)
					var hpos = _hero_pos[pi] if pi < _hero_pos.size() else Vector2(W*0.65, _ground_y)
					_float_text("+%d" % h, hpos + Vector2(0,-50), Color("#88ff88"), 18)
					_spawn_particles(hpos + Vector2(0,-20), Color("#44ff88"), 8, 35)
					heals.append(h)
				msg = "%s 施展 %s，恢復 %s 點生命值！" % [actor.name, sk.name, "/".join(heals.map(func(h): return str(h)))]
			get_tree().create_timer(0.48).timeout.connect(func(): _waiting = false; _next_actor(); queue_redraw())
			_add_log(msg); queue_redraw()
		"item":
			var it = Data.ITEMS.get(item_id, {})
			if it.is_empty(): do_after.call("…"); return
			var tgt = _party[target_idx]
			GS.remove_item(item_id)
			var msg := ""
			if it.has("hp"):
				tgt.hp = min(tgt.max_hp, tgt.hp + it.hp); msg = "%s 恢復了 %d HP！" % [tgt.name, it.hp]
			if it.has("mp"):
				var s2 = Data.calc_stats(tgt); tgt.mp = min(s2.max_mp, tgt.mp + it.mp); msg += " MP+%d" % it.mp
			if it.has("revive") and tgt.get("dead",false):
				tgt.dead = false; tgt.hp = int(tgt.max_hp * it.revive / 100.0); msg = tgt.name + " 復活了！"
			var hpos = _hero_pos[target_idx] if target_idx < _hero_pos.size() else Vector2(W*0.65, _ground_y)
			if it.has("hp"):
				_float_text("+%d" % it.hp, hpos + Vector2(0,-50), Color("#88ff88"), 18)
				_spawn_particles(hpos + Vector2(0,-20), Color("#44ff88"), 6, 30)
			do_after.call(msg if msg != "" else "使用了 %s！" % it.get("name","?"))

func _next_actor() -> void:
	if _enemies.all(func(e): return e.get("dead",false)): _win_battle(); return
	if _party.all(func(m): return m.get("dead",false)): _lose_battle(); return
	_actor_idx += 1
	if _actor_idx >= _party.size():
		_enemy_phase(); return
	while _actor_idx < _party.size() and _party[_actor_idx].get("dead",false):
		_actor_idx += 1
	if _actor_idx >= _party.size():
		_enemy_phase(); return
	_cursor = 0; _sub_mode = ""; queue_redraw()

func _enemy_phase() -> void:
	_phase = "enemyTurn"
	var living = _enemies.filter(func(e): return not e.get("dead",false))
	var idx := 0
	var next_enemy : Callable
	next_enemy = func():
		if _party.all(func(m): return m.get("dead",false)):
			_lose_battle(); return
		if idx >= living.size():
			# End of round — apply status
			await get_tree().create_timer(0.2).timeout
			for m in _party:
				if m.get("dead",false): continue
				if "poison" in m.status:
					var dmg := max(1, int(m.max_hp * 0.05))
					m.hp = max(1, m.hp - dmg)
					_add_log("%s 中毒，損失 %d HP！" % [m.name, dmg])
					Sound.play("poison")
					var pi := _party.find(m)
					var hpos = _hero_pos[pi] if pi < _hero_pos.size() else Vector2(W*0.65, _ground_y)
					_float_text(str(dmg), hpos+Vector2(0,-40), Color("#c050e8"), 15)
					_spawn_particles(hpos+Vector2(0,-10), Color("#9030c0"), 5, 25)
				var pc = m.status.filter(func(s): return s=="poison").size()
				m.status = m.status.filter(func(s): return s != "defend" and s != "atkUp" and s != "poison")
				for _j in range(pc - 1): m.status.append("poison")
			if _party.all(func(m): return m.get("dead",false)):
				_lose_battle(); return
			_phase = "playerTurn"; _actor_idx = 0
			while _actor_idx < _party.size() and _party[_actor_idx].get("dead",false): _actor_idx += 1
			_cursor = 0; _sub_mode = ""; queue_redraw()
			return
		var e = living[idx]
		idx += 1
		await _do_enemy_act(e)
		await get_tree().create_timer(0.1).timeout
		next_enemy.call()
	await get_tree().create_timer(0.3).timeout
	next_enemy.call()

func _do_enemy_act(e: Dictionary) -> void:
	var act_id: String = e.acts[randi() % e.acts.size()]
	var act: Dictionary = Data.ENEMY_ACTS.get(act_id, {})
	if act.is_empty(): await get_tree().create_timer(0.4).timeout; return
	var living_heroes = _party.filter(func(m): return not m.get("dead",false))
	if living_heroes.is_empty(): return
	var e_idx := _enemies.find(e)

	if act.get("type","") in ["atk","drain"]:
		if act.get("tgt","single") == "all":
			# AOE — no dash, hit every living hero at once
			_add_log("%s 使用 %s！" % [e.name, act.name])
			_shake(0.007, 0.35)
			for hero in living_heroes:
				var def_val = hero.get("base_def", 5)
				if "defend" in hero.status: def_val = int(def_val * 1.5)
				var dmg := _calc_dmg(e.get("atk",10), def_val, act.get("pow",1.0))
				hero.hp = max(0, hero.hp - dmg)
				if hero.hp == 0: hero.dead = true
				if act.has("debuff"):
					for k in act.debuff:
						for _j in act.debuff[k]: hero.status.append(k)
				var pi := _party.find(hero)
				var hpos = _hero_pos[pi] if pi < _hero_pos.size() else Vector2(W*0.65, _ground_y)
				_float_text(str(dmg), hpos+Vector2(0,-30), Color("#ff8888"), 17)
				_spawn_particles(hpos+Vector2(0,10), Color("#ff6644"), 6, 32)
			Sound.play("damage"); queue_redraw()
			await get_tree().create_timer(0.5).timeout
		else:
			var tgt = living_heroes[randi() % living_heroes.size()]
			var p_idx := _party.find(tgt)
			await _anim_enemy_attack_async(e_idx, p_idx, func():
				var def_val = tgt.get("base_def", 5)
				if "defend" in tgt.status: def_val = int(def_val * 1.5)
				var dmg := _calc_dmg(e.get("atk",10), def_val, act.get("pow",1.0))
				tgt.hp = max(0, tgt.hp - dmg)
				if tgt.hp == 0: tgt.dead = true
				if act.has("debuff"):
					for k in act.debuff:
						for _j in act.debuff[k]: tgt.status.append(k)
				if act.get("type","") == "drain":
					e.hp = min(e.get("max_hp",e.hp), e.hp + int(dmg * 0.5))
				Sound.play("damage"); _shake(0.004, 0.24)
				var hpos = _hero_pos[p_idx] if p_idx < _hero_pos.size() else Vector2(W*0.65, _ground_y)
				_float_text(str(dmg), hpos+Vector2(0,-30), Color("#ff8888"), 17)
				_spawn_particles(hpos+Vector2(0,10), Color("#ff4444"), 5, 28)
				_add_log("%s 使用 %s，%s 受到 %d 點傷害！" % [e.name, act.name, tgt.name, dmg])
				queue_redraw()
			)
			await get_tree().create_timer(0.38).timeout
	elif act.get("type","") == "buff":
		e.status.append(act.get("buff","atkUp"))
		_add_log("%s 使用 %s！" % [e.name, act.name])
		await get_tree().create_timer(0.6).timeout
	else:
		await get_tree().create_timer(0.4).timeout

func _win_battle() -> void:
	_phase = "win"; _waiting = true
	Sound.play("victory"); Sound.stop_bgm()
	# Mark boss(es) defeated so World NPC won't re-trigger
	var is_boss_battle := false
	for e in _enemies:
		if e.get("boss", false):
			GS.flags["defeated_" + e.get("id","")] = true
			is_boss_battle = true
	var exp_gain := 0; var gold_gain := 0
	for e in _enemies:
		exp_gain += Data.ENEMIES.get(e.get("id",""), {}).get("exp", 0)
		gold_gain += Data.ENEMIES.get(e.get("id",""), {}).get("gold", 0)
	GS.gold += gold_gain
	var drops := []
	for e in _enemies:
		for d in Data.ENEMIES.get(e.get("id",""), {}).get("drops", []):
			if randf() < d.r:
				GS.add_item(d.id)
				drops.append(Data.ITEMS.get(d.id, {}).get("name", d.id))
	var level_ups := []
	for i in GS.party.size():
		var m = GS.party[i]
		if _party[i].get("dead",false): continue
		m.exp += exp_gain
		while m.exp >= Data.exp_for_level(m.lv):
			GS.level_up(m); level_ups.append(m.name)
			Sound.play("levelUp")
	for i in _party.size():
		if i < GS.party.size():
			GS.party[i].merge(_party[i], true)
	# Victory flash
	var tw := create_tween()
	tw.tween_property(self, "modulate", Color(2,2,2,1), 0.1).set_trans(Tween.TRANS_LINEAR)
	tw.tween_property(self, "modulate", Color.WHITE, 0.15)
	if is_boss_battle:
		_add_log("魔君已被消滅！天下從此太平！")
		_float_text("勝利！", Vector2(W*0.5, H*0.38), Color("#ffd700"), 32)
		_float_text("魔君已倒！", Vector2(W*0.5, H*0.50), Color("#ff88ff"), 22)
		_screen_flash(Color("#ffe080"), 0.6, 0.8)
		GS.flags["game_cleared"] = true
		await get_tree().create_timer(3.8).timeout
		_fade_out("res://scenes/Ending.tscn")
	else:
		var msg := "戰鬥勝利！獲得 %d EXP、%d 靈石。" % [exp_gain, gold_gain]
		if not drops.is_empty(): msg += " 獲得：" + "、".join(drops) + "。"
		if not level_ups.is_empty(): msg += " " + "、".join(level_ups) + " 升級！"
		_add_log(msg)
		_float_text("+%d EXP" % exp_gain, Vector2(W*0.5, H*0.46), Color("#88ffcc"), 18)
		_float_text("+%d 靈石" % gold_gain, Vector2(W*0.5, H*0.53), Color("#ffd700"), 18)
		await get_tree().create_timer(2.2).timeout
		_fade_out("res://scenes/World.tscn")

func _lose_battle() -> void:
	_phase = "lose"; _waiting = true
	Sound.play("dead"); Sound.stop_bgm()
	_add_log("全員陣亡…")
	await get_tree().create_timer(2.8).timeout
	GS.init()
	_fade_out("res://scenes/Title.tscn")

func _fade_out(path: String) -> void:
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.5)
	tw.tween_callback(func(): get_tree().change_scene_to_file(path))

# ── Animations ────────────────────────────────────────────────
func _anim_hero_attack(h_idx: int, e_idx: int, on_hit: Callable, on_done: Callable) -> void:
	var orig_x = _hero_pos[h_idx].x if h_idx < _hero_pos.size() else W*0.65
	var tgt_x = (_enemy_pos[e_idx].x if e_idx < _enemy_pos.size() else W*0.22) + 60.0
	var tw := create_tween()
	tw.tween_method(
		func(v): if h_idx < _hero_offsets.size(): _hero_offsets[h_idx].x = v; queue_redraw(),
		0.0, tgt_x - orig_x, 0.18
	).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw.tween_callback(func():
		on_hit.call()
		var tw2 := create_tween()
		tw2.tween_method(
			func(v): if h_idx < _hero_offsets.size(): _hero_offsets[h_idx].x = v; queue_redraw(),
			tgt_x - orig_x, 0.0, 0.28
		).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw2.tween_callback(on_done)
	)

func _anim_enemy_attack_async(e_idx: int, h_idx: int, on_hit: Callable) -> void:
	var orig_x = _enemy_pos[e_idx].x if e_idx < _enemy_pos.size() else W*0.22
	var tgt_x = (_hero_pos[h_idx].x if h_idx < _hero_pos.size() else W*0.65) - 60.0
	var tw := create_tween()
	tw.tween_method(
		func(v): if e_idx < _enemy_offsets.size(): _enemy_offsets[e_idx].x = v; queue_redraw(),
		0.0, tgt_x - orig_x, 0.18
	).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	await tw.finished
	on_hit.call()
	var tw2 := create_tween()
	tw2.tween_method(
		func(v): if e_idx < _enemy_offsets.size(): _enemy_offsets[e_idx].x = v; queue_redraw(),
		tgt_x - orig_x, 0.0, 0.28
	).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await tw2.finished

func _float_text(text: String, pos: Vector2, color: Color, size: float = 18.0) -> void:
	_floats.append({"text": text, "pos": pos, "color": color, "size": size, "age": 0.0, "max_age": 1.1})

func _shake(intensity: float = 0.005, duration: float = 0.26) -> void:
	_shake_int = intensity * W
	_shake_dur = duration

func _screen_flash(col: Color, alpha: float = 0.45, dur: float = 0.22) -> void:
	_flash_col = col; _flash_alpha = alpha
	var tw := create_tween()
	tw.tween_method(func(v): _flash_alpha = v; queue_redraw(), alpha, 0.0, dur)

func _spawn_particles(pos: Vector2, color: Color, count: int = 8, spread: float = 40.0) -> void:
	for i in count:
		var angle := TAU * i / count + randf_range(-0.4, 0.4)
		var dist  := spread * randf_range(0.4, 1.2)
		var p := {
			"start": pos, "end": pos + Vector2(cos(angle)*dist, sin(angle)*dist - 15),
			"color": color, "age": 0.0, "max_age": randf_range(0.5, 0.8),
			"r": randf_range(2.5, 5.5),
		}
		_floats.append({"type": "particle", "data": p, "age": 0.0, "max_age": p.max_age})

func _add_log(msg: String) -> void:
	_log_text = msg
	queue_redraw()

# ── Draw ──────────────────────────────────────────────────────
func _draw() -> void:
	var ox := _shake_x; var oy := _shake_y
	draw_set_transform(Vector2(ox, oy), 0.0, Vector2.ONE)

	# Background
	draw_rect(Rect2(0, 0, W, H * 0.5), Color("#0c0418"))
	draw_rect(Rect2(0, H*0.5, W, H*0.5), Color("#060316"))

	# Moon
	draw_circle(Vector2(W*0.82, H*0.13), H*0.048, Color("#ffd4a0"))
	draw_circle(Vector2(W*0.836, H*0.12), H*0.042, Color("#0c0418"))

	# Stars
	for s in _stars:
		var a := 0.25 + sin(_t * s.speed + s.phase) * 0.38 + 0.35
		draw_circle(Vector2(s.x, s.y), s.r, Color(1.0, 0.97, 0.88, clampf(a, 0.05, 1.0)))

	# Mountains back
	var m1 := PackedVector2Array()
	for p in [[0,0.68],[0.08,0.42],[0.16,0.58],[0.24,0.36],[0.34,0.52],[0.44,0.30],[0.54,0.46],[0.62,0.32],[0.72,0.50],[0.80,0.28],[0.90,0.44],[1.0,0.38],[1.0,1.0],[0.0,1.0]]:
		m1.append(Vector2(p[0]*W, p[1]*_ground_y))
	draw_polygon(m1, [Color("#180c2a")])
	var m2 := PackedVector2Array()
	for p in [[0,0.80],[0.1,0.55],[0.22,0.70],[0.32,0.50],[0.50,0.65],[0.68,0.48],[0.84,0.60],[1.0,0.52],[1.0,1.0],[0.0,1.0]]:
		m2.append(Vector2(p[0]*W, p[1]*_ground_y))
	draw_polygon(m2, [Color("#1e1030")])

	# Ground
	draw_rect(Rect2(0, _ground_y, W, H - _ground_y), Color("#0e0806"))
	draw_line(Vector2(0,_ground_y), Vector2(W,_ground_y), Color("#b07828",0.65), 2.0)
	# Arena glow
	draw_ellipse_filled(Vector2(W*0.38, _ground_y+3), W*0.32, 14.0, Color("#280840", 0.25))

	# Enemy sprites
	for i in _enemies.size():
		var e = _enemies[i]
		var rp = _enemy_pos[i] + _enemy_offsets[i]
		rp.y += sin(_t * 0.045 + i * 1.3) * 2.5  # idle bob
		_draw_enemy(rp, e)
		# HP bar
		var sz = e.get("sz", 28)
		_draw_hp_bar(Vector2(rp.x - sz, _ground_y + 6), sz*2, 7, e.hp, e.get("max_hp", e.hp), Color("#e04040"))
		# Name
		_draw_text_centered(e.name, rp + Vector2(0, 20), 11, Color("#c8a060"))

	# Hero sprites
	for i in _party.size():
		var m = _party[i]
		var rp = _hero_pos[i] + _hero_offsets[i]
		_draw_hero(rp, m)

	# Log strip
	draw_rect(Rect2(0, _log_y, W, _log_h), Color("#050410", 0.93))
	draw_line(Vector2(0,_log_y), Vector2(W,_log_y), Color("#5a3e10",0.8), 1.0)
	draw_line(Vector2(0,_log_y+_log_h), Vector2(W,_log_y+_log_h), Color("#5a3e10",0.8), 1.0)
	_draw_text(_log_text, Vector2(14, _log_y + _log_h*0.62), int(max(12,H*0.023)), Color("#f0e6c8"))

	# Status panel
	_draw_status_panel()
	# Menu panel
	if _phase == "playerTurn":
		_draw_menu_panel()

	# Win/Lose overlays
	if _phase == "win":
		draw_rect(Rect2(0,0,W,H), Color(0,0,0,0.35))
		_draw_text_centered("勝利！", Vector2(W*0.5, H*0.36), int(H*0.08), Color("#ffd700"))
	elif _phase == "lose":
		draw_rect(Rect2(0,0,W,H), Color(0,0,0,0.65))
		_draw_text_centered("全員陣亡", Vector2(W*0.5, H*0.38), int(H*0.08), Color("#ff4040"))

	# Float texts & particles
	for f in _floats:
		if f.has("type") and f.type == "particle":
			var pd = f.data
			var prog = f.age / f.max_age
			var pp = pd.start.lerp(pd.end, prog)
			var alpha = 1.0 - prog
			draw_circle(pp, pd.r * (1.0 - prog*0.8), Color(pd.color.r, pd.color.g, pd.color.b, alpha))
		else:
			var prog = f.age / f.max_age
			var fp = f.pos - Vector2(0, 65.0 * prog)
			var alpha = 1.0 - prog
			var sc = 1.0 + prog * 0.3
			_draw_text_centered(f.text, fp, int(f.size * sc), Color(f.color.r, f.color.g, f.color.b, alpha))

	# Screen flash overlay
	if _flash_alpha > 0.0:
		draw_rect(Rect2(0,0,W,H), Color(_flash_col.r,_flash_col.g,_flash_col.b,_flash_alpha))

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_status_panel() -> void:
	var px := 0.0; var py := _ui_y; var pw := _split_x; var ph := _ui_h
	draw_rect(Rect2(px,py,pw,ph), Color("#080612",0.97))
	draw_rect(Rect2(px,py,pw,ph), Color("#7a5c1e",0.8), false)
	var row_h := ph / _party.size()
	var fs := int(max(11, row_h * 0.28))
	var fs_s := max(9, fs-3)
	for i in _party.size():
		var m = _party[i]
		var ry := py + i * row_h
		var sel := i == _actor_idx and _phase == "playerTurn"
		if sel:
			draw_rect(Rect2(px+2, ry, pw-4, row_h), Color("#9a7828",0.14))
		if i > 0:
			draw_line(Vector2(px+6,ry), Vector2(px+pw-6,ry), Color("#3a2808",0.5), 1.0)
		var col = Color("#ffd700") if sel else (Color("#484040") if m.get("dead",false) else Color("#e8c060"))
		_draw_text(("▶ " if sel else "  ") + m.name, Vector2(px+10, ry+row_h*0.28), fs, col)
		var bar_w := pw * 0.52; var bx := px+10
		var bh := max(5.0, row_h*0.13)
		var st = Data.calc_stats(m)
		_draw_hp_bar(Vector2(bx, ry+row_h*0.46), bar_w, bh, m.hp, m.max_hp, Color("#e04040"))
		_draw_hp_bar(Vector2(bx, ry+row_h*0.70), bar_w, bh, m.mp, st.max_mp, Color("#4060e0"))
		_draw_text(str(m.hp), Vector2(bx+bar_w+5, ry+row_h*0.52), fs_s, Color("#e05050"))
		_draw_text(str(m.mp), Vector2(bx+bar_w+5, ry+row_h*0.76), fs_s, Color("#5070e0"))

func _draw_menu_panel() -> void:
	if _actor_idx >= _party.size(): return
	var actor = _party[_actor_idx]
	if actor.get("dead",false): return
	var px := _split_x+2; var py := _ui_y; var pw := W-_split_x-2; var ph := _ui_h
	draw_rect(Rect2(px,py,pw,ph), Color("#080612",0.97))
	draw_rect(Rect2(px,py,pw,ph), Color("#7a5c1e",0.8), false)
	var fs := int(max(13, ph*0.18))
	if _sub_mode == "":
		var cmds := ["攻擊","技能","道具","防禦","逃跑"]
		var col_w := pw*0.5; var rh := ph/3.0
		for i in cmds.size():
			var c := int(i/3); var r := i%3
			var tx := px + c*col_w + 20; var ty := py + r*rh + rh*0.5
			var sel := i == _cursor
			if sel:
				draw_rect(Rect2(px+c*col_w+4, py+r*rh+4, col_w-8, rh-8), Color("#9a7828",0.25))
				draw_rect(Rect2(px+c*col_w+4, py+r*rh+4, col_w-8, rh-8), Color("#b09030",0.6), false)
			_draw_text(("▶ " if sel else "")+cmds[i], Vector2(tx,ty+fs*0.4), fs, Color("#ffd700") if sel else Color("#c8a060"))
	elif _sub_mode == "skill":
		var skills = actor.get("skills",[]).map(func(sk): return Data.SKILLS.get(sk,{})).filter(func(s): return not s.is_empty())
		var rh := max(30.0, ph/max(4,skills.size()))
		for i in skills.size():
			var sk = skills[i]; var sel := i == _sub_cursor
			var ty := py + i*rh
			if sel: draw_rect(Rect2(px+4, ty+2, pw-8, rh-4), Color("#9a7828",0.25))
			var mp_ok = actor.get("mp",0) >= sk.get("mp",0)
			_draw_text(("▶ " if sel else "  ")+sk.name, Vector2(px+18, ty+rh*0.62), fs, (Color("#ffd700") if sel else Color("#c8a060")) if mp_ok else Color("#555"))
			_draw_text_right("MP:%d" % sk.get("mp",0), Vector2(px+pw-10, ty+rh*0.62), fs-3, Color("#5080e8"))
	elif _sub_mode == "item":
		var items := []
		for id in GS.inventory:
			if GS.inventory[id] > 0 and Data.ITEMS.get(id,{}).get("cat","") == "use":
				items.append(id)
		if items.is_empty():
			_draw_text_centered("── 無道具 ──", Vector2(px+pw*0.5, py+ph*0.5), fs, Color("#555"))
		else:
			var rh := max(30.0, ph/max(4,items.size()))
			for i in items.size():
				var it = Data.ITEMS.get(items[i],{}); var sel := i == _sub_cursor
				var ty := py + i*rh
				if sel: draw_rect(Rect2(px+4, ty+2, pw-8, rh-4), Color("#9a7828",0.25))
				_draw_text(("▶ " if sel else "  ")+it.get("name","?")+(" ×%d" % GS.inventory.get(items[i],0)), Vector2(px+18, ty+rh*0.62), fs, Color("#ffd700") if sel else Color("#c8a060"))
	elif _sub_mode == "target":
		var rh := max(30.0, ph/max(3,_target_list.size()))
		for i in _target_list.size():
			var tgt = _target_list[i]; var sel := i == _sub_cursor
			var ty := py + i*rh
			if sel: draw_rect(Rect2(px+4, ty+2, pw-8, rh-4), Color("#9a7828",0.25))
			var label = tgt.e.get("name","?") if tgt.get("is_enemy",false) else tgt.get("m",{}).get("name","?")
			_draw_text(("▶ " if sel else "  ")+label, Vector2(px+18, ty+rh*0.62), fs, Color("#ffd700") if sel else Color("#c8a060"))

# ── Sprite drawing ────────────────────────────────────────────
func _draw_enemy(pos: Vector2, e: Dictionary) -> void:
	if e.get("dead",false): return
	var sz := float(e.get("sz", 28))
	var col: Color = e.get("color", Color("#884422"))
	var cy := pos.y - sz*0.85; var hy := pos.y - sz*1.8; var hr := sz*0.62
	# Status aura
	var pulse := 0.5 + sin(_t * 4.2) * 0.5
	if "atkUp" in e.status:
		draw_ellipse_filled(Vector2(pos.x,cy), sz*1.25, sz*0.9, Color(1.0,0.15,0.05,0.18*pulse))
		_draw_text_centered("ATK↑", pos+Vector2(0,-sz*2.5), 11, Color("#ff5533",pulse))
	if "poison" in e.status:
		draw_ellipse_filled(Vector2(pos.x,cy), sz*1.2, sz*0.85, Color(0.2,0.9,0.1,0.14*pulse))
		_draw_text_centered("毒", pos+Vector2(sz*0.9,-sz*1.2), 10, Color("#44ee22",pulse))
	if "slow" in e.status:
		draw_ellipse_filled(Vector2(pos.x,cy), sz*1.2, sz*0.85, Color(0.1,0.4,0.9,0.14*pulse))
		_draw_text_centered("緩", pos+Vector2(sz*0.9,-sz*1.2), 10, Color("#44aaff",pulse))
	# Shadow
	draw_ellipse_filled(pos + Vector2(0,3), sz*1.2, sz*0.15, Color(0,0,0,0.28))
	# Body
	draw_ellipse_filled(Vector2(pos.x, cy), sz, sz*0.7, col)
	draw_ellipse_filled(Vector2(pos.x, cy), sz*0.95, sz*0.65, col, false)
	# Head
	draw_circle(Vector2(pos.x, hy), hr, col)
	if not e.get("boss",false):
		# Horns
		draw_polygon(PackedVector2Array([Vector2(pos.x-sz*0.27,hy-hr*0.82),Vector2(pos.x-sz*0.52,hy-hr*1.55),Vector2(pos.x-sz*0.02,hy-hr*0.72)]), [Color("#604820")])
		draw_polygon(PackedVector2Array([Vector2(pos.x+sz*0.27,hy-hr*0.82),Vector2(pos.x+sz*0.52,hy-hr*1.55),Vector2(pos.x+sz*0.02,hy-hr*0.72)]), [Color("#604820")])
	# Eyes
	var er := sz*0.11
	draw_circle(Vector2(pos.x-sz*0.24, hy-sz*0.06), er*2.0, Color(1,0,0,0.28))
	draw_circle(Vector2(pos.x+sz*0.24, hy-sz*0.06), er*2.0, Color(1,0,0,0.28))
	draw_circle(Vector2(pos.x-sz*0.24, hy-sz*0.06), er, Color("#ff2020"))
	draw_circle(Vector2(pos.x+sz*0.24, hy-sz*0.06), er, Color("#ff2020"))
	draw_circle(Vector2(pos.x-sz*0.22, hy-sz*0.05), er*0.5, Color("#080000"))
	draw_circle(Vector2(pos.x+sz*0.26, hy-sz*0.05), er*0.5, Color("#080000"))
	# Mouth
	draw_ellipse_filled(Vector2(pos.x, hy+sz*0.28), sz*0.275, sz*0.1, Color("#180000"))
	# Arms
	draw_ellipse_filled(Vector2(pos.x-sz*1.1, cy+sz*0.08), sz*0.275, sz*0.375, col)
	draw_ellipse_filled(Vector2(pos.x+sz*1.1, cy+sz*0.08), sz*0.275, sz*0.375, col)
	if e.get("boss",false):
		# Crown
		draw_rect(Rect2(pos.x-sz*0.56, hy-hr*1.08, sz*1.12, sz*0.22), Color("#ffd700"))
		draw_polygon(PackedVector2Array([Vector2(pos.x,hy-hr*1.95),Vector2(pos.x-sz*0.1,hy-hr*1.08),Vector2(pos.x+sz*0.1,hy-hr*1.08)]), [Color("#ffd700")])
		draw_circle(Vector2(pos.x, hy-hr*1.2), sz*0.12, Color("#ff4040"))

func _draw_hero(pos: Vector2, m: Dictionary) -> void:
	var s := 14.0
	var col: Color = m.get("color", Color("#4a9eff"))
	draw_ellipse_filled(pos+Vector2(0,2), s*1.1, s*0.225, Color(0,0,0,0.22))
	if m.get("dead",false):
		draw_ellipse_filled(pos+Vector2(-s*0.4,-s*0.35), s*1.3, s*0.425, Color("#282828",0.75))
		draw_line(pos+Vector2(-11,-8), pos+Vector2(11,8), Color("#ff4040",0.75), 1.5)
		draw_line(pos+Vector2(11,-8), pos+Vector2(-11,8), Color("#ff4040",0.75), 1.5)
		return
	# Robe
	draw_polygon(PackedVector2Array([pos+Vector2(-s*0.65,-s*0.85),pos+Vector2(s*0.65,-s*0.85),pos+Vector2(s*0.48,-s*2.25),pos+Vector2(-s*0.48,-s*2.25)]), [col])
	# Belt
	draw_rect(Rect2(pos.x-s*0.65, pos.y-s*1.05, s*1.3, s*0.2), Color("#906030"))
	# Arms
	draw_rect(Rect2(pos.x-s*0.95, pos.y-s*2.2, s*0.33, s*0.85), col)
	draw_rect(Rect2(pos.x+s*0.62, pos.y-s*2.2, s*0.33, s*0.85), col)
	# Head
	draw_circle(pos+Vector2(0,-s*2.82), s*0.65, Color("#d4a078"))
	draw_circle(pos+Vector2(0,-s*3.15), s*0.65, Color("#1c0c08"))
	# Eyes
	draw_circle(pos+Vector2(-s*0.26,-s*2.80), s*0.12, Color("#0c0808"))
	draw_circle(pos+Vector2( s*0.26,-s*2.80), s*0.12, Color("#0c0808"))
	# Weapon
	match m.get("shape",""):
		"sword":
			draw_line(pos+Vector2(s*0.98,-s*3.25), pos+Vector2(s*0.98,-s*0.95), Color("#d8d8d8"), 2.5)
			draw_line(pos+Vector2(s*0.64,-s*2.65), pos+Vector2(s*1.32,-s*2.65), Color("#ffd700"), 2.0)
		"mage":
			draw_line(pos+Vector2(-s*1.18,0), pos+Vector2(-s*1.18,-s*3.4), Color("#b09050"), 2.0)
			draw_circle(pos+Vector2(-s*1.18,-s*3.62), s*0.38, Color("#7888ff",0.85))
		"archer":
			draw_arc(pos+Vector2(s*1.22,-s*1.8), s*0.98, -PI*0.55, PI*0.55, 16, Color("#9a6830"), 2.0)

# ── Helpers ───────────────────────────────────────────────────
func _draw_hp_bar(pos: Vector2, bar_w: float, bar_h: float, cur: int, mx: int, col: Color) -> void:
	draw_rect(Rect2(pos, Vector2(bar_w, bar_h)), Color(0,0,0,0.5))
	var fill := bar_w * clampf(float(cur)/max(1,mx), 0.0, 1.0)
	draw_rect(Rect2(pos, Vector2(fill, bar_h)), col)
	draw_rect(Rect2(pos, Vector2(bar_w, bar_h)), Color(0,0,0,0.4), false)

func _draw_text(text: String, pos: Vector2, size: int, color: Color) -> void:
	if _font: draw_string(_font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text_centered(text: String, pos: Vector2, size: int, color: Color) -> void:
	if not _font: return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos - Vector2(sw*0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_text_right(text: String, pos: Vector2, size: int, color: Color) -> void:
	if not _font: return
	var sw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string(_font, pos-Vector2(sw,0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func draw_ellipse_filled(center: Vector2, rx: float, ry: float, color: Color, filled: bool = true) -> void:
	var pts := PackedVector2Array()
	var n := 24
	for i in n:
		var a := float(i)/n * TAU
		pts.append(center + Vector2(cos(a)*rx, sin(a)*ry))
	if filled:
		draw_polygon(pts, [color])
	else:
		pts.append(pts[0])
		draw_polyline(pts, color, 1.0)
