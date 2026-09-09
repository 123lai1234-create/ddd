/**
 * 🎚️ Mixing Console — 與 music-player.js 並行運作的混音台控制模組
 *
 * 設計理念：零侵入，不直接改 music-player.js
 *   - 自己接 audio 元素，自己做 Mixer + Visualizer
 *   - 包 audio.play() → 確保 mixer.resume() 先跑
 *   - listen loadstart / timeupdate / volumechange → 同步顯示
 *   - 自己生成 timbre 6 條 + EQ 8 段 UI + preset 儲存
 *
 * 啟動條件：
 *   - DOM 有 #mixer-console + #canvas-spectrum + #canvas-waveform
 *   - audio 元素為 #audio-player
 *   - 假定 audio-engine.js、visualizer.js、reverb-irs.js 已在前面載入
 */
(function () {
    "use strict";

    // 等 DOM ready 再開工
    function ready(fn) {
        if (document.readyState !== "loading") fn();
        else document.addEventListener("DOMContentLoaded", fn);
    }

    ready(() => {
        const audio = document.getElementById("audio-player");
        const consoleRoot = document.getElementById("mixer-console");
        const spectrumCanvas = document.getElementById("canvas-spectrum");
        const waveformCanvas = document.getElementById("canvas-waveform");
        if (!audio || !consoleRoot) {
            console.info("[mixer] no audio/console elements, skipping init");
            return;
        }
        if (typeof window.DontTalkMixer !== "function") {
            console.warn("[mixer] DontTalkMixer not loaded — script order?");
            return;
        }

        const mixer = new window.DontTalkMixer();
        mixer.init(audio);

        // ═══ 鎖住 audio 元素的 native volume，永遠 1.0 ═════════════════
        // （音量由 mixer 統一管理，避免與音樂播放器的 audio.volume 衝突造成雙重衰減）
        try {
            let _lock = 1.0;
            Object.defineProperty(audio, "volume", {
                configurable: true,
                get() { return _lock; },
                set(v) { _lock = 1.0; /* 由 mixer 控制，忽略外部設定 */ }
            });
            audio.volume = 1.0;
        } catch (e) { /* 某些瀏覽器不支援 defineProperty，fallback：直接蓋 */ audio.volume = 1.0; }

        // ═══ 緩存 DOM（mixer 專用）══════════════════════════════════════
        const dom = {
            trackTitle:  document.getElementById("track-title"),
            trackArtist: document.getElementById("track-artist"),
            mixerTrackTitle:  document.getElementById("mixer-track-title"),
            mixerTrackArtist: document.getElementById("mixer-track-artist"),
            nowPlayingCover:  document.getElementById("now-playing-cover"),

            mixerVolume:  document.getElementById("mixer-volume"),
            mixerVolumeVal: document.getElementById("mixer-volume-val"),
            levelFill:    document.getElementById("mixer-level-fill"),
            levelVal:     document.getElementById("mixer-level-val"),

            reverbType:   document.getElementById("mixer-reverb-type"),
            reverbWet:    document.getElementById("mixer-reverb-wet"),
            reverbWetVal: document.getElementById("mixer-reverb-wet-val"),
            timbrePreset: document.getElementById("mixer-timbre-preset"),
            timbreWet:    document.getElementById("mixer-timbre-wet"),
            timbreWetVal: document.getElementById("mixer-timbre-wet-val"),
            timbreGrid:   document.getElementById("timbre-grid"),
            eqGrid:       document.getElementById("eq-grid"),
            eqFlat:       document.getElementById("mixer-eq-flat"),
            resetMixer:   document.getElementById("reset-mixer-btn"),

            presetSave:   document.getElementById("mixer-preset-save"),
            presetList:   document.getElementById("mixer-preset-list"),
            presetDelete: document.getElementById("mixer-preset-delete"),
        };

        // ═══ 生成 timbre 6 條水平 slider ═══════════════════════════════
        const TIMBRE = window.DontTalkMixer.TIMBRE_LIST;
        const timbreVals = TIMBRE.map(() => 0);
        if (dom.timbreGrid) {
            dom.timbreGrid.innerHTML = TIMBRE.map((t, i) => `
                <div class="timbre-item">
                    <div class="timbre-label">
                        <span>${t.label}</span>
                        <span class="timbre-val" data-timbre-val="${i}">0</span>
                    </div>
                    <input type="range" class="mixer-slider timbre-slider" data-timbre-idx="${i}" min="-12" max="12" value="0" step="0.5" aria-label="${t.label}">
                </div>
            `).join("");
        }

        // ═══ 生成 8 段 EQ 垂直 slider ═══════════════════════════════════
        const EQ_FREQS = window.DontTalkMixer.EQ_FREQS;
        const eqVals = EQ_FREQS.map(() => 0);
        if (dom.eqGrid) {
            dom.eqGrid.innerHTML = EQ_FREQS.map((f, i) => {
                const label = f >= 1000 ? (f / 1000) + "k" : f + "";
                return `
                    <div class="eq-band">
                        <div class="eq-band-val" data-eq-val="${i}">0</div>
                        <input type="range" class="eq-band-slider" data-eq-idx="${i}" min="-12" max="12" value="0" step="0.5" orient="vertical" aria-label="EQ ${label}Hz">
                        <div class="eq-band-freq">${label}</div>
                    </div>
                `;
            }).join("");
        }

        // ═══ 包 audio.play() — 確保 mixer.resume() 先跑 ═══════════════
        const origPlay = audio.play.bind(audio);
        audio.play = function () {
            const p = mixer.resume().catch(e => {
                console.warn("[mixer] resume failed:", e);
            });
            return p.then(() => origPlay());
        };

        // ═══ Visualizer ═══════════════════════════════════════════════
        const viz = window.DontTalkVisualizer
            ? new window.DontTalkVisualizer(mixer)
            : null;
        if (viz) {
            if (spectrumCanvas) viz.attachSpectrum(spectrumCanvas);
            if (waveformCanvas) viz.attachWaveform(waveformCanvas);
            viz.start();
        }

        // ═══ Level meter（rAF 讀頻譜資料算 dB） ═══════════════════════
        let levelSmooth = 0;
        function updateLevel() {
            const data = mixer.getFrequencyData();
            if (data) {
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length / 255; // 0..1
                // 平滑（attack 快、release 慢）
                const target = avg;
                const coef = target > levelSmooth ? 0.5 : 0.08;
                levelSmooth = levelSmooth + (target - levelSmooth) * coef;
                const pct = Math.min(100, Math.round(levelSmooth * 220)); // 視覺放大
                if (dom.levelFill) dom.levelFill.style.width = pct + "%";
                if (dom.levelVal)  dom.levelVal.textContent = Math.round(levelSmooth * 100) + "%";
            }
            requestAnimationFrame(updateLevel);
        }
        requestAnimationFrame(updateLevel);

        // ═══ 預設音色套用 ═════════════════════════════════════════════
        const TIMBRE_PRESETS = {
            flat:    [0, 0, 0, 0, 0, 0],
            air:     [+8, -2, 0, +4, +1, +6],
            warm:    [-2, +7, +5, -2, -1, -3],
            thick:   [0, +3, +8, 0, -2, 0],
            bright:  [+4, 0, -2, +7, +3, +5],
            vocal:   [+1, +1, +1, +2, +7, +4],
        };
        function applyTimbrePreset(name) {
            const vals = TIMBRE_PRESETS[name];
            if (!vals) return;
            TIMBRE.forEach((t, i) => {
                timbreVals[i] = vals[i];
                const slider = dom.timbreGrid && dom.timbreGrid.querySelector(`[data-timbre-idx="${i}"]`);
                const valEl = dom.timbreGrid && dom.timbreGrid.querySelector(`[data-timbre-val="${i}"]`);
                if (slider) slider.value = vals[i];
                if (valEl)  valEl.textContent = (vals[i] > 0 ? "+" : "") + vals[i];
                // 套用到 mixer（含 wet 縮放）
                const wet = (parseFloat(dom.timbreWet?.value) || 0) / 100;
                mixer.setTimbreByIndex(i, vals[i] * wet);
            });
            saveMixerToStorage();
        }

        // ═══ 事件綁定 ═════════════════════════════════════════════════
        // Volume
        if (dom.mixerVolume) {
            dom.mixerVolume.addEventListener("input", () => {
                const v = parseFloat(dom.mixerVolume.value);
                mixer.setVolume(v);
                if (dom.mixerVolumeVal) dom.mixerVolumeVal.textContent = v + "%";
                saveMixerToStorage();
            });
        }

        // Reverb type
        if (dom.reverbType) {
            dom.reverbType.addEventListener("change", () => {
                mixer.setReverbType(dom.reverbType.value);
                saveMixerToStorage();
            });
        }
        // Reverb wet
        if (dom.reverbWet) {
            dom.reverbWet.addEventListener("input", () => {
                const v = parseFloat(dom.reverbWet.value);
                mixer.setReverbWet(v);
                if (dom.reverbWetVal) dom.reverbWetVal.textContent = v + "%";
                saveMixerToStorage();
            });
        }

        // Timbre preset
        if (dom.timbrePreset) {
            dom.timbrePreset.addEventListener("change", () => {
                applyTimbrePreset(dom.timbrePreset.value);
            });
        }
        // Timbre wet（全域縮放：把所有 timbre 值乘上 wet）
        if (dom.timbreWet) {
            dom.timbreWet.addEventListener("input", () => {
                const w = parseFloat(dom.timbreWet.value) / 100;
                if (dom.timbreWetVal) dom.timbreWetVal.textContent = Math.round(w * 100) + "%";
                TIMBRE.forEach((t, i) => {
                    mixer.setTimbreByIndex(i, timbreVals[i] * w);
                });
                saveMixerToStorage();
            });
        }

        // 6 條 timbre slider
        if (dom.timbreGrid) {
            dom.timbreGrid.querySelectorAll(".timbre-slider").forEach(slider => {
                slider.addEventListener("input", () => {
                    const idx = parseInt(slider.dataset.timbreIdx);
                    const v = parseFloat(slider.value);
                    timbreVals[idx] = v;
                    const valEl = dom.timbreGrid.querySelector(`[data-timbre-val="${idx}"]`);
                    if (valEl) valEl.textContent = (v > 0 ? "+" : "") + v;
                    const wet = (parseFloat(dom.timbreWet?.value) || 0) / 100;
                    mixer.setTimbreByIndex(idx, v * wet);
                    // 切到 custom
                    if (dom.timbrePreset) dom.timbrePreset.value = "custom";
                    saveMixerToStorage();
                });
            });
        }

        // 8 段 EQ
        if (dom.eqGrid) {
            dom.eqGrid.querySelectorAll(".eq-band-slider").forEach(slider => {
                slider.addEventListener("input", () => {
                    const idx = parseInt(slider.dataset.eqIdx);
                    const v = parseFloat(slider.value);
                    eqVals[idx] = v;
                    const valEl = dom.eqGrid.querySelector(`[data-eq-val="${idx}"]`);
                    if (valEl) valEl.textContent = (v > 0 ? "+" : "") + v;
                    mixer.setEQBand(idx, v);
                    saveMixerToStorage();
                });
            });
        }

        // EQ Flat
        if (dom.eqFlat) {
            dom.eqFlat.addEventListener("click", () => {
                EQ_FREQS.forEach((_, i) => {
                    eqVals[i] = 0;
                    const slider = dom.eqGrid.querySelector(`[data-eq-idx="${i}"]`);
                    const valEl = dom.eqGrid.querySelector(`[data-eq-val="${i}"]`);
                    if (slider) slider.value = 0;
                    if (valEl) valEl.textContent = "0";
                    mixer.setEQBand(i, 0);
                });
                saveMixerToStorage();
            });
        }

        // Reset all
        if (dom.resetMixer) {
            dom.resetMixer.addEventListener("click", () => {
                if (!confirm("重置全部混音設定？")) return;
                mixer.reset();
                // 同步 UI
                if (dom.mixerVolume) { dom.mixerVolume.value = 75; dom.mixerVolumeVal.textContent = "75%"; }
                if (dom.reverbType) dom.reverbType.value = "off";
                if (dom.reverbWet)  { dom.reverbWet.value = 0;  dom.reverbWetVal.textContent = "0%"; }
                if (dom.timbrePreset) dom.timbrePreset.value = "flat";
                if (dom.timbreWet)   { dom.timbreWet.value = 75; dom.timbreWetVal.textContent = "75%"; }
                EQ_FREQS.forEach((_, i) => {
                    eqVals[i] = 0;
                    const slider = dom.eqGrid.querySelector(`[data-eq-idx="${i}"]`);
                    const valEl = dom.eqGrid.querySelector(`[data-eq-val="${i}"]`);
                    if (slider) slider.value = 0;
                    if (valEl) valEl.textContent = "0";
                });
                TIMBRE.forEach((t, i) => {
                    timbreVals[i] = 0;
                    const slider = dom.timbreGrid.querySelector(`[data-timbre-idx="${i}"]`);
                    const valEl = dom.timbreGrid.querySelector(`[data-timbre-val="${i}"]`);
                    if (slider) slider.value = 0;
                    if (valEl) valEl.textContent = "0";
                });
                localStorage.removeItem("donttalk-mixer");
                localStorage.removeItem("donttalk-mixer-presets");
            });
        }

        // ═══ Preset save / load / delete ═══════════════════════════════
        const PRESET_KEY = "donttalk-mixer-presets";

        function loadPresets() {
            try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "{}"); }
            catch { return {}; }
        }
        function savePresets(p) {
            localStorage.setItem(PRESET_KEY, JSON.stringify(p));
        }
        function refreshPresetList() {
            if (!dom.presetList) return;
            const presets = loadPresets();
            const current = dom.presetList.value;
            dom.presetList.innerHTML = '<option value="">載入 preset...</option>' +
                Object.keys(presets).sort().map(name =>
                    `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`
                ).join("");
            dom.presetList.value = current;
        }
        function saveMixerToStorage() {
            const snap = mixer.snapshot();
            localStorage.setItem("donttalk-mixer", JSON.stringify(snap));
        }
        function loadMixerFromStorage() {
            try {
                const raw = localStorage.getItem("donttalk-mixer");
                if (!raw) return;
                const snap = JSON.parse(raw);
                mixer.restore(snap);
                // 同步 UI
                if (dom.mixerVolume) { dom.mixerVolume.value = snap.volume; dom.mixerVolumeVal.textContent = snap.volume + "%"; }
                if (dom.reverbType) dom.reverbType.value = snap.reverbType;
                if (dom.reverbWet)  { dom.reverbWet.value = snap.reverbWet; dom.reverbWetVal.textContent = snap.reverbWet + "%"; }
                if (dom.timbreWet)  { dom.timbreWet.value = 75; dom.timbreWetVal.textContent = "75%"; }
                if (Array.isArray(snap.eq)) {
                    snap.eq.forEach((v, i) => {
                        eqVals[i] = v;
                        const slider = dom.eqGrid && dom.eqGrid.querySelector(`[data-eq-idx="${i}"]`);
                        const valEl = dom.eqGrid && dom.eqGrid.querySelector(`[data-eq-val="${i}"]`);
                        if (slider) slider.value = v;
                        if (valEl) valEl.textContent = (v > 0 ? "+" : "") + v;
                    });
                }
                if (Array.isArray(snap.timbre)) {
                    snap.timbre.forEach((v, i) => {
                        timbreVals[i] = v;
                        const slider = dom.timbreGrid && dom.timbreGrid.querySelector(`[data-timbre-idx="${i}"]`);
                        const valEl = dom.timbreGrid && dom.timbreGrid.querySelector(`[data-timbre-val="${i}"]`);
                        if (slider) slider.value = v;
                        if (valEl) valEl.textContent = (v > 0 ? "+" : "") + v;
                    });
                }
            } catch (e) { console.warn("[mixer] load failed", e); }
        }

        if (dom.presetSave) {
            dom.presetSave.addEventListener("click", () => {
                const name = prompt("Preset 名稱：");
                if (!name) return;
                const presets = loadPresets();
                presets[name] = mixer.snapshot();
                savePresets(presets);
                refreshPresetList();
                if (dom.presetList) dom.presetList.value = name;
            });
        }
        if (dom.presetList) {
            dom.presetList.addEventListener("change", () => {
                const name = dom.presetList.value;
                if (!name) return;
                const presets = loadPresets();
                const snap = presets[name];
                if (!snap) return;
                mixer.restore(snap);
                // 同步 UI
                if (dom.mixerVolume) { dom.mixerVolume.value = snap.volume; dom.mixerVolumeVal.textContent = snap.volume + "%"; }
                if (dom.reverbType) dom.reverbType.value = snap.reverbType;
                if (dom.reverbWet)  { dom.reverbWet.value = snap.reverbWet; dom.reverbWetVal.textContent = snap.reverbWet + "%"; }
                if (Array.isArray(snap.eq)) {
                    snap.eq.forEach((v, i) => {
                        eqVals[i] = v;
                        const slider = dom.eqGrid.querySelector(`[data-eq-idx="${i}"]`);
                        const valEl = dom.eqGrid.querySelector(`[data-eq-val="${i}"]`);
                        if (slider) slider.value = v;
                        if (valEl) valEl.textContent = (v > 0 ? "+" : "") + v;
                    });
                }
                if (Array.isArray(snap.timbre)) {
                    snap.timbre.forEach((v, i) => {
                        timbreVals[i] = v;
                        const slider = dom.timbreGrid.querySelector(`[data-timbre-idx="${i}"]`);
                        const valEl = dom.timbreGrid.querySelector(`[data-timbre-val="${i}"]`);
                        if (slider) slider.value = v;
                        if (valEl) valEl.textContent = (v > 0 ? "+" : "") + v;
                    });
                }
            });
        }
        if (dom.presetDelete) {
            dom.presetDelete.addEventListener("click", () => {
                const name = dom.presetList && dom.presetList.value;
                if (!name) { alert("請先選擇一個 preset"); return; }
                if (!confirm(`刪除 preset「${name}」？`)) return;
                const presets = loadPresets();
                delete presets[name];
                savePresets(presets);
                refreshPresetList();
            });
        }

        function escapeHtml(s) {
            return String(s == null ? "" : s)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function escapeAttr(s) { return escapeHtml(s); }

        // ═══ 從 music-player.js 同步 track 資訊 ═══════════════════════
        // 用 MutationObserver 監聽 audio.src 變化（track 切換時一定會換 src）
        const observer = new MutationObserver(() => {
            // 等 metadata 載入後標題才會更新
            setTimeout(syncFromTrackTitle, 100);
        });
        observer.observe(audio, { attributes: true, attributeFilter: ["src"] });
        function syncFromTrackTitle() {
            if (!dom.trackTitle) return;
            const t = dom.trackTitle.textContent.trim();
            const a = dom.trackArtist ? dom.trackArtist.textContent.trim() : "";
            if (t && t !== "選擇一首音樂開始" && dom.mixerTrackTitle) {
                dom.mixerTrackTitle.textContent = t;
                dom.mixerTrackTitle.title = t;
            }
            if (a && dom.mixerTrackArtist) {
                dom.mixerTrackArtist.textContent = a;
            }
        }
        // 第一次同步
        setTimeout(syncFromTrackTitle, 500);

        // ═══ 初始化：載入儲存、套用預設、初始化 viz ═══════════════════
        // 預設：reverb 22% wet, hall 類型（跟參考視訊一樣）
        if (dom.reverbType)  dom.reverbType.value = "hall";
        if (dom.reverbWet)   { dom.reverbWet.value = 22; dom.reverbWetVal.textContent = "22%"; }
        if (dom.timbreWet)   { dom.timbreWet.value = 75; dom.timbreWetVal.textContent = "75%"; }
        if (dom.mixerVolume) { dom.mixerVolume.value = 75; dom.mixerVolumeVal.textContent = "75%"; }

        // 試著從 storage 還原
        loadMixerFromStorage();
        refreshPresetList();

        // 等一下再 size canvas（避免一開始 0x0）
        setTimeout(() => viz && viz.resize(), 100);
        window.addEventListener("resize", () => viz && viz.resize());

        console.info("[mixer] mixing console ready ✓");
    });
})();
