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
    // 等化器預設
    // ═══════════════════════════════════════════════════════════════════
    const EQ_PRESETS = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        pop: [1, 2, 4, 5, 4, 2, 1, 0, -1],
        rock: [4, 3, 1, -1, -2, 0, 2, 4, 5],
        jazz: [2, 1, -1, 0, 1, 3, 4, 3, 2],
        classical: [3, 2, 1, 0, -1, -1, 0, 2, 3],
        bass: [6, 5, 4, 2, 0, -1, -2, -2, -3]
    };

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
    // 初始化
    // ═══════════════════════════════════════════════════════════════════
    function init() {
        cacheElements();
        loadFromStorage();
        bindEvents();
        // 用真實的 manifest 啟動；失敗才退回 SAMPLE_MUSIC demo
        loadTracksManifest().then(() => {
            renderPlaylist();
            updateStats();
        });
        initAudioVisualizer();
        loadStatsFromStorage();

        // 設置預設音量
        elements.audioPlayer.volume = state.volume / 100;
        elements.volumeSlider.value = state.volume;
        elements.volumeValue.textContent = state.volume + "%";
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
        elements.albumArt = document.getElementById("album-art");
        elements.albumPlaceholder = document.querySelector(".album-placeholder");
        elements.searchInput = document.getElementById("search-input");
        elements.addMusicBtn = document.getElementById("add-music-btn");
        elements.addMusicModal = document.getElementById("add-music-modal");
        elements.modalClose = document.getElementById("modal-close");
        elements.addMusicConfirm = document.getElementById("add-music-confirm");
        elements.eqSliders = document.querySelectorAll(".eq-slider");
        elements.eqValues = document.querySelectorAll(".eq-value");
        elements.presetBtns = document.querySelectorAll(".preset-btn");
        elements.eqReset = document.getElementById("eq-reset");
        elements.visualizerCanvas = document.getElementById("visualizer-canvas");
        elements.audioVisualizer = document.getElementById("audio-visualizer");
        elements.lyrics = document.getElementById("lyrics");
        elements.qualitySelect = document.getElementById("quality-select");
        elements.totalSongs = document.getElementById("total-songs");
        elements.totalDuration = document.getElementById("total-duration");
        elements.tabBtns = document.querySelectorAll(".tab-btn");
        elements.playlistStats = document.querySelector(".playlist-stats");
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

        // 等化器
        elements.eqSliders.forEach(slider => {
            slider.addEventListener("input", updateEqualizer);
        });
        elements.presetBtns.forEach(btn => {
            btn.addEventListener("click", applyPreset);
        });
        elements.eqReset.addEventListener("click", resetEqualizer);

        // 搜尋
        elements.searchInput.addEventListener("input", filterPlaylist);

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
            elements.audioPlayer.play().catch(err => {
                console.warn("[music] play() rejected (autoplay? user gesture?):", err && err.message);
            });
        }

        updateNowPlaying(track);
        updatePlaylistUI();
        state.isPlaying = true;
        updatePlayButton();

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
        } else {
            // 真實音檔：加 playing class 給視覺效果
            elements.albumArt.classList.add("playing");
            elements.audioVisualizer.classList.add("active");
        }
    }

    function pauseTrack() {
        elements.audioPlayer.pause();
        state.isPlaying = false;
        updatePlayButton();
        elements.albumArt.classList.remove("playing");
        elements.audioVisualizer.classList.remove("active");
    }

    function resumeTrack() {
        if (state.currentIndex >= 0) {
            elements.audioPlayer.play().catch(() => { });
            state.isPlaying = true;
            updatePlayButton();
            elements.albumArt.classList.add("playing");
            elements.audioVisualizer.classList.add("active");
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
        elements.albumArt.classList.add("playing");
        elements.audioVisualizer.classList.add("active");

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
            elements.albumPlaceholder.textContent = "🎵";
            elements.lyrics.innerHTML = '<p class="lyric-line">歌詞將在播放時顯示</p>';
            return;
        }

        elements.trackTitle.textContent = track.title;
        elements.trackArtist.textContent = (track.artist || "") + " · " + (track.album || "");
        setAlbumArt(track.cover);
        elements.timeTotal.textContent = formatTime(track.duration);
        elements.progressFill.style.width = "0%";
        elements.progressHandle.style.left = "0%";
        elements.timeCurrent.textContent = "0:00";

        // 渲染歌詞（支援 LRC timed array > plain lyrics array > lyricsUrl 抓）
        if (track.lyricsTimed && track.lyricsTimed.length > 0) {
            renderLyricsTimed(track.lyricsTimed);
        } else if (track.lyrics && track.lyrics.length > 0) {
            elements.lyrics.innerHTML = track.lyrics
                .map(line => `<p class="lyric-line">${escapeHtml(line)}</p>`)
                .join("");
        } else if (track.lyricsUrl) {
            loadLyricsFromUrl(track.lyricsUrl);
        } else {
            elements.lyrics.innerHTML = '<p class="lyric-line">暫無歌詞</p>';
        }
    }

    // 渲染 timed lyrics：[{ time: 12.34, text: '...' }, ...]
    function renderLyricsTimed(timed) {
        elements.lyrics.innerHTML = timed
            .map((l, i) => `<p class="lyric-line" data-time="${l.time.toFixed(2)}" data-idx="${i}">${escapeHtml(l.text)}</p>`)
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

    function setAlbumArt(cover) {
        if (!elements.albumPlaceholder) return;
        if (cover && typeof cover === "string" && /^(\/|https?:|data:)/i.test(cover)) {
            elements.albumPlaceholder.innerHTML =
                `<img src="${escapeHtml(cover)}" alt="" onerror="this.outerHTML='🎵'" />`;
        } else {
            elements.albumPlaceholder.textContent = cover || "🎵";
        }
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
        elements.lyrics.innerHTML = '<p class="lyric-line">歌詞載入中…</p>';
        try {
            const r = await fetch(url, { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            const text = await r.text();
            const track = state.playlist[state.currentIndex];
            if (track) {
                track.lyricsUrl = url;
                // 自動偵測 LRC 格式（[mm:ss.xx]）
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
                        elements.lyrics.innerHTML = lines
                            .map(line => `<p class="lyric-line">${escapeHtml(line)}</p>`)
                            .join("");
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
        const prev = state.currentLyricIndex ?? -1;
        if (prev !== currentLineIndex) {
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
            state.currentLyricIndex = currentLineIndex;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 等化器控制
    // ═══════════════════════════════════════════════════════════════════
    function updateEqualizer() {
        elements.eqSliders.forEach(slider => {
            const value = slider.value;
            const valueDisplay = slider.nextElementSibling;
            valueDisplay.textContent = value;
        });
        saveToStorage();
    }

    function applyPreset(e) {
        const presetName = e.target.dataset.preset;
        const preset = EQ_PRESETS[presetName];

        if (!preset) return;

        elements.eqSliders.forEach((slider, index) => {
            slider.value = preset[index];
        });

        updateEqualizer();

        // 更新預設按鈕狀態
        elements.presetBtns.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.preset === presetName);
        });
    }

    function resetEqualizer() {
        elements.eqSliders.forEach(slider => {
            slider.value = 0;
        });
        updateEqualizer();
        elements.presetBtns.forEach(btn => {
            btn.classList.remove("active");
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 音效視覺化
    // ═══════════════════════════════════════════════════════════════════
    function initAudioVisualizer() {
        try {
            const canvas = elements.visualizerCanvas;
            const ctx = canvas.getContext("2d");

            // 設置畫布尺寸
            function resizeCanvas() {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }
            resizeCanvas();
            window.addEventListener("resize", resizeCanvas);

            // 動畫循環
            function draw() {
                requestAnimationFrame(draw);

                if (!state.isPlaying) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    return;
                }

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const bars = 32;
                const radius = Math.min(centerX, centerY) * 0.6;

                // 繪製動態圓環
                for (let i = 0; i < bars; i++) {
                    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
                    const barHeight = Math.random() * 40 + 20;

                    const x1 = centerX + Math.cos(angle) * radius;
                    const y1 = centerY + Math.sin(angle) * radius;
                    const x2 = centerX + Math.cos(angle) * (radius + barHeight);
                    const y2 = centerY + Math.sin(angle) * (radius + barHeight);

                    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
                    gradient.addColorStop(0, "rgba(99, 102, 241, 0.8)");
                    gradient.addColorStop(1, "rgba(129, 140, 248, 0.4)");

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = 3;
                    ctx.lineCap = "round";
                    ctx.stroke();
                }

                // 中心圓
                const centerGradient = ctx.createRadialGradient(
                    centerX, centerY, 0,
                    centerX, centerY, radius * 0.5
                );
                centerGradient.addColorStop(0, "rgba(99, 102, 241, 0.3)");
                centerGradient.addColorStop(1, "rgba(99, 102, 241, 0)");

                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = centerGradient;
                ctx.fill();
            }

            draw();
        } catch (e) {
            console.log("視覺化初始化失敗", e);
        }
    }

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