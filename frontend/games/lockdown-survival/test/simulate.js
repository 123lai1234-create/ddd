/* =====================================================================
 * 禁閉逃殺 Lockdown Survival — headless 模擬測試
 * 用法：node frontend/games/lockdown-survival/test/simulate.js [局數]
 *
 * 全部玩家（含真人位）都由機器人 policy 驅動，跑滿 6 回合，
 * 檢查例外與不變量（HP 範圍、房間合法性、物品數量非負…）。
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const sandbox = vm.createContext({ console });
sandbox.globalThis = sandbox;
for (const f of ['data.js', 'engine.js', 'bots.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), sandbox, { filename: f });
}
const LS = sandbox.LS;
const E = LS.engine;

const RUNS = parseInt(process.argv[2], 10) || 300;

function invariant(cond, msg, ctx) {
    if (!cond) throw new Error('INVARIANT: ' + msg + (ctx ? ' | ' + ctx : ''));
}

function checkState(state) {
    for (const p of state.players) {
        invariant(p.hp >= 0 && p.hp <= p.maxHp, `${p.name} HP 越界 ${p.hp}`);
        invariant(Number.isFinite(p.hp), `${p.name} HP 非有限數`);
        invariant(p.roomId === null || LS.ROOM_MAP.has(p.roomId), `${p.name} 房間不存在 ${p.roomId}`);
        invariant(p.genes.might >= 1 && p.genes.weight >= 1 && p.genes.speed >= 1,
            `${p.name} 基因非法 ${JSON.stringify(p.genes)}`);
        for (const it of p.items) {
            invariant(it.quantity > 0, `${p.name} 道具數量 <= 0`);
            invariant(!!LS.ITEMS[it.itemId], `${p.name} 未知道具 ${it.itemId}`);
        }
        invariant(p.genes.might + p.genes.weight + p.genes.speed <= 20,
            `${p.name} 基因總點數失控 ${JSON.stringify(p.genes)}`);
    }
    for (const r of Object.values(state.rooms)) {
        for (const it of r.pool) invariant(it.quantity >= 0, `${r.id} 物資池數量負數`);
    }
}

function playOne(seed, difficulty, botCount) {
    const state = E.createGame({ seed, difficulty, botCount, playerName: '測試員' });
    /* 真人位也用機器人 policy 驅動 */
    state.human.policy = 'rookie';
    /* 交易裁判：機器人用 policy 判斷，真人位（此處也是機器人）一樣判 */
    state.tradeJudge = (target, from, trade) => LS.bots.wantsTrade(state, target, from, trade);
    const spawns = LS.ROOMS.filter((r) => r.spawn).map((r) => r.id);
    E.assignSpawns(state, spawns[seed % spawns.length]);
    checkState(state);

    for (let round = 1; round <= LS.TOTAL_ROUNDS; round++) {
        E.startRound(state);
        checkState(state);

        for (const p of state.players) {
            if (p.isShadow) {
                /* 暗影也要行動：往有活人的房間移動 */
                LS.bots.playTurn(state, p);
                continue;
            }
            LS.bots.playTurn(state, p);
            checkState(state);
        }

        E.resolveRound(state);
        checkState(state);
        E.checkEnd(state);
        if (state.phase === 'ended') break;
    }

    invariant(state.phase === 'ended', '遊戲沒有結束');
    invariant(!!state.result, '沒有結果');
    invariant(state.result.ranking.length === state.players.length, '排名人數不符');
    return state;
}

/* ── 執行 ─────────────────────────────────────────────────────── */
let ok = 0, fail = 0;
const reasons = {};
const errors = [];
const causes = {};
const byPolicy = {};
let hpSum = 0, hpCount = 0, aliveAtEnd = 0, totalPlayers = 0;
const bySize = {};
const gasStats = { n: 0, rounds: 0, maxFloors: 0 };
const dmgBySource = { combat: 0, gas: 0, supply: 0, other: 0, thirst: 0, hunger: 0, healed: 0 };
const t0 = Date.now();

for (let i = 0; i < RUNS; i++) {
    const difficulty = ['easy', 'normal', 'boss'][i % 3];
    const botCount = 3 + (i % 5);
    try {
        const state = playOne(i + 1, difficulty, botCount);
        ok++;
        reasons[state.result.reason] = (reasons[state.result.reason] || 0) + 1;
        const sizeKey = String(state.players.length);
        bySize[sizeKey] = bySize[sizeKey] || { alive: 0, total: 0, hp: 0, allShadow: 0 };
        if (state.result.reason === 'all_shadow') bySize[sizeKey].allShadow += 1;
        for (const p of state.players) {
            const key = p.policy || 'human';
            byPolicy[key] = byPolicy[key] || { games: 0, deaths: 0, aliveRounds: 0, hp: 0, n: 0, wins: 0 };
            byPolicy[key].games += 1;
            byPolicy[key].deaths += p.stats.deaths;
            byPolicy[key].aliveRounds += p.stats.aliveRounds;
            byPolicy[key].hp += p.isShadow ? 0 : p.hp;
            byPolicy[key].n += 1;
            if (p.stats.wins > 0) byPolicy[key].wins += 1;
            if (p.stats.deaths > 0) causes[p.stats.deathCause] = (causes[p.stats.deathCause] || 0) + 1;
            hpSum += p.isShadow ? 0 : p.hp; hpCount++;
            totalPlayers++;
            if (!p.isShadow) { aliveAtEnd++; bySize[sizeKey].alive += 1; }
            bySize[sizeKey].total += 1;
            bySize[sizeKey].hp += p.isShadow ? 0 : p.hp;
            dmgBySource.combat += p.stats.damageCombat;
            dmgBySource.gas += p.stats.damageGas;
            dmgBySource.supply += p.stats.damageSupply;
            dmgBySource.other += p.stats.damageOther;
            dmgBySource.thirst += p.stats.damageFromThirst;
            dmgBySource.hunger += p.stats.damageFromHunger;
            dmgBySource.healed += p.stats.healedTotal;
        }
        gasStats.n += state.gassedFloors.length;
        gasStats.rounds += LS.TOTAL_ROUNDS;
        gasStats.maxFloors = Math.max(gasStats.maxFloors, state.gassedFloors.length);
    } catch (e) {
        fail++;
        if (errors.length < 5) {
            errors.push(`[seed=${i + 1} ${difficulty} bots=${botCount}] ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e}`);
        }
    }
}

const ms = Date.now() - t0;
console.log(`\n=== 禁閉逃殺 headless 模擬 ===`);
console.log(`局數 ${RUNS}｜成功 ${ok}｜失敗 ${fail}｜耗時 ${ms}ms`);
console.log('結局分布：', JSON.stringify(reasons));
console.log(`平均存活 HP：${(hpSum / Math.max(1, hpCount)).toFixed(2)}｜終局存活率：${((aliveAtEnd / Math.max(1, totalPlayers)) * 100).toFixed(1)}%`);
console.log('死因分布：', JSON.stringify(causes));
console.log(`平均毒氣樓層數（到第 6 回合）：${(gasStats.n / gasStats.rounds).toFixed(2)}｜單局最多 ${gasStats.maxFloors} 層`);
console.log(`扣血來源：戰鬥 ${dmgBySource.combat}｜毒氣 ${dmgBySource.gas}｜水糧 ${dmgBySource.supply}（脫水 ${dmgBySource.thirst}／飢餓 ${dmgBySource.hunger}）｜其他 ${dmgBySource.other}｜回復 ${dmgBySource.healed}`);
console.log('\n依總人數分：');
for (const [n, v] of Object.entries(bySize)) {
    console.log(`  ${n} 人：存活率 ${((v.alive / v.total) * 100).toFixed(0)}%｜平均存活 HP ${(v.hp / Math.max(1, v.total)).toFixed(1)}｜全滅 ${v.allShadow} 局`);
}
console.log('\n各 policy 平均：');
for (const [k, v] of Object.entries(byPolicy).sort((a, b) => b[1].deaths - a[1].deaths)) {
    console.log(`  ${k.padEnd(9)} 死亡/局 ${(v.deaths / v.games).toFixed(2)}｜存活回合 ${(v.aliveRounds / v.n).toFixed(1)}｜平均 HP ${(v.hp / v.n).toFixed(1)}｜贏過 ${((v.wins / v.n) * 100).toFixed(0)}%`);
}
if (errors.length) {
    console.log('\n錯誤樣本：');
    for (const e of errors) console.log('  ' + e);
    process.exit(1);
}
console.log('\n全部通過 ✅');
