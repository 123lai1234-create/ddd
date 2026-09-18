/**
 * 🎬 Music MV Mode
 * 讓指定歌曲在播放時，背景顯示對應的 YouTube MV（iframe），
 * 與既有 karaoke 字幕、混音台共存。
 *
 * MV video ID 來源（依序）：
 *   1. track.mvVideoId（tracks.json 內每首可設）
 *   2. localStorage["music_mv_overrides"]（使用者手動設定）
 *
 * 與 audio 同步（best-effort）：
 *   audio.play  → YT.playVideo()
 *   audio.pause → YT.pauseVideo()
 *   audio.seeked → YT.seekTo(time)
 */
(function () {
    "use strict";

    const LS_MODE_KEY = "music_mv_mode";
    const LS_OVERRIDES_KEY = "music_mv_overrides";

    // 預設綁定：track title → YouTube video ID
    // 可在 tracks.json 內每首加 "mvVideoId" 欄位，但這層是 fallback 跟本地開發用
    // （tracks.json 完整掃描的成本比直接維護這個 mapping 還高）
    const MV_VIDEO_IDS = {
        "不服輸__未知藝術家": "vAIZv1NSAHY",
    };

    // ── State ───────────────────────────────────────────────────
    let mvMode = localStorage.getItem(LS_MODE_KEY) === "1";
    let player = null;        // YT.Player instance
    let apiReady = false;     // YT IFrame API ready
    let activeTrackKey = null;
    let lastIframeId = null;
    let pendingPlay = false;

    // ── DOM refs ────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function el(tag, props = {}, ...kids) {
        const e = document.createElement(tag);
        for (const k in props) {
            if (k === "class") e.className = props[k];
            else if (k === "style") Object.assign(e.style, props[k]);
            else if (k.startsWith("on") && typeof props[k] === "function") e.addEventListener(k.slice(2), props[k]);
            else e.setAttribute(k, props[k]);
        }
        for (const kid of kids) if (kid != null) e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
        return e;
    }

    // ── YouTube IFrame API loader ───────────────────────────────
    function ensureYTApi() {
        if (window.YT && window.YT.Player) { apiReady = true; return; }
        if (document.getElementById("yt-iframe-api")) return;
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => { apiReady = true; tryRenderIframe(); };
    }

    function makePlayer(ytId) {
        const host = document.createElement("div");
        host.id = "yt-mv-player";
        const iframeId = "yt-mv-iframe-" + Date.now();
        lastIframeId = iframeId;
        host.appendChild(el("div", { id: iframeId }));
        return { host, iframeId, ytId };
    }

    function tryRenderIframe() {
        const container = $("mv-container");
        if (!container) return;
        const trackKey = activeTrackKey;
        if (!trackKey) { clearContainer(); return; }
        // 優先序：localStorage override > 預設 mapping
        const overrides = JSON.parse(localStorage.getItem(LS_OVERRIDES_KEY) || "{}");
        const ytId = overrides[trackKey] || MV_VIDEO_IDS[trackKey];
        if (!ytId) { clearContainer(); return; }

        container.hidden = false;
        // hide cover behind it
        const cover = $("now-playing-cover");
        if (cover) cover.style.opacity = "0";

        if (!apiReady) { ensureYTApi(); return; }

        const { host, iframeId, ytId: id } = makePlayer(ytId);
        container.innerHTML = "";
        container.appendChild(host);

        player = new window.YT.Player(iframeId, {
            videoId: id,
            playerVars: {
                autoplay: 0,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                playsinline: 1,
            },
            events: {
                onReady: (ev) => {
                    if (pendingPlay) {
                        pendingPlay = false;
                        const audio = $("audio-player");
                        if (audio && !audio.paused) ev.target.playVideo();
                    }
                },
                onStateChange: (ev) => {
                    // YT_PLAYING = 1, YT_PAUSED = 2
                    const audio = $("audio-player");
                    if (!audio) return;
                    if (ev.data === 1 && audio.paused) audio.play().catch(()=>{});
                    else if (ev.data === 2 && !audio.paused) audio.pause();
                },
            },
        });
    }

    function clearContainer() {
        const container = $("mv-container");
        if (!container) return;
        if (player && player.destroy) { try { player.destroy(); } catch (_) {} }
        player = null;
        container.hidden = true;
        container.innerHTML = "";
        const cover = $("now-playing-cover");
        if (cover) cover.style.opacity = "";
    }

    // ── Audio <-> YT sync ───────────────────────────────────────
    function hookAudioSync() {
        const audio = $("audio-player");
        if (!audio) return;
        audio.addEventListener("play", () => {
            if (!mvMode || !player || !player.playVideo) return;
            pendingPlay = false;
            try { player.playVideo(); } catch (_) { pendingPlay = true; }
        });
        audio.addEventListener("pause", () => {
            if (!mvMode || !player || !player.pauseVideo) return;
            try { player.pauseVideo(); } catch (_) {}
        });
        audio.addEventListener("seeked", () => {
            if (!mvMode || !player || !player.seekTo) return;
            try { player.seekTo(audio.currentTime, true); } catch (_) {}
        });
    }

    // ── Track detection via DOM MutationObserver ────────────────
    function getCurrentTrackKey() {
        const title = ($("track-title") || {}).textContent || "";
        const artist = ($("track-artist") || {}).textContent || "";
        const t = (title || "").trim();
        const a = (artist || "").split("·")[0].trim();
        if (!t || t === "選擇一首音樂開始") return null;
        return `${t}__${a}`;
    }

    function setupTrackObserver() {
        const target = $("track-title");
        if (!target) return;
        let last = target.textContent;
        const mo = new MutationObserver(() => {
            const cur = target.textContent;
            if (cur === last) return;
            last = cur;
            const key = getCurrentTrackKey();
            if (key !== activeTrackKey) {
                activeTrackKey = key;
                if (mvMode) tryRenderIframe();
            }
        });
        mo.observe(target, { childList: true, characterData: true, subtree: true });
    }

    // ── MV toggle ───────────────────────────────────────────────
    function setupToggle() {
        const btn = $("mv-toggle");
        if (!btn) return;
        const sync = () => {
            btn.setAttribute("aria-pressed", mvMode ? "true" : "false");
            btn.classList.toggle("active", mvMode);
            btn.title = mvMode ? "MV 模式（開）" : "MV 模式（關）";
        };
        sync();
        btn.addEventListener("click", () => {
            const key = getCurrentTrackKey();
            if (!key) {
                alert("請先選一首音樂。");
                return;
            }
            const overrides = JSON.parse(localStorage.getItem(LS_OVERRIDES_KEY) || "{}");
            const haveMv = !!overrides[key];

            if (mvMode) {
                // 關閉
                mvMode = false;
                localStorage.setItem(LS_MODE_KEY, "0");
                sync();
                clearContainer();
                return;
            }

            // 開啟 — 但若該曲沒有 MV，先問 YT ID
            if (!haveMv) {
                const yt = prompt(
                    `「${key.split("__")[0]}」尚未綁定 YouTube MV。\n\n` +
                    `請貼上 YouTube video ID（網址 v= 後面那 11 碼，例如 dQw4w9WgXcQ）。\n\n` +
                    `留空取消。`
                );
                if (!yt) return;
                const clean = yt.trim().replace(/^https?:\/\/(www\.)?youtube\.com\/watch\?v=/, "").replace(/^https?:\/\/youtu\.be\//, "").split(/[?&#]/)[0];
                if (!/^[A-Za-z0-9_-]{6,15}$/.test(clean)) {
                    alert("格式不對，請給 YouTube video ID。");
                    return;
                }
                overrides[key] = clean;
                localStorage.setItem(LS_OVERRIDES_KEY, JSON.stringify(overrides));
            }

            mvMode = true;
            localStorage.setItem(LS_MODE_KEY, "1");
            sync();
            activeTrackKey = key;
            tryRenderIframe();
        });
    }

    // ── Init ────────────────────────────────────────────────────
    function init() {
        setupToggle();
        setupTrackObserver();
        hookAudioSync();
        ensureYTApi();
        if (mvMode) {
            activeTrackKey = getCurrentTrackKey();
            tryRenderIframe();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Expose for debugging / external control
    window.MusicMV = {
        get mode() { return mvMode; },
        setMode(v) {
            mvMode = !!v;
            localStorage.setItem(LS_MODE_KEY, mvMode ? "1" : "0");
            const btn = $("mv-toggle"); if (btn) btn.click();
        },
        setOverride(trackKey, ytId) {
            const o = JSON.parse(localStorage.getItem(LS_OVERRIDES_KEY) || "{}");
            if (ytId == null) delete o[trackKey]; else o[trackKey] = ytId;
            localStorage.setItem(LS_OVERRIDES_KEY, JSON.stringify(o));
            if (mvMode) tryRenderIframe();
        },
    };
})();
