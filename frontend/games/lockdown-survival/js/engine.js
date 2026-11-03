/* =====================================================================
 * 禁閉逃殺 Lockdown Survival — 遊戲引擎
 * 純邏輯，無 DOM、無網路。可在 Node 直接 require 做 headless 測試。
 * ===================================================================== */
(function (global) {
    'use strict';

    const LS = (global.LS = global.LS || {});
    const D = LS;
    const ITEMS = D.ITEMS;
    const ROOM_MAP = D.ROOM_MAP;

    /* ── 小工具 ──────────────────────────────────────────────────── */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

    function itemCount(player, itemId) {
        let n = 0;
        for (const it of player.items) if (it.itemId === itemId) n += it.quantity;
        return n;
    }
    function totalItems(player) {
        let n = 0;
        for (const it of player.items) n += it.quantity;
        return n;
    }
    function hasItem(player, itemId) { return itemCount(player, itemId) > 0; }
    function addItem(player, itemId, qty = 1) {
        if (qty <= 0) return;
        const found = player.items.find((i) => i.itemId === itemId);
        if (found) found.quantity += qty;
        else player.items.push({ itemId, quantity: qty });
    }
    function removeItem(player, itemId, qty = 1) {
        let left = qty;
        for (let i = player.items.length - 1; i >= 0 && left > 0; i--) {
            const it = player.items[i];
            if (it.itemId !== itemId) continue;
            const take = Math.min(it.quantity, left);
            it.quantity -= take; left -= take;
            if (it.quantity <= 0) player.items.splice(i, 1);
        }
        return qty - left;
    }
    function capacityOf(player) {
        if (hasItem(player, 'dimension_pocket')) return Infinity;
        return Math.max(0, player.genes.weight);
    }
    function itemName(id) { return (ITEMS[id] && ITEMS[id].name) || id; }
    function fmtItems(list) {
        if (!list || !list.length) return '無';
        const map = new Map();
        for (const it of list) map.set(it.itemId, (map.get(it.itemId) || 0) + it.quantity);
        return [...map].map(([id, q]) => (q > 1 ? `${itemName(id)}×${q}` : itemName(id))).join('、');
    }
    function isEmptyRoom(room) {
        return !room.special && !room.resourcePool && !room.laser;
    }
    function roomLabel(id) {
        const r = ROOM_MAP.get(id);
        return r && r.name !== '(空房)' ? `${id} ${r.name}` : id;
    }

    /* ── 建立遊戲 ────────────────────────────────────────────────── */
    function createGame(opts) {
        const o = opts || {};
        const seed = o.seed != null ? o.seed : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        const rng = mulberry32(seed);
        const difficulty = o.difficulty || 'normal';
        const botCount = clamp(o.botCount == null ? 5 : o.botCount, 0, 7);

        const state = {
            seed, rng, difficulty,
            round: 0,
            phase: 'setup',
            players: [],
            rooms: {},
            airdrop: [],
            usedPile: [],
            discardPile: [],
            gassedFloors: [],
            detoxedRooms: [],
            order: [],
            log: [],
            steps: [],
            result: null,
            pending: null,
        };

        for (const r of D.ROOMS) {
            state.rooms[r.id] = {
                id: r.id,
                pool: (r.resourcePool || []).map((p) => ({ itemId: p.itemId, quantity: p.quantity })),
            };
        }

        /* 玩家 */
        const human = makePlayer({
            id: 'p1', name: (o.playerName || '不說').slice(0, 10),
            isBot: false, policy: null,
            genes: Object.assign({}, D.DEFAULT_GENES),
        });
        state.players.push(human);

        const pool = D.BOT_POLICIES.slice();
        const policyOrder = pickBotPolicies(pool, botCount, difficulty, state.rng);
        for (let i = 0; i < botCount; i++) {
            const pol = policyOrder[i];
            const p = makePlayer({
                id: 'b' + (i + 1),
                name: pol.label + '·' + String.fromCharCode(65 + i),
                isBot: true,
                policy: pol.id,
                genes: startingGenes(pol.id),
            });
            state.players.push(p);
        }

        state.human = human;
        return state;
    }

    function makePlayer(o) {
        return {
            id: o.id, name: o.name, isBot: !!o.isBot, policy: o.policy || null,
            genes: o.genes,
            hp: D.MAX_HP, maxHp: D.MAX_HP,
            isShadow: false, shadowHp: 0,
            items: [],
            roomId: null, path: [],
            orderCard: 0,
            adrenaline: { active: false },
            helicopter: false,
            alive: true,
            action: null,
            pendingDraw: null,
            pendingSpecial: null,
            controlChoice: null,
            geneRealloc: null,
            stats: newStats(),
        };
    }

    function newStats() {
        return {
            damageTotal: 0, damageCombat: 0, damageGas: 0, damageSupply: 0, damageOther: 0,
            damageFromHunger: 0, damageFromThirst: 0,
            fights: 0, wins: 0, losses: 0, maxSingleHit: 0, timesHit: 0,
            deaths: 0, revives: 0,
            pillsUsed: 0, adrenalsUsed: 0, saves: 0, healedTotal: 0,
            wineCount: 0, wineRolls: [], wineWins: 0, shadowDrain: 0,
            goldGot: 0, goldHeld: 0, goldSpent: 0,
            itemsGiven: 0, freeGot: 0,
            junkTaken: 0, junkMax: 0, treasureFromDump: 0,
            detoxed: 0, gasVoteHits: 0,
            rocketShots: 0, rocketHitPlayers: 0, rocketHitCount: 0, rocketHitRounds: 0,
            steps: 0, maxSteps: 0, teleports: 0, climbs: 0, flights: 0,
            metCount: {}, opponents: {}, metSameRound: 0, sameRoomRounds: 0,
            supplyGave: 0, lowHp: false, lowHpThenHigh: 0, aliveRounds: 0, moneySpent: 0,
            lastSupplyDamage: 0, lastSupplyExempt: false, resupplyRuns: 0, exemptRuns: 0,
        };
    }

    /* 難度 → 機器人政策配對 */
    function pickBotPolicies(pool, n, difficulty, rng) {
        const out = [];
        if (difficulty === 'easy') {
            for (let i = 0; i < n; i++) out.push({ id: 'rookie', label: '初心者', hint: '' });
            return out;
        }
        /* normal：各自拿手開局，兩兩組隊
           boss：各自拿手開局，而且全體聯手對付真人玩家（行為更兇，見 bots.js） */
        const ids = pool.map((p) => p.id);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        for (let i = 0; i < n; i++) out.push(pool.find((p) => p.id === ids[i % ids.length]));
        return out;
    }
    /* 產生機器人基因 */
    function startingGenes(policy) {
        const base = { might: 4, weight: 3, speed: 3 };
        switch (policy) {
            case 'gunner': return { might: 5, weight: 3, speed: 3 };
            case 'brute': case 'brute_b': case 'marshal': return { might: 6, weight: 2, speed: 3 };
            case 'hoarder': case 'gambler': return { might: 3, weight: 5, speed: 3 };
            case 'medic': case 'warden': return { might: 3, weight: 4, speed: 4 };
            case 'ranger': case 'drunkard': return { might: 4, weight: 3, speed: 4 };
            case 'hydro': case 'grain': case 'mule': return { might: 3, weight: 5, speed: 3 };
            default: return base;
        }
    }

    /* ── 回合流程 ────────────────────────────────────────────────── */
    function startRound(state) {
        state.round += 1;
        state.phase = 'action';
        state.steps = [];
        state.pending = null;

        /* 空投：每回合一張道具卡累積到停機坪 */
        const poolIds = Object.keys(ITEMS).filter((id) => id !== 'junk' && id !== 'gold_bar');
        const drop = poolIds[Math.floor(state.rng() * poolIds.length)];
        state.airdrop.push({ itemId: drop, quantity: 1 });

        /* 行動順序卡 */
        const ids = state.players.map((p) => p.id);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(state.rng() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        state.order = ids.slice();
        state.players.forEach((p) => { p.orderCard = state.order.indexOf(p.id) + 1; });

        state.players.forEach((p) => {
            p.action = null;
            p.pendingDraw = null;
            p.pendingSpecial = null;
            p.controlChoice = null;
            p.geneRealloc = null;
            p.path = [];
            p.adrenaline.active = false;
            p.stats.aliveRounds += 1;
        });

        logRound(state, `第 ${state.round} 回合開始`);
    }

    function logRound(state, text) {
        state.log.push({ round: state.round, text, gm: true, kind: 'round' });
    }
    function log(state, text, gm, step) {
        state.log.push({ round: state.round, text, gm: !!gm, step: step || null });
    }

    /* ── 移動 ────────────────────────────────────────────────────── */
    function neighbors(state, player, fromRoomId, opts) {
        const out = new Set();
        const canClimb = player.isShadow || hasItem(player, 'rope');
        for (const e of D.EDGES) {
            if (e.from !== fromRoomId) continue;
            if (e.type === 'climb' && !canClimb) continue;
            out.add(e.to);
        }
        if (!player.isShadow) {
            if (fromRoomId === 'B403') {
                for (const r of D.ROOMS) if (isEmptyRoom(r)) out.add(r.id);
            }
            if (opts && opts.helipad && fromRoomId === '202') {
                for (const r of D.ROOMS) if (r.helipad) out.add(r.id);
            }
        }
        out.delete(fromRoomId);
        return [...out];
    }

    function speedOf(player) {
        return player.adrenaline.active ? 10 : player.genes.speed;
    }

    function validatePath(state, player, path) {
        if (!Array.isArray(path) || path.length === 0) return { ok: false, error: '路徑是空的' };
        if (path[0] !== player.roomId) return { ok: false, error: '路徑起點必須是目前所在房間' };
        if (path.length - 1 > speedOf(player)) return { ok: false, error: `超過移動力 ${speedOf(player)}` };
        for (let n = 1; n < path.length; n++) {
            const from = path[n - 1], to = path[n];
            if (!ROOM_MAP.has(to)) return { ok: false, error: `不存在的房間 ${to}` };
            const opts = { helipad: n === 1 && player.helicopter && !player.isShadow };
            if (!neighbors(state, player, from, opts).includes(to)) {
                return { ok: false, error: `${from} 無法前往 ${to}` };
            }
            if (path.slice(0, n).includes(to)) return { ok: false, error: `不可往回走（${to} 已在路徑中）` };
        }
        return { ok: true };
    }

    /* BFS：可達房間（含距離） */
    function reachable(state, player, fromRoomId) {
        const max = speedOf(player);
        const seen = new Map([[fromRoomId, 0]]);
        let frontier = [fromRoomId];
        for (let d = 1; d <= max && frontier.length; d++) {
            const next = [];
            for (const cur of frontier) {
                const opts = { helipad: d === 1 && player.helicopter && !player.isShadow };
                for (const nb of neighbors(state, player, cur, opts)) {
                    if (seen.has(nb)) continue;
                    seen.set(nb, d);
                    next.push(nb);
                }
            }
            frontier = next;
        }
        seen.delete(fromRoomId);
        return seen;
    }

    /* 執行移動 */
    function applyMove(state, player, path) {
        const v = validatePath(state, player, path);
        if (!v.ok) return v;
        const from = player.roomId;
        player.path = path.slice();
        player.roomId = path[path.length - 1];
        player.stats.steps += path.length - 1;
        player.stats.maxSteps = Math.max(player.stats.maxSteps, path.length - 1);

        /* 經過的樓層通道（繩索） */
        for (let i = 1; i < path.length; i++) {
            const edge = D.EDGES.find((e) => e.from === path[i - 1] && e.to === path[i] && e.type === 'climb');
            if (edge) player.stats.climbs += 1;
            if (path[i] === 'B403') player.stats.teleports += 1;
        }
        if (path[1] === 'B403' || path.includes('B403')) { /* 傳送點過 */ }

        /* 激光室：經過或停留受 1 點傷害 */
        for (const roomId of path) {
            const room = ROOM_MAP.get(roomId);
            if (room && room.laser && !player.isShadow) {
                applyDamage(state, player, 1, 'laser', '經過激光室 −1');
                break;
            }
        }
        return { ok: true };
    }

    /* ── 抽取 ────────────────────────────────────────────────────── */
    function drawLimitOf(state, roomId) {
        const room = ROOM_MAP.get(roomId);
        if (!room) return 0;
        if (roomId === '202') return state.airdrop.length;
        if (!state.rooms[roomId].pool.length) return 0;
        if (room.drawLimit === 'all') return state.rooms[roomId].pool.length;
        return Math.min(room.drawLimit, state.rooms[roomId].pool.length);
    }

    /* 抽牌：回傳抽到的 [{itemId,quantity}] */
    function drawCards(state, player, roomId) {
        const room = ROOM_MAP.get(roomId);
        if (!room) return [];
        const drawn = [];

        if (roomId === '202') {
            const n = state.airdrop.length;
            for (let i = 0; i < n; i++) {
                const c = state.airdrop[i];
                drawn.push({ itemId: c.itemId, quantity: 1 });
            }
            return drawn;
        }

        const limit = Math.min(
            room.drawLimit === 'all' ? 999 : room.drawLimit,
            state.rooms[roomId].pool.reduce((s, i) => s + i.quantity, 0)
        );
        const pool = state.rooms[roomId].pool;
        for (let i = 0; i < limit; i++) {
            /* 依剩餘數量隨機挑一張 */
            const total = pool.reduce((s, x) => s + x.quantity, 0);
            if (total <= 0) break;
            let r = Math.floor(state.rng() * total);
            let chosen = null;
            for (const p of pool) {
                if (p.quantity <= 0) continue;
                if (r < p.quantity) { chosen = p; break; }
                r -= p.quantity;
            }
            if (!chosen) break;
            chosen.quantity -= 1;
            drawn.push({ itemId: chosen.itemId, quantity: 1 });
        }
        return drawn;
    }

    /* 保留規則：負重、垃圾場上限、金庫金條不可選、空投最多 1 張 */
    function keepRules(state, player, roomId) {
        const room = ROOM_MAP.get(roomId);
        const rules = { maxNonJunk: null, forceJunk: false, maxTotal: null, noGoldBar: false };
        if (roomId === 'B503') { rules.maxNonJunk = room.maxNonJunkPickup; rules.forceJunk = true; }
        if (roomId === '202') rules.maxTotal = 1;
        return rules;
    }

    /* 執行抽取並回傳可保留的清單 */
    function performDraw(state, player, roomId) {
        const room = ROOM_MAP.get(roomId);
        if (!room || !room.resourcePool) return null;
        const drawn = drawCards(state, player, roomId);
        if (!drawn.length) return null;

        /* 停機坪：攤開整疊空投卡，但被拿走的才從池子扣除
           （不整疊清空，否則同回合後到的人什麼都拿不到） */
        if (roomId === '202') {
            const rules = keepRules(state, player, roomId);
            const options = drawn.map((c, i) => ({
                index: i, itemId: c.itemId, quantity: c.quantity,
                junk: false, forced: false, gold: c.itemId === 'gold_bar',
            }));
            player.pendingDraw = { roomId, drawn, options, rules, airdrop: true };
            return player.pendingDraw;
        }

        const rules = keepRules(state, player, roomId);
        const options = drawn.map((c, i) => ({
            index: i,
            itemId: c.itemId, quantity: c.quantity,
            junk: c.itemId === 'junk',
            forced: rules.forceJunk && c.itemId === 'junk',
            gold: c.itemId === 'gold_bar',
        }));
        player.pendingDraw = { roomId, drawn, options, rules };
        return player.pendingDraw;
    }

    /* 依玩家選擇保留（垃圾強制帶走，其餘丟回）
       keepIndexes: options 陣列的索引清單 */
    function applyKeep(state, player, keepIndexes) {
        const pd = player.pendingDraw;
        if (!pd) return { kept: [], discarded: [] };
        const rules = pd.rules;
        const keepSet = new Set((keepIndexes || []).map(Number));
        const kept = [];
        const discarded = [];

        /* 垃圾強制帶走 */
        let forcedCount = 0;
        for (const o of pd.options) {
            if (o.forced) { forcedCount += o.quantity; kept.push({ itemId: o.itemId, quantity: o.quantity }); }
        }
        let keptCount = forcedCount;
        let nonJunkKept = 0;

        for (const o of pd.options) {
            if (o.forced) continue;
            if (!keepSet.has(o.index)) {
                discarded.push({ itemId: o.itemId, quantity: o.quantity });
                continue;
            }
            if (rules.maxNonJunk != null && nonJunkKept >= rules.maxNonJunk) {
                discarded.push({ itemId: o.itemId, quantity: o.quantity });
                continue;
            }
            if (rules.maxTotal != null && keptCount >= rules.maxTotal) {
                discarded.push({ itemId: o.itemId, quantity: o.quantity });
                continue;
            }
            const cap = capacityOf(player);
            if (keptCount >= cap) {
                discarded.push({ itemId: o.itemId, quantity: o.quantity });
                continue;
            }
            kept.push({ itemId: o.itemId, quantity: o.quantity });
            keptCount += o.quantity;
            if (!o.junk) nonJunkKept += o.quantity;
        }

        for (const k of kept) {
            addItem(player, k.itemId, k.quantity);
            if (k.itemId === 'gold_bar') player.stats.goldGot += k.quantity;
            if (k.itemId === 'junk') {
                player.stats.junkTaken += k.quantity;
                player.stats.junkMax = Math.max(player.stats.junkMax, totalItems(player, 'junk'));
            }
            if (pd.roomId === 'B503' && k.itemId !== 'junk') player.stats.treasureFromDump += 1;
        }
        for (const d of discarded) state.discardPile.push({ itemId: d.itemId, quantity: d.quantity });

        /* 停機坪：拿走的卡從空投池扣除 */
        if (pd.airdrop) {
            for (const k of kept) {
                for (let i = 0; i < state.airdrop.length; i++) {
                    if (state.airdrop[i].itemId === k.itemId && state.airdrop[i].quantity > 0) {
                        state.airdrop[i].quantity -= 1;
                        if (state.airdrop[i].quantity <= 0) state.airdrop.splice(i, 1);
                        break;
                    }
                }
            }
        }

        player.pendingDraw = null;
        return { kept, discarded };
    }
    function totalItems(player, itemId) { return itemCount(player, itemId); }

    /* ── 傷害 ────────────────────────────────────────────────────── */
    function applyDamage(state, player, amount, source, note) {
        if (player.isShadow || amount <= 0) return 0;
        let dmg = amount;
        if (player.adrenaline.active && dmg >= player.hp) {
            player.stats.saves += 1;
            dmg = player.hp - 1;
            if (dmg < 0) dmg = 0;
            if (state.currentSaves) state.currentSaves.push(player.id);
        }
        const before = player.hp;
        player.hp = Math.max(0, player.hp - dmg);
        const dealt = before - player.hp;
        player.stats.damageTotal += dealt;
        player.stats.maxSingleHit = Math.max(player.stats.maxSingleHit, dealt);
        if (source === 'combat') player.stats.damageCombat += dealt;
        else if (source === 'gas') player.stats.damageGas += dealt;
        else if (source === 'supply') player.stats.damageSupply += dealt;
        else player.stats.damageOther += dealt;
        if (player.hp <= 5) player.stats.lowHp = true;
        if (player.hp <= 0) becomeShadow(state, player, source);
        return dealt;
    }

    function becomeShadow(state, player, source) {
        if (player.isShadow) return;
        player.isShadow = true;
        player.shadowHp = 0;
        player.alive = true;          /* 暗影仍算在場上，但不再算「存活玩家」 */
        player.stats.deaths += 1;
        player.stats.deathCause = source || 'unknown';
        player.deathRound = state.round;
        player.lastAliveHp = player.hp;
        player.hp = 0;

        /* 身上的道具留在當時房間的資源池 */
        const room = state.rooms[player.roomId] || (player.roomId && state.rooms[player.roomId]);
        if (room && player.items.length) {
            for (const it of player.items) {
                const found = room.pool.find((p) => p.itemId === it.itemId);
                if (found) found.quantity += it.quantity;
                else room.pool.push({ itemId: it.itemId, quantity: it.quantity });
            }
            player.items = [];
        }
        log(state, `💀 ${player.name} 生命值歸 0，化為暗影`, true, 'shadow');
    }

    /* ── 戰鬥核心 ────────────────────────────────────────────────── */
    /* 同一房間 2 人＝戰鬥、3 人以上＝亂鬥。回傳戰鬥詳情並套用傷害。 */
    function combatInRoom(state, roomId, alive, skippedRooms) {
        if (alive.length < 2) return null;
        if (skippedRooms && skippedRooms.includes(roomId)) return null;

        const combatants = alive.map((p) => {
            const power = attackPower(p);
            return {
                playerId: p.id,
                might: p.genes.might,
                attackPower: power.total,
                hasFirearm: power.hasFirearm,
                effective: power.total,
            };
        });
        /* 在場有人持槍 → 沒持槍的人攻擊力視為 0 */
        if (combatants.some((c) => c.hasFirearm)) {
            for (const c of combatants) if (!c.hasFirearm) c.effective = 0;
        }
        const maxEff = Math.max(...combatants.map((c) => c.effective));
        const dm = {};
        for (const c of combatants) {
            const dmg = Math.max(0, maxEff - c.effective);
            dm[c.playerId] = dmg;
            const p = alive.find((x) => x.id === c.playerId);
            p.stats.fights += 1;
            if (dmg > 0) { p.stats.timesHit += 1; p.stats.losses += 1; }
            else p.stats.wins += 1;
            p.stats.opponents = p.stats.opponents || {};
            for (const o of combatants) {
                if (o.playerId === c.playerId) continue;
                p.stats.opponents[o.playerId] = (p.stats.opponents[o.playerId] || 0) + 1;
            }
        }
        for (const c of combatants) {
            const p = alive.find((x) => x.id === c.playerId);
            applyDamage(state, p, dm[c.playerId], 'combat', '戰鬥');
        }
        return { combatants, damage: dm };
    }

    /* ── 出生點 ──────────────────────────────────────────────────── */
    /* 選到同一個出生點的人，落地就會先打一場。 */
    function assignSpawns(state, humanSpawn) {
        const spawns = D.SPAWN_POINTS.map((s) => s.id);
        const others = state.players.filter((p) => p.id !== state.human.id);
        /* 機器人依 policy 分到適合的出生點；重複的用隨機補 */
        const bag = spawns.slice();
        for (const p of others) {
            const home = D.POLICY_HOME[p.policy];
            let idx = bag.indexOf(home);
            if (idx < 0) idx = Math.floor(state.rng() * bag.length);
            p.roomId = bag.splice(idx, 1)[0] || home;
            if (!bag.length) bag.push(...spawns);
        }
        const humanRoom = spawns.includes(humanSpawn) ? humanSpawn : spawns[0];
        state.human.roomId = humanRoom;
        state.spawnRoom = { [state.human.id]: humanRoom };
        for (const p of others) state.spawnRoom[p.id] = p.roomId;
        resolveSpawnFight(state);
        return state.players.map((p) => p.roomId);
    }

    function resolveSpawnFight(state) {
        const byRoom = new Map();
        for (const p of state.players) {
            if (p.isShadow || !p.roomId) continue;
            if (!byRoom.has(p.roomId)) byRoom.set(p.roomId, []);
            byRoom.get(p.roomId).push(p);
        }
        const fights = [];
        for (const [roomId, group] of byRoom) {
            if (group.length < 2) continue;
            state.currentSaves = [];
            const res = combatInRoom(state, roomId, group, null);
            if (res) {
                fights.push({ roomId, players: group.map((p) => p.id), damage: res.damage });
                log(state, `⚔ ${roomLabel(roomId)} 落地遭遇：${group.map((p) => p.name).join('、')}`, true, 'spawn');
            }
        }
        return fights;
    }

    /* ── 交易 ────────────────────────────────────────────────────── */
    /* 提議：{ targetId, give:[itemId], want:[itemId] }
       judge(target, from, trade) → true 接受 / false 拒絕 / null 交給玩家決定 */
    function resolveTrades(state, judge) {
        state.pendingTrades = [];
        const executed = [];
        for (const id of state.order) {
            const p = state.players.find((x) => x.id === id);
            if (!p || p.isShadow) continue;
            const t = p.action && p.action.trade;
            if (!t || !t.targetId || !t.give || !t.give.length) continue;
            const target = state.players.find((x) => x.id === t.targetId);
            if (!target || target.isShadow || target.id === p.id) continue;
            if (!t.give.every((it) => hasItem(p, it))) continue;
            const want = t.want || [];
            if (want.length && !want.every((it) => hasItem(target, it))) continue;

            const verdict = judge ? judge(target, p, t) : false;
            if (verdict === true) {
                for (const it of t.give) { removeItem(p, it, 1); addItem(target, it, 1); p.stats.itemsGiven += 1; }
                for (const it of want) { removeItem(target, it, 1); addItem(p, it, 1); }
                executed.push({ from: p.id, to: target.id, give: t.give.slice(), want: want.slice() });
                log(state, `${p.name} ⇄ ${target.name}：${p.name} 給 ${fmtItems(t.give.map((id) => ({ itemId: id, quantity: 1 })))}`, true, 'trade');
            } else if (verdict === null) {
                state.pendingTrades.push({ from: p.id, to: target.id, give: t.give.slice(), want: want.slice() });
            }
        }
        state.tradeResult = { executed, pending: state.pendingTrades };
        return state.tradeResult;
    }

    /* 玩家回應待決交易 */
    function answerTrade(state, index, accept) {
        const t = state.pendingTrades && state.pendingTrades[index];
        if (!t) return false;
        state.pendingTrades.splice(index, 1);
        if (!accept) return false;
        const from = state.players.find((x) => x.id === t.from);
        const to = state.players.find((x) => x.id === t.to);
        if (!from || !to) return false;
        if (!t.give.every((it) => hasItem(from, it))) return false;
        if (t.want.length && !t.want.every((it) => hasItem(to, it))) return false;
        for (const it of t.give) { removeItem(from, it, 1); addItem(to, it, 1); from.stats.itemsGiven += 1; }
        for (const it of t.want) { removeItem(to, it, 1); addItem(from, it, 1); }
        log(state, `${from.name} ⇄ ${to.name}：${from.name} 給 ${fmtItems(t.give.map((id) => ({ itemId: id, quantity: 1 })))}`, true, 'trade');
        return true;
    }

    /* ── 結算 ────────────────────────────────────────────────────── */
    function resolveRound(state) {
        state.phase = 'resolution';
        state.surgeryRoom = null;
        const steps = [];
        const R = state.round;

        /* 交易先結算，物品轉移要趕在水糧上繳之前 */
        resolveTrades(state, state.tradeJudge);

        /* ── 步驟 1：手術室 ─────────────────────────────────────── */
        {
            const occupants = state.players.filter((p) => !p.isShadow && p.roomId === 'B202');
            const content = { effect: 'none', occupants: occupants.map((p) => p.id) };
            if (occupants.length === 2) {
                content.effect = 'heal';
                for (const p of occupants) {
                    const before = p.hp;
                    p.hp = Math.min(p.maxHp, p.hp + 4);
                    p.stats.healedTotal += p.hp - before;
                }
                state.surgeryRoom = 'B202';
            } else if (occupants.length >= 3) {
                content.effect = 'brawl';
            }
            steps.push({ step: 'operating_room', content, round: R });
        }

        /* ── 步驟 2：戰鬥 / 亂鬥 / 暗影相遇 ──────────────────────── */
        {
            const byRoom = new Map();
            for (const p of state.players) {
                if (!p.roomId) continue;
                if (!byRoom.has(p.roomId)) byRoom.set(p.roomId, []);
                byRoom.get(p.roomId).push(p);
            }
            const fightRooms = [], brawlRooms = [], shadowRooms = [];
            const details = {};
            const damage = {};
            const drained = {}, gained = {};
            state.currentSaves = [];
            const adrenalineSaved = state.currentSaves;

            const ordered = state.order.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);

            for (const [roomId, group] of byRoom) {
                const alive = group.filter((p) => !p.isShadow);
                const shadows = group.filter((p) => p.isShadow);
                if (alive.length === 0 && shadows.length === 0) continue;

                /* 戰鬥 / 亂鬥 */
                if (alive.length >= 2) {
                    const res = combatInRoom(state, roomId, alive, state.surgeryRoom === 'B202' ? ['B202'] : []);
                    if (res) {
                        details[roomId] = res;
                        for (const [pid, dmg] of Object.entries(res.damage)) {
                            damage[pid] = (damage[pid] || 0) + dmg;
                        }
                        if (alive.length === 2) fightRooms.push(roomId); else brawlRooms.push(roomId);
                    }
                }

                /* 暗影吸血 */
                if (shadows.length && alive.length) {
                    shadowRooms.push(roomId);
                    for (const s of shadows) {
                        const drain = Math.max(1, attackPower(s).total);
                        for (const a of alive) {
                            if (a.isShadow) continue;
                            const dealt = applyDamage(state, a, drain, 'shadow', '暗影吸血');
                            drained[a.id] = (drained[a.id] || 0) + dealt;
                            s.shadowHp = Math.min(D.MAX_HP, s.shadowHp + dealt);
                            s.stats.shadowDrain += dealt;
                            gained[s.id] = (gained[s.id] || 0) + dealt;
                        }
                    }
                }
            }

            steps.push({
                step: 'encounter', round: R,
                content: { fightRooms, brawlRooms, shadowEncounterRooms: shadowRooms, details, damage, drained, gained, adrenalineSaved },
            });
        }

        /* ── 步驟 3：毒氣 ───────────────────────────────────────── */
        {
            const tally = new Map();
            for (const p of state.players) {
                const a = p.action;
                if (!a || !a.gasVote) continue;
                const w = a.gasVoteWeight || 1;
                if (!tally.has(a.gasVote)) tally.set(a.gasVote, { floorId: a.gasVote, votes: 0, voters: [] });
                const t = tally.get(a.gasVote);
                t.votes += w; t.voters.push({ playerId: p.id, weight: w });
            }
            const ranked = [...tally.values()].sort((a, b) => b.votes - a.votes || D.FLOOR_ORDER.indexOf(a.floorId) - D.FLOOR_ORDER.indexOf(b.floorId));
            const newGasFloors = [];
            if (ranked.length) {
                const top = ranked[0].votes;
                for (const t of ranked) {
                    if (t.votes === top && !state.gassedFloors.includes(t.floorId)) {
                        newGasFloors.push(t.floorId);
                        state.gassedFloors.push(t.floorId);
                    }
                }
            }
            state.gassedFloors.sort((a, b) => D.FLOOR_ORDER.indexOf(a) - D.FLOOR_ORDER.indexOf(b));

            /* 命中率統計 */
            for (const p of state.players) {
                if (p.action && p.action.gasVote && newGasFloors.includes(p.action.gasVote)) p.stats.gasVoteHits += 1;
            }

            /* 公開記錄上一回合各樓層得票（玩家可據此避開熱門毒層） */
            const tallyObj = Object.fromEntries([...tally.values()].map((t) => [t.floorId, t.votes]));
            state.lastGasTally = ranked.length
                ? { floorId: ranked[0].floorId, votes: ranked[0].votes, all: tallyObj }
                : null;

            /* 解毒 */
            const detoxedRooms = [];
            for (const p of state.players) {
                const a = p.action;
                if (a && a.controlChoice && a.controlChoice.mode === 'detox' && a.controlChoice.target) {
                    const room = ROOM_MAP.get(a.controlChoice.target);
                    if (room && !state.detoxedRooms.includes(a.controlChoice.target)) {
                        state.detoxedRooms.push(a.controlChoice.target);
                        detoxedRooms.push(a.controlChoice.target);
                        p.stats.detoxed += 1;
                    }
                }
            }

            /* 毒氣傷害 */
            const gasDamage = D.GAS_DAMAGE_BY_ROUND[R - 1] != null ? D.GAS_DAMAGE_BY_ROUND[R - 1] : 4;
            const damaged = {};
            state.currentSaves = [];
            const gasSaved = state.currentSaves;
            for (const p of state.players) {
                if (p.isShadow || !p.roomId) continue;
                const room = ROOM_MAP.get(p.roomId);
                if (!room) continue;
                if (state.detoxedRooms.includes(p.roomId)) continue;
                if (room.gasImmune) continue;
                if (hasItem(p, 'gas_mask')) continue;
                const allGassed = room.floors.every((f) => state.gassedFloors.includes(f));
                if (!allGassed) continue;
                const dealt = applyDamage(state, p, gasDamage, 'gas', '毒氣');
                damaged[p.id] = dealt;
            }

            steps.push({
                step: 'gas', round: R,
                content: {
                    newGasFloors, tally: tallyObj,
                    detoxedRooms, damaged, adrenalineSaved: gasSaved,
                },
            });
        }

        /* ── 步驟 4：水糧上繳 ───────────────────────────────────── */
        {
            const perPlayer = {};
            if (R === 1) {
                steps.push({ step: 'supplies', round: R, content: { skipped: true } });
            } else {
                const survivors = state.players.filter((p) => !p.isShadow);
                const orderIds = state.order;
                for (const id of orderIds) {
                    const p = state.players.find((x) => x.id === id);
                    if (!p || p.isShadow) continue;
                    const exempt = p.roomId === 'B204';
                    let kit = false, usedWater = false, usedFood = false;
                    let water = false, food = false;

                    if (!exempt) {
                        if (hasItem(p, 'water')) { water = true; usedWater = true; }
                        if (hasItem(p, 'food')) { food = true; usedFood = true; }
                        /* 生存補給 = 水 + 糧，同時缺兩樣才用（只用一半是浪費） */
                        if (!water && !food && hasItem(p, 'survival_kit')) {
                            kit = true; water = true; food = true;
                            removeItem(p, 'survival_kit', 1);
                        }
                        if (usedWater) removeItem(p, 'water', 1);
                        if (usedFood) removeItem(p, 'food', 1);
                        if (usedWater || usedFood) p.stats.supplyGave += (usedWater ? 1 : 0) + (usedFood ? 1 : 0);
                    }

                    let dmg = 0;
                    if (!exempt) {
                        if (!water) { dmg += 1; p.stats.damageFromThirst += 1; }
                        if (!food) { dmg += 1; p.stats.damageFromHunger += 1; }
                    }
                    p.stats.lastSupplyDamage = dmg;
                    p.stats.lastSupplyExempt = exempt;
                    const before = p.hp;
                    if (dmg > 0) applyDamage(state, p, dmg, 'supply', '脫水／飢餓');
                    const saved = before > 0 && p.hp > 0 && p.adrenaline.active;

                    perPlayer[p.id] = {
                        water, food, kit, exempt,
                        damage: dmg,
                        adrenalineSaved: saved,
                    };
                }
                steps.push({ step: 'supplies', round: R, content: { perPlayer, inProgress: false } });
            }
        }

        /* ── 步驟 5：火箭筒 ─────────────────────────────────────── */
        {
            const bombedRooms = [];
            const damaged = {};
            state.currentSaves = [];
            const saved = state.currentSaves;
            for (const p of state.players) {
                const a = p.action;
                if (!a || !a.rocketTarget) continue;
                if (!hasItem(p, 'rocket_launcher')) continue;
                if (!bombedRooms.includes(a.rocketTarget)) bombedRooms.push(a.rocketTarget);
                p.stats.rocketShots += 1;
            }
            for (const roomId of bombedRooms) {
                const victims = state.players.filter((p) => !p.isShadow && p.roomId === roomId);
                for (const v of victims) {
                    const dealt = applyDamage(state, v, 4, 'rocket', '火箭筒');
                    damaged[v.id] = (damaged[v.id] || 0) + dealt;
                }
            }
            /* 反向統計：誰被炸到 */
            for (const p of state.players) {
                const a = p.action;
                if (!a || !a.rocketTarget || !hasItem(p, 'rocket_launcher')) continue;
                const victims = state.players.filter((v) => !v.isShadow && v.roomId === a.rocketTarget);
                p.stats.rocketHitPlayers += victims.length;
                p.stats.rocketHitCount += victims.length;
            }
            for (const v of state.players) {
                if (damaged[v.id]) v.stats.rocketHitRounds += 1;
            }
            steps.push({ step: 'rocket', round: R, content: { bombedRooms, damaged, adrenalineSaved: saved } });
        }

        /* ── 步驟 6：道具卡使用 ─────────────────────────────────── */
        {
            const used = [];
            for (const id of state.order) {
                const p = state.players.find((x) => x.id === id);
                if (!p || p.isShadow) continue;
                const a = p.action;
                if (!a || !a.itemUses || !a.itemUses.length) continue;
                for (const use of a.itemUses) {
                    const itemId = use.itemId;
                    if (!ITEMS[itemId] || !ITEMS[itemId].usableInResolution) continue;
                    if (!hasItem(p, itemId)) continue;
                    removeItem(p, itemId, 1);
                    state.usedPile.push({ itemId, quantity: 1 });

                    if (itemId === 'pill') {
                        const before = p.hp;
                        p.hp = Math.min(p.maxHp, p.hp + 2);
                        const gained = p.hp - before;
                        p.stats.pillsUsed += 1;
                        p.stats.healedTotal += gained;
                        used.push({ playerId: p.id, result: `藥片 +${gained} HP`, detail: `目前 ${p.hp} HP` });
                    } else if (itemId === 'adrenaline') {
                        p.adrenaline.active = true;
                        p.stats.adrenalsUsed += 1;
                        used.push({ playerId: p.id, result: '使用腎上腺素', detail: '速度 10，傷害保底 1 HP' });
                    } else if (itemId === 'wine' || itemId === 'fine_wine') {
                        const roll = 1 + Math.floor(state.rng() * 6);
                        const mul = itemId === 'fine_wine' ? 2 : 1;
                        p.stats.wineCount += 1;
                        p.stats.wineRolls.push(roll);
                        let detail;
                        if (roll === 1) {
                            const lost = p.items.slice();
                            p.items = [];
                            for (const it of lost) state.discardPile.push({ itemId: it.itemId, quantity: it.quantity });
                            detail = `擲出 1：所有道具丟失（${fmtItems(lost)}）`;
                        } else if (roll === 2) {
                            detail = '擲出 2：無事發生';
                        } else if (roll === 3) {
                            p.genes.might += mul;
                            detail = `擲出 ${roll}：武力 +${mul}`;
                            p.stats.wineWins += 1;
                        } else if (roll === 4) {
                            p.genes.speed += mul;
                            detail = `擲出 ${roll}：速度 +${mul}`;
                            p.stats.wineWins += 1;
                        } else if (roll === 5) {
                            p.genes.weight += mul;
                            detail = `擲出 ${roll}：負重 +${mul}`;
                            p.stats.wineWins += 1;
                        } else {
                            const before = p.hp;
                            p.hp = Math.min(p.maxHp, p.hp + 2 * mul);
                            detail = `擲出 ${roll}：生命 +${2 * mul}`;
                            p.stats.healedTotal += p.hp - before;
                            p.stats.wineWins += 1;
                        }
                        used.push({ playerId: p.id, result: `${itemName(itemId)}（擲骰 ${roll}）`, detail });
                    } else if (itemId === 'gold_bar') {
                        used.push({ playerId: p.id, result: '金條', detail: use.detail || '' });
                    }
                }
            }
            steps.push({ step: 'items', round: R, content: { used, inProgress: false } });
        }

        /* ── 步驟 7：暗影復活 ───────────────────────────────────── */
        {
            const revived = [];
            for (const p of state.players) {
                if (!p.isShadow) continue;
                if (p.shadowHp >= 2) {
                    p.isShadow = false;
                    p.hp = Math.min(p.maxHp, p.shadowHp);
                    p.shadowHp = 0;
                    p.stats.revives += 1;
                    revived.push(p.id);
                    log(state, `✨ ${p.name} 暗影回血 ${p.hp} HP，復活`, true, 'revival');
                }
            }
            steps.push({ step: 'revival', round: R, content: { revived } });
        }

        /* ── 步驟 8：生命值公告 ─────────────────────────────────── */
        {
            const hp = {};
            const shadows = [];
            for (const p of state.players) {
                hp[p.id] = p.isShadow ? p.shadowHp : p.hp;
                if (p.isShadow) shadows.push(p.id);
            }
            steps.push({ step: 'hp_announce', round: R, content: { hp, shadows } });
        }

        /* ── 回合末：停機坪飛行權 ───────────────────────────────── */
        for (const p of state.players) {
            p.helicopter = (p.roomId === '202' && !p.isShadow);
            if (p.roomId === '202') p.stats.flights += 0;
        }

        state.steps = steps;
        return steps;
    }

    /* 攻擊力：基因武力 + 裝備加成 */
    function attackPower(player) {
        let bonus = 0, hasFirearm = false;
        for (const it of player.items) {
            const def = ITEMS[it.itemId];
            if (!def) continue;
            bonus += (def.attackBonus || 0) * it.quantity;
            if (def.isFirearm && it.quantity > 0) hasFirearm = true;
        }
        return { total: player.genes.might + bonus, hasFirearm, bonus };
    }

    /* ── 勝負判定 ────────────────────────────────────────────────── */
    function livingPlayers(state) {
        return state.players.filter((p) => !p.isShadow);
    }
    function checkEnd(state) {
        const living = livingPlayers(state);
        if (living.length === 1 && state.players.length > 1) {
            return finish(state, 'last_survivor');
        }
        if (living.length === 0 && state.players.length > 1) {
            return finish(state, 'all_shadow');
        }
        if (state.round >= D.TOTAL_ROUNDS) {
            return finish(state, 'six_rounds');
        }
        return null;
    }

    function finish(state, reason) {
        state.phase = 'ended';
        /* 金條在結束時折算生命 */
        for (const p of state.players) {
            if (p.isShadow) continue;
            const gold = itemCount(p, 'gold_bar');
            if (gold > 0) p.hp = Math.min(p.maxHp, p.hp + gold);
        }
        const finalRanking = state.players.slice().sort((a, b) => rankKey(b) - rankKey(a));
        state.result = {
            reason,
            reasonText: D.END_REASONS[reason] || reason,
            ranking: finalRanking.map((p, i) => ({
                rank: i + 1,
                id: p.id, name: p.name, isBot: p.isBot,
                hp: p.isShadow ? p.shadowHp : p.hp,
                isShadow: p.isShadow,
                score: scoreOf(p),
                achievements: achievementsFor(p, state),
            })),
        };
        return state.result;
    }
    /* 名次：生命值優先（同值再比綜合分） */
    function rankKey(p) {
        const hp = p.isShadow ? (p.lastAliveHp || 0) : p.hp;
        return hp * 1000 + scoreOf(p);
    }
    function scoreOf(p) {
        const ach = achievementsFor(p, null).length;
        if (p.isShadow) return (p.lastAliveHp || 0) * 10;
        return p.hp * 10 + itemCount(p, 'gold_bar') * 3 + ach * 2 + p.stats.wins;
    }

    /* ── 成就 ────────────────────────────────────────────────────── */
    function achievementsFor(player, state) {
        const s = player.stats;
        const out = [];
        const add = (id) => { if (!out.includes(id)) out.push(id); };
        const gold = itemCount(player, 'gold_bar');
        const water = itemCount(player, 'water');
        const food = itemCount(player, 'food');
        const junk = itemCount(player, 'junk');

        if (s.damageTotal === 0 && s.aliveRounds >= D.TOTAL_ROUNDS) add('perfect');
        if (s.damageCombat === 0 && s.damageGas === 0 && s.damageOther === 0) add('onlyHunger');
        if (!player.isShadow && player.hp >= player.maxHp) add('fullHp');
        if (!player.isShadow && player.hp >= player.maxHp && gold > 0) add('goldFullHp');
        if (water >= 5 && food >= 5) add('supply5Both');
        if (water >= 4 && food >= 4) add('supply4Both');
        if (water >= 5) add('supply5Water');
        if (food >= 5) add('supply5Food');
        if (Object.keys(s.metCount).length === 0) add('loner');
        if (s.damageFromHunger === 0) add('fasting');

        if (junk >= 3) add('junkieFan');
        if (junk >= 6) add('junkKing');
        if (s.treasureFromDump >= 3) add('treasure');
        if (gold >= 5) add('gold5');
        if (gold >= 4) add('gold4');
        if (gold >= 3) add('gold3');
        if (s.goldGot >= 4) add('goldGot4');
        if (s.goldGot >= 3) add('goldGot3');
        if (s.freeGot >= 4) add('freeGot4');
        if (s.freeGot >= 3) add('freeGot3');
        if (s.itemsGiven >= 4) add('freeGave4');
        if (s.itemsGiven >= 3) add('freeGave3');

        if (s.maxSingleHit >= 4) add('onePunch');
        if (s.wins >= 1 && hasItem(player, 'knife')) add('blade');
        if (s.wins >= 1 && (hasItem(player, 'pistol') || hasItem(player, 'shotgun'))) add('warlord');
        if (Object.values(s.metCount).some((n) => n >= 3)) add('stalker');
        if (s.fights >= 3) add('warmonger');
        if (Object.values(s.opponents).some((n) => n >= 2)) add('prey');
        if (Object.keys(s.opponents).length >= Math.max(1, player.teamSize || 1)) add('enemyOfAll');
        if (s.fights === 0 && s.aliveRounds >= 2) add('peacemaker');
        if (s.rocketShots >= 1 && s.rocketHitCount === 0) add('rocketPerfect');
        if (s.rocketHitPlayers >= 3) add('rocketKing');
        if (s.rocketHitPlayers >= 2) add('rocketAce');
        if (s.damageTotal >= 10) add('masochist');
        if (s.damageTotal >= 9 && !player.isShadow) add('tough9');
        if (s.damageTotal >= 8 && !player.isShadow) add('tough8');
        if (s.damageTotal >= 10) add('bigHit10');
        if (s.maxSingleHit >= 4) add('onehit');
        if (s.rocketHitRounds >= 3) add('bombed3');
        if (s.rocketHitRounds >= 2) add('bombed2');

        if (s.detoxed >= 2) add('purifier');
        if (s.gasVoteHits >= 3) add('gasCommander');
        if (s.gasVoteHits >= 6) add('oracle6');
        if (s.gasVoteHits >= 5) add('oracle5');

        if (s.healedTotal >= player.maxHp) add('blackJack');
        if (s.healedTotal >= 10) add('resident');
        if (s.pillsUsed >= 5) add('needle5');
        if (s.pillsUsed >= 4) add('needle4');
        if (s.pillsUsed >= 3) add('needle3');
        if (s.saves >= 5) add('save5');
        if (s.saves >= 4) add('save4');
        if (s.saves >= 3) add('save3');
        if (s.saves >= 2) add('save2');
        if (s.pillsUsed >= 6) add('pill6');
        if (s.pillsUsed >= 5) add('pill5');
        if (s.pillsUsed >= 4) add('pill4');
        if (s.pillsUsed >= 3) add('pill3');

        if (s.damageTotal >= 5 && player.isShadow) add('drainedDead');
        if (s.damageTotal >= 10 && player.isShadow) add('drainedAlive');
        if (player.isShadow && player.roomId === 'B701') add('haunt');
        if (s.shadowDrain >= 8) add('vampireKing');
        if (s.shadowDrain >= 4) add('vampire');
        if (s.revives >= 1) add('phoenix');
        if (s.pillsUsed + s.adrenalsUsed >= 9) add('ninelives');
        if (s.lowHp && player.hp >= 8) add('comeback');
        if (s.revives >= 1 && s.wins >= 1) add('deadRevenge');
        if (s.damageTotal === 0 && s.aliveRounds >= D.TOTAL_ROUNDS) add('lyingWin');
        if (s.deaths >= 3) add('thriceDead');

        if (s.teleports >= 3) add('jumper');
        if (s.climbs >= 2) add('slider');
        if (s.flights >= 3) add('airportVip');
        if (s.flights >= 2) add('frequentFlyer');
        if (s.steps >= 20) add('miles');
        if (s.maxSteps >= 5) add('runner35');
        if (s.maxSteps >= 4) add('runner30');

        if (water >= 10) add('plainWater');
        if (s.wineRolls.length >= 4 && s.wineRolls.slice(-4).every((r) => r <= 2)) add('unlucky4');
        if (s.wineRolls.length >= 3 && s.wineRolls.slice(-3).every((r) => r <= 2)) add('unlucky3');
        if (s.wineCount >= 5) add('drunk5');
        if (s.wineCount >= 4) add('drunk4');

        return out;
    }

    /* ── 匯出 ────────────────────────────────────────────────────── */
    LS.engine = {
        createGame, startRound, resolveRound, checkEnd, finish,
        validatePath, reachable, neighbors, applyMove, combatInRoom,
        assignSpawns, resolveSpawnFight,
        performDraw, applyKeep, applyDamage, becomeShadow,
        attackPower, itemCount, totalItems, hasItem, addItem, removeItem,
        capacityOf, fmtItems, roomLabel, isEmptyRoom, achievementsFor, scoreOf,
        mulberry32, clamp, speedOf,
    };
    LS.util = { itemCount, totalItems, hasItem, addItem, removeItem, fmtItems, roomLabel, isEmptyRoom };
})(typeof window !== 'undefined' ? window : globalThis);
