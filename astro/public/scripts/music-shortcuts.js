/**
 * ⌨️ Music 鍵盤快捷鍵
 *
 * 觸發條件：focus 不在 input/textarea/select/contenteditable
 *
 * 快捷鍵：
 *   Space       → 播放/暫停
 *   ← / →       → 上一首 / 下一首
 *   M           → 切換迷你播放器
 *   F           → 全螢幕歌詞
 *   K           → 卡拉OK 逐字
 *   ? / H       → 顯示/隱藏快捷鍵面板
 *   Esc         → 關閉 modal / drawer / 快捷鍵面板
 */
(function () {
    "use strict";

    const isEditable = (el) => {
        if (!el) return false;
        const tag = el.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const fire = (id) => {
        const el = document.getElementById(id);
        if (el) el.click();
        return !!el;
    };

    const toggleDrawer = () => {
        const drawer = document.getElementById("playlist-drawer");
        if (!drawer) return;
        const open = drawer.getAttribute("aria-hidden") === "false";
        if (open) {
            drawer.setAttribute("aria-hidden", "true");
            document.getElementById("drawer-backdrop")?.classList.remove("visible");
        } else {
            drawer.setAttribute("aria-hidden", "false");
            document.getElementById("drawer-backdrop")?.classList.add("visible");
        }
    };

    const toggleShortcutsPopover = () => {
        const existing = document.getElementById("ck-shortcuts-popover");
        if (existing) { existing.remove(); return; }
        const pop = document.createElement("div");
        pop.id = "ck-shortcuts-popover";
        pop.className = "ck-shortcuts-popover";
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-label", "鍵盤快捷鍵");
        pop.innerHTML = `
            <h4>⌨️ 鍵盤快捷鍵</h4>
            <dl>
                <dt>Space</dt><dd>播放 / 暫停</dd>
                <dt>← →</dt><dd>上一首 / 下一首</dd>
                <dt>M</dt><dd>迷你播放器</dd>
                <dt>F</dt><dd>全螢幕歌詞</dd>
                <dt>K</dt><dd>卡拉OK 逐字</dd>
                <dt>L</dt><dd>切換播放清單</dd>
                <dt>?</dt><dd>顯示/隱藏本面板</dd>
                <dt>Esc</dt><dd>關閉彈窗</dd>
            </dl>
        `;
        document.body.appendChild(pop);
        pop.focus();
    };

    const closeAny = () => {
        // 1) modal
        const modal = document.getElementById("add-music-modal");
        if (modal && (modal.style.display === "block" || modal.classList.contains("show") || modal.getAttribute("aria-hidden") === "false")) {
            document.getElementById("modal-close")?.click();
            return;
        }
        // 2) drawer
        const drawer = document.getElementById("playlist-drawer");
        if (drawer && drawer.getAttribute("aria-hidden") === "false") {
            toggleDrawer();
            return;
        }
        // 3) shortcuts popover
        const pop = document.getElementById("ck-shortcuts-popover");
        if (pop) { pop.remove(); return; }
    };

    document.addEventListener("keydown", (e) => {
        // 不在編輯欄位
        if (isEditable(e.target)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // 修飾鍵沒按才處理（純鍵）

        switch (e.key) {
            case " ":
                e.preventDefault();
                fire("play-btn");
                break;
            case "ArrowLeft":
                e.preventDefault();
                fire("prev-btn");
                break;
            case "ArrowRight":
                e.preventDefault();
                fire("next-btn");
                break;
            case "m":
            case "M":
                e.preventDefault();
                fire("mini-player-toggle");
                break;
            case "f":
            case "F":
                e.preventDefault();
                fire("fullscreen-lyrics-btn");
                break;
            case "k":
            case "K":
                e.preventDefault();
                fire("karaoke-toggle");
                break;
            case "l":
            case "L":
                e.preventDefault();
                toggleDrawer();
                break;
            case "?":
                e.preventDefault();
                toggleShortcutsPopover();
                break;
            case "Escape":
                e.preventDefault();
                closeAny();
                break;
        }
    }, { passive: false });

    // 點 backdrop 關 drawer（增強 UX）
    document.getElementById("drawer-backdrop")?.addEventListener("click", toggleDrawer);
    document.getElementById("drawer-close")?.addEventListener("click", toggleDrawer);

    // Footer 「鍵盤操作說明」按鈕接快捷鍵面板
    document.getElementById("shortcut-btn")?.addEventListener("click", toggleShortcutsPopover);

    console.info("[music-shortcuts] ready (Space/←/→/M/F/K/L/?/Esc)");
})();
