/* =====================================================================
 * 禁閉逃殺 Lockdown Survival — 雲端成績（可選，失敗自動降級）
 * ---------------------------------------------------------------------
 * 核心玩法完全不需要後端：這個檔案只是「成績層」。
 * 走同源 /api/game/*（站台自己的 Vercel function → Neon），
 * 沒有 CORS 問題；網路失敗 / 後端沒開 → 靜默退回本機紀錄，遊戲照玩。
 * ===================================================================== */
(function (global) {
    'use strict';

    const LS = (global.LS = global.LS || {});
    const SCORE_URL = '/api/game/score';
    const BOARD_URL = '/api/game/leaderboard?limit=20';
    const LOCAL_KEY = 'lockdown-survival-scores';
    const MAX_LOCAL = 30;
    const TIMEOUT = 6000;

    function readLocal() {
        try {
            const raw = localStorage.getItem(LOCAL_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    }
    function writeLocal(rows) {
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL))); } catch { /* 隱私模式 */ }
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
        ]);
    }

    LS.cloud = {
        /** 提交一局成績；失敗就只留本機 */
        async submit(state, result) {
            const me = result.ranking.find((x) => x.id === 'p1');
            if (!me) return;
            const row = {
                name: state.human.name,
                score: me.score,
                hp: me.hp,
                rank: me.rank,
                players: state.players.length,
                difficulty: state.difficulty,
                reason: result.reason,
                achievements: me.achievements.length,
                at: new Date().toISOString(),
            };
            /* 先寫本機（一定成功） */
            const local = readLocal();
            local.unshift(row);
            writeLocal(local);

            /* 再試著上傳雲端 */
            try {
                const res = await withTimeout(fetch(SCORE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(row),
                }), TIMEOUT);
                if (!res.ok) throw new Error('http ' + res.status);
            } catch {
                /* 靜默：不上雲端也完全沒影響 */
            }
        },

        /** 讀排行榜：雲端優先，失敗退回本機 */
        async fetchBoard() {
            try {
                const res = await withTimeout(fetch(BOARD_URL), TIMEOUT);
                if (!res.ok) throw new Error('http ' + res.status);
                const data = await res.json();
                const rows = Array.isArray(data) ? data : (data && data.rows) || [];
                if (rows.length) return rows;
            } catch { /* 落到本機 */ }
            return readLocal();
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);
