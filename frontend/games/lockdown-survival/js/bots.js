/* =====================================================================
 * 禁閉逃殺 Lockdown Survival — 機器人 AI
 * 13 種政策 policy × 3 種難度。純邏輯，可在 Node headless 跑。
 *
 * 關鍵行為（決定節奏的東西）：
 *   1. 毒氣房間優先逃離
 *   2. 缺水缺糧 → 找還有存貨的補給房
 *   3. 物資夠了 → 回餐廳享受免繳（脫水／飢餓不扣血）
 *   4. 補貨回合與免繳回合交錯，避免被水糧餓死
 * ===================================================================== */
(function (global) {
    'use strict';

    const LS = (global.LS = global.LS || {});
    const D = LS;
    const E = LS.engine;

    const SUPPLY_WATER = ['hydro', 'mule'];
    const SUPPLY_FOOD = ['grain', 'marshal'];

    /* ── 場地查詢 ────────────────────────────────────────────────── */
    function occupants(state, roomId) {
        return state.players.filter((p) => p.roomId === roomId);
    }
    function crowdOf(state, roomId) {
        return occupants(state, roomId).filter((p) => !p.isShadow).length;
    }
    function neighborsOf(state, player, roomId) {
        return E.neighbors(state, player, roomId, {});
    }
    function dangerOf(state, player, roomId) {
        let n = crowdOf(state, roomId);
        for (const nb of neighborsOf(state, player, roomId)) n += crowdOf(state, nb);
        return n;
    }
    function isGassed(state, roomId) {
        const r = D.ROOM_MAP.get(roomId);
        if (!r) return false;
        if (state.detoxedRooms.includes(roomId)) return false;
        if (r.gasImmune) return false;
        return r.floors.every((f) => state.gassedFloors.includes(f));
    }
    function speedOf(player) { return player.adrenaline.active ? 10 : player.genes.speed; }

    /* 還有多少存貨的房間（依目前資源池現況） */
    function roomsWith(state, itemId) {
        const out = [];
        for (const r of D.ROOMS) {
            const pool = state.rooms[r.id].pool;
            if (pool.some((p) => p.itemId === itemId && p.quantity > 0)) out.push(r.id);
        }
        return out;
    }
    function supplyState(player) {
        const water = E.itemCount(player, 'water');
        const food = E.itemCount(player, 'food');
        const kit = E.itemCount(player, 'survival_kit');
        return {
            water, food, kit,
            needWater: water === 0 && kit === 0,
            needFood: food === 0 && kit === 0,
            ok: water > 0 && food > 0,
        };
    }

    /* ── 尋路：完整 BFS（不限步數）─────────────────────────────
       地圖很大，水塔到糧倉要 8 步以上。走不到也要往那邊靠，
       否則機器人會整局卡在原地。 */
    function bfsPath(state, player, target) {
        if (target === player.roomId) return [player.roomId];
        const prev = new Map([[player.roomId, null]]);
        let frontier = [player.roomId];
        let guard = 0;
        while (frontier.length && guard++ < 300) {
            const next = [];
            for (const cur of frontier) {
                /* 停機坪飛行只能用第一步 */
                const opts = { helipad: cur === player.roomId && player.helicopter && !player.isShadow };
                for (const nb of E.neighbors(state, player, cur, opts)) {
                    if (prev.has(nb)) continue;
                    prev.set(nb, cur);
                    if (nb === target) {
                        const path = [];
                        let c = nb;
                        while (c !== null && c !== undefined) { path.unshift(c); c = prev.get(c); }
                        return path;
                    }
                    next.push(nb);
                }
            }
            frontier = next;
        }
        return null;
    }

    /* 產生本回合要走的路徑：優先能走到的目標，其次往最近的目标靠 */
    function chooseTarget(state, player) {
        const cands = policyTargets(state, player);
        const maxSteps = speedOf(player);
        let best = null;
        for (const c of cands) {
            const full = bfsPath(state, player, c.id);
            if (!full) continue;
            const steps = Math.min(full.length - 1, maxSteps);
            const trunc = full.slice(0, steps + 1);
            const reached = trunc.length === full.length;
            let score = scoreTarget(state, player, c, trunc);
            if (!reached) score -= 8 + (full.length - 1) * 1.5;   /* 走不到 → 往那邊靠 */
            if (player.targetRoom === c.id) score += 15;        /* 目標不要中途改 */
            if (!best || score > best.score) {
                best = { id: c.id, path: trunc, score, reached, fullLen: full.length - 1 };
            }
        }
        return best;
    }

    /* ── 目標產生 ────────────────────────────────────────────────── */
    function policyTargets(state, player) {
        const p = player.policy;
        const hasGun = E.hasItem(player, 'pistol') || E.hasItem(player, 'shotgun');
        const food = E.itemCount(player, 'food');
        const pill = E.itemCount(player, 'pill');
        const wine = E.itemCount(player, 'wine') + E.itemCount(player, 'fine_wine');
        const sup = supplyState(player);
        const human = state.players.find((x) => x.id === 'p1');
        const bossMode = state.difficulty === 'boss' && human && !human.isShadow;

        const cands = [];
        const add = (id, bonus, label) => cands.push({ id, bonus: bonus || 0, label });

        /* (1) 毒氣逃離：最高優先 */
        if (isGassed(state, player.roomId)) {
            for (const r of D.ROOMS) {
                if (r.id === player.roomId) continue;
                if (isGassed(state, r.id)) continue;
                if (r.gasImmune) { add(r.id, 300, '戶外'); continue; }
                add(r.id, 260, '逃離毒氣');
            }
        }

        /* (1b) 上回合最高票的樓層很可能再被毒 → 迴避 */
        if (state.lastGasTally) {
            const hot = state.lastGasTally.floorId;
            if (hot && !state.gassedFloors.includes(hot)) {
                for (const r of D.ROOMS) {
                    if (r.floors.includes(hot) && !isGassed(state, r.id)) add(r.id, -80, '避開熱門毒層');
                }
            }
        }

        /* (2) 物資補給：缺水缺糧就去還有存貨的地方 */
        if (sup.needWater) for (const id of roomsWith(state, 'water')) add(id, 140, '找水');
        if (sup.needFood) for (const id of roomsWith(state, 'food')) add(id, 140, '找糧');

        /* (3) 餐廳免繳：脫水與飢餓都不扣血，是最安全的落腳點。
               上一回合被水糧扣過血 → 優先回餐廳；其餘時候當備案。 */
        const diningSafe = !isGassed(state, 'B204');
        if (state.round >= 2 && diningSafe) {
            add('B204', player.stats.lastSupplyDamage > 0 ? 200 : 130, '餐廳免繳');
        }

        /* (4) 政策專屬目標 */
        switch (p) {
            case 'gunner':
                if (!hasGun) { add('B206', 60, '金庫'); add('B107', 55, '武器庫'); }
                else { add('B107', 25, '武器庫'); add('B206', 20, '金庫'); }
                if (bossMode && human) add(human.roomId, 45, '追擊真人');
                break;
            case 'hoarder':
                add('B501', 60, '大倉庫');
                if (player.stats.junkTaken >= 3) add('B503', 25, '垃圾場');
                break;
            case 'gambler':
                add('B503', 65, '垃圾場');
                break;
            case 'medic':
                if (pill < 3) add('B301', 60, '藥房');
                add('B304', 30, '操作室');
                break;
            case 'ranger':
                if (food < 4) add('B505', 55, '糧倉');
                add('B403', 35, '傳送室');
                break;
            case 'drunkard':
                if (wine < 2) add('B601', 65, '酒窖');
                break;
            case 'warden':
                add('B101', 70, '控制室');
                break;
            case 'brute':
                if (state.round === 1) add('B304', 80, '操作室');
                add('B202', 20, '手術室');
                break;
            case 'brute_b':
                if (state.round === 1) add('B304', 80, '操作室');
                add('B204', 30, '餐廳');
                break;
            case 'hydro':
            case 'mule':
                if (sup.needWater) add('101', 120, '水塔');
                break;
            case 'grain':
            case 'marshal':
                if (sup.needFood) add('B505', 120, '糧倉');
                break;
            case 'rookie':
            default:
                add('B501', 30, '大倉庫');
                add('B107', 28, '武器庫');
                add('101', 26, '水塔');
                add('B505', 25, '糧倉');
                add('B206', 22, '金庫');
                add('B301', 20, '藥房');
                add('B601', 18, '酒窖');
                add('B101', 15, '控制室');
                break;
        }
        return cands;
    }

    /* 目標評分：偏好高 bonus、避開人潮與毒氣 */
    function scoreTarget(state, player, cand, path) {
        let score = cand.bonus;
        const crowd = crowdOf(state, cand.id);
        const gas = isGassed(state, cand.id) ? 1 : 0;
        const hp = player.hp;

        switch (player.policy) {
            case 'hoarder':
            case 'gambler':
            case 'ranger':
                score -= crowd * 12;            /* 怕撞到人 */
                break;
            case 'gunner':
            case 'brute':
            case 'brute_b':
                score += crowd * 8;             /* 喜歡找人 */
                break;
            case 'warden':
            case 'medic':
                score -= crowd * 4;
                break;
            default:
                score -= crowd * 5;
        }
        if (gas) score -= 60;
        if (hp <= 4) score -= crowd * 10;
        score -= path.length * 0.4;
        return score;
    }

    /* ── 保留優先序 ──────────────────────────────────────────────── */
    const KEEP_PRIORITY = {
        gunner: ['shotgun', 'pistol', 'bayonet', 'knife', 'gold_bar', 'survival_kit', 'pill', 'adrenaline', 'water', 'food'],
        hoarder: ['gold_bar', 'shotgun', 'pistol', 'bayonet', 'knife', 'pill', 'adrenaline', 'wine', 'fine_wine', 'survival_kit', 'water', 'food', 'rope', 'gas_mask', 'rocket_launcher', 'dimension_pocket', 'recycler'],
        gambler: ['rocket_launcher', 'dimension_pocket', 'gas_mask', 'recycler', 'rope', 'shotgun', 'pistol', 'bayonet', 'knife', 'gold_bar', 'pill', 'adrenaline', 'survival_kit'],
        medic: ['pill', 'adrenaline', 'survival_kit', 'water', 'food', 'gold_bar'],
        ranger: ['food', 'water', 'survival_kit', 'rope', 'adrenaline', 'pill'],
        drunkard: ['wine', 'fine_wine', 'survival_kit', 'gold_bar', 'pill'],
        warden: ['gas_mask', 'adrenaline', 'pill', 'survival_kit', 'water', 'food'],
        brute: ['bayonet', 'shotgun', 'pistol', 'knife', 'adrenaline', 'survival_kit', 'pill'],
        brute_b: ['bayonet', 'shotgun', 'pistol', 'knife', 'adrenaline', 'survival_kit', 'pill'],
        hydro: ['water', 'survival_kit', 'gas_mask', 'adrenaline', 'pill', 'food'],
        grain: ['food', 'survival_kit', 'gas_mask', 'adrenaline', 'pill', 'water'],
        mule: ['water', 'survival_kit', 'gas_mask', 'adrenaline'],
        marshal: ['food', 'survival_kit', 'gold_bar', 'adrenaline', 'pill'],
        rookie: ['gold_bar', 'shotgun', 'pistol', 'bayonet', 'knife', 'pill', 'adrenaline', 'survival_kit', 'water', 'food', 'wine', 'fine_wine', 'rope', 'gas_mask', 'rocket_launcher', 'dimension_pocket', 'recycler'],
    };

    /* 依當下需求調整優先序（缺水就把水排前面） */
    function dynamicOrder(player) {
        const base = (KEEP_PRIORITY[player.policy] || KEEP_PRIORITY.rookie).slice();
        const sup = supplyState(player);
        const boost = [];
        if (sup.needWater) boost.push('water');
        if (sup.needFood) boost.push('food');
        if (sup.needWater && sup.needFood) boost.push('survival_kit');
        return boost.concat(base.filter((id) => !boost.includes(id)));
    }

    /* 手上價值最低、而且比即將拿到的東西還差的物資 */
    function worstHeld(state, player, incomingId) {
        const order = dynamicOrder(player);
        const rank = (id) => { const i = order.indexOf(id); return i < 0 ? 99 : i; };
        const incomingRank = rank(incomingId);
        let worst = null;
        for (const it of player.items) {
            if (it.quantity <= 0) continue;
            const r = rank(it.itemId);
            if (r >= incomingRank) continue;            /* 手上這比要拿的好，別丟 */
            if (it.itemId === 'gold_bar') continue;       /* 金條不丟 */
            if (it.itemId === 'water' || it.itemId === 'food') {
                /* 還沒備齊水糧就不丟 */
                const sup = supplyState(player);
                if (it.itemId === 'water' && sup.needWater) continue;
                if (it.itemId === 'food' && sup.needFood) continue;
            }
            if (!worst || r > worst.rank) worst = { itemId: it.itemId, quantity: 1, rank: r };
        }
        return worst;
    }

    function decideKeep(state, player, options) {
        const order = dynamicOrder(player);
        const keep = [];
        for (const o of options) if (o.forced) keep.push(o.index);
        const ranked = options
            .filter((o) => !o.forced)
            .sort((a, b) => (order.indexOf(a.itemId) < 0 ? 99 : order.indexOf(a.itemId)) - (order.indexOf(b.itemId) < 0 ? 99 : order.indexOf(b.itemId)));
        for (const o of ranked) {
            if (o.itemId === 'junk' && player.policy !== 'rookie') continue;
            const cap = E.capacityOf(player);
            let used = player.items.reduce((s, i) => s + i.quantity, 0) + keep.length;
            if (used >= cap) {
                /* 背包滿了：丟掉價值最低的，換這張 */
                const worst = worstHeld(state, player, o.itemId);
                if (!worst) continue;
                E.removeItem(player, worst.itemId, 1);
                state.discardPile.push({ itemId: worst.itemId, quantity: 1 });
                used -= 1;
            }
            keep.push(o.index);
        }
        return keep;
    }

    /* 回合結束前把沒用的垃圾丟回去換負重 */
    function discardJunk(state, player) {
        if (player.policy === 'rookie') return;
        const junk = E.itemCount(player, 'junk');
        if (junk <= 0) return;
        const cap = E.capacityOf(player);
        const used = player.items.reduce((s, i) => s + i.quantity, 0);
        if (used < cap) return;                 /* 還有空間就留著 */
        E.removeItem(player, 'junk', 1);
        state.discardPile.push({ itemId: 'junk', quantity: 1 });
    }

    /* ── 毒氣投票 ────────────────────────────────────────────────── */
    /* 策略：大家都投「人最少的那一層」→ 不會平票 → 每回合最多毒一層。
       否則 6 回合會把 9 層毒掉 7.5 層，無處可躲。 */
    function decideGasVote(state, player) {
        const options = D.FLOOR_ORDER.filter((f) => !state.gassedFloors.includes(f));
        if (!options.length) return null;

        const allies = new Set();
        for (const o of state.players) {
            if (!o.isBot || o.id === player.id) continue;
            const same = o.policy === player.policy;
            const pair = (SUPPLY_WATER.includes(player.policy) && SUPPLY_WATER.includes(o.policy)) ||
                (SUPPLY_FOOD.includes(player.policy) && SUPPLY_FOOD.includes(o.policy)) ||
                (player.policy === 'mule' && o.policy === 'marshal') ||
                (player.policy === 'marshal' && o.policy === 'mule');
            if (same || pair) allies.add(o.id);
        }
        const human = state.players.find((x) => x.id === 'p1');
        const bossMode = state.difficulty === 'boss' && human && !human.isShadow;

        const myRoom = D.ROOM_MAP.get(player.roomId);
        const myFloor = myRoom ? myRoom.floors[0] : null;

        let best = null;
        for (const f of options) {
            const peopleOnFloor = state.players.filter((p) => {
                const r = D.ROOM_MAP.get(p.roomId);
                return r && r.floors.includes(f);
            });
            let score = -peopleOnFloor.length * 10 + state.rng() * 3;
            if (peopleOnFloor.some((p) => allies.has(p.id))) score -= 60;
            if (f === myFloor) score -= 80;                      /* 不要毒自己腳下 */
            if (bossMode && human) {
                const humanRoom = D.ROOM_MAP.get(human.roomId);
                if (humanRoom && humanRoom.floors.includes(f)) score += 15;
            }
            if (!best || score > best.score) best = { floor: f, score };
        }
        return best ? best.floor : null;
    }

    /* ── 火箭筒瞄準 ──────────────────────────────────────────────── */
    function decideRocket(state, player) {
        if (!E.hasItem(player, 'rocket_launcher')) return null;
        const human = state.players.find((x) => x.id === 'p1');
        const bossMode = state.difficulty === 'boss';
        const targets = new Map();
        for (const p of state.players) {
            if (p.id === player.id || p.isShadow || !p.roomId) continue;
            targets.set(p.roomId, (targets.get(p.roomId) || 0) + 1);
        }
        let best = null;
        for (const [roomId, n] of targets) {
            let score = n * 10;
            if (bossMode && human && human.roomId === roomId) score += 20;
            if (isGassed(state, roomId)) score -= 5;
            if (!best || score > best.score) best = { roomId, score };
        }
        return best && best.score > 0 ? best.roomId : null;
    }

    /* ── 道具使用 ────────────────────────────────────────────────── */
    function decideItemUses(state, player) {
        const uses = [];
        const crowd = crowdOf(state, player.roomId);
        const danger = crowd > 0 || isGassed(state, player.roomId);

        if (E.hasItem(player, 'adrenaline') && (player.hp <= 4 || (danger && player.hp <= 6))) {
            uses.push({ itemId: 'adrenaline' });
        }
        if (E.hasItem(player, 'pill') && player.hp <= player.maxHp - 3) {
            uses.push({ itemId: 'pill' });
        }
        if (E.hasItem(player, 'wine') || E.hasItem(player, 'fine_wine')) {
            const drinker = player.policy === 'drunkard';
            if (drinker || (player.hp <= 3 && !E.hasItem(player, 'pill'))) {
                const which = E.hasItem(player, 'fine_wine') ? 'fine_wine' : 'wine';
                uses.push({ itemId: which });
            }
        }
        return uses;
    }

    /* ── 交易 ────────────────────────────────────────────────────── */
    /* 這個政策想要哪些東西 */
    function wantsItem(policy, itemId) {
        const order = KEEP_PRIORITY[policy] || KEEP_PRIORITY.rookie;
        const i = order.indexOf(itemId);
        return i >= 0 && i < 6;
    }

    /* 提議一筆交換：拿自己多的換自己缺的 */
    function decideTrade(state, player) {
        const sup = supplyState(player);
        const partners = state.players.filter((o) => o.id !== player.id && !o.isShadow);

        const wants = [];
        if (sup.needWater) wants.push('water');
        if (sup.needFood) wants.push('food');
        if (!wants.length) {
            /* 物資夠了 → 拿多餘的東西換戰力 */
            const surplus = ['gold_bar', 'survival_kit', 'pill', 'knife', 'adrenaline'].filter((id) => E.itemCount(player, id) >= 2);
            if (!surplus.length) return null;
            for (const p of partners) {
                if (E.itemCount(p, 'pistol') > 0 || E.itemCount(p, 'shotgun') > 0) {
                    return { targetId: p.id, give: [surplus[0]], want: ['shotgun'] };
                }
            }
            return null;
        }
        const want = wants[0];
        const givePool = ['water', 'food', 'survival_kit', 'gold_bar'].filter((id) => E.itemCount(player, id) >= 1 && id !== want);
        if (!givePool.length) return null;
        const give = givePool[0];

        for (const p of partners) {
            if (E.itemCount(p, want) >= 2) return { targetId: p.id, give: [give], want: [want] };
        }
        return null;
    }

    /* 對方願不願意接受這筆交換 */
    function wantsTrade(state, target, from, trade) {
        if (!trade.give || !trade.give.length) return false;
        const given = trade.give[0];
        const wanted = (trade.want || [])[0];
        if (!wantsItem(target.policy, given)) return false;
        /* 捨不得自己要給的：手上超過 1 個才肯送 */
        if (wanted && E.itemCount(target, wanted) <= 1 && wantsItem(target.policy, wanted)) return false;
        return true;
    }

    /* ── 控制室選項 ──────────────────────────────────────────────── */
    function decideControlRoom(state, player) {
        const gassed = state.gassedFloors.slice();
        if (gassed.length && state.rng() < 0.45) {
            const target = pickDetoxTarget(state, player);
            if (target) return { mode: 'detox', target };
        }
        return { mode: 'gas10' };
    }
    function pickDetoxTarget(state, player) {
        const cands = state.gassedFloors.filter((f) => {
            const rooms = D.ROOMS.filter((r) => r.floors.includes(f));
            return rooms.some((r) => !state.detoxedRooms.includes(r.id));
        });
        if (!cands.length) return null;
        const floor = cands[Math.floor(state.rng() * cands.length)];
        const rooms = D.ROOMS.filter((r) => r.floors.includes(floor) && !state.detoxedRooms.includes(r.id));
        return rooms.length ? rooms[Math.floor(state.rng() * rooms.length)].id : null;
    }

    /* ── 基因重配（操作室）───────────────────────────────────────── */
    function decideGeneRealloc(state, player) {
        const g = player.genes;
        const total = g.might + g.weight + g.speed;
        const p = player.policy;
        let might, weight;
        switch (p) {
            case 'brute': might = Math.max(2, total - 4); weight = 2; break;
            case 'brute_b': might = total - 3; weight = 2; break;
            case 'gunner': might = total - 3; weight = 3; break;
            case 'hoarder': case 'gambler': might = 2; weight = total - 3; break;
            case 'hydro': case 'grain': case 'mule': case 'marshal': might = 2; weight = total - 3; break;
            case 'medic': might = 2; weight = total - 3; break;
            case 'ranger': might = 2; weight = 2; break;
            default: might = Math.ceil(total / 2); weight = Math.floor(total / 3);
        }
        might = Math.max(1, Math.min(total - 2, might));
        weight = Math.max(1, Math.min(total - 2, weight));
        const speed = Math.max(1, total - might - weight);
        return { might, weight, speed };
    }

    /* ── 金條使用 ────────────────────────────────────────────────── */
    function useGoldBar(state, player) {
        if (!E.hasItem(player, 'gold_bar')) return null;
        const room = D.ROOM_MAP.get(player.roomId);
        if (!room || room.goldBarDisabled) return null;
        const pool = state.rooms[player.roomId].pool;
        const order = KEEP_PRIORITY[player.policy] || KEEP_PRIORITY.rookie;
        const pick = pool
            .filter((x) => x.itemId !== 'gold_bar' && x.quantity > 0)
            .sort((a, b) => (order.indexOf(a.itemId) < 0 ? 99 : order.indexOf(a.itemId)) - (order.indexOf(b.itemId) < 0 ? 99 : order.indexOf(b.itemId)))[0];
        if (!pick) return null;
        pick.quantity -= 1;
        E.removeItem(player, 'gold_bar', 1);
        E.addItem(player, pick.itemId, 1);
        player.stats.goldSpent += 1;
        player.stats.freeGot += 1;
        return { itemId: pick.itemId, detail: `金條換到 ${D.ITEMS[pick.itemId].name}` };
    }

    /* ── 主流程：跑完一個機器人的整個行動 ───────────────────────── */
    function playTurn(state, player) {
        const action = {
            path: [player.roomId],
            gasVote: null,
            gasVoteWeight: 1,
            controlChoice: null,
            rocketTarget: null,
            itemUses: [],
            trade: null,
            geneRealloc: null,
        };

        /* 1. 選目標並移動（走不到也往那邊靠） */
        const chosen = chooseTarget(state, player);
        if (chosen) {
            const res = E.applyMove(state, player, chosen.path);
            if (res.ok) {
                action.path = chosen.path.slice();
                player.targetRoom = chosen.reached ? null : chosen.id;
            }
        }

        /* 2. 抽取並保留 */
        const draw = E.performDraw(state, player, player.roomId);
        if (draw) {
            const keep = decideKeep(state, player, draw.options);
            E.applyKeep(state, player, keep);
        }

        /* 3. 金條換物資（不佔抽取次數） */
        if (E.hasItem(player, 'gold_bar')) {
            const used = useGoldBar(state, player);
            if (used) action.goldUsed = used;
        }

        /* 4. 特殊房間 */
        const room = D.ROOM_MAP.get(player.roomId);
        if (room) {
            if (room.special === 'control_room') action.controlChoice = decideControlRoom(state, player);
            else if (room.special === 'console_room') action.geneRealloc = decideGeneRealloc(state, player);
            else if (room.special === 'gene_bank') {
                player.genes.might += 1; player.genes.weight += 1; player.genes.speed += 1;
            }
        }

        /* 5. 毒氣投票 */
        const vote = decideGasVote(state, player);
        if (vote) {
            action.gasVote = vote;
            action.gasVoteWeight = action.controlChoice && action.controlChoice.mode === 'gas10' ? 10 : 1;
        }

        /* 6. 火箭筒 */
        action.rocketTarget = decideRocket(state, player);

        /* 7. 道具 */
        action.itemUses = decideItemUses(state, player);

        /* 8. 交易提議 */
        action.trade = decideTrade(state, player);

        /* 9. 丟棄垃圾換負重 */
        discardJunk(state, player);

        player.action = action;
        return action;
    }

    LS.bots = {
        playTurn, bfsPath, chooseTarget, decideKeep, decideGasVote, decideRocket,
        decideItemUses, decideTrade, wantsTrade, decideControlRoom, decideGeneRealloc,
        useGoldBar, policyTargets, scoreTarget, isGassed, crowdOf, dangerOf,
        roomsWith, supplyState, wantsItem, dynamicOrder, discardJunk,
    };
})(typeof window !== 'undefined' ? window : globalThis);
