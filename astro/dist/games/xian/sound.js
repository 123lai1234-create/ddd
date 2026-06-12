'use strict';

// ── Procedural Web Audio Sound System ─────────────────────
const Sound = (() => {
  let ctx = null;
  let masterGain = null;
  let _bgmNode = null;
  let _bgmName = null;
  let _muted = false;

  function _ctx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function _osc(freq, type, dur, vol = 0.3, start = 0, dest = null) {
    const c = _ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(vol, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    o.connect(g);
    g.connect(dest || masterGain);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.05);
    return { osc: o, gain: g };
  }

  function _noise(dur, vol = 0.15, freq = 800, dest = null) {
    const c = _ctx();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || masterGain);
    src.start(); src.stop(c.currentTime + dur + 0.05);
  }

  function _noiseAt(dur, vol = 0.15, freq = 800, start = 0, dest = null) {
    const c = _ctx();
    const bufSz = Math.ceil(c.sampleRate * (dur + 0.1));
    const buf = c.createBuffer(1, bufSz, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || masterGain);
    src.start(c.currentTime + start);
    src.stop(c.currentTime + start + dur + 0.1);
  }

  function _kick(start = 0) {
    const c = _ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, c.currentTime + start);
    o.frequency.exponentialRampToValueAtTime(42, c.currentTime + start + 0.09);
    g.gain.setValueAtTime(0.55, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + 0.14);
    o.connect(g); g.connect(masterGain);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + 0.2);
  }

  // ── SFX ──────────────────────────────────────────────────
  const SFX = {
    hit() {
      _osc(180, 'sawtooth', 0.08, 0.25);
      _noise(0.06, 0.2, 400);
    },
    miss() {
      _osc(300, 'sine', 0.12, 0.1);
      _osc(220, 'sine', 0.12, 0.08, 0.04);
    },
    magic() {
      [500, 700, 900, 1100].forEach((f, i) => _osc(f, 'sine', 0.18, 0.15, i * 0.05));
    },
    heal() {
      [600, 750, 900, 1050].forEach((f, i) => _osc(f, 'triangle', 0.22, 0.18, i * 0.06));
    },
    victory() {
      const seq = [523, 659, 784, 1047];
      seq.forEach((f, i) => _osc(f, 'square', 0.25, 0.2, i * 0.18));
      _osc(1047, 'square', 0.5, 0.25, seq.length * 0.18);
    },
    levelUp() {
      [392, 494, 587, 784].forEach((f, i) => _osc(f, 'triangle', 0.22, 0.22, i * 0.14));
    },
    step() {
      _noise(0.04, 0.06, 200);
    },
    menuMove() {
      _osc(440, 'sine', 0.06, 0.08);
    },
    menuSelect() {
      _osc(660, 'triangle', 0.1, 0.15);
      _osc(880, 'triangle', 0.08, 0.12, 0.05);
    },
    damage() {
      _osc(120, 'sawtooth', 0.15, 0.3);
      _noise(0.1, 0.25, 250);
    },
    dead() {
      _osc(200, 'sawtooth', 0.08, 0.3);
      _osc(140, 'sawtooth', 0.12, 0.25, 0.06);
      _osc(90,  'sawtooth', 0.2,  0.2,  0.12);
    },
    enemyDead() {
      _noise(0.12, 0.3, 600);
      _osc(160, 'sawtooth', 0.18, 0.2);
    },
    poison() {
      [300, 280, 260].forEach((f, i) => _osc(f, 'sine', 0.14, 0.1, i * 0.08));
    },
    openMenu() {
      _osc(500, 'triangle', 0.08, 0.12);
      _osc(625, 'triangle', 0.08, 0.1, 0.06);
    },
    shopBuy() {
      [440, 550, 660].forEach((f, i) => _osc(f, 'triangle', 0.14, 0.18, i * 0.08));
    },
    inn() {
      [261, 329, 392, 523].forEach((f, i) => _osc(f, 'sine', 0.3, 0.12, i * 0.12));
    },
    chest() {
      [880, 1100, 1320, 1760].forEach((f, i) => _osc(f, 'triangle', 0.14, 0.18 - i*0.02, i*0.07));
    },
    door() {
      _noise(0.18, 0.22, 160);
      _osc(190, 'sawtooth', 0.22, 0.14, 0.04);
    },
    thunderSkill() {
      _noise(0.06, 0.48, 200);
      _osc(80, 'sawtooth', 0.12, 0.5);
      _osc(60, 'sawtooth', 0.2, 0.4, 0.06);
      [1600, 1200, 800].forEach((f, i) => _osc(f, 'sine', 0.07, 0.12, i * 0.022));
    },
    freeze() {
      [2400, 2800, 3200, 2000].forEach((f, i) => _osc(f, 'sine', 0.08, 0.09, i * 0.04));
      _noise(0.18, 0.06, 4000);
    },
    drain() {
      [300, 270, 240, 200, 165].forEach((f, i) => _osc(f, 'sawtooth', 0.18, 0.1, i * 0.06));
    },
    burn() {
      _osc(180, 'sawtooth', 0.10, 0.22);
      _noise(0.22, 0.18, 420);
      _osc(240, 'sawtooth', 0.08, 0.14, 0.05);
    },
    buff() {
      [523, 659, 784, 880].forEach((f, i) => _osc(f, 'triangle', 0.20, 0.20, i * 0.06));
    },
    stun() {
      _noise(0.07, 0.35, 1800);
      _osc(200, 'sawtooth', 0.10, 0.22);
      _osc(140, 'sawtooth', 0.14, 0.16, 0.06);
    },
    limitReady() {
      [330, 415, 523, 659, 784].forEach((f, i) => _osc(f, 'triangle', 0.15, 0.22, i * 0.045));
      _noise(0.07, 0.10, 3200, 0.20);
    },
    rage() {
      _noise(0.28, 0.55, 90);
      _osc(80, 'sawtooth', 0.22, 0.50);
      _osc(120, 'sawtooth', 0.18, 0.38, 0.08);
      _osc(55, 'sawtooth', 0.30, 0.30, 0.18);
      _osc(160, 'sawtooth', 0.10, 0.22, 0.32);
    },
    cleanse() {
      [1047, 1318, 1568, 2093].forEach((f, i) => _osc(f, 'sine', 0.22, 0.14, i * 0.07));
      _noise(0.03, 0.18, 2400, 0.10);
    },
    bossIntro() {
      _noise(0.09, 0.38, 80);
      _osc(110, 'sawtooth', 0.12, 0.48);
      _osc(82, 'sawtooth', 0.18, 0.42, 0.09);
      _osc(62, 'sawtooth', 0.24, 0.36, 0.18);
    },
    mapTransition() {
      _osc(1046, 'triangle', 0.07, 0.2);
      _osc(1318, 'triangle', 0.09, 0.17, 0.06);
      _osc(880, 'triangle', 0.11, 0.14, 0.12);
    },
  };

  // ── BGM (procedural loops) ────────────────────────────────
  const BGM = {
    village: { // 黑山村 — 沉鬱滄涼，廢村殘影
      bpm: 70,
      notes: [165, 185, 196, 220, 247, 277, 294, 330],
      pattern: [0, -1, 2, -1, 4, 2, 0, -1, 3, 5, 3, 1, 0, -1, 2, 4],
      bass:    [0, -1, 0, -1, 3, -1, 3, -1, 0, -1, 5, -1, 3, -1, 0, -1],
    },
    forest: { // 幽竹林 — 神秘空靈，竹影搖曳
      bpm: 63,
      notes: [196, 220, 247, 261, 294, 330, 349, 392],
      pattern: [0, 2, 4, 2, 0, -1, 5, 3, 2, 4, 6, 4, 2, -1, 0, -1],
      bass:    [0, -1, 4, -1, 0, -1, 3, -1, 0, -1, 4, -1, 5, -1, 0, -1],
    },
    castle: { // 黃風嶺 — 風沙漫天，氣勢磅礴
      bpm: 102,
      notes: [138, 155, 174, 185, 207, 233, 261, 277],
      pattern: [0, 3, 0, 3, 5, 6, 5, 3, 0, 4, 0, 4, 6, 7, 6, 4],
      bass:    [0, -1, 0, -1, 5, -1, 5, -1, 3, -1, 3, -1, 0, -1, 5, -1],
    },
    battle: { // 決戰 — 金箍棒怒震蒼穹，激烈震撼
      bpm: 160,
      notes: [110, 123, 138, 147, 165, 185, 196, 220],
      pattern: [0, 4, 0, 5, 3, 6, 0, 4, 1, 5, 1, 7, 3, 6, 3, 4],
      bass:    [0, -1, 4, -1, 0, -1, 5, -1, 1, -1, 6, -1, 3, -1, 5, -1],
    },
    dungeon: { // 盤絲洞 — 鬼氣森森，絲網纏繞
      bpm: 46,
      notes: [98, 110, 123, 130, 147, 164, 185, 196],
      pattern: [0, -1, 2, 3, 2, -1, 5, -1, 4, -1, 3, 5, 2, -1, 1, 0],
      bass:    [0, -1, 0, -1, 4, -1, 4, -1, 3, -1, 3, -1, 0, -1, 0, -1],
    },
    shrine: { // 小西天 — 佛光普照，梵音裊裊
      bpm: 64,
      notes: [261, 293, 329, 349, 392, 440, 494, 523],
      pattern: [0, 2, 4, 7, 4, 2, 0, -1, 1, 3, 5, 6, 5, 3, 1, -1],
      bass:    [0, -1, 4, -1, 2, -1, 0, -1, 1, -1, 5, -1, 3, -1, 0, -1],
    },
    dragonPalace: { // 東海龍宮 — 深海幽冥，龍威浩蕩
      bpm: 48,
      notes: [87, 97, 110, 116, 131, 146, 164, 174],
      pattern: [0, -1, 2, -1, 4, 3, 2, -1, 5, -1, 4, 2, 0, -1, 1, -1],
      bass:    [0, -1, 0, -1, 4, -1, 4, -1, 5, -1, 5, -1, 0, -1, 0, -1],
    },
  };

  let _bgmTimeout = null;
  function _playBgmLoop(name) {
    if (_muted || !BGM[name]) return;
    const { bpm, notes, pattern, bass } = BGM[name];
    const c = _ctx();
    const beatDur = 60 / bpm;
    const totalDur = pattern.length * beatDur;

    // Melody
    pattern.forEach((idx, i) => {
      if (idx < 0) return;
      const f = notes[idx];
      _osc(f, 'triangle', beatDur * 0.7, 0.12, i * beatDur);
    });
    // Bass
    bass.forEach((idx, i) => {
      if (idx < 0) return;
      const f = notes[idx] * 0.5;
      _osc(f, 'sine', beatDur * 1.8, 0.07, i * beatDur);
    });
    // Percussion — battle gets kick+snare+hihat, castle gets kick+snare
    if (name === 'battle') {
      [0, 4, 8, 12].forEach(i => _kick(i * beatDur));
      [4, 12].forEach(i => _noiseAt(0.09, 0.2, 2200, i * beatDur));
      [2, 6, 10, 14].forEach(i => _noiseAt(0.04, 0.08, 5000, i * beatDur));
    } else if (name === 'castle') {
      [0, 8].forEach(i => _kick(i * beatDur));
      [4, 12].forEach(i => _noiseAt(0.08, 0.16, 2000, i * beatDur));
    } else if (name === 'dragonPalace') {
      // Underwater bubble pops on off-beats
      [1, 3, 7, 9, 13].forEach(i => _noiseAt(0.06, 0.04, 3200, i * beatDur));
      // Deep resonant thud every 4 beats
      [0, 8].forEach(i => _noiseAt(0.18, 0.09, 60, i * beatDur));
    }

    _bgmTimeout = setTimeout(() => {
      if (_bgmName === name) _playBgmLoop(name);
    }, totalDur * 1000 - 50);
  }

  return {
    init() {
      // Unlock AudioContext on first user gesture
      const unlock = () => {
        _ctx();
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('touchstart', unlock, { passive: true });
      document.addEventListener('keydown', unlock);
      document.addEventListener('click', unlock);
    },

    play(name) {
      if (_muted) return;
      if (SFX[name]) SFX[name]();
    },

    bgm(name) {
      if (name === _bgmName) return;
      if (_bgmTimeout) clearTimeout(_bgmTimeout);
      _bgmName = name;
      if (!name || _muted) return;
      _playBgmLoop(name);
    },

    stopBgm() {
      if (_bgmTimeout) clearTimeout(_bgmTimeout);
      _bgmName = null;
    },

    mute(v) {
      _muted = v;
      if (masterGain) masterGain.gain.value = v ? 0 : 0.4;
      if (v) this.stopBgm();
    },

    toggleMute() {
      this.mute(!_muted);
      return _muted;
    },

    isMuted() { return _muted; },
  };
})();
