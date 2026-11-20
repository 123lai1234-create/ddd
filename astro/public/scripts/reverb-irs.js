/**
 * 🎛️ Reverb Impulse Response Generator
 *
 * Procedurally generates reverb IRs in the browser — no asset files needed.
 * Each preset is a different "room" character:
 *   - room   : tight, warm (small room)
 *   - hall   : long, lush (concert hall)
 *   - plate  : bright, dense (studio plate)
 *   - spring : metallic, bouncy (vintage spring reverb)
 *
 * Algorithm: white-noise burst × exponential decay envelope, then
 * one-pole lowpass for tonal shaping. Stereo is decorrelated by
 * using a different random seed per channel.
 */
(function (global) {
    "use strict";

    /** One-pole lowpass filter (in-place) */
    function lowpass(data, cutoffHz, sampleRate) {
        const rc = 1.0 / (cutoffHz * 2 * Math.PI);
        const dt = 1.0 / sampleRate;
        const a = dt / (rc + dt);
        let y = 0;
        for (let i = 0; i < data.length; i++) {
            y = y + a * (data[i] - y);
            data[i] = y;
        }
    }

    /** High-shelf-ish gentle highpass to remove DC and sub-rumble */
    function highpass(data, cutoffHz, sampleRate) {
        const rc = 1.0 / (cutoffHz * 2 * Math.PI);
        const dt = 1.0 / sampleRate;
        const a = rc / (rc + dt);
        let yPrev = 0;
        let xPrev = 0;
        for (let i = 0; i < data.length; i++) {
            const x = data[i];
            const y = a * (yPrev + x - xPrev);
            xPrev = x;
            yPrev = y;
            data[i] = y;
        }
    }

    /** Tiny LCG for repeatable stereo decorrelation */
    function makeRng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    /**
     * Generate a stereo IR buffer for the given preset.
     * @param {AudioContext|OfflineAudioContext} ctx
     * @param {string} preset — 'room' | 'hall' | 'plate' | 'spring'
     * @returns {AudioBuffer}
     */
    function generateIR(ctx, preset) {
        const presets = {
            room:   { duration: 0.55, decay: 3.0, lpHz: 4000,  hpHz: 120,  preDelay: 0.005, modAmt: 0.04, modHz: 12 },
            hall:   { duration: 2.8,  decay: 1.4, lpHz: 6500,  hpHz: 90,   preDelay: 0.020, modAmt: 0.10, modHz:  6 },
            plate:  { duration: 1.7,  decay: 1.8, lpHz: 8500,  hpHz: 200,  preDelay: 0.002, modAmt: 0.06, modHz: 18 },
            spring: { duration: 1.3,  decay: 2.1, lpHz: 2800,  hpHz: 180,  preDelay: 0.003, modAmt: 0.08, modHz: 22 },
        };
        const cfg = presets[preset];
        if (!cfg) return null;

        const sr = ctx.sampleRate;
        const totalLen = Math.floor(sr * (cfg.preDelay + cfg.duration));
        const preDelaySamples = Math.floor(sr * cfg.preDelay);
        const buffer = ctx.createBuffer(2, totalLen, sr);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            const rng = makeRng(0x1234 + ch * 7919); // different per channel
            const len = data.length - preDelaySamples;

            // Pre-delay: silence
            for (let i = 0; i < preDelaySamples; i++) data[i] = 0;

            // Early reflections: a few sharp taps
            const earlyTaps = preset === "hall" ? 8 : preset === "plate" ? 12 : 5;
            for (let t = 0; t < earlyTaps; t++) {
                const at = Math.floor(rng() * len * 0.18);
                const amp = (0.4 + rng() * 0.5) * (preset === "plate" ? 0.7 : 1.0);
                const sign = rng() > 0.5 ? 1 : -1;
                if (preDelaySamples + at < data.length) {
                    data[preDelaySamples + at] += sign * amp;
                }
            }

            // Diffuse tail: noise * exponential decay
            for (let i = 0; i < len; i++) {
                const t = i / len;
                const env = Math.pow(1 - t, cfg.decay);
                // Slight amplitude modulation for "movement"
                const mod = 1 + cfg.modAmt * Math.sin(2 * Math.PI * cfg.modHz * t);
                let s = (rng() * 2 - 1) * env * mod;
                data[preDelaySamples + i] += s;
            }

            // Spring character: add a couple of metallic resonances
            if (preset === "spring") {
                for (let i = 0; i < len; i++) {
                    const t = i / len;
                    const env = Math.pow(1 - t, cfg.decay * 1.4);
                    data[preDelaySamples + i] +=
                        0.10 * env * Math.sin(2 * Math.PI * 700 * (i / sr)) +
                        0.05 * env * Math.sin(2 * Math.PI * 1300 * (i / sr));
                }
            }

            // Tonal shaping
            if (cfg.hpHz) highpass(data, cfg.hpHz, sr);
            if (cfg.lpHz) lowpass(data, cfg.lpHz, sr);

            // Normalize peak to ~0.5 (avoid clipping when wet gain is high)
            let peak = 0;
            for (let i = 0; i < data.length; i++) {
                const v = Math.abs(data[i]);
                if (v > peak) peak = v;
            }
            if (peak > 0) {
                const norm = 0.5 / peak;
                for (let i = 0; i < data.length; i++) data[i] *= norm;
            }
        }

        return buffer;
    }

    /** List of available preset names */
    const PRESETS = ["off", "room", "hall", "plate", "spring"];

    global.DontTalkReverb = { generateIR, PRESETS };
})(window);
