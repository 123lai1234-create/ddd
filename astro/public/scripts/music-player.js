/**
 * 🎵 Music Player - 音樂播放平台核心邏輯
 * 包含播放控制、播放清單、等化器、視覺化效果
 */

(function () {
    "use strict";

    // ═══════════════════════════════════════════════════════════════════
    // 範例音樂數據
    // ═══════════════════════════════════════════════════════════════════
    const SAMPLE_MUSIC = [
        {
            id: 1,
            title: "晨曦中的鋼琴",
            artist: "鋼琴詩人",
            album: "黎明時分",
            duration: 245,
            url: "",
            cover: "🎹",
            lyrics: [
                "陽光穿透窗簾的縫隙",
                "喚醒沉睡的鋼琴鍵盤",
                "每一個音符都是",
                "新的一天開始的旋律"
            ],
            favorite: false
        },
        {
            id: 2,
            title: "城市節奏",
            artist: "電子浪潮",
            album: "都會夜曲",
            duration: 312,
            url: "",
            cover: "🌆",
            lyrics: [
                "霓虹燈閃爍的街道",
                "人群穿梭的地鐵",
                "城市的心跳",
                "在夜色中加速"
            ],
            favorite: true
        },
        {
            id: 3,
            title: "海洋的呼喚",
            artist: "自然之音",
            album: "海邊時光",
            duration: 278,
            url: "",
            cover: "🌊",
            lyrics: [
                "海浪輕拍著沙灘",
                "海鷗在天空翱翔",
                "潮汐的韻律",
                "是大海的呼吸"
            ],
            favorite: false
        },
        {
            id: 4,
            title: "森林小路",
            artist: "環境音樂",
            album: "自然之旅",
            duration: 356,
            url: "",
            cover: "🌲",
            lyrics: [
                "陽光穿過樹葉縫隙",
                "鳥鳴迴盪在林間",
                "踩著落葉的小徑",
                "通往內心的寧靜"
            ],
            favorite: false
        },
        {
            id: 5,
            title: "星空下的約定",
            artist: "夢幻樂團",
            album: "銀河紀元",
            duration: 289,
            url: "",
            cover: "⭐",
            lyrics: [
                "星星點亮夜的帷幕",
                "我們仰望同一片天空",
                "在星河之下許下願望",
                "永遠不分開"
            ],
            favorite: true
        },
        {
            id: 6,
            title: "咖啡館時光",
            artist: "爵士融合",
            album: "慵懶午後",
            duration: 234,
            url: "",
            cover: "☕",
            lyrics: [
                "拿鐵的香氣瀰漫",
                "爵士樂輕聲迴盪",
                "在靠窗的位置",
                "享受慢時光"
            ],
            favorite: false
        },
        {
            id: 7,
            title: "雨後的彩虹",
            artist: "清新樂章",
            album: "希望的顏色",
            duration: 267,
            url: "",
            cover: "🌈",
            lyrics: [
                "暴風雨後的天空",
                "總會出現彩虹",
                "就像困難過後",
                "迎來的是希望"
            ],
            favorite: false
        },
        {
            id: 8,
            title: "深夜圖書館",
            artist: "古典鋼琴",
            album: "書香歲月",
            duration: 423,
            url: "",
            cover: "📚",
            lyrics: [
                "安靜的圖書館裡",
                "只有翻頁的聲音",
                "知識的海洋",
                "在心靈深處流淌"
            ],
            favorite: true
        }
    ];

    // ═══════════════════════════════════════════════════════════════════
    // 播放器狀態
    // ═══════════════════════════════════════════════════════════════════
    let state = {
        playlist: [],
        currentIndex: -1,
        isPlaying: false,
        volume: 75,
        isMuted: false,
        shuffle: false,
        repeat: "none", // none, one, all
        karaoke: true, // 卡拉OK逐字漸亮模式（預設開）
        drawerOpen: false,
        audioContext: null,
        analyser: null,
        audioSource: null,
        stats: {
            totalPlayedTime: 0,
            todayPlays: 0,
            mostPlayed: null,
            playCounts: {}
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // DOM 元素緩存
    // ═══════════════════════════════════════════════════════════════════
    const elements = {};

    // ═══════════════════════════════════════════════════════════════════
    // 本機音樂上傳 — IndexedDB 持久化（跨重整保留音檔）
    // ═══════════════════════════════════════════════════════════════════
    let _idb = null;

    function idbOpen() {
        return new Promise((resolve, reject) => {
            if (_idb) return resolve(_idb);
            if (!window.indexedDB) return reject(new Error("IndexedDB 不支援"));
            const req = indexedDB.open("music-player-local", 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("audio")) {
                    db.createObjectStore("audio", { keyPath: "id" });
                }
            };
            req.onsuccess = () => { _idb = req.result; resolve(_idb); };
            req.onerror = () => reject(req.error);
        });
    }

    async function idbPut(id, blob) {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("audio", "readwrite");
            tx.objectStore("audio").put({ id, blob });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function idbGet(id) {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("audio", "readonly");
            const rq = tx.objectStore("audio").get(id);
            rq.onsuccess = () => resolve(rq.result ? rq.result.blob : null);
            rq.onerror = () => reject(rq.error);
        });
    }

    async function idbDelete(id) {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("audio", "readwrite");
            tx.objectStore("audio").delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 初始化
    // ═══════════════════════════════════════════════════════════════════
    function init() {
        cacheElements();
        loadFromStorage();
        bindEvents();
        // 注入「上傳本機音樂」UI 到新增音樂 modal
        injectUploadUI();
        // 注入卡拉OK切換鈕到歌詞區
        injectKaraokeToggle();
        // 設定卡拉OK預設
        setKaraokeMode(state.karaoke);
        // 用真實的 manifest 啟動；失敗才退回 SAMPLE_MUSIC demo
        loadTracksManifest().then(() => {
            renderPlaylist();
            updateStats();
            // 重新接上上一回上傳、保存在 IndexedDB 的音檔（blob -> objectURL）
            restoreLocalAudio();
            // 預載所有 LRC（背景 fetch + parse，點歌時歌詞已經在 DOM）
            preloadAllLyrics();
        });
        loadStatsFromStorage();

        // 設置預設音量
        elements.audioPlayer.volume = state.volume / 100;
        elements.volumeSlider.value = state.volume;
        elements.volumeValue.textContent = state.volume + "%";

        // rAF 持續更新歌詞（不靠 timeupdate，更可靠）
        startLyricSyncLoop();
    }

    // rAF loop：每幀依 audio.currentTime 更新 active line
    let _rafId = null;
    function startLyricSyncLoop() {
        if (_rafId) return;
        function tick() {
            if (state.isPlaying && state.currentIndex >= 0) {
                const t = elements.audioPlayer.currentTime || 0;
                updateLyrics(t);
            }
            _rafId = requestAnimationFrame(tick);
        }
        _rafId = requestAnimationFrame(tick);
    }

    // 預載所有 LRC（背景 fetch + parse）
    async function preloadAllLyrics() {
        const tasks = [];
        for (let i = 0; i < state.playlist.length; i++) {
            const t = state.playlist[i];
            if (t && t.lyricsUrl && !t.lyricsTimed && !t.lyrics) {
                tasks.push(preloadLyric(t));
            }
        }
        if (tasks.length === 0) return;
        // 平行但節流（一次 4 個）
        const CONCURRENCY = 4;
        for (let i = 0; i < tasks.length; i += CONCURRENCY) {
            const batch = tasks.slice(i, i + CONCURRENCY);
            await Promise.all(batch);
        }
        console.log(`[music] preloaded ${tasks.length} LRC files`);
    }

    async function preloadLyric(track) {
        if (!track.lyricsUrl) return;
        try {
            const r = await fetch(track.lyricsUrl, { cache: "force-cache" });
            if (!r.ok) return;
            const text = await r.text();
            if (isLrcFormat(text)) {
                track.lyricsTimed = parseLrc(text);
            } else {
                const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                if (lines.length > 0) track.lyrics = lines;
            }
        } catch (_) { /* ignore */ }
    }

    // 從 /music/tracks.json 載入真實音樂清單
    async function loadTracksManifest() {
        try {
            const r = await fetch("/music/tracks.json?v=" + Date.now(), { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            const data = await r.json();
            if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
                // 保留 localStorage 裡使用者新增的（標題 + url 都不在 manifest 才算 userAdded）
                const userAdded = (state.playlist || []).filter(t =>
                    !data.tracks.some(mt => mt.url === t.url && mt.title === t.title)
                );
                state.playlist = data.tracks.concat(userAdded);
                return;
            }
        } catch (err) {
            console.warn("[music] tracks.json 載入失敗，使用 SAMPLE_MUSIC：", err && err.message);
        }
        // manifest 抓不到才退回 SAMPLE_MUSIC demo
        if (!state.playlist || state.playlist.length === 0) {
            state.playlist = SAMPLE_MUSIC.slice();
        }
    }

    function cacheElements() {
        elements.audioPlayer = document.getElementById("audio-player");
        elements.playlist = document.getElementById("playlist");
        elements.playBtn = document.getElementById("play-btn");
        elements.prevBtn = document.getElementById("prev-btn");
        elements.nextBtn = document.getElementById("next-btn");
        elements.shuffleBtn = document.getElementById("shuffle-btn");
        elements.repeatBtn = document.getElementById("repeat-btn");
        elements.volumeBtn = document.getElementById("volume-btn");
        elements.volumeSlider = document.getElementById("volume-slider");
        elements.volumeValue = document.getElementById("volume-value");
        elements.progressBar = document.getElementById("progress-bar");
        elements.progressFill = document.getElementById("progress-fill");
        elements.progressHandle = document.getElementById("progress-handle");
        elements.timeCurrent = document.getElementById("time-current");
        elements.timeTotal = document.getElementById("time-total");
        elements.trackTitle = document.getElementById("track-title");
        elements.trackArtist = document.getElementById("track-artist");
        elements.searchInput = document.getElementById("search-input");
        elements.addMusicBtn = document.getElementById("add-music-btn");
        elements.addMusicModal = document.getElementById("add-music-modal");
        elements.modalClose = document.getElementById("modal-close");
        elements.addMusicConfirm = document.getElementById("add-music-confirm");
        elements.lyrics = document.getElementById("lyrics");
        elements.qualitySelect = document.getElementById("quality-select");
        elements.totalSongs = document.getElementById("total-songs");
        elements.totalDuration = document.getElementById("total-duration");
        elements.tabBtns = document.querySelectorAll(".tab-btn");
        // 抽屜
        elements.openPlaylistBtn = document.getElementById("open-playlist-btn");
        elements.drawer = document.getElementById("playlist-drawer");
        elements.drawerBackdrop = document.getElementById("drawer-backdrop");
        elements.drawerClose = document.getElementById("drawer-close");
    }

    function bindEvents() {
        // 播放控制
        elements.playBtn.addEventListener("click", togglePlay);
        elements.prevBtn.addEventListener("click", prevTrack);
        elements.nextBtn.addEventListener("click", nextTrack);
        elements.shuffleBtn.addEventListener("click", toggleShuffle);
        elements.repeatBtn.addEventListener("click", toggleRepeat);

        // 進度條
        elements.progressBar.addEventListener("click", seekTo);
        elements.progressBar.addEventListener("mousedown", startSeek);

        // 音量
        elements.volumeBtn.addEventListener("click", toggleMute);
        elements.volumeSlider.addEventListener("input", setVolume);

        // 搜尋
        elements.searchInput.addEventListener("input", filterPlaylist);

        // 抽屜
        elements.openPlaylistBtn.addEventListener("click", openPlaylistDrawer);
        elements.drawerClose.addEventListener("click", closePlaylistDrawer);
        elements.drawerBackdrop.addEventListener("click", closePlaylistDrawer);
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && state.drawerOpen) closePlaylistDrawer();
        });

        // 新增音樂
        elements.addMusicBtn.addEventListener("click", openAddMusicModal);
        elements.modalClose.addEventListener("click", closeAddMusicModal);
        elements.addMusicConfirm.addEventListener("click", addMusic);
        elements.addMusicModal.addEventListener("click", e => {
            if (e.target === elements.addMusicModal) closeAddMusicModal();
        });

        // 音頻事件
        elements.audioPlayer.addEventListener("timeupdate", updateProgress);
        elements.audioPlayer.addEventListener("loadedmetadata", onMetadataLoaded);
        elements.audioPlayer.addEventListener("ended", onTrackEnded);
        elements.audioPlayer.addEventListener("error", onAudioError);

        // 鍵盤快捷鍵
        document.addEventListener("keydown", handleKeyboard);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 上傳本機音樂 UI（注入「新增音樂」modal）
    // ═══════════════════════════════════════════════════════════════════
    function injectUploadUI() {
        const modalBody = document.querySelector("#add-music-modal .modal-body");
        if (!modalBody) return;

        // 避免重複注入
        if (modalBody.querySelector(".upload-zone")) return;

        const zone = document.createElement("div");
        zone.className = "upload-zone";
        zone.innerHTML = `
            <div class="upload-header">☁️ 上傳本機音樂</div>
            <div class="upload-hint">點擊選擇或拖放音檔至此（mp3 / wav / ogg / m4a / webm）</div>
            <input type="file" id="audio-file-input" accept="audio/*" multiple hidden>
            <input type="file" id="lyrics-file-input" accept=".lrc,.txt,text/plain" hidden>
            <div class="upload-actions">
                <button type="button" class="upload-btn" id="upload-audio-btn">📁 選擇音檔</button>
                <button type="button" class="upload-btn" id="upload-lyrics-btn">📄 上傳歌詞 (.lrc)</button>
            </div>
            <div class="upload-status" id="upload-status"></div>
        `;
        modalBody.insertBefore(zone, modalBody.firstChild);

        const fileInput = zone.querySelector("#audio-file-input");
        const lyricsInput = zone.querySelector("#lyrics-file-input");
        const statusEl = zone.querySelector("#upload-status");
        const audioBtn = zone.querySelector("#upload-audio-btn");
        const lyricsBtn = zone.querySelector("#upload-lyrics-btn");

        audioBtn.addEventListener("click", () => fileInput.click());
        lyricsBtn.addEventListener("click", () => lyricsInput.click());

        fileInput.addEventListener("change", () => {
            if (fileInput.files && fileInput.files.length) {
                handleUploadFiles(fileInput.files, statusEl);
                fileInput.value = "";
            }
        });
        lyricsInput.addEventListener("change", () => {
            if (lyricsInput.files && lyricsInput.files.length) {
                importLyricsFile(lyricsInput.files[0], statusEl);
                lyricsInput.value = "";
            }
        });

        // 拖放
        ["dragenter", "dragover"].forEach(evt => {
            zone.addEventListener(evt, e => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.add("dragover");
            });
        });
        ["dragleave", "drop"].forEach(evt => {
            zone.addEventListener(evt, e => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove("dragover");
            });
        });
        zone.addEventListener("drop", e => {
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length) {
                const audio = Array.from(files).filter(f => /^audio\//.test(f.type));
                if (audio.length) handleUploadFiles(audio, statusEl);
                else statusEl.textContent = "⚠️ 請拖放音檔（mp3 / wav / ogg / m4a / webm）";
            }
        });
    }

    // 一次新增一個或多個音檔；由 addMusic() 寫入 playlist 時接上 blob
    async function handleUploadFiles(fileList, statusEl) {
        const files = Array.from(fileList).filter(f => /^audio\//.test(f.type) || /\.(mp3|wav|ogg|m4a|webm)$/i.test(f.name));
        if (files.length === 0) {
            if (statusEl) statusEl.textContent = "⚠️ 未偵測到可用的音檔。";
            return;
        }

        // 準備批量資料：先讀取 metadata 取得 duration / 當封面
        const pending = [];
        for (const file of files) {
            const track = await buildUploadedTrack(file);
            pending.push(track);
            state.playlist.push(track);
        }

        renderPlaylist(elements.searchInput.value);
        updatePlaylistStats();
        saveToStorage();

        if (statusEl) {
            statusEl.textContent = `✅ 已新增 ${pending.length} 首本機音樂：${pending.map(t => t.title).join("、")}`;
        }
        // 自動播第一首剛上傳的（若有）
        if (pending.length && state.currentIndex === -1) {
            playTrack(state.playlist.indexOf(pending[0]));
        }
    }

    async function buildUploadedTrack(file) {
        const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        const blob = file; // Blob 直接存 IDB
        // 存到 IndexedDB，以便重整後還原
        try {
            await idbPut(id, blob);
        } catch (e) {
            console.warn("[music] 無法持久化音檔到 IndexedDB：", e);
        }

        // 讀取音檔 metadata（長度/時長）
        let duration = 0;
        const cover = await extractCoverMetadata(file);
        duration = await probeAudioDuration(id, blob);

        return {
            id,
            title: titleFromFilename(file.name),
            artist: "本機上傳",
            album: "我的音樂",
            duration: duration || 0,
            url: URL.createObjectURL(blob),
            cover: cover || "🎵",
            lyrics: [],
            lyricsTimed: null,
            lyricsUrl: null,
            favorite: false,
            local: true       // 標記為本機上傳，重整後從 IDB 還原
        };
    }

    function titleFromFilename(name) {
        const base = name.replace(/\.[^.]*$/, "");
        return base || "未知歌曲";
    }

    // 用暫時 <audio> 抓長度（讀 objectURL；blob 若在 IDB，重新造 URL）
    function probeAudioDuration(id, blob) {
        return new Promise((resolve) => {
            let src;
            try {
                // 優先直接吃 blob
                const url = URL.createObjectURL(blob);
                src = url;
            } catch (_) {
                src = "";
            }
            if (!src) return resolve(0);
            const a = document.createElement("audio");
            a.preload = "metadata";
            const cleanup = () => { URL.revokeObjectURL(src); };
            a.addEventListener("loadedmetadata", () => {
                const d = a.duration && isFinite(a.duration) ? Math.round(a.duration) : 0;
                cleanup();
                resolve(d);
            });
            a.addEventListener("error", () => { cleanup(); resolve(0); });
            setTimeout(() => { cleanup(); resolve(0); }, 4000);
            a.src = src;
        });
    }

    // 從音檔 ID3 抓封面（無則回 null）
    function extractCoverMetadata(file) {
        return new Promise((resolve) => {
            if (!window.FileReader) return resolve(null);
            try {
                const reader = new FileReader();
                reader.onload = () => {
                    // 嘗試解析 ID3 APIC；太複雜就跳過，避免阻塞
                    const buf = new Uint8Array(reader.result);
                    const header = String.fromCharCode.apply(null, buf.slice(0, 3));
                    if (header !== "ID3") return resolve(null);
                    // 找 ID3v2 APIC frame（粗略掃描）
                    const str = String.fromCharCode.apply(null, buf);
                    const idx = str.indexOf("APIC");
                    if (idx > 0 && idx < buf.length) {
                        const start = idx + 4;
                        const len = buf[start];
                        const mimeEnd = start + 1 + len;
                        const mime = String.fromCharCode.apply(null, buf.slice(start + 1, mimeEnd));
                        let picStart = mimeEnd + 3;
                        if (buf[picStart - 1] === 0) picStart++;
                        const b64 = arrayBufferToBase64(buf.slice(picStart, picStart + 40000));
                        if (b64 && /^image\//.test(mime)) {
                            resolve(`data:${mime};base64,${b64}`);
                            return;
                        }
                    }
                    resolve(null);
                };
                reader.onerror = () => resolve(null);
                reader.readAsArrayBuffer(file);
            } catch (_) {
                resolve(null);
            }
        });
    }

    function arrayBufferToBase64(buf) {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
            binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    // 上傳 .lrc 歌詞 → 直接填入 modal 歌詞欄
    async function importLyricsFile(file, statusEl) {
        try {
            const text = await file.text();
            const ta = document.getElementById("new-lyrics");
            if (ta) {
                ta.value = text;
                if (statusEl) statusEl.textContent = `✅ 歌詞已匯入：${file.name}（${text.split(/\r?\n/).filter(Boolean).length} 行）`;
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = "⚠️ 歌詞讀取失敗。";
        }
    }

    // 重整後：把上傳過的 local 歌曲從 IndexedDB 還原 objectURL
    async function restoreLocalAudio() {
        for (let i = 0; i < state.playlist.length; i++) {
            const t = state.playlist[i];
            if (t && t.local) {
                try {
                    const blob = await idbGet(t.id);
                    if (blob) {
                        // blob URL 每次 session 都失效，一律重建
                        if (t.url && t.url.startsWith("blob:")) {
                            try { URL.revokeObjectURL(t.url); } catch (_) {}
                        }
                        t.url = URL.createObjectURL(blob);
                    }
                } catch (_) { /* ignore */ }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 卡拉OK模式
    // ═══════════════════════════════════════════════════════════════════
    function injectKaraokeToggle() {
        const container = document.querySelector(".lyrics-container");
        if (!container) return;
        if (container.querySelector("#karaoke-toggle")) return;

        const btn = document.createElement("button");
        btn.id = "karaoke-toggle";
        btn.className = "karaoke-toggle";
        btn.type = "button";
        btn.title = "切換卡拉OK逐字模式";
        btn.textContent = "🎤";
        btn.addEventListener("click", () => {
            state.karaoke = !state.karaoke;
            setKaraokeMode(state.karaoke);
            // 依目前播放中的歌曲重新渲染歌詞，讓結構符合新模式
            const track = state.playlist[state.currentIndex];
            if (track && state.currentIndex >= 0) {
                if (track.lyricsTimed && track.lyricsTimed.length) {
                    renderLyricsTimed(track.lyricsTimed);
                } else if (track.lyrics && track.lyrics.length) {
                    renderLyricsPlain(track.lyrics);
                }
            }
        });
        container.appendChild(btn);
    }

    function setKaraokeMode(on) {
        const modeBtn = document.getElementById("karaoke-toggle");
        const lyricsEl = document.getElementById("lyrics");
        if (modeBtn) modeBtn.classList.toggle("on", on);
        if (lyricsEl) lyricsEl.classList.toggle("karaoke", on);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 播放控制
    // ═══════════════════════════════════════════════════════════════════
    function togglePlay() {
        if (state.currentIndex === -1) {
            if (state.playlist.length > 0) {
                playTrack(0);
            }
            return;
        }

        if (state.isPlaying) {
            pauseTrack();
        } else {
            resumeTrack();
        }
    }

    function playTrack(index) {
        if (index < 0 || index >= state.playlist.length) return;

        const track = state.playlist[index];
        state.currentIndex = index;
        state.currentLyricIndex = -1; // 重置歌詞高亮索引

        // 有真實音檔 → 用 <audio> 播；沒 url 才退回模擬
        if (track.url) {
            if (simulateInterval) { clearInterval(simulateInterval); simulateInterval = null; }
            const absUrl = new URL(track.url, location.href).href;
            if (elements.audioPlayer.src !== absUrl) {
                elements.audioPlayer.src = track.url;
            }
            elements.audioPlayer.volume = state.isMuted ? 0 : state.volume / 100;
            elements.audioPlayer.play().then(() => {
                // play() 成功後才更新 UI 狀態
                state.isPlaying = true;
                updatePlayButton();
            }).catch(err => {
                // 以下屬於「可預期 / 非錯誤」的情況，但提示一下方便診斷：
                //  - AbortError：快速跳歌時新的 load() 中斷了上一次 play()
                //  - NotAllowedError：瀏覽器自動播放政策擋下 play()（保留 currentIndex，
                //    下次點 ▶️ 會在 user gesture 內重試播放當前選中的曲目）
                if (err && (err.name === "AbortError" || err.name === "NotAllowedError" || err.code === 20)) {
                    console.info("[music] play() blocked (autoplay policy or aborted):", err && err.name);
                    return;
                }
                console.warn("[music] play() rejected:", err && err.message);
            });
        }

        // 這些只負責顯示，不依賴 play() 是否成功
        updateNowPlaying(track);
        updatePlaylistUI();

        // 更新播放統計
        updatePlayStats(track);

        // 開始視覺化
        if (state.audioContext && state.audioSource) {
            try {
                state.audioSource.connect(state.analyser);
                state.analyser.connect(state.audioContext.destination);
            } catch (_) { /* already connected */ }
        }

        // 沒 url 才模擬播放進度
        if (!track.url) {
            simulatePlayback(track.duration);
        }
    }

    function pauseTrack() {
        elements.audioPlayer.pause();
        state.isPlaying = false;
        updatePlayButton();
    }

    function resumeTrack() {
        if (state.currentIndex >= 0) {
            elements.audioPlayer.play().then(() => {
                state.isPlaying = true;
                updatePlayButton();
            }).catch(err => {
                if (err && (err.name === "AbortError" || err.name === "NotAllowedError" || err.code === 20)) return;
                console.warn("[music] resume play() rejected:", err && err.message);
            });
        }
    }

    function prevTrack() {
        let newIndex = state.currentIndex - 1;
        if (newIndex < 0) {
            newIndex = state.playlist.length - 1;
        }
        playTrack(newIndex);
    }

    function nextTrack() {
        let newIndex;
        if (state.shuffle) {
            newIndex = Math.floor(Math.random() * state.playlist.length);
        } else {
            newIndex = state.currentIndex + 1;
            if (newIndex >= state.playlist.length) {
                if (state.repeat === "all") {
                    newIndex = 0;
                } else {
                    newIndex = state.currentIndex;
                    pauseTrack();
                    return;
                }
            }
        }
        playTrack(newIndex);
    }

    function toggleShuffle() {
        state.shuffle = !state.shuffle;
        elements.shuffleBtn.classList.toggle("active", state.shuffle);
    }

    function toggleRepeat() {
        const modes = ["none", "all", "one"];
        const currentModeIndex = modes.indexOf(state.repeat);
        state.repeat = modes[(currentModeIndex + 1) % modes.length];

        elements.repeatBtn.classList.remove("active");
        if (state.repeat === "one") {
            elements.repeatBtn.classList.add("active");
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 進度條控制
    // ═══════════════════════════════════════════════════════════════════
    function updateProgress() {
        if (state.currentIndex < 0) return;

        const current = elements.audioPlayer.currentTime;
        const duration = elements.audioPlayer.duration || state.playlist[state.currentIndex].duration;
        const progress = (current / duration) * 100;

        elements.progressFill.style.width = progress + "%";
        elements.progressHandle.style.left = progress + "%";
        elements.timeCurrent.textContent = formatTime(current);

        // 更新歌詞
        updateLyrics(current);
    }

    function seekTo(e) {
        if (state.currentIndex < 0) return;

        const rect = elements.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const duration = elements.audioPlayer.duration || state.playlist[state.currentIndex].duration;
        elements.audioPlayer.currentTime = percent * duration;
    }

    let isSeeking = false;
    function startSeek() {
        isSeeking = true;
        document.addEventListener("mousemove", onSeek);
        document.addEventListener("mouseup", stopSeek);
    }

    function onSeek(e) {
        if (!isSeeking) return;
        const rect = elements.progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        elements.progressFill.style.width = percent + "%";
        elements.progressHandle.style.left = percent + "%";
    }

    function stopSeek(e) {
        if (!isSeeking) return;
        isSeeking = false;
        document.removeEventListener("mousemove", onSeek);
        document.removeEventListener("mouseup", stopSeek);
        seekTo(e);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 進度條模擬（因為沒有真實音頻）
    // ═══════════════════════════════════════════════════════════════════
    let simulateInterval = null;
    let simulateProgress = 0;

    function simulatePlayback(duration) {
        if (simulateInterval) clearInterval(simulateInterval);

        simulateProgress = 0;
        elements.timeTotal.textContent = formatTime(duration);

        simulateInterval = setInterval(() => {
            if (!state.isPlaying) {
                clearInterval(simulateInterval);
                return;
            }

            simulateProgress++;
            const progress = (simulateProgress / duration) * 100;

            elements.progressFill.style.width = progress + "%";
            elements.progressHandle.style.left = progress + "%";
            elements.timeCurrent.textContent = formatTime(simulateProgress);

            // 更新歌詞
            updateLyrics(simulateProgress);

            if (simulateProgress >= duration) {
                onTrackEnded();
            }
        }, 1000);
    }

    function onMetadataLoaded() {
        const d = elements.audioPlayer.duration;
        if (d && !isNaN(d) && isFinite(d)) {
            // 用真實 metadata duration 蓋過 manifest 的估計值
            const track = state.playlist[state.currentIndex];
            if (track) track.duration = Math.round(d);
            elements.timeTotal.textContent = formatTime(d);
            updatePlaylistStats();
        }
    }

    function onTrackEnded() {
        if (simulateInterval) clearInterval(simulateInterval);

        if (state.repeat === "one") {
            simulateProgress = 0;
            if (state.playlist[state.currentIndex].url) {
                elements.audioPlayer.currentTime = 0;
                elements.audioPlayer.play().catch(() => { });
            } else {
                simulatePlayback(state.playlist[state.currentIndex].duration);
            }
        } else {
            nextTrack();
        }
    }

    function onAudioError() {
        console.warn("[music] audio error:", elements.audioPlayer.error);
        const track = state.playlist[state.currentIndex];
        if (track) {
            elements.trackArtist.textContent = (track.artist || "") + " · " + (track.album || "") + "  ⚠️ 載入失敗";
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 播放清單抽屜
    // ═══════════════════════════════════════════════════════════════════
    function openPlaylistDrawer() {
        state.drawerOpen = true;
        elements.drawer.classList.add("open");
        elements.drawer.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closePlaylistDrawer() {
        state.drawerOpen = false;
        elements.drawer.classList.remove("open");
        elements.drawer.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    // ═══════════════════════════════════════════════════════════════════
    // 音量控制
    // ═══════════════════════════════════════════════════════════════════
    function toggleMute() {
        state.isMuted = !state.isMuted;
        elements.audioPlayer.muted = state.isMuted;
        elements.volumeBtn.textContent = state.isMuted ? "🔇" : "🔊";

        if (state.isMuted) {
            elements.volumeValue.textContent = "0%";
        } else {
            elements.volumeValue.textContent = state.volume + "%";
        }
    }

    function setVolume() {
        state.volume = parseInt(elements.volumeSlider.value);
        elements.audioPlayer.volume = state.volume / 100;
        elements.volumeValue.textContent = state.volume + "%";

        if (state.volume === 0) {
            elements.volumeBtn.textContent = "🔇";
        } else if (state.volume < 50) {
            elements.volumeBtn.textContent = "🔉";
        } else {
            elements.volumeBtn.textContent = "🔊";
        }

        saveToStorage();
    }

    // ═══════════════════════════════════════════════════════════════════
    // 播放清單
    // ═══════════════════════════════════════════════════════════════════
    function renderPlaylist(filter = "") {
        elements.playlist.innerHTML = "";

        let filteredPlaylist = state.playlist;
        if (filter) {
            const searchTerm = filter.toLowerCase();
            filteredPlaylist = state.playlist.filter(track =>
                track.title.toLowerCase().includes(searchTerm) ||
                track.artist.toLowerCase().includes(searchTerm) ||
                track.album.toLowerCase().includes(searchTerm)
            );
        }

        filteredPlaylist.forEach((track, index) => {
            const originalIndex = state.playlist.indexOf(track);
            const item = createPlaylistItem(track, originalIndex);
            elements.playlist.appendChild(item);
        });

        updatePlaylistStats();
    }

    function createPlaylistItem(track, index) {
        const item = document.createElement("div");
        item.className = "playlist-item";
        if (index === state.currentIndex) {
            item.classList.add("playing");
        }
        item.dataset.index = index;

        const coverHtml = renderCoverHtml(track.cover);

        item.innerHTML = `
            <div class="playlist-item-cover">${coverHtml}</div>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${escapeHtml(track.title)}</div>
                <div class="playlist-item-artist">${escapeHtml(track.artist || "")}</div>
            </div>
            <div class="playlist-item-duration">${formatTime(track.duration)}</div>
            <div class="playlist-item-actions">
                <button class="playlist-item-action favorite ${track.favorite ? 'active' : ''}" title="收藏">❤️</button>
                <button class="playlist-item-action delete" title="刪除">🗑️</button>
            </div>
        `;

        // 點擊播放
        item.addEventListener("click", e => {
            if (!e.target.closest(".playlist-item-action")) {
                playTrack(index);
            }
        });

        // 收藏按鈕
        const favoriteBtn = item.querySelector(".favorite");
        favoriteBtn.addEventListener("click", e => {
            e.stopPropagation();
            toggleFavorite(track.id);
        });

        // 刪除按鈕
        const deleteBtn = item.querySelector(".delete");
        deleteBtn.addEventListener("click", e => {
            e.stopPropagation();
            deleteTrack(track.id);
        });

        return item;
    }

    function toggleFavorite(trackId) {
        const track = state.playlist.find(t => t.id === trackId);
        if (track) {
            track.favorite = !track.favorite;
            renderPlaylist(elements.searchInput.value);
            saveToStorage();
        }
    }

    function deleteTrack(trackId) {
        const index = state.playlist.findIndex(t => t.id === trackId);
        if (index !== -1) {
            const removed = state.playlist[index];
            // 若是本機上傳的音檔，也從 IndexedDB 移除
            if (removed && removed.local) {
                idbDelete(removed.id).catch(() => {});
                if (removed.url && removed.url.startsWith("blob:")) {
                    try { URL.revokeObjectURL(removed.url); } catch (_) {}
                }
            }
            state.playlist.splice(index, 1);
            if (state.currentIndex === index) {
                pauseTrack();
                state.currentIndex = -1;
                updateNowPlaying(null);
            } else if (state.currentIndex > index) {
                state.currentIndex--;
            }
            renderPlaylist(elements.searchInput.value);
            saveToStorage();
        }
    }

    function filterPlaylist() {
        renderPlaylist(elements.searchInput.value);
    }

    function updatePlaylistUI() {
        const items = elements.playlist.querySelectorAll(".playlist-item");
        items.forEach((item, index) => {
            item.classList.toggle("playing", index === state.currentIndex);
        });
    }

    function updatePlaylistStats() {
        const totalSongs = state.playlist.length;
        const totalSeconds = state.playlist.reduce((sum, track) => sum + track.duration, 0);

        elements.totalSongs.textContent = totalSongs;
        elements.totalDuration.textContent = formatTime(totalSeconds);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 當前播放資訊
    // ═══════════════════════════════════════════════════════════════════
    function updateNowPlaying(track) {
        if (!track) {
            elements.trackTitle.textContent = "選擇一首音樂開始";
            elements.trackArtist.textContent = "-";
            elements.lyrics.innerHTML = '<p class="lyric-line">歌詞將在播放時顯示</p>';
            return;
        }

        elements.trackTitle.textContent = track.title;
        elements.trackArtist.textContent = (track.artist || "") + " · " + (track.album || "");
        elements.timeTotal.textContent = formatTime(track.duration);
        elements.progressFill.style.width = "0%";
        elements.progressHandle.style.left = "0%";
        elements.timeCurrent.textContent = "0:00";

        // 渲染歌詞（支援 LRC timed array > plain lyrics array > lyricsUrl 抓）
        if (track.lyricsTimed && track.lyricsTimed.length > 0) {
            renderLyricsTimed(track.lyricsTimed);
        } else if (track.lyrics && track.lyrics.length > 0) {
            renderLyricsPlain(track.lyrics);
        } else if (track.lyricsUrl) {
            loadLyricsFromUrl(track.lyricsUrl);
        } else {
            elements.lyrics.innerHTML = '<p class="lyric-line">暫無歌詞</p>';
        }
    }

    // 渲染 plain lyrics（無時間戳）成 karaoke 字元 span
    function renderLyricsPlain(lines) {
        elements.lyrics.classList.toggle("karaoke", state.karaoke);
        elements.lyrics.innerHTML = lines
            .map(line => {
                const chars = Array.from(line || "");
                const spans = chars
                    .map(ch => `<span class="kar-ch">${escapeHtml(ch)}</span>`)
                    .join("");
                return `<p class="lyric-line song-line">${spans || '<span class="kar-ch">&nbsp;</span>'}</p>`;
            })
            .join("");
    }

    // 渲染 timed lyrics：[{ time: 12.34, text: '...' }, ...]
    // 卡拉OK模式：每一行拆成「字元 span」，用 --kar-fill 逐字元漸亮
    function renderLyricsTimed(timed) {
        elements.lyrics.classList.toggle("karaoke", state.karaoke);
        elements.lyrics.innerHTML = timed
            .map((l, i) => {
                const chars = Array.from(l.text || "");
                const spans = chars
                    .map(ch => `<span class="kar-ch">${escapeHtml(ch)}</span>`)
                    .join("");
                return `<p class="lyric-line song-line" data-time="${l.time.toFixed(2)}" data-idx="${i}" data-next="${i + 1 < timed.length ? (timed[i + 1].time - l.time).toFixed(2) : '3.00'}">${spans}</p>`;
            })
            .join("");
    }

    // 渲染封面 HTML（URL 用 <img>，emoji 純字串）
    function renderCoverHtml(cover) {
        if (!cover) return "🎵";
        if (typeof cover === "string" && /^(\/|https?:|data:)/i.test(cover)) {
            const esc = escapeHtml(cover);
            return `<img src="${esc}" alt="" loading="lazy" onerror="this.outerHTML='🎵'" />`;
        }
        return escapeHtml(cover);
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function loadLyricsFromUrl(url) {
        // 已被預載 → 直接 render
        const t = state.playlist[state.currentIndex];
        if (t && t.lyricsTimed && t.lyricsTimed.length > 0) {
            renderLyricsTimed(t.lyricsTimed);
            return;
        }
        if (t && t.lyrics && t.lyrics.length > 0) {
            renderLyricsPlain(t.lyrics);
            return;
        }
        elements.lyrics.innerHTML = '<p class="lyric-line">歌詞載入中…</p>';
        try {
            const r = await fetch(url, { cache: "force-cache" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            const text = await r.text();
            const track = state.playlist[state.currentIndex];
            if (track) {
                track.lyricsUrl = url;
                if (isLrcFormat(text)) {
                    const timed = parseLrc(text);
                    track.lyricsTimed = timed;
                    track.lyrics = null;
                    renderLyricsTimed(timed);
                } else {
                    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                    track.lyrics = lines;
                    track.lyricsTimed = null;
                    if (lines.length === 0) {
                        elements.lyrics.innerHTML = '<p class="lyric-line">歌詞為空</p>';
                    } else {
                        renderLyricsPlain(lines);
                    }
                }
            }
        } catch (err) {
            elements.lyrics.innerHTML = '<p class="lyric-line">歌詞載入失敗</p>';
            console.warn("[music] lyrics load failed:", err);
        }
    }

    // LRC 格式：[mm:ss.xx] 歌詞
    function isLrcFormat(text) {
        return /^\s*\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/m.test(text);
    }

    // 解析 LRC 為 [{time, text}]，處理多時間標籤同一行
    function parseLrc(text) {
        const lines = text.split(/\r?\n/);
        const out = [];
        const tagRe = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
        const metaRe = /^\[(ti|ar|al|length|by|offset|re|ve):/i;
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            if (metaRe.test(line)) continue; // 跳過 [ti:..] [ar:..] 等 metadata
            // 找所有時間標籤
            const times = [];
            let m;
            tagRe.lastIndex = 0;
            while ((m = tagRe.exec(line)) !== null) {
                const min = parseInt(m[1], 10);
                const sec = parseInt(m[2], 10);
                const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
                times.push(min * 60 + sec + ms / 1000);
            }
            if (times.length === 0) continue;
            // 去掉時間標籤，剩下的是歌詞
            const text = line.replace(tagRe, '').trim();
            for (const t of times) {
                out.push({ time: t, text });
            }
        }
        // 按時間排序
        out.sort((a, b) => a.time - b.time);
        return out;
    }

    // 找當前播放時間對應的歌詞行（用 lyricsTimed 二分搜尋）
    function findCurrentLyricLine(timed, currentTime) {
        if (!timed || timed.length === 0) return -1;
        let lo = 0, hi = timed.length - 1, idx = -1;
        // 找最大的 t <= currentTime
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (timed[mid].time <= currentTime) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return idx;
    }

    function updateLyrics(currentTime) {
        if (state.currentIndex < 0) return;

        const track = state.playlist[state.currentIndex];
        if (!track) return;

        let currentLineIndex = -1;

        if (track.lyricsTimed && track.lyricsTimed.length > 0) {
            // LRC 模式：二分配對時間
            currentLineIndex = findCurrentLyricLine(track.lyricsTimed, currentTime);
        } else if (track.lyrics && track.lyrics.length > 0) {
            // 純文字 fallback：均分時間
            const duration = track.duration / track.lyrics.length;
            currentLineIndex = Math.floor(currentTime / duration);
        } else {
            return;
        }

        // 切換 active/passed class（避免不必要的 DOM 操作）
        const lines = elements.lyrics.querySelectorAll(".lyric-line");
        if (lines.length === 0) return;

        // 計算當前行在整行時間窗內的完成度（k 値 0..1）→ 卡拉OK漸亮
        let lineFill = 0;
        if (currentLineIndex >= 0) {
            if (track.lyricsTimed && track.lyricsTimed.length) {
                const start = track.lyricsTimed[currentLineIndex].time;
                const end = (currentLineIndex + 1 < track.lyricsTimed.length)
                    ? track.lyricsTimed[currentLineIndex + 1].time
                    : (start + 3);
                lineFill = Math.max(0, Math.min(1, (currentTime - start) / Math.max(0.05, end - start)));
            } else if (track.lyrics && track.lyrics.length) {
                const seg = track.duration / track.lyrics.length;
                const s = currentLineIndex * seg;
                lineFill = Math.max(0, Math.min(1, (currentTime - s) / Math.max(0.05, seg)));
            }
        }

        const prev = state.currentLyricIndex ?? -1;
        const lineChanged = prev !== currentLineIndex;

        if (lineChanged) {
            // 移除所有舊狀態
            for (let i = 0; i < lines.length; i++) {
                const c = lines[i].classList;
                if (c.contains("active") || c.contains("passed")) {
                    c.remove("active", "passed");
                }
            }
            // 標記已過的 + 當前的
            if (currentLineIndex >= 0) {
                for (let i = 0; i < currentLineIndex; i++) {
                    lines[i].classList.add("passed");
                }
                lines[currentLineIndex].classList.add("active");
                // 平滑滾動到當前行（置中）
                try {
                    lines[currentLineIndex].scrollIntoView({ behavior: "smooth", block: "center" });
                } catch (_) { /* scrollIntoView not supported */ }
            }
            // 行切換時，把非當前行所有字元的 .lit 清除，避免殘留高亮
            for (let i = 0; i < lines.length; i++) {
                if (i !== currentLineIndex) {
                    lines[i].querySelectorAll(".lit").forEach(el => el.classList.remove("lit"));
                }
            }
            state.currentLyricIndex = currentLineIndex;
        }

        // 卡拉OK：即使行沒變，把當前行細分成字元，依 lineFill 上色
        if (state.karaoke && currentLineIndex >= 0 && lines[currentLineIndex]) {
            const activeLine = lines[currentLineIndex];
            const chars = activeLine.querySelectorAll(".kar-ch");
            if (chars.length) {
                const threshold = lineFill * chars.length;
                const prevLit = activeLine.dataset.litCount || "0";
                const litCount = Math.floor(threshold);
                if (prevLit !== String(litCount)) {
                    for (let i = 0; i < chars.length; i++) {
                        chars[i].classList.toggle("lit", i < litCount);
                    }
                    activeLine.dataset.litCount = String(litCount);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 音效視覺化（已移除）
    // ═══════════════════════════════════════════════════════════════════
    // 新增音樂 Modal
    // ═══════════════════════════════════════════════════════════════════
    function openAddMusicModal() {
        elements.addMusicModal.classList.add("active");
        clearModalInputs();
    }

    function closeAddMusicModal() {
        elements.addMusicModal.classList.remove("active");
    }

    function clearModalInputs() {
        document.getElementById("new-title").value = "";
        document.getElementById("new-artist").value = "";
        document.getElementById("new-album").value = "";
        document.getElementById("new-url").value = "";
        document.getElementById("new-cover").value = "";
        document.getElementById("new-duration").value = "180";
        document.getElementById("new-lyrics").value = "";
    }

    function addMusic() {
        const title = document.getElementById("new-title").value.trim();
        const artist = document.getElementById("new-artist").value.trim();
        const album = document.getElementById("new-album").value.trim() || "未知專輯";
        const url = document.getElementById("new-url").value.trim();
        const cover = document.getElementById("new-cover").value.trim() || "🎵";
        const duration = parseInt(document.getElementById("new-duration").value) || 180;
        const lyricsText = document.getElementById("new-lyrics").value.trim();

        /************* Local content check *************/
        if (!title || !artist) {
            alert("請填寫歌曲標題和藝術家");
            return;
        }

        const newTrack = {
            id: Date.now(),
            title,
            artist,
            album,
            duration,
            url,
            cover,
            lyrics: lyricsText ? lyricsText.split("\n") : [],
            favorite: false
        };

        // 若歌詞欄是 LRC 格式，改用 timed 模式
        if (lyricsText && isLrcFormat(lyricsText)) {
            newTrack.lyricsTimed = parseLrc(lyricsText);
            newTrack.lyrics = null;
        }

        state.playlist.push(newTrack);
        renderPlaylist(elements.searchInput.value);
        saveToStorage();
        closeAddMusicModal();
    }

    // ═══════════════════════════════════════════════════════════════════
    // 播放統計
    // ═══════════════════════════════════════════════════════════════════
    function updatePlayStats(track) {
        state.stats.todayPlays++;
        state.stats.playCounts[track.id] = (state.stats.playCounts[track.id] || 0) + 1;

        // 找出最常播放
        let maxPlays = 0;
        let mostPlayedTrack = null;
        for (const [trackId, plays] of Object.entries(state.stats.playCounts)) {
            if (plays > maxPlays) {
                maxPlays = plays;
                mostPlayedTrack = state.playlist.find(t => t.id === parseInt(trackId));
            }
        }
        state.stats.mostPlayed = mostPlayedTrack;

        updateStats();
        saveStatsToStorage();
    }

    function updateStats() {
        const statPlayed = document.getElementById("stat-played");
        const statPlays = document.getElementById("stat-plays");
        const statMostPlayed = document.getElementById("stat-most-played");

        if (statPlayed) {
            statPlayed.textContent = formatTime(state.stats.totalPlayedTime);
        }
        if (statPlays) {
            statPlays.textContent = state.stats.todayPlays;
        }
        if (statMostPlayed && state.stats.mostPlayed) {
            statMostPlayed.textContent = state.stats.mostPlayed.title;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 按鈕狀態
    // ═══════════════════════════════════════════════════════════════════
    function updatePlayButton() {
        elements.playBtn.textContent = state.isPlaying ? "⏸️" : "▶️";
        elements.playBtn.classList.toggle("playing", state.isPlaying);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 鍵盤快捷鍵
    // ═══════════════════════════════════════════════════════════════════
    function handleKeyboard(e) {
        // 忽略輸入框中的按鍵
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        switch (e.code) {
            case "Space":
                e.preventDefault();
                togglePlay();
                break;
            case "ArrowLeft":
                prevTrack();
                break;
            case "ArrowRight":
                nextTrack();
                break;
            case "ArrowUp":
                e.preventDefault();
                state.volume = Math.min(100, state.volume + 5);
                elements.volumeSlider.value = state.volume;
                setVolume();
                break;
            case "ArrowDown":
                e.preventDefault();
                state.volume = Math.max(0, state.volume - 5);
                elements.volumeSlider.value = state.volume;
                setVolume();
                break;
            case "KeyM":
                toggleMute();
                break;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 本地存儲
    // ═══════════════════════════════════════════════════════════════════
    function saveToStorage() {
        try {
            localStorage.setItem("musicPlayer", JSON.stringify({
                playlist: state.playlist,
                volume: state.volume,
                currentIndex: state.currentIndex
            }));
        } catch (e) {
            console.log("本地存儲保存失敗", e);
        }
    }

    function loadFromStorage() {
        try {
            const saved = localStorage.getItem("musicPlayer");
            if (saved) {
                const data = JSON.parse(saved);
                state.playlist = Array.isArray(data.playlist) ? data.playlist : [];
                state.volume = data.volume || 75;
                state.currentIndex = data.currentIndex ?? -1;
            }
            // 沒 localStorage 不預塞 SAMPLE_MUSIC，留給 loadTracksManifest() 填
        } catch (e) {
            // ignore
        }
    }

    function saveStatsToStorage() {
        try {
            localStorage.setItem("musicStats", JSON.stringify(state.stats));
        } catch (e) {
            console.log("統計保存失敗", e);
        }
    }

    function loadStatsFromStorage() {
        try {
            const saved = localStorage.getItem("musicStats");
            if (saved) {
                const savedStats = JSON.parse(saved);
                // 檢查是否是今天
                const today = new Date().toDateString();
                if (savedStats.lastDate !== today) {
                    state.stats = {
                        totalPlayedTime: savedStats.totalPlayedTime || 0,
                        todayPlays: 0,
                        mostPlayed: savedStats.mostPlayed || null,
                        playCounts: savedStats.playCounts || {}
                    };
                } else {
                    state.stats = savedStats;
                }
            }
        } catch (e) {
            console.log("統計載入失敗", e);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 工具函數
    // ═══════════════════════════════════════════════════════════════════
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 啟動
    // ═══════════════════════════════════════════════════════════════════
    document.addEventListener("DOMContentLoaded", init);
})();