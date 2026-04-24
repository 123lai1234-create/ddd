extends Node
# Procedural audio system using AudioStreamGenerator

const SAMPLE_RATE := 22050
var _muted := false
var _bgm_player: AudioStreamPlayer
var _bgm_theme := ""
var _bgm_seq: Array = []  # [{freq, dur}]
var _bgm_idx := 0
var _bgm_timer: Timer

# BGM themes: each entry is [freq_hz, duration_beats] at given bpm
const BGM_THEMES := {
	"village": {
		"bpm": 88,
		"melody": [
			[523.3, 0.5],[523.3, 0.5],[587.3, 0.5],[659.3, 1.0],
			[587.3, 0.5],[523.3, 0.5],[493.9, 0.5],[523.3, 1.0],
			[440.0, 0.5],[493.9, 0.5],[523.3, 0.5],[587.3, 1.0],
			[523.3, 0.5],[440.0, 0.5],[392.0, 0.5],[440.0, 2.0],
		],
	},
	"forest": {
		"bpm": 72,
		"melody": [
			[392.0, 1.0],[349.2, 0.5],[392.0, 0.5],[440.0, 1.0],
			[415.3, 0.5],[392.0, 0.5],[349.2, 1.0],[329.6, 2.0],
			[349.2, 1.0],[392.0, 0.5],[440.0, 0.5],[493.9, 1.0],
			[466.2, 0.5],[440.0, 0.5],[392.0, 1.0],[349.2, 2.0],
		],
	},
	"castle": {
		"bpm": 108,
		"melody": [
			[220.0, 0.5],[233.1, 0.5],[246.9, 0.5],[261.6, 0.5],
			[277.2, 0.5],[261.6, 0.5],[246.9, 0.5],[233.1, 0.5],
			[220.0, 1.0],[0.0, 0.5],[220.0, 0.5],[246.9, 0.5],
			[261.6, 0.5],[293.7, 1.0],[0.0, 0.5],[220.0, 1.5],
		],
	},
	"battle": {
		"bpm": 140,
		"melody": [
			[261.6, 0.25],[261.6, 0.25],[0.0, 0.25],[311.1, 0.25],
			[329.6, 0.5],[0.0, 0.25],[261.6, 0.25],[293.7, 0.5],
			[261.6, 0.25],[261.6, 0.25],[0.0, 0.25],[349.2, 0.25],
			[329.6, 0.5],[0.0, 0.5],[293.7, 0.5],[261.6, 1.0],
		],
	},
}

func _ready() -> void:
	_bgm_timer = Timer.new()
	_bgm_timer.one_shot = true
	_bgm_timer.timeout.connect(_on_bgm_tick)
	add_child(_bgm_timer)

func bgm(theme: String) -> void:
	if theme == _bgm_theme:
		return
	stop_bgm()
	_bgm_theme = theme
	var t: Variant = BGM_THEMES.get(theme, {})
	if t.is_empty():
		return
	var bpm: float = t.get("bpm", 120)
	var beat_dur := 60.0 / bpm
	_bgm_seq = []
	for note in t.get("melody", []):
		_bgm_seq.append({"freq": float(note[0]), "dur": float(note[1]) * beat_dur})
	_bgm_idx = 0
	_on_bgm_tick()

func _on_bgm_tick() -> void:
	if _bgm_theme == "" or _bgm_seq.is_empty():
		return
	var note: Dictionary = _bgm_seq[_bgm_idx]
	_bgm_idx = (_bgm_idx + 1) % _bgm_seq.size()
	if not _muted and note.freq > 0.0:
		_play_tone(note.freq, note.dur, 0.18, "square")
	_bgm_timer.start(note.dur)

func stop_bgm() -> void:
	_bgm_theme = ""
	_bgm_timer.stop()

func play(name: String) -> void:
	if _muted:
		return
	match name:
		"hit":        _play_tone(220.0, 0.08, 0.4, "noise")
		"miss":       _play_tone(180.0, 0.12, 0.2, "sine")
		"magic":      _play_tone(880.0, 0.18, 0.35, "sine"); _play_tone(1046.0, 0.18, 0.2, "sine")
		"heal":       _play_tone(523.0, 0.12, 0.3, "sine"); _play_tone(659.0, 0.15, 0.25, "sine")
		"victory":    _play_victory()
		"levelUp":    _play_level_up()
		"openMenu":   _play_tone(392.0, 0.06, 0.2, "square"); _play_tone(523.0, 0.08, 0.18, "square")
		"menuMove":   _play_tone(440.0, 0.06, 0.25, "square")
		"menuSelect": _play_tone(523.0, 0.08, 0.3, "square"); _play_tone(659.0, 0.10, 0.25, "square")
		"damage":     _play_tone(110.0, 0.10, 0.45, "noise")
		"dead":       _play_tone(130.8, 0.3, 0.4, "sine"); _play_tone(110.0, 0.4, 0.35, "sine")
		"enemyDead":  _play_tone(196.0, 0.08, 0.35, "noise"); _play_tone(146.8, 0.12, 0.3, "noise")
		"poison":     _play_tone(311.1, 0.15, 0.25, "square")
		"step":       _play_tone(220.0, 0.04, 0.08, "noise")
		"shopBuy":    _play_tone(523.0, 0.08, 0.25, "square"); _play_tone(659.0, 0.08, 0.25, "square")
		"inn":        _play_tone(392.0, 0.12, 0.2, "sine"); _play_tone(523.0, 0.15, 0.2, "sine")

func _play_victory() -> void:
	await get_tree().create_timer(0.0).timeout
	for note in [[523.0,0.12],[659.0,0.12],[784.0,0.12],[1046.0,0.3]]:
		_play_tone(note[0], note[1], 0.4, "square")
		await get_tree().create_timer(note[1] * 0.9).timeout

func _play_level_up() -> void:
	await get_tree().create_timer(0.0).timeout
	for note in [[523.0,0.1],[659.0,0.1],[784.0,0.1],[1046.0,0.1],[1318.0,0.2]]:
		_play_tone(note[0], note[1], 0.35, "square")
		await get_tree().create_timer(note[1] * 0.85).timeout

func toggle_mute() -> void:
	_muted = !_muted

func _play_tone(freq: float, duration: float, volume: float = 0.4, wave: String = "sine") -> void:
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = SAMPLE_RATE
	stream.buffer_length = duration + 0.05

	var player := AudioStreamPlayer.new()
	player.stream = stream
	player.volume_db = linear_to_db(clampf(volume, 0.0, 1.0))
	add_child(player)
	player.play()

	var pb := player.get_stream_playback() as AudioStreamGeneratorPlayback
	var frames := pb.get_frames_available()
	var attack := int(SAMPLE_RATE * 0.005)
	var release := int(SAMPLE_RATE * min(0.05, duration * 0.3))
	var total := int(SAMPLE_RATE * duration)

	for i in frames:
		if i >= total:
			pb.push_frame(Vector2.ZERO)
			continue
		var t := float(i) / SAMPLE_RATE
		var s: float
		match wave:
			"sine":
				s = sin(t * TAU * freq)
			"square":
				s = 1.0 if sin(t * TAU * freq) >= 0.0 else -1.0
				s *= 0.5
			"noise":
				s = randf_range(-1.0, 1.0) * sin(t * TAU * freq * 0.5)
			_:
				s = sin(t * TAU * freq)
		# Envelope
		var env := 1.0
		if i < attack:
			env = float(i) / attack
		elif i > total - release:
			env = float(total - i) / release
		pb.push_frame(Vector2(s * env, s * env))

	# Clean up after playback
	get_tree().create_timer(duration + 0.1).timeout.connect(func(): if is_instance_valid(player): player.queue_free())
