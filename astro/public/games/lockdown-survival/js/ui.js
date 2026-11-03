/* =====================================================================
 * 禁閉逃殺 Lockdown Survival — 介面層
 * 畫面：標題 → 出生點 → 基因 → 對局 → 結果 → 排行榜
 * ===================================================================== */
(function (global) {
    'use strict';

    const LS = global.LS;
    const D = LS;
    const E = LS.engine;
    const B = LS.bots;
    const $ = (id) => document.getElementById(id);
    const el = (tag, cls, html) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ── 全域狀態 ──────────────────────────────────────────────── */
    const G = {
        state: null,
        setup: { difficulty: 'normal', bots: 5, spawn: null, genes: { might: 4, weight: 3, speed: 3 } },
        act: null,          /* 玩家行動草稿 */
        phase: 'move',      /* move | keep | act */
        busy: false,
        resolving: false,
    };

    /* ═══════════════════════════════════════════════════════════
     *  啟動
     * ═══════════════════════════════════════════════════════════ */
    function boot() {
        buildTitle();
        bindGlobal();
    }

    function showScreen(id) {
        for (const s of document.querySelectorAll('.ls-screen')) s.classList.add('hidden');
        $(id).classList.remove('hidden');
        global.scrollTo(0, 0);
    }

    function toast(msg, ms) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), ms || 2200);
    }

    function bindGlobal() {
        $('btn-rules').addEventListener('click', () => showRules());
        $('modal-close').addEventListener('click', closeModal);
        $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
        $('btn-help').addEventListener('click', () => showRules());
        $('btn-quit').addEventListener('click', () => {
            if (confirm('離開這局？進度不會保留。')) location.reload();
        });
        $('btn-setup-back').addEventListener('click', () => { G.state = null; buildTitle(); showScreen('screen-title'); });
        $('btn-again').addEventListener('click', () => { G.state = null; buildTitle(); showScreen('screen-title'); });
        $('btn-home').addEventListener('click', () => { G.state = null; buildTitle(); showScreen('screen-title'); });
        $('btn-leaderboard').addEventListener('click', showBoard);
        $('btn-board-back').addEventListener('click', () => {
            if (G.state && G.state.phase === 'ended') showScreen('screen-result');
            else showScreen('screen-title');
        });
    }

    /* ═══════════════════════════════════════════════════════════
     *  標題頁
     * ═══════════════════════════════════════════════════════════ */
    function buildTitle() {
        const dc = $('choice-difficulty');
        dc.innerHTML = '';
        for (const d of D.DIFFICULTIES) {
            const b = el('button', 'ls-opt' + (G.setup.difficulty === d.id ? ' on' : ''),
                `${esc(d.label)}`);
            b.title = d.hint;
            b.onclick = () => { G.setup.difficulty = d.id; buildTitle(); };
            dc.appendChild(b);
        }
        const bc = $('choice-bots');
        bc.innerHTML = '';
        for (let n = 2; n <= 7; n++) {
            const b = el('button', 'ls-opt' + (G.setup.bots === n ? ' on' : ''), `${n} 名`);
            b.onclick = () => { G.setup.bots = n; buildTitle(); };
            bc.appendChild(b);
        }
        $('btn-start').onclick = startSetup;
    }

    function startSetup() {
        const name = ($('in-name').value || '不說').trim().slice(0, 10);
        G.state = E.createGame({
            playerName: name,
            difficulty: G.setup.difficulty,
            botCount: G.setup.bots,
        });
        G.setup.spawn = null;
        showSpawns();
    }

    /* ═══════════════════════════════════════════════════════════
     *  出生點
     * ═══════════════════════════════════════════════════════════ */
    function showSpawns() {
        $('setup-title').textContent = '選擇出生點';
        $('setup-desc').textContent =
            '出生點決定你一開始離哪些資源多近。選到同一個出生點的人，落地就會先打一場。';
        const list = $('spawn-list');
        list.innerHTML = '';
        for (const s of D.SPAWN_POINTS) {
            const b = el('button', 'ls-spawn' + (G.setup.spawn === s.id ? ' on' : ''));
            b.innerHTML = `<b>${esc(s.id)}</b><div class="near">附近：${esc(s.near)}</div><div class="tip">${esc(s.tip)}</div>`;
            b.onclick = () => { G.setup.spawn = s.id; showSpawns(); };
            list.appendChild(b);
        }
        $('gene-panel').classList.add('hidden');
        $('btn-setup-next').textContent = '下一步：分配基因';
        $('btn-setup-next').onclick = () => {
            if (!G.setup.spawn) { toast('先選一個出生點'); return; }
            showGenes();
        };
        showScreen('screen-setup');
    }

    /* ═══════════════════════════════════════════════════════════
     *  基因分配
     * ═══════════════════════════════════════════════════════════ */
    function showGenes() {
        $('setup-title').textContent = '分配基因';
        $('setup-desc').textContent = '總點數固定。武力決定戰鬥上限、負重決定能帶幾件、速度決定每回合走幾步。';
        const panel = $('gene-panel');
        panel.classList.remove('hidden');
        const total = () => G.setup.genes.might + G.setup.genes.weight + G.setup.genes.speed;
        panel.innerHTML = `<h3>基因面板</h3>
            <p class="hint">已用 <b id="gene-used">${total()}</b> / 10 點。第一次玩建議 4 / 3 / 3。</p>`;

        const keys = ['might', 'weight', 'speed'];
        for (const k of keys) {
            const row = el('div', 'ls-gene-row');
            row.innerHTML = `<div><div class="gname">${esc(D.GENE_INFO[k].name)}</div><div class="gdesc">${esc(D.GENE_INFO[k].desc)}</div></div>`;
            const ctl = el('div', 'ls-gene-ctl');
            const minus = el('button', null, '−');
            const val = el('span', 'gval', String(G.setup.genes[k]));
            const plus = el('button', null, '+');
            minus.onclick = () => {
                if (G.setup.genes[k] <= 1) return;
                G.setup.genes[k] -= 1;
                if (total() < 10) G.setup.genes.speed += 1;
                showGenes();
            };
            plus.onclick = () => {
                if (total() >= 10) return;
                G.setup.genes[k] += 1;
                showGenes();
            };
            ctl.append(minus, val, plus);
            row.appendChild(ctl);
            panel.appendChild(row);
        }
        $('btn-setup-next').textContent = '進入禁閉設施 →';
        $('btn-setup-next').onclick = () => {
            if (total() !== 10) { toast('基因總點數必須是 10'); return; }
            startPlay();
        };
    }

    /* ═══════════════════════════════════════════════════════════
     *  開局
     * ═══════════════════════════════════════════════════════════ */
    function startPlay() {
        const st = G.state;
        st.human.genes = Object.assign({}, G.setup.genes);
        st.human.genes.might += st.human.genes.might ? 0 : 0;
        st.tradeJudge = (target, from, trade) => {
            if (target.isBot) return B.wantsTrade(st, target, from, trade);
            return null;   /* 真人（玩家）自己決定 */
        };
        E.assignSpawns(st, G.setup.spawn);
        showScreen('screen-game');
        beginRound();
    }

    function beginRound() {
        const st = G.state;
        E.startRound(st);
        G.act = {
            path: [st.human.roomId],
            gasVote: null,
            controlChoice: null,
            rocketTarget: null,
            itemUses: [],
            trade: null,
        };
        G.phase = 'move';
        G.busy = false;
        renderAll();
        $('broadcast').innerHTML = '';
        addLine(`<span class="line head">第 ${st.round} 回合 · 行動階段</span>`);
        addLine('選擇要走的房間，然後完成本回合行動。');
    }

    /* ═══════════════════════════════════════════════════════════
     *  地圖
     * ═══════════════════════════════════════════════════════════ */
    function rectCenter(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
    function rectBorder(r, tx, ty) {
        const c = rectCenter(r);
        const dx = tx - c.x, dy = ty - c.y;
        if (dx === 0 && dy === 0) return c;
        const sx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
        const sy = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
        const s = Math.min(sx, sy);
        return { x: c.x + dx * s, y: c.y + dy * s };
    }

    function reachableMap(state, player) {
        const max = player.adrenaline.active ? 10 : player.genes.speed;
        const dist = new Map([[player.roomId, 0]]);
        let frontier = [player.roomId];
        for (let d = 1; d <= max && frontier.length; d++) {
            const next = [];
            for (const cur of frontier) {
                const opts = { helipad: d === 1 && player.helicopter && !player.isShadow };
                for (const nb of E.neighbors(state, player, cur, opts)) {
                    if (dist.has(nb)) continue;
                    dist.set(nb, d);
                    next.push(nb);
                }
            }
            frontier = next;
        }
        dist.delete(player.roomId);
        return dist;
    }

    function renderMap() {
        const st = G.state;
        const svg = $('map');
        const parts = [];

        /* 樓層帶 */
        for (const b of D.FLOOR_BANDS) {
            parts.push(`<rect x="0" y="${b.y - 6}" width="1568" height="${b.h + 6}" fill="rgba(255,255,255,.015)" rx="6"/>`);
            parts.push(`<text x="14" y="${b.y + b.h / 2 + 5}" fill="#6b7a8c" font-size="15" font-weight="700">${esc(b.label)}</text>`);
        }

        /* 連接 */
        for (const e of D.EDGES) {
            const a = D.MAP_BOXES[e.from], b = D.MAP_BOXES[e.to];
            if (!a || !b) continue;
            const ca = rectCenter(a), cb = rectCenter(b);
            const pa = rectBorder(a, cb.x, cb.y), pb = rectBorder(b, ca.x, ca.y);
            const cls = e.type === 'climb' ? 'climb' : e.type === 'link' ? 'link' : '';
            parts.push(`<line class="rm-edge ${cls}" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`);
        }

        /* 房間 */
        const reach = G.phase === 'move' ? reachableMap(st, st.human) : new Map();
        const pathSet = new Set(G.act ? G.act.path : []);
        for (const r of D.ROOMS) {
            const box = D.MAP_BOXES[r.id];
            if (!box) continue;
            const c = rectCenter(box);
            const gassed = isGassedRoom(st, r.id);
            const cls = [
                'rm-box',
                r.special ? 'special' : '',
                reach.has(r.id) ? 'reachable' : '',
                pathSet.has(r.id) && r.id !== st.human.roomId ? 'path' : '',
                gassed ? 'gassed' : '',
                r.id === st.human.roomId ? 'here' : '',
            ].join(' ');
            parts.push(`<g data-room="${r.id}">`);
            parts.push(`<rect class="${cls}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="7"/>`);
            const label = r.name === '(空房)' ? r.id : `${r.id} ${r.name}`;
            const fs = label.length > 7 ? 12 : 14;
            parts.push(`<text class="rm-label" x="${c.x}" y="${c.y - 2}" style="font-size:${fs}px">${esc(label)}</text>`);
            if (D.ROOM_TAGS[r.id]) {
                parts.push(`<text class="rm-tag" x="${c.x}" y="${c.y + 16}">${esc(D.ROOM_TAGS[r.id])}</text>`);
            }
            if (r.helipad) parts.push(`<text class="rm-helipad" x="${box.x + box.w - 12}" y="${box.y + 14}">H</text>`);
            parts.push(`</g>`);
        }

        /* 玩家 */
        const byRoom = new Map();
        for (const p of st.players) {
            if (!p.roomId) continue;
            if (!byRoom.has(p.roomId)) byRoom.set(p.roomId, []);
            byRoom.get(p.roomId).push(p);
        }
        const colors = ['#9dff8a', '#60a5fa', '#f2b544', '#f472b6', '#b07cff', '#f87171', '#2dd4bf', '#fbbf24'];
        let ci = 0;
        for (const [roomId, group] of byRoom) {
            const box = D.MAP_BOXES[roomId];
            if (!box) continue;
            group.forEach((p, i) => {
                const col = p.isBot ? colors[ci++ % colors.length] : '#9dff8a';
                const cx = box.x + box.w / 2 + (i - (group.length - 1) / 2) * 17;
                const cy = box.y + box.h - 13;
                const dim = p.isShadow ? 0.45 : 1;
                parts.push(`<g class="p-dot" data-player="${p.id}">`);
                parts.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="${p.isShadow ? '#05080b' : col}" stroke="${col}" stroke-width="2" opacity="${dim}"/>`);
                parts.push(`<text class="p-label ${p.isShadow ? 'out' : ''}" x="${cx}" y="${cy + 4}" opacity="${dim}">${esc(p.name.slice(0, 1))}</text>`);
                parts.push(`</g>`);
            });
        }

        svg.innerHTML = parts.join('');

        /* 點擊移動 */
        svg.querySelectorAll('g[data-room]').forEach((g) => {
            g.addEventListener('click', () => {
                const id = g.getAttribute('data-room');
                if (G.phase !== 'move') return;
                if (!reach.has(id)) { toast('這回合走不到那個房間'); return; }
                const p = B.bfsPath(st, st.human, id);
                if (!p) { toast('走不過去'); return; }
                const v = E.validatePath(st, st.human, p);
                if (!v.ok) { toast(v.error); return; }
                G.act.path = p;
                renderMap();
                renderAction();
            });
        });
    }

    function isGassedRoom(state, roomId) {
        const r = D.ROOM_MAP.get(roomId);
        if (!r) return false;
        if (state.detoxedRooms.includes(roomId)) return false;
        if (r.gasImmune) return false;
        return r.floors.every((f) => state.gassedFloors.includes(f));
    }

    /* ═══════════════════════════════════════════════════════════
     *  玩家列表 / 圖例
     * ═══════════════════════════════════════════════════════════ */
    function renderPlayers() {
        const st = G.state;
        const list = $('player-list');
        list.innerHTML = '';
        const colors = ['#60a5fa', '#f2b544', '#f472b6', '#b07cff', '#f87171', '#2dd4bf', '#fbbf24'];
        let ci = 0;
        for (const p of st.players) {
            const row = el('div', 'pl-row' + (p.id === 'p1' ? ' me' : '') + (p.isShadow ? ' dead' : ''));
            const col = p.isBot ? colors[ci++ % colors.length] : '#9dff8a';
            row.innerHTML = `<span class="dot" style="background:${p.isShadow ? 'transparent' : col};border:1.5px solid ${col}"></span>
                <span class="nm">${esc(p.name)}${p.isBot ? ' <span class="tag">BOT</span>' : ''}</span>
                <span class="rm">${esc(p.roomId || '—')}</span>
                <span class="hp ${p.hp <= 3 ? 'low' : p.hp >= 8 ? 'ok' : ''}">${p.isShadow ? '暗影' : p.hp}</span>`;
            list.appendChild(row);
        }

        /* 圖例 */
        const fl = $('floor-legend');
        fl.innerHTML = D.FLOOR_ORDER.map((f) => {
            const gassed = st.gassedFloors.includes(f);
            const hot = st.lastGasTally && st.lastGasTally.floorId === f;
            return `<span class="ls-fl ${gassed ? 'gassed' : ''} ${hot && !gassed ? 'hot' : ''}">${esc(f)}</span>`;
        }).join('');
        const gl = $('gas-legend');
        gl.innerHTML = `<span class="ls-fl gassed">毒氣中</span><span class="ls-fl hot">上回合最高票</span>`;

        /* 底部資訊 */
        const h = st.human;
        $('map-foot').innerHTML = `你在 <b>${esc(h.roomId)}</b>｜武力 ${h.genes.might}・負重 ${h.genes.weight}・速度 ${h.genes.speed}｜
            負重 ${E.totalItems(h)}/${E.capacityOf(h) === Infinity ? '∞' : E.capacityOf(h)}｜
            ${h.isShadow ? '<b style="color:#f87171">你是暗影</b>' : 'HP ' + h.hp + '/' + h.maxHp}`;
    }

    /* ═══════════════════════════════════════════════════════════
     *  行動面板
     * ═══════════════════════════════════════════════════════════ */
    function renderAction() {
        const st = G.state;
        const h = st.human;
        const p = $('action-panel');
        p.innerHTML = '';

        if (st.phase === 'ended') {
            p.innerHTML = '<p class="ls-hint">本局結束。</p>';
            return;
        }
        if (G.resolving) {
            p.innerHTML = '<p class="ls-hint">系統結算中…</p>';
            return;
        }

        /* 待處理的交易邀請 */
        if (st.pendingTrades && st.pendingTrades.length) {
            const box = el('div', 'ls-pending');
            let html = '<h4>有人想跟你交換</h4>';
            st.pendingTrades.forEach((t, i) => {
                const from = st.players.find((x) => x.id === t.from);
                html += `<div class="ls-box" style="margin-bottom:8px">
                    <p><b>${esc(from ? from.name : '?')}</b> 想給你 <b>${esc(itemList(t.give))}</b>${t.want.length ? `，換 <b>${esc(itemList(t.want))}</b>` : '（單方贈送）'}</p>
                    <div class="ls-row">
                      <button class="ls-btn sm primary" data-trade-accept="${i}">接受</button>
                      <button class="ls-btn sm ghost" data-trade-reject="${i}">拒絕</button>
                    </div></div>`;
            });
            box.innerHTML = html;
            p.appendChild(box);
        }

        if (G.phase === 'move') {
            p.appendChild(stepMove());
        } else if (G.phase === 'keep') {
            p.appendChild(stepKeep());
        } else {
            p.appendChild(stepAct());
        }

        bindActionEvents(p);
    }

    function stepMove() {
        const st = G.state;
        const h = st.human;
        const path = G.act.path;
        const moved = path.length > 1;
        const reach = reachableMap(st, h);
        const canMove = reach.size > 0;
        const box = el('div');
        box.innerHTML = `
            <p class="ls-step-title">行動 <b>1/3</b>・移動</p>
            <p class="ls-hint">在地圖上點一個綠框房間移動。每回合最多走 <b>${h.adrenaline.active ? 10 : h.genes.speed}</b> 步，不能往回走。</p>
            ${canMove ? '' : '<div class="ls-box warn"><p>這個房間沒有任何可走的出口（可能需要繩索才能上下樓）。只能原地撐過這回合。</p></div>'}
            ${moved ? `<div class="ls-box"><p>路徑：<b>${esc(path.map((r) => D.ROOM_MAP.get(r).name === '(空房)' ? r : r + ' ' + D.ROOM_MAP.get(r).name).join(' → '))}</b></p>
              <p class="ls-cost">共 ${path.length - 1} 步${h.helicopter && path.length > 1 ? '（第一步可用停機坪飛行）' : ''}</p></div>` : ''}
            <div class="ls-actions">
              <button class="ls-btn ghost sm" data-act="reset-path" ${moved ? '' : 'disabled'}>重新選</button>
              <button class="ls-btn primary grow" data-act="confirm-move" ${(moved || !canMove) ? '' : 'disabled'}>確定位置</button>
            </div>`;
        return box;
    }

    function stepKeep() {
        const st = G.state;
        const h = st.human;
        const pd = h.pendingDraw;
        const box = el('div');
        if (!pd) { G.phase = 'act'; return stepAct(); }
        const cap = E.capacityOf(h);
        const used = E.totalItems(h);
        let html = `<p class="ls-step-title">行動 <b>2/3</b>・抽取物資</p>`;
        const room = D.ROOM_MAP.get(pd.roomId);
        html += `<p class="ls-hint">你在 <b>${esc(pd.roomId)} ${esc(room.name)}</b> 停留，攤開了 ${pd.options.length} 張卡。點卡片決定帶不帶走。</p>`;
        if (pd.roomId === 'B503') html += '<div class="ls-box warn"><p>垃圾強制帶走，但最多只能留 2 件非垃圾。</p></div>';
        if (pd.roomId === '202') html += '<div class="ls-box info"><p>停機坪空投：最多帶走 1 張。</p></div>';
        html += `<div class="ls-box"><p>負重：已用 <b>${used}</b> / ${cap === Infinity ? '∞' : cap}</p></div>`;
        for (const o of pd.options) {
            const def = D.ITEMS[o.itemId];
            const forced = o.forced;
            html += `<label class="ls-item${forced ? ' locked' : ''}">
                <input type="checkbox" data-keep="${o.index}" ${forced ? 'checked disabled' : ''} />
                <span class="inm">${esc(def.name)}${o.itemId === 'gold_bar' ? ' <span class="ls-cost">（只能靠抽取取得）</span>' : ''}</span>
                <span class="qty">×${o.quantity}</span></label>`;
        }
        html += `<div class="ls-actions"><button class="ls-btn primary grow" data-act="confirm-keep">確定保留</button></div>`;
        box.innerHTML = html;
        return box;
    }

    function stepAct() {
        const st = G.state;
        const h = st.human;
        const room = D.ROOM_MAP.get(h.roomId);
        let html = `<p class="ls-step-title">行動 <b>3/3</b>・本回合決定</p>`;

        /* 特殊房間 */
        if (room.special === 'control_room') {
            const c = G.act.controlChoice;
            html += `<div class="ls-box"><h4>控制室・二選一</h4>
                <p>① 毒氣票以 <b>10 票</b>計算（可改投哪一層）② 讓一個有毒的房間永久解毒（隱藏資訊）</p>
                <div class="ls-row">
                  <button class="ls-opt ${c && c.mode === 'gas10' ? 'on' : ''}" data-act="ctrl-gas10">① 毒氣票 ×10</button>
                  <button class="ls-opt ${c && c.mode === 'detox' ? 'on' : ''}" data-act="ctrl-detox">② 永久解毒</button>
                </div>`;
            if (c && c.mode === 'detox') {
                const cands = st.detoxedRooms.length ? [] : D.ROOMS.filter((r) =>
                    r.floors.some((f) => st.gassedFloors.includes(f)) && !st.detoxedRooms.includes(r.id));
                html += '<p class="ls-cost" style="margin-top:8px">選擇要解毒的房間：</p><div class="ls-floor-pick">';
                for (const r of cands) {
                    html += `<button class="${c.target === r.id ? 'on' : ''}" data-detox="${r.id}">${esc(r.id)} ${esc(r.name)}</button>`;
                }
                if (!cands.length) html += '<span class="ls-cost">目前沒有可解毒的房間</span>';
                html += '</div>';
            }
            html += '</div>';
        }
        if (room.special === 'console_room') {
            const gr = G.act.geneRealloc;
            const total = h.genes.might + h.genes.weight + h.genes.speed;
            html += `<div class="ls-box"><h4>操作室・重新分配基因</h4>
                <p>總點數維持 <b>${total}</b>，只換分佈。</p>
                <div class="ls-row">`;
            for (const k of ['might', 'weight', 'speed']) {
                const v = gr ? gr[k] : h.genes[k];
                html += `<span class="ls-opt">${esc(D.GENE_INFO[k].name)} <b>${v}</b></span>`;
            }
            html += `</div><p class="ls-cost" style="margin-top:8px">想重配就取消勾選並調整；不重配則維持原樣。</p>
                <div class="ls-row">${['might', 'weight', 'speed'].map((k) =>
                `<button class="ls-opt" data-realloc="${k}">${esc(D.GENE_INFO[k].name)} +1</button>`).join('')}</div>
                <div class="ls-row" style="margin-top:6px">${['might', 'weight', 'speed'].map((k) =>
                `<button class="ls-opt" data-realloc-down="${k}">${esc(D.GENE_INFO[k].name)} −1</button>`).join('')}</div>
                </div>`;
        }

        /* 資源動作 */
        html += '<div class="ls-box"><h4>資源動作</h4>';
        let any = false;
        if (E.hasItem(h, 'recycler') && st.usedPile.length) {
            any = true;
            html += `<p>循環回收裝置：待回收堆有 <b>${st.usedPile.length}</b> 張，每回合可抽 1 張。</p>
              <button class="ls-btn sm ghost" data-act="use-recycler">抽一張</button>`;
        }
        if (E.hasItem(h, 'rocket_launcher')) {
            any = true;
            html += `<p style="margin-top:8px">火箭筒：選一個房間，結算第 5 步對裡面每位存活玩家造成 4 點傷害。</p>
              <select class="ls-select" data-rocket-select style="width:100%;margin-top:6px;padding:8px;border-radius:8px;background:#0d1218;border:1px solid #23303f;color:#e8edf3">
                <option value="">（不瞄準）</option>`;
            for (const r of D.ROOMS) {
                const n = st.players.filter((p) => p.roomId === r.id && !p.isShadow).length;
                html += `<option value="${r.id}" ${G.act.rocketTarget === r.id ? 'selected' : ''}>${esc(r.id)} ${esc(r.name)}${n ? `（${n} 人）` : ''}</option>`;
            }
            html += '</select>';
        }
        if (E.hasItem(h, 'gold_bar')) {
            const pool = st.rooms[h.roomId].pool.filter((x) => x.itemId !== 'gold_bar' && x.quantity > 0);
            any = true;
            html += `<p style="margin-top:8px">金條 ×${E.itemCount(h, 'gold_bar')}：花 1 張直接從當前地點物資挑 1 項（不佔抽取次數）。</p>`;
            if (pool.length && room.goldBarDisabled !== true) {
                html += '<div class="ls-floor-pick">';
                for (const x of pool) html += `<button data-gold="${x.itemId}">${esc(D.ITEMS[x.itemId].name)}</button>`;
                html += '</div>';
            } else {
                html += '<p class="ls-cost">這裡沒有可換的物資。</p>';
            }
        }
        if (!any) html += '<p class="ls-cost">沒有可用的資源動作。</p>';
        html += '</div>';

        /* 道具使用 */
        const usable = h.items.filter((it) => D.ITEMS[it.itemId] && D.ITEMS[it.itemId].usableInResolution);
        html += '<div class="ls-box"><h4>道具卡使用（結算第 6 步依序生效）</h4>';
        if (!usable.length) html += '<p class="ls-cost">身上沒有能在結算時使用的道具。</p>';
        for (const it of usable) {
            const def = D.ITEMS[it.itemId];
            const n = G.act.itemUses.filter((u) => u.itemId === it.itemId).length;
            html += `<div class="ls-item${n ? ' on' : ''}">
                <span class="inm">${esc(def.name)} ×${it.quantity}</span>
                <button class="ls-btn sm ghost" data-use-item="${it.itemId}">${n ? `已排 ${n}` : '排入使用'}</button></div>
                <p class="ls-cost" style="margin:-4px 0 8px">${esc(D.ITEM_HELP[it.itemId] || '')}</p>`;
        }
        html += '</div>';

        /* 毒氣投票 */
        const voteable = D.FLOOR_ORDER.filter((f) => !st.gassedFloors.includes(f));
        html += `<div class="ls-box"><h4>毒氣投票</h4>
            <p>投毒一整層。得票最高者中毒（平票則並列一起毒）。</p>
            <div class="ls-floor-pick">`;
        for (const f of voteable) {
            html += `<button class="${G.act.gasVote === f ? 'on' : ''}" data-gas="${f}">${esc(f)}</button>`;
        }
        html += `<button class="${!G.act.gasVote ? 'on' : ''}" data-gas="">不投</button></div>`;
        if (G.act.controlChoice && G.act.controlChoice.mode === 'gas10') {
            html += '<p class="ls-cost" style="margin-top:6px">控制室加成：這一票算 <b>10 票</b>。</p>';
        }
        html += '</div>';

        /* 交易 */
        html += `<div class="ls-box"><h4>交易（可略過）</h4>`;
        const others = st.players.filter((p) => p.id !== 'p1' && !p.isShadow);
        if (G.act.trade) {
            const t = G.act.trade;
            const tgt = st.players.find((x) => x.id === t.targetId);
            html += `<p>提議：給 <b>${esc(tgt ? tgt.name : '?')}</b> ${esc(itemList(t.give))}${t.want.length ? `，換 ${esc(itemList(t.want))}` : '（單方贈送）'}</p>
              <button class="ls-btn sm ghost" data-act="clear-trade">取消</button>`;
        } else {
            html += '<div class="ls-row">';
            for (const o of others) {
                html += `<button class="ls-opt" data-trade-with="${o.id}">${esc(o.name)}</button>`;
            }
            html += '</div>';
        }
        html += '</div>';

        html += `<div class="ls-actions"><button class="ls-btn primary grow" data-act="submit">完成本回合行動</button></div>`;
        const box = el('div');
        box.innerHTML = html;
        return box;
    }

    function itemList(ids) {
        if (!ids || !ids.length) return '無';
        return ids.map((i) => D.ITEMS[i] ? D.ITEMS[i].name : i).join('、');
    }

    /* ── 行動面板事件 ──────────────────────────────────────────── */
    function bindActionEvents(root) {
        root.querySelectorAll('[data-act]').forEach((b) => {
            b.addEventListener('click', () => onAction(b.getAttribute('data-act'), b));
        });
        root.querySelectorAll('[data-keep]').forEach((c) => {
            c.addEventListener('change', () => {
                const pd = G.state.human.pendingDraw;
                if (!pd) return;
                const idx = Number(c.getAttribute('data-keep'));
                const opt = pd.options[idx];
                const cap = E.capacityOf(G.state.human);
                const used = E.totalItems(G.state.human);
                if (c.checked && !opt.forced && used >= cap) {
                    c.checked = false;
                    toast('負重不夠了');
                }
            });
        });
        root.querySelectorAll('[data-gas]').forEach((b) => {
            b.addEventListener('click', () => {
                const f = b.getAttribute('data-gas');
                G.act.gasVote = f || null;
                renderAction();
            });
        });
        root.querySelectorAll('[data-detox]').forEach((b) => {
            b.addEventListener('click', () => {
                if (!G.act.controlChoice) G.act.controlChoice = { mode: 'detox' };
                G.act.controlChoice.target = b.getAttribute('data-detox');
                renderAction();
            });
        });
        root.querySelectorAll('[data-realloc]').forEach((b) => {
            b.addEventListener('click', () => realloc(b.getAttribute('data-realloc'), 1));
        });
        root.querySelectorAll('[data-realloc-down]').forEach((b) => {
            b.addEventListener('click', () => realloc(b.getAttribute('data-realloc-down'), -1));
        });
        root.querySelectorAll('[data-use-item]').forEach((b) => {
            b.addEventListener('click', () => {
                const id = b.getAttribute('data-use-item');
                const h = G.state.human;
                const used = G.act.itemUses.filter((u) => u.itemId === id).length;
                if (used >= E.itemCount(h, id)) { toast('沒有更多了'); return; }
                G.act.itemUses.push({ itemId: id });
                renderAction();
            });
        });
        root.querySelectorAll('[data-gold]').forEach((b) => {
            b.addEventListener('click', () => {
                const itemId = b.getAttribute('data-gold');
                const st = G.state;
                const h = st.human;
                const pool = st.rooms[h.roomId].pool;
                const pick = pool.find((x) => x.itemId === itemId && x.quantity > 0);
                if (!pick) { toast('這個物品剛剛被拿完了'); return; }
                if (!E.hasItem(h, 'gold_bar')) return;
                pick.quantity -= 1;
                E.removeItem(h, 'gold_bar', 1);
                E.addItem(h, itemId, 1);
                h.stats.goldSpent += 1;
                h.stats.freeGot += 1;
                toast(`金條換到 ${D.ITEMS[itemId].name}`);
                renderAll();
            });
        });
        root.querySelectorAll('[data-trade-with]').forEach((b) => {
            b.addEventListener('click', () => {
                const id = b.getAttribute('data-trade-with');
                const h = G.state.human;
                const mine = Object.keys(D.ITEMS).filter((k) => E.itemCount(h, k) > 0);
                if (!mine.length) { toast('你沒有東西可以給'); return; }
                const give = mine[0];
                const tgt = G.state.players.find((x) => x.id === id);
                const their = Object.keys(D.ITEMS).filter((k) => E.itemCount(tgt, k) > 0);
                G.act.trade = { targetId: id, give: [give], want: their.length ? [their[0]] : [] };
                renderAction();
            });
        });
        root.querySelectorAll('[data-trade-accept]').forEach((b) => {
            b.addEventListener('click', () => { E.answerTrade(G.state, Number(b.getAttribute('data-trade-accept')), true); renderAll(); });
        });
        root.querySelectorAll('[data-trade-reject]').forEach((b) => {
            b.addEventListener('click', () => { E.answerTrade(G.state, Number(b.getAttribute('data-trade-reject')), false); renderAll(); });
        });
        const rs = root.querySelector('[data-rocket-select]');
        if (rs) rs.addEventListener('change', () => { G.act.rocketTarget = rs.value || null; });
    }

    function realloc(key, delta) {
        const h = G.state.human;
        const base = G.act.geneRealloc || { might: h.genes.might, weight: h.genes.weight, speed: h.genes.speed };
        const next = Object.assign({}, base);
        next[key] += delta;
        const total = next.might + next.weight + next.speed;
        if (next[key] < 1 || total > 13) { toast('點數超出範圍'); return; }
        G.act.geneRealloc = next;
        renderAction();
    }

    /* ── 行動流程 ──────────────────────────────────────────────── */
    function onAction(act) {
        const st = G.state;
        const h = st.human;

        if (act === 'reset-path') { G.act.path = [h.roomId]; renderMap(); renderAction(); return; }

        if (act === 'confirm-move') {
            const v = E.validatePath(st, h, G.act.path);
            if (!v.ok) { toast(v.error); return; }
            E.applyMove(st, h, G.act.path);
            /* 基因庫：停留後三項各 +1 */
            const room = D.ROOM_MAP.get(h.roomId);
            if (room && room.special === 'gene_bank') {
                h.genes.might += 1; h.genes.weight += 1; h.genes.speed += 1;
                toast('基因庫：武力、負重、速度各 +1');
            }
            /* 抽取 */
            const draw = E.performDraw(st, h, h.roomId);
            if (draw && draw.options.length) {
                /* 預設勾選：依負重先勾滿，垃圾強制 */
                const cap = E.capacityOf(h);
                let used = E.totalItems(h);
                for (const o of draw.options) {
                    if (o.forced) continue;
                    if (used < cap) { used += o.quantity; o._default = true; }
                }
                G.phase = 'keep';
                renderAll();
                /* 把預設勾選套進 checkbox */
                setTimeout(() => {
                    const pd = h.pendingDraw;
                    if (!pd) return;
                    document.querySelectorAll('[data-keep]').forEach((c) => {
                        const idx = Number(c.getAttribute('data-keep'));
                        const opt = pd.options[idx];
                        c.checked = !!opt.forced || !!opt._default;
                    });
                }, 0);
                return;
            }
            G.phase = 'act';
            renderAll();
            return;
        }

        if (act === 'confirm-keep') {
            const pd = h.pendingDraw;
            if (pd) {
                const idxs = [];
                document.querySelectorAll('[data-keep]').forEach((c) => {
                    if (c.checked) idxs.push(Number(c.getAttribute('data-keep')));
                });
                E.applyKeep(st, h, idxs);
            }
            G.phase = 'act';
            renderAll();
            return;
        }

        if (act === 'ctrl-gas10') { G.act.controlChoice = { mode: 'gas10' }; renderAction(); return; }
        if (act === 'ctrl-detox') { G.act.controlChoice = { mode: 'detox', target: null }; renderAction(); return; }
        if (act === 'clear-trade') { G.act.trade = null; renderAction(); return; }

        if (act === 'use-recycler') {
            if (!E.hasItem(h, 'recycler')) return;
            if (!st.usedPile.length) { toast('待回收堆是空的'); return; }
            const i = Math.floor(st.rng() * st.usedPile.length);
            const it = st.usedPile.splice(i, 1)[0];
            E.addItem(h, it.itemId, 1);
            toast(`回收裝置取得 ${D.ITEMS[it.itemId].name}`);
            renderAll();
            return;
        }

        if (act === 'submit') { submitAction(); return; }
    }

    function submitAction() {
        const st = G.state;
        const h = st.human;
        const a = {
            path: G.act.path.slice(),
            gasVote: G.act.gasVote,
            gasVoteWeight: G.act.controlChoice && G.act.controlChoice.mode === 'gas10' ? 10 : 1,
            controlChoice: G.act.controlChoice,
            rocketTarget: G.act.rocketTarget,
            itemUses: G.act.itemUses.slice(),
            trade: G.act.trade,
            geneRealloc: G.act.geneRealloc,
        };
        /* 基因重配 */
        if (a.geneRealloc) {
            h.genes = { might: a.geneRealloc.might, weight: a.geneRealloc.weight, speed: a.geneRealloc.speed };
        }
        h.action = a;
        G.busy = true;
        renderAll();
        setTimeout(runBots, 500);
    }

    /* ═══════════════════════════════════════════════════════════
     *  機器人回合
     * ═══════════════════════════════════════════════════════════ */
    function runBots() {
        const st = G.state;
        for (const p of st.players) {
            if (p.id === 'p1') continue;
            B.playTurn(st, p);
        }
        renderPlayers();
        renderMap();
        setTimeout(() => resolveRound(), 600);
    }

    /* ═══════════════════════════════════════════════════════════
     *  結算
     * ═══════════════════════════════════════════════════════════ */
    function resolveRound() {
        const st = G.state;
        G.resolving = true;
        renderAction();
        const steps = E.resolveRound(st);
        const end = E.checkEnd(st);
        G.resolving = false;

        /* 依序播報 */
        let i = 0;
        const labels = {
            operating_room: '手術室結算', encounter: '戰鬥 / 亂鬥 / 暗影相遇',
            gas: '毒氣樓層公布', supplies: '水糧上繳', rocket: '火箭筒襲擊',
            items: '道具卡使用', revival: '暗影復活', hp_announce: '生命值公告',
        };
        const play = () => {
            if (i >= steps.length) {
                renderAll();
                if (end) { showResult(); return; }
                beginRound();
                return;
            }
            const s = steps[i++];
            addLine(`<span class="line head">${esc(labels[s.step] || s.step)}</span>`);
            for (const t of describeStep(st, s)) addLine(t);
            renderPlayers();
            renderMap();
            setTimeout(play, 520);
        };
        play();
    }

    function describeStep(st, s) {
        const out = [];
        const name = (id) => { const p = st.players.find((x) => x.id === id); return p ? p.name : id; };
        const c = s.content;
        switch (s.step) {
            case 'operating_room': {
                const eff = c.effect;
                out.push(`<span class="line">${eff === 'heal' ? '🏥 有手術發生' : eff === 'brawl' ? '💥 手術室 3 人以上，沒有手術發生' : '沒有手術發生'}</span>`);
                if (c.occupants && c.occupants.length) {
                    out.push(`<span class="line">停留者：${c.occupants.map(name).join('、')}${eff === 'heal' ? '，各回復 4 點生命' : ''}</span>`);
                }
                break;
            }
            case 'encounter': {
                const all = [...c.fightRooms, ...c.brawlRooms];
                if (!all.length) out.push('<span class="line">沒有任何相遇</span>');
                for (const roomId of all) {
                    const det = c.details && c.details[roomId];
                    if (!det) continue;
                    const isBrawl = c.brawlRooms.includes(roomId);
                    const line = det.combatants.map((cb) => {
                        const p = st.players.find((x) => x.id === cb.playerId);
                        const gun = cb.hasFirearm ? '🔫' : '';
                        const effTxt = cb.effective === cb.attackPower ? '' : `→${cb.effective}`;
                        const dmg = det.damage[cb.playerId];
                        const base = `${p ? p.name : cb.playerId}[${cb.might}${cb.attackPower > cb.might ? `(+${cb.attackPower - cb.might})` : ''}${gun}${effTxt}]`;
                        return dmg > 0 ? `${base} 受到 ${dmg} 點傷害` : `${base}(無傷)`;
                    }).join('、');
                    out.push(`<span class="line">${isBrawl ? '💥' : '⚔'} ${esc(E.roomLabel(roomId))} ${isBrawl ? '亂鬥' : '戰鬥'}：${line}</span>`);
                }
                for (const roomId of (c.shadowEncounterRooms || [])) {
                    out.push(`<span class="line">👻 ${esc(E.roomLabel(roomId))} 暗影相遇</span>`);
                }
                const dr = Object.entries(c.drained || {});
                if (dr.length) out.push(`<span class="line">暗影吸血：${dr.map(([k, v]) => `${name(k)} −${v}`).join('、')}</span>`);
                const gn = Object.entries(c.gained || {});
                if (gn.length) out.push(`<span class="line">暗影回血：${gn.map(([k, v]) => `${name(k)} +${v}`).join('、')}</span>`);
                break;
            }
            case 'gas': {
                const n = c.newGasFloors;
                out.push(`<span class="line">本回合新增毒氣樓層：${n.length ? n.join('、') : '無'}</span>`);
                const t = Object.entries(c.tally || {});
                if (t.length) out.push(`<span class="line">各樓層得票：${t.map(([k, v]) => `${k} ${v}`).join('、')}</span>`);
                if (c.detoxedRooms && c.detoxedRooms.length) {
                    out.push(`<span class="line">已解毒（永久免疫）：${c.detoxedRooms.map((r) => E.roomLabel(r)).join('、')}</span>`);
                }
                const d = Object.entries(c.damaged || {});
                if (d.length) out.push(`<span class="line">受毒氣傷害：${d.map(([k, v]) => `${name(k)} −${v}`).join('、')}</span>`);
                else out.push('<span class="line">無人受毒氣傷害</span>');
                break;
            }
            case 'supplies': {
                if (c.skipped) { out.push('<span class="line">第 1 回合不需上繳水糧</span>'); break; }
                const pp = c.perPlayer || {};
                for (const [pid, v] of Object.entries(pp)) {
                    if (v.kit) out.push(`<span class="line">${name(pid)}：生存補給（水✓ 糧✓）</span>`);
                    else out.push(`<span class="line">${name(pid)}：水${v.water ? '✓' : '✗'} 糧${v.food ? '✓' : '✗'}</span>`);
                    if (v.exempt) out.push(`<span class="line">${name(pid)}：免上繳，不扣血</span>`);
                    else if (v.damage) out.push(`<span class="line">${name(pid)}：−${v.damage}</span>`);
                }
                break;
            }
            case 'rocket': {
                if (c.bombedRooms && c.bombedRooms.length) {
                    out.push(`<span class="line">火箭筒轟炸：${c.bombedRooms.map((r) => E.roomLabel(r)).join('、')}</span>`);
                    const d = Object.entries(c.damaged || {});
                    if (d.length) out.push(`<span class="line">${d.map(([k, v]) => `${name(k)} −${v}`).join('、')}</span>`);
                } else out.push('<span class="line">本回合無火箭筒襲擊</span>');
                break;
            }
            case 'items': {
                if (!c.used || !c.used.length) { out.push('<span class="line">本回合無道具卡使用</span>'); break; }
                for (const u of c.used) {
                    out.push(`<span class="line">${name(u.playerId)}：${esc(u.result)}</span>`);
                    if (u.detail) out.push(`<span class="line">　${esc(u.detail)}</span>`);
                }
                break;
            }
            case 'revival': {
                if (c.revived && c.revived.length) out.push(`<span class="line">暗影復活：${c.revived.map(name).join('、')}</span>`);
                else out.push('<span class="line">無暗影復活</span>');
                break;
            }
            case 'hp_announce': {
                const hp = c.hp || {};
                const sh = c.shadows || [];
                const txt = Object.entries(hp).map(([k, v]) => `${name(k)}:${sh.includes(k) ? `暗影(${v})` : v + ' HP'}`).join('　');
                out.push(`<span class="line">${txt}</span>`);
                break;
            }
        }
        return out;
    }

    function addLine(html) {
        const b = $('broadcast');
        const d = el('div', 'line', html);
        b.appendChild(d);
        b.scrollTop = b.scrollHeight;
    }

    /* ═══════════════════════════════════════════════════════════
     *  結果
     * ═══════════════════════════════════════════════════════════ */
    function showResult() {
        const st = G.state;
        const r = st.result;
        $('result-title').textContent = r.reasonText;
        const me = r.ranking.find((x) => x.id === 'p1');
        $('result-desc').textContent = me
            ? `你排第 ${me.rank} 名，${me.isShadow ? '最後是暗影' : `剩下 ${me.hp} HP`}，得分 ${me.score}。`
            : '';

        const list = $('rank-list');
        list.innerHTML = '';
        for (const p of r.ranking) {
            const row = el('div', 'rk-row' + (p.id === 'p1' ? ' me' : '') + (p.rank === 1 ? ' gold' : ''));
            row.innerHTML = `<span class="no">${p.rank}</span>
                <span class="nm">${esc(p.name)}${p.isShadow ? ' <span class="ls-cost">暗影</span>' : ''}</span>
                <span class="sc">${p.isShadow ? '暗影' : p.hp + ' HP'}・${p.score} 分</span>`;
            list.appendChild(row);
        }

        /* 成就 */
        const mine = me ? me.achievements : [];
        const achBox = $('ach-list');
        const all = D.ACHIEVEMENTS;
        const got = new Set(mine);
        let grid = '';
        for (const a of all) {
            const on = got.has(a.id);
            grid += `<div class="ach ${a.tier}" style="${on ? '' : 'opacity:.35'}">
                <div class="an">${on ? esc(a.name) : '???'}</div>
                <div class="at">${esc(D.TIER_LABEL[a.tier])}${on ? '' : '・未解鎖'}</div></div>`;
        }
        achBox.innerHTML = `<h3 style="margin:0 0 10px;font-size:15px">成就（${mine.length} / ${all.length}）</h3>
            <div class="ach-grid">${grid}</div>`;

        showScreen('screen-result');
        /* 上傳成績（失敗靜默降級） */
        if (LS.cloud && LS.cloud.submit) LS.cloud.submit(st, r);
    }

    /* ═══════════════════════════════════════════════════════════
     *  排行榜
     * ═══════════════════════════════════════════════════════════ */
    async function showBoard() {
        showScreen('screen-board');
        const list = $('board-list');
        list.innerHTML = '<div class="ls-hint">載入中…</div>';
        const rows = await LS.cloud.fetchBoard();
        if (!rows || !rows.length) {
            list.innerHTML = '<div class="ls-hint">還沒有成績，或伺服器暫時無法連線。</div>';
            return;
        }
        list.innerHTML = '';
        rows.forEach((r, i) => {
            const row = el('div', 'bd-row');
            row.innerHTML = `<span class="no">${i + 1}</span>
                <span class="nm">${esc(r.name)}</span>
                <span class="dt">${esc(r.difficulty || '')}・${esc(r.reason || '')}</span>
                <span class="sc">${r.score}</span>`;
            list.appendChild(row);
        });
    }

    /* ═══════════════════════════════════════════════════════════
     *  規則
     * ═══════════════════════════════════════════════════════════ */
    function showRules() {
        const roomRows = D.ROOMS.filter((r) => D.ROOM_HELP[r.id]).map((r) =>
            `<tr><td><b>${esc(r.id)} ${esc(r.name)}</b></td><td>${esc(D.ROOM_HELP[r.id])}</td></tr>`).join('');
        const itemRows = Object.keys(D.ITEMS).map((k) =>
            `<tr><td><b>${esc(D.ITEMS[k].name)}</b></td><td>${esc(D.ITEM_HELP[k] || '')}</td></tr>`).join('');
        $('modal-title').textContent = '規則說明';
        $('modal-body').innerHTML = `
            <h4>回合流程</h4>
            <ul>
              <li>一共 <b>6 回合</b>，每回合兩段：<b>行動階段</b>（你私下決定）→ <b>結算</b>（系統公開 8 個步驟）。</li>
              <li>結算順序：手術室 → 戰鬥／亂鬥／暗影 → 毒氣 → 水糧上繳 → 火箭筒 → 道具使用 → 暗影復活 → 生命值公告。</li>
              <li>第 2 回合起，每天要上繳 1 份水 + 1 份糧，少一項扣 1 點生命；停在<b>餐廳</b>當天免繳也不扣。</li>
              <li>存活到最後直接獲勝；全員化為暗影則按生前的生命值排名；六回合結束也按生命值排名。</li>
            </ul>
            <h4>基因</h4>
            <ul>
              <li><b>武力</b>：戰鬥比大小，輸的人扣相差的點數。</li>
              <li><b>負重</b>：能帶幾件物品（每件佔 1 點）。</li>
              <li><b>速度</b>：每回合最多走幾步。總點數固定 10。</li>
              <li>槍械規則：在場有人持槍時，沒持槍的人攻擊力視為 <b>0</b>。</li>
            </ul>
            <h4>毒氣</h4>
            <ul>
              <li>每回合結束後所有人投票毒一層樓層，得票最高者中毒（平票則一起毒）。</li>
              <li>毒氣傷害依回合遞增：第 1～6 回合分別是 1 / 2 / 2 / 3 / 3 / 4 點。</li>
              <li>房間橫跨兩層時（如大倉庫 B4+B5）兩層都中毒才有毒氣。</li>
              <li>控制室可以讓一票變 <b>10 票</b>，或替一個房間永久解毒。</li>
            </ul>
            <h4>特殊房間</h4>
            <table><tbody>${roomRows}</tbody></table>
            <h4>道具</h4>
            <table><tbody>${itemRows}</tbody></table>
            <h4>暗影</h4>
            <ul>
              <li>生命值歸 0 → 化為暗影，身上的道具留在當時房間的資源池。</li>
              <li>暗影不再受傷，可自由移動、跨樓層不需繩索；和活人停同一間就能吸血。</li>
              <li>暗影生命累積到 <b>2</b> 以上會復活。</li>
            </ul>`;
        $('modal').classList.remove('hidden');
    }
    function closeModal() { $('modal').classList.add('hidden'); }

    /* ── 整體重繪 ──────────────────────────────────────────────── */
    function renderAll() {
        if (!G.state) return;
        const st = G.state;
        $('round-badge').textContent = `第 ${st.round} / ${D.TOTAL_ROUNDS} 回合`;
        $('phase-badge').textContent = st.phase === 'ended' ? '遊戲結束' : (G.resolving ? '結算中' : '行動階段');
        const h = st.human;
        const hpPct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));
        $('hp-fill').style.width = hpPct + '%';
        $('hp-fill').classList.toggle('low', h.hp <= 3);
        $('hp-num').textContent = h.isShadow ? '暗' : h.hp;
        renderPlayers();
        renderMap();
        renderAction();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    global.LSUI = { G, renderAll, showRules, toast };
})(window);
