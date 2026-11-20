/* hero-network.js — hero 背景：分子／神經網格
 *
 * 為什麼不直接貼 MotionSite 的 prompt：
 *   1. donttalk 是 Astro 6.x，那邊的 prompt 產出的是 React + Tailwind 元件，要改寫。
 *   2. MotionSite 不認得我們的 design token，貼完會蓋掉既有配色。
 *   這支直接讀元素上的 --mint / --cyan / --amber，配色自動跟著頁面 CSS 走。
 *
 * a11y：aria-hidden + pointer-events:none，完全不影響閱讀與互動。
 * prefers-reduced-motion: reduce 時只畫一格靜態圖就停，不跑 rAF。
 */
(() => {
    'use strict';

    const HOST_SEL   = '[data-hero-network], .hero';
    const MAX_NODES  = 72;
    const MIN_NODES  = 26;
    const NODE_GAP   = 14000; // 每 14000 px² 一個節點
    const LINK_GAP   = 132;   // 節點連線距離（會依畫布大小縮放）
    const SPEED      = 0.016; // px / ms
    const PARALLAX   = 26;    // 指標視差最大位移 px
    const DAMPING    = 0.045; // 視差 lerp 係數

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ── 色彩：讀 CSS 變數，缺值就退回 about_me.css 的預設 ──────────── */
    const readToken = (cs, name, fallback) => {
        const v = cs.getPropertyValue(name).trim();
        return v || fallback;
    };

    /** '#7bf0be' → 'rgba(123,240,190,a)'；非 hex 就原樣退回。 */
    const withAlpha = (color, a) => {
        const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
        if (!m) return color;
        let hex = m[1];
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        const int = parseInt(hex, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgba(${r},${g},${b},${a})`;
    };

    const mount = (host) => {
        if (!host || host.dataset.heroNetworkReady === '1') return;
        host.dataset.heroNetworkReady = '1';

        const canvas = document.createElement('canvas');
        canvas.className = 'hero-network-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host.insertBefore(canvas, host.firstChild);

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const cs = getComputedStyle(host);
        const MINT  = readToken(cs, '--mint',  '#7bf0be');
        const CYAN  = readToken(cs, '--cyan',  '#58d7ff');
        const AMBER = readToken(cs, '--amber', '#ffbc72');
        const PALETTE = [MINT, CYAN, CYAN, AMBER]; // amber 刻意稀疏，當「工程」點綴

        /* 把 alpha 量化成 12 階，避免每對節點都做字串拼接 */
        const STEPS = 12;
        const linkStyles = PALETTE.map((c) => {
            const row = [];
            for (let i = 0; i <= STEPS; i++) row.push(withAlpha(c, (i / STEPS) * 0.34));
            return row;
        });
        const nodeStyles = PALETTE.map((c) => {
            const row = [];
            for (let i = 0; i <= STEPS; i++) row.push(withAlpha(c, 0.35 + (i / STEPS) * 0.55));
            return row;
        });

        let w = 0, h = 0, dpr = 1, nodes = [], raf = 0, last = 0;
        const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

        const linkGap = () => Math.max(96, Math.min(LINK_GAP, Math.min(w, h) * 0.32));

        const resize = () => {
            const rect = host.getBoundingClientRect();
            w = Math.max(1, Math.round(rect.width));
            h = Math.max(1, Math.round(rect.height));
            dpr = Math.min(window.devicePixelRatio || 1, 2); // 2 以上沒有肉眼收益，只燒效能
            canvas.width  = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            seed();
            // 設定 canvas.width/height 會把畫布清空。reduced-motion 下沒有 rAF
            // 會幫忙重畫，所以這裡要自己補一格，否則視窗一 resize 效果就整個消失。
            if (reduceMotion.matches) step(16);
        };

        const seed = () => {
            const n = Math.max(MIN_NODES, Math.min(MAX_NODES, ((w * h) / NODE_GAP) | 0));
            nodes = Array.from({ length: n }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * SPEED,
                vy: (Math.random() - 0.5) * SPEED,
                r: 0.9 + Math.random() * 1.5,
                c: Math.floor(Math.random() * PALETTE.length),
                ph: Math.random() * Math.PI * 2,
            }));
        };

        const step = (dt) => {
            const gap = linkGap();
            const gap2 = gap * gap;

            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                n.x += n.vx * dt;
                n.y += n.vy * dt;
                n.ph += dt * 0.0012;

                // 邊界回彈，維持節點在畫布內
                if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx); }
                else if (n.x > w) { n.x = w; n.vx = -Math.abs(n.vx); }
                if (n.y < 0) { n.y = 0; n.vy = Math.abs(n.vy); }
                else if (n.y > h) { n.y = h; n.vy = -Math.abs(n.vy); }

                // 指標視差：靠近游標的節點被輕微拉走
                if (pointer.x > -9998) {
                    const dx = n.x - pointer.x;
                    const dy = n.y - pointer.y;
                    const d2 = dx * dx + dy * dy;
                    const reach = gap * 2.2;
                    if (d2 < reach * reach && d2 > 1) {
                        const d = Math.sqrt(d2);
                        const push = ((reach - d) / reach) * PARALLAX;
                        n.x += (dx / d) * push * DAMPING;
                        n.y += (dy / d) * push * DAMPING;
                    }
                }
            }

            ctx.clearRect(0, 0, w, h);

            // 連線
            ctx.lineWidth = 1;
            for (let i = 0; i < nodes.length; i++) {
                const a = nodes[i];
                for (let j = i + 1; j < nodes.length; j++) {
                    const b = nodes[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > gap2) continue;
                    const q = Math.round((1 - Math.sqrt(d2) / gap) * STEPS);
                    ctx.strokeStyle = linkStyles[a.c][q];
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }

            // 節點 + 呼吸光暈
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                const pulse = 0.5 + 0.5 * Math.sin(n.ph);
                const q = Math.round(pulse * STEPS);
                ctx.fillStyle = nodeStyles[n.c][q];
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.r * (0.85 + pulse * 0.3), 0, Math.PI * 2);
                ctx.fill();

                // 只有最亮的一小撮節點畫光暈，省 fillRect/gradient 成本
                if (pulse > 0.82) {
                    ctx.fillStyle = withAlpha(PALETTE[n.c], 0.06 * (pulse - 0.82) / 0.18);
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.r * 7, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };

        const frame = (now) => {
            const dt = Math.min(now - last, 48); // 夾住 dt，切回分頁時不會整片跳
            last = now;

            pointer.x += (pointer.tx - pointer.x) * DAMPING;
            pointer.y += (pointer.ty - pointer.y) * DAMPING;

            step(dt);
            raf = requestAnimationFrame(frame);
        };

        const start = () => {
            if (raf) return;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        };
        const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

        const applyMotion = () => {
            if (reduceMotion.matches) {
                stop();
                pointer.tx = pointer.ty = -9999;
                pointer.x = pointer.y = -9999;
                step(16); // 靜態一格，畫面不會變空白
            } else {
                start();
            }
        };

        // ── 事件 ───────────────────────────────────────────────
        window.addEventListener('resize', resize, { passive: true });
        host.addEventListener('pointermove', (e) => {
            const r = host.getBoundingClientRect();
            pointer.tx = e.clientX - r.left;
            pointer.ty = e.clientY - r.top;
        }, { passive: true });
        host.addEventListener('pointerleave', () => {
            pointer.tx = pointer.ty = -9999;
        }, { passive: true });

        // 分頁在背景時別燒電
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else if (!reduceMotion.matches) start();
        });

        if (typeof reduceMotion.addEventListener === 'function') {
            reduceMotion.addEventListener('change', applyMotion);
        }

        resize();
        applyMotion();
    };

    const boot = () => mount(document.querySelector(HOST_SEL));
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();