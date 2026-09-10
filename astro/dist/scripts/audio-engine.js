/**
 * 🎚️ DontTalkMixer — Web Audio API mixing engine
 *
 * 完整音訊處理鏈：
 *   <audio>
 *     → MediaElementSource
 *     → AnalyserNode        (for visualizer)
 *     → HighpassFilter      (rumble cut @ 30Hz)
 *     → 8 BiquadFilter      (parametric EQ, peaking, ±12dB)
 *     → 6 BiquadFilter      (timbre 維度, peaking, ±12dB)
 *     → splitter ──→ dryGain ──┐
 *                └──→ ConvolverNode (reverb IR)
 *                      └──→ wetGain ┘
 *     → outputGain (master volume)
 *     → ctx.destination
 *
 * API:
 *   const mixer = new DontTalkMixer();
 *   mixer.init(audioElement);                // 必須在使用前呼叫
 *   await mixer.resume();                    // 使用者手勢後呼叫
 *   mixer.setVolume(75);                     // 0-100
 *   mixer.setEQBand(idx, gainDb);            // idx 0-7
 *   mixer.setReverbType('hall');             // 'off'|'room'|'hall'|'plate'|'spring'
 *   mixer.setReverbWet(22);                  // 0-100
 *   mixer.setTimbre('air', +3);              // name → dB
 *   mixer.getFrequencyData();                // Uint8Array (visualizer)
 *   mixer.getWaveformData();                 // Uint8Array (oscilloscope)
 *   mixer.reset();                           // 回原廠
 *   mixer.snapshot();                        // 取得當前設定 JSON
 *   mixer.restore(snapshot);                 // 從 JSON 還原
 */
(function (global) {
    "use strict";

    // 8-band EQ center frequencies (Hz)
    const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000];

    // 6 timbre dimensions — name → center frequency (Hz), Q
    // 這些名稱跟 UI 滑桿順序對應
    const TIMBRE_LIST = [
        { name: "air",       label: "浮點",   freq: 8000, q: 0.7 },  // air / 飄逸
        { name: "warmth",    label: "暖度",   freq: 200,  q: 0.7 },  // warmth
        { name: "thickness", label: "厚度",   freq: 250,  q: 1.2 },  // thickness / body
        { name: "brightness",label: "明亮感", freq: 4000, q: 1.0 },  // brightness
        { name: "clarity",   label: "清晰感", freq: 1200, q: 1.4 },  // clarity / articulation
        { name: "presence",  label: "透明度", freq: 6000, q: 0.9 },  // presence / air
    ];

    class DontTalkMixer {
        constructor() {
            this.audio = null;
            this.ctx = null;
            this.source = null;
            this.analyser = null;
            this.hp = null;             // highpass
            this.bands = [];            // 8 EQ biquads
            this.timbreBands = [];      // 6 timbre biquads
            this.dryGain = null;
            this.wetGain = null;
            this.convolver = null;
            this.outputGain = null;
            this._irs = {};             // IR cache
            this._ready = false;

            // State
            this.volume = 75;
            this.eqValues = EQ_FREQS.map(() => 0);
            this.timbreValues = TIMBRE_LIST.map(() => 0);
            this.reverbType = "off";
            this.reverbWet = 0;
        }

        /** Attach to an HTMLAudioElement. Idempotent. */
        init(audioElement) {
            if (this.audio === audioElement) return this;
            this.audio = audioElement;
            return this;
        }

        /** Create AudioContext + nodes. Must be called from a user gesture. */
        async resume() {
            if (!this.audio) {
                throw new Error("DontTalkMixer: init(audioEl) not called");
            }
            if (!this.ctx) {
                const Ctor = window.AudioContext || window.webkitAudioContext;
                this.ctx = new Ctor();
                this._build();
                this._ready = true;
                this._applyAll();
            }
            if (this.ctx.state === "suspended") {
                await this.ctx.resume();
            }
            return this;
        }

        /** Wire up the entire signal chain. Called once. */
        _build() {
            const ctx = this.ctx;

            this.source = ctx.createMediaElementSource(this.audio);

            // Analyser (tap for visualizer; bypass-aware via mute)
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.82;

            // Rumble cut
            this.hp = ctx.createBiquadFilter();
            this.hp.type = "highpass";
            this.hp.frequency.value = 30;
            this.hp.Q.value = 0.707;

            // 8-band EQ
            this.bands = EQ_FREQS.map((f) => {
                const b = ctx.createBiquadFilter();
                b.type = "peaking";
                b.frequency.value = f;
                b.Q.value = 1.0;
                b.gain.value = 0;
                return b;
            });

            // 6 timbre
            this.timbreBands = TIMBRE_LIST.map((t) => {
                const b = ctx.createBiquadFilter();
                b.type = "peaking";
                b.frequency.value = t.freq;
                b.Q.value = t.q;
                b.gain.value = 0;
                return b;
            });

            // Reverb split
            this.convolver = ctx.createConvolver();
            this.dryGain = ctx.createGain();
            this.wetGain = ctx.createGain();
            this.outputGain = ctx.createGain();

            // Chain EQ
            let node = this.hp;
            for (const b of this.bands) { node.connect(b); node = b; }
            // Chain Timbre
            for (const b of this.timbreBands) { node.connect(b); node = b; }

            // Split: dry + reverb
            node.connect(this.dryGain);
            node.connect(this.convolver);
            this.convolver.connect(this.wetGain);
            this.dryGain.connect(this.outputGain);
            this.wetGain.connect(this.outputGain);
            this.outputGain.connect(ctx.destination);

            // Source first hits analyser, then hp
            this.source.connect(this.analyser);
            this.analyser.connect(this.hp);
        }

        _applyAll() {
            this.setVolume(this.volume);
            this.eqValues.forEach((g, i) => this.setEQBand(i, g));
            this.timbreValues.forEach((g, i) => this.setTimbreByIndex(i, g));
            this.setReverbType(this.reverbType);
            this.setReverbWet(this.reverbWet);
        }

        // ─── Public API ───────────────────────────────────────────

        setVolume(val) {
            const v = Math.max(0, Math.min(100, val));
            this.volume = v;
            if (this.outputGain) {
                // Square curve for natural feel
                const lin = v / 100;
                this.outputGain.gain.setTargetAtTime(lin * lin, this.ctx.currentTime, 0.01);
            }
        }

        setEQBand(idx, gainDb) {
            if (idx < 0 || idx >= this.bands.length) return;
            const g = Math.max(-12, Math.min(12, gainDb));
            this.eqValues[idx] = g;
            if (this.bands[idx]) {
                this.bands[idx].gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
            }
        }

        setReverbType(type) {
            this.reverbType = type;
            if (!this.convolver) return;
            if (type === "off") {
                this.convolver.buffer = null;
            } else {
                if (!this._irs[type]) {
                    this._irs[type] = global.DontTalkReverb.generateIR(this.ctx, type);
                }
                this.convolver.buffer = this._irs[type];
            }
            this._updateReverbMix();
        }

        setReverbWet(val) {
            const v = Math.max(0, Math.min(100, val));
            this.reverbWet = v;
            this._updateReverbMix();
        }

        _updateReverbMix() {
            if (!this.dryGain || !this.wetGain) return;
            const wetOn = this.reverbType !== "off";
            const wet = wetOn ? (this.reverbWet / 100) * 0.5 : 0; // cap at 0.5
            const dry = 1.0;
            const t = this.ctx.currentTime;
            this.dryGain.gain.setTargetAtTime(dry, t, 0.02);
            this.wetGain.gain.setTargetAtTime(wet, t, 0.02);
        }

        setTimbre(name, gainDb) {
            const idx = TIMBRE_LIST.findIndex((t) => t.name === name);
            if (idx < 0) return;
            this.setTimbreByIndex(idx, gainDb);
        }

        setTimbreByIndex(idx, gainDb) {
            if (idx < 0 || idx >= this.timbreBands.length) return;
            const g = Math.max(-12, Math.min(12, gainDb));
            this.timbreValues[idx] = g;
            if (this.timbreBands[idx]) {
                this.timbreBands[idx].gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
            }
        }

        // ─── Visualizer data ──────────────────────────────────────

        getFrequencyData() {
            if (!this.analyser) return null;
            const arr = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(arr);
            return arr;
        }

        getWaveformData() {
            if (!this.analyser) return null;
            const arr = new Uint8Array(this.analyser.fftSize);
            this.analyser.getByteTimeDomainData(arr);
            return arr;
        }

        // ─── Snapshot / restore (preset persistence) ──────────────

        snapshot() {
            return {
                v: 1,
                volume: this.volume,
                eq: this.eqValues.slice(),
                timbre: this.timbreValues.slice(),
                reverbType: this.reverbType,
                reverbWet: this.reverbWet,
            };
        }

        restore(snap) {
            if (!snap || snap.v !== 1) return;
            this.volume = snap.volume ?? 75;
            this.eqValues = (snap.eq || EQ_FREQS.map(() => 0)).slice(0, 8);
            while (this.eqValues.length < 8) this.eqValues.push(0);
            this.timbreValues = (snap.timbre || TIMBRE_LIST.map(() => 0)).slice(0, 6);
            while (this.timbreValues.length < 6) this.timbreValues.push(0);
            this.reverbType = snap.reverbType || "off";
            this.reverbWet = snap.reverbWet ?? 0;
            if (this._ready) this._applyAll();
        }

        reset() {
            this.volume = 75;
            this.eqValues = EQ_FREQS.map(() => 0);
            this.timbreValues = TIMBRE_LIST.map(() => 0);
            this.reverbType = "off";
            this.reverbWet = 0;
            if (this._ready) this._applyAll();
        }

        isReady() { return this._ready; }
    }

    // Static helpers exposed for the UI
    DontTalkMixer.EQ_FREQS = EQ_FREQS;
    DontTalkMixer.TIMBRE_LIST = TIMBRE_LIST;
    DontTalkMixer.REVERB_PRESETS = ["off", "room", "hall", "plate", "spring"];

    global.DontTalkMixer = DontTalkMixer;
})(window);
