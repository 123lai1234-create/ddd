/**
 * 🌊 DontTalkVisualizer — 即時音訊視覺化
 *
 * 兩種 canvas 模式：
 *   - waveform  : 振盪波形（oscilloscope）
 *   - spectrum  : 對數分佈的 32 段頻譜（log-binned）
 *
 * 用法：
 *   const viz = new DontTalkVisualizer(mixer);
 *   viz.attachWaveform(canvasEl);
 *   viz.attachSpectrum(canvasEl);
 *   viz.start();
 *   // ...之後
 *   viz.stop();
 */
(function (global) {
    "use strict";

    const FPS_CAP = 60;
    const FRAME_MS = 1000 / FPS_CAP;

    class DontTalkVisualizer {
        constructor(mixer) {
            this.mixer = mixer;
            this.wfCanvas = null;
            this.spCanvas = null;
            this.wfCtx = null;
            this.spCtx = null;
            this._running = false;
            this._rafId = 0;
            this._lastDraw = 0;
            this._waveBuf = null;  // reused Uint8Array
            this._freqBuf = null;
            this._spPeaks = [];    // spectrum peak-hold values
        }

        attachWaveform(canvas) {
            this.wfCanvas = canvas;
            this.wfCtx = canvas.getContext("2d");
            this._resizeWaveform();
        }

        attachSpectrum(canvas) {
            this.spCanvas = canvas;
            this.spCtx = canvas.getContext("2d");
            this._resizeSpectrum();
        }

        _resizeWaveform() {
            if (!this.wfCanvas) return;
            const dpr = window.devicePixelRatio || 1;
            const w = this.wfCanvas.clientWidth || 200;
            const h = this.wfCanvas.clientHeight || 60;
            this.wfCanvas.width = Math.floor(w * dpr);
            this.wfCanvas.height = Math.floor(h * dpr);
            this.wfCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        _resizeSpectrum() {
            if (!this.spCanvas) return;
            const dpr = window.devicePixelRatio || 1;
            const w = this.spCanvas.clientWidth || 280;
            const h = this.spCanvas.clientHeight || 80;
            this.spCanvas.width = Math.floor(w * dpr);
            this.spCanvas.height = Math.floor(h * dpr);
            this.spCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this._spPeaks = new Array(32).fill(0);
        }

        start() {
            if (this._running) return;
            this._running = true;
            this._loop();
        }

        stop() {
            this._running = false;
            if (this._rafId) cancelAnimationFrame(this._rafId);
        }

        _loop(t) {
            if (!this._running) return;
            this._rafId = requestAnimationFrame((now) => this._loop(now));
            const stamp = (typeof t === "number") ? t : performance.now();
            if (stamp - this._lastDraw < FRAME_MS) return;
            this._lastDraw = stamp;
            if (this.wfCanvas) this._drawWaveform();
            if (this.spCanvas) this._drawSpectrum();
        }

        _drawWaveform() {
            const c = this.wfCtx;
            const W = this.wfCanvas.clientWidth;
            const H = this.wfCanvas.clientHeight;
            c.clearRect(0, 0, W, H);

            // Subtle grid baseline
            c.strokeStyle = "rgba(99, 102, 241, 0.18)";
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(0, H / 2);
            c.lineTo(W, H / 2);
            c.stroke();

            const data = this.mixer.getWaveformData();
            if (!data) return;
            if (!this._waveBuf || this._waveBuf.length !== data.length) this._waveBuf = data;

            // Draw wave as a filled shape, top + bottom mirror
            c.strokeStyle = "rgba(129, 140, 248, 0.9)"; // accent-light
            c.lineWidth = 1.5;
            c.beginPath();
            const sliceW = W / data.length;
            let x = 0;
            for (let i = 0; i < data.length; i++) {
                const v = data[i] / 128.0; // 0..2, 1 = silence
                const y = (v * H) / 2;
                if (i === 0) c.moveTo(x, y);
                else c.lineTo(x, y);
                x += sliceW;
            }
            c.stroke();

            // Glow under wave
            c.strokeStyle = "rgba(99, 102, 241, 0.35)";
            c.lineWidth = 4;
            c.stroke();
        }

        _drawSpectrum() {
            const c = this.spCtx;
            const W = this.spCanvas.clientWidth;
            const H = this.spCanvas.clientHeight;
            c.clearRect(0, 0, W, H);

            const data = this.mixer.getFrequencyData();
            if (!data) return;

            // Log-binned 32 bars. SampleRate likely 44100 or 48000.
            // analyser.frequencyBinCount = fftSize/2 = 1024 (with fftSize=2048)
            // bin i covers i * (sr/fftSize) Hz. We only care up to ~16kHz.
            const bins = data.length;
            const sr = this.mixer.ctx ? this.mixer.ctx.sampleRate : 48000;
            const binHz = sr / 2048; // fftSize=2048

            const NUM_BARS = 32;
            const minLog = Math.log10(30);
            const maxLog = Math.log10(16000);
            const barW = (W - (NUM_BARS - 1) * 2) / NUM_BARS;

            for (let bar = 0; bar < NUM_BARS; bar++) {
                // log-scale frequency range for this bar
                const f0 = Math.pow(10, minLog + (bar / NUM_BARS) * (maxLog - minLog));
                const f1 = Math.pow(10, minLog + ((bar + 1) / NUM_BARS) * (maxLog - minLog));
                const i0 = Math.max(0, Math.floor(f0 / binHz));
                const i1 = Math.min(bins - 1, Math.ceil(f1 / binHz));
                let sum = 0;
                let cnt = 0;
                for (let i = i0; i <= i1; i++) { sum += data[i]; cnt++; }
                const v = cnt > 0 ? sum / cnt : 0;
                const norm = v / 255; // 0..1
                const h = norm * H;
                const x = bar * (barW + 2);
                const y = H - h;

                // Gradient bar
                const grad = c.createLinearGradient(0, H, 0, 0);
                grad.addColorStop(0, "rgba(99, 102, 241, 0.95)");   // bottom: indigo
                grad.addColorStop(0.7, "rgba(129, 140, 248, 0.9)");  // mid
                grad.addColorStop(1.0, "rgba(244, 114, 182, 0.85)"); // top: pink
                c.fillStyle = grad;
                c.fillRect(x, y, barW, h);

                // Peak-hold line
                if (norm > this._spPeaks[bar]) this._spPeaks[bar] = norm;
                else this._spPeaks[bar] = Math.max(0, this._spPeaks[bar] - 0.012);
                const peakY = H - this._spPeaks[bar] * H;
                c.fillStyle = "rgba(244, 114, 182, 0.9)";
                c.fillRect(x, peakY - 2, barW, 2);
            }
        }

        resize() {
            this._resizeWaveform();
            this._resizeSpectrum();
        }
    }

    global.DontTalkVisualizer = DontTalkVisualizer;
})(window);
