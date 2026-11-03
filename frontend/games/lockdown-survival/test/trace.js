/* 單局追蹤：把某個玩家每回合的狀態印出來 */
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

const seed = parseInt(process.argv[2], 10) || 7;
const watchId = process.argv[3] || 'p1';

const state = E.createGame({ seed, difficulty: 'normal', botCount: 5, playerName: '測試員' });
state.human.policy = 'rookie';
state.tradeJudge = (target, from, trade) => LS.bots.wantsTrade(state, target, from, trade);
const spawns = LS.ROOMS.filter((r) => r.spawn).map((r) => r.id);
E.assignSpawns(state, spawns[seed % spawns.length]);

const watch = state.players.find((p) => p.id === watchId);
console.log(`seed=${seed} 追蹤 ${watch.name} (${watch.policy}) 負重=${watch.genes.weight} 速度=${watch.genes.speed}`);

for (let round = 1; round <= LS.TOTAL_ROUNDS; round++) {
    E.startRound(state);
    console.log(`\n────── 第 ${round} 回合（毒氣樓層：${state.gassedFloors.join(',') || '無'}）`);
    for (const p of state.players) LS.bots.playTurn(state, p);

    const before = { hp: watch.hp, room: watch.roomId, items: watch.items.map((i) => `${i.itemId}x${i.quantity}`).join(',') };
    const steps = E.resolveRound(state);
    E.checkEnd(state);

    console.log(`  ${watch.name}: HP ${before.hp} → ${watch.hp}｜位置 ${before.room} → ${watch.roomId}｜道具 ${before.items || '無'} → ${watch.items.map((i) => `${i.itemId}x${i.quantity}`).join(',') || '無'}`);
    console.log(`  供應：${JSON.stringify(steps.find((s) => s.step === 'supplies').content.perPlayer?.[watch.id])}`);
    const gas = steps.find((s) => s.step === 'gas').content;
    console.log(`  毒氣：新增 ${gas.newGasFloors.join(',') || '無'}｜受害 ${JSON.stringify(gas.damaged)}`);
    const enc = steps.find((s) => s.step === 'encounter').content;
    console.log(`  戰鬥房 ${enc.fightRooms.join(',') || '無'}｜亂鬥 ${enc.brawlRooms.join(',') || '無'}｜暗影 ${enc.shadowEncounterRooms.join(',') || '無'}`);

    /* 資源池現況 */
    const pools = [];
    for (const r of LS.ROOMS) {
        const p = state.rooms[r.id].pool;
        if (p.length) pools.push(`${r.id}:${p.map((x) => `${x.itemId}x${x.quantity}`).join(',')}`);
    }
    console.log(`  物資池：${pools.join(' | ') || '全空'}`);

    if (state.phase === 'ended') { console.log('\n結束：', state.result.reasonText); break; }
}
