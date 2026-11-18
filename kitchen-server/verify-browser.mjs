// kitchen-server/verify-browser.mjs — 不說廚房雙人流程 headless 驗證。
// 兩個獨立 Chrome profile（各自 localStorage）＋一台 390px 手機版。
// 前置：先跑 node kitchen-server/local-server.mjs 8901（或由本腳本自動起）。
// Run: node kitchen-server/verify-browser.mjs
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';

// 清掉上一輪殘留的 chrome，避免連到舊 profile 的舊分頁
try { execSync('pkill -f chrome-headless-shell', { stdio: 'ignore' }); } catch {}
await new Promise((r) => setTimeout(r, 1000));

const CHROME = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://127.0.0.1:8901/games/kitchen/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = [];
function check(name, cond, extra = '') {
  if (cond) console.log(`PASS ${name}`);
  else { failures.push(name); console.log(`FAIL ${name} ${extra}`); }
}

async function launch(port, dir, w, h) {
  fs.rmSync(dir, { recursive: true, force: true });
  const proc = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch {}
    await sleep(500);
  }
  if (!wsUrl) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => { ws.onopen = r; });
  const errors = [];
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      if (!/favicon/i.test(text)) errors.push('CONSOLE.ERROR: ' + text.slice(0, 400));
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id; pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };
  const waitFor = async (expression, timeoutMs, label) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { const v = await evalJs(expression); if (v) return v; } catch {}
      await sleep(400);
    }
    throw new Error('timeout waiting for: ' + label);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return { proc, ws, send, evalJs, waitFor, errors, port };
}
async function shot(c, file) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('screenshot', file);
}

// ---- 啟動 ----
// 暱稱在後端是全域唯一的，本地伺服器重跑才清空；每次驗證用不同後綴避免 409
const SUFFIX = String(Math.floor(Math.random() * 90) + 10);
const NICK_A = '阿哲' + SUFFIX;
const NICK_B = '小美' + SUFFIX;
const A = await launch(9333, '/tmp/kc-profile-a', 1280, 900);
const B = await launch(9334, '/tmp/kc-profile-b', 1280, 900);
try {
  // A 開房
  await A.send('Page.navigate', { url: BASE });
  await A.waitFor(`!document.getElementById('screen-join').hidden`, 10000, 'A join screen');
  // 等 game.js 初始化完成（公開房間載入後才點按鈕，否則 click 會打在還沒綁 handler 的按鈕上）
  await A.waitFor(`!document.getElementById('publicRooms').textContent.includes('載入中')`, 10000, 'A game.js ready');
  await A.evalJs(`document.getElementById('nickInput').value='${NICK_A}'; document.getElementById('createBtn').click();`);
  await A.evalJs(`(function(){var b=document.querySelector('[data-action="close-modal"]'); if(b) b.click();})();`);
  await A.waitFor(`document.getElementById('roomCodeBig').textContent !== '----'`, 15000, 'A lobby code');
  const code = await A.evalJs(`document.getElementById('roomCodeBig').textContent`);
  check('A creates room, code shown', /^[A-Z0-9]{4}$/.test(code), 'code=' + code);
  const modalOpen = await A.evalJs(`!!document.querySelector('.kc-modal-back')`);
  check('no modal blocks the screen after entering room', !modalOpen);

  // B 加入
  await B.send('Page.navigate', { url: BASE });
  await B.waitFor(`!document.getElementById('screen-join').hidden`, 10000, 'B join screen');
  await B.waitFor(`!document.getElementById('publicRooms').textContent.includes('載入中')`, 10000, 'B game.js ready');
  await B.evalJs(`document.getElementById('nickInput').value='${NICK_B}'; document.getElementById('codeInput').value='${code}'; document.getElementById('joinBtn').click();`);
  await B.evalJs(`(function(){var b=document.querySelector('[data-action="close-modal"]'); if(b) b.click();})();`);
  await B.waitFor(`document.querySelectorAll('#lobbyPlayers li').length === 2`, 15000, 'B lobby 2 players');
  check('B joins with code, lobby shows 2 players', true);
  await A.waitFor(`document.querySelectorAll('#lobbyPlayers li').length === 2`, 10000, 'A sees 2 players');
  check('A sees B in lobby (sync)', true);

  // A 開工
  await A.evalJs(`document.getElementById('startBtn').click();`);
  await A.waitFor(`!document.getElementById('screen-game').hidden`, 10000, 'A game screen');
  await B.waitFor(`!document.getElementById('screen-game').hidden`, 10000, 'B game screen');
  check('both enter game screen after start', true);
  const clock1 = await A.evalJs(`document.getElementById('shiftClock').textContent`);
  await sleep(2500);
  const clock2 = await A.evalJs(`document.getElementById('shiftClock').textContent`);
  check('shift clock ticks down', clock1 !== clock2, clock1 + ' -> ' + clock2);

  // 等單出現，A 接單
  await A.waitFor(`document.querySelectorAll('.kc-order').length > 0`, 15000, 'orders appear');
  check('orders spawn', true);
  await A.evalJs(`document.querySelector('[data-action="take"]').click();`);
  await B.waitFor(`document.querySelector('.kc-order-taker') && document.querySelector('.kc-order-taker').textContent.includes('阿哲')`, 10000, 'B sees taker');
  check('take order syncs to B', true);

  // 做第一步 → 收成
  await A.evalJs(`document.querySelector('[data-action="cook"]').click();`);
  await A.waitFor(`document.querySelector('.kc-cooking')`, 8000, 'cooking state');
  check('step 1 cooking starts', true);
  await A.waitFor(`document.querySelector('.kc-ready')`, 20000, 'step 1 ready');
  check('step 1 finishes (ready to collect)', true);
  await A.evalJs(`document.querySelector('[data-action="collect"]').click();`);
  await A.waitFor(`document.querySelector('.kc-order-taker') && document.querySelector('.kc-order-taker').textContent.includes('1/2')`, 8000, 'progress 1/2');
  check('collect step 1, progress 1/2', true);

  // 第二步 → 出餐
  await A.evalJs(`document.querySelector('[data-action="cook"]').click();`);
  await A.waitFor(`document.querySelector('.kc-ready')`, 25000, 'step 2 ready');
  await A.evalJs(`document.querySelector('[data-action="collect"]').click();`);
  await A.waitFor(`document.querySelector('[data-action="serve"]')`, 8000, 'serve button');
  check('dish complete, serve button appears', true);
  const moneyBefore = await A.evalJs(`document.getElementById('goldVal').textContent`);
  await A.evalJs(`document.querySelector('[data-action="serve"]').click();`);
  await A.waitFor(`document.getElementById('goldVal').textContent !== '${moneyBefore}'`, 8000, 'money increases on A');
  const moneyA = await A.evalJs(`document.getElementById('goldVal').textContent`);
  check('serve adds money on A', Number(moneyA) > 0, 'money=' + moneyA);
  await B.waitFor(`document.getElementById('goldVal').textContent === '${moneyA}'`, 10000, 'money syncs to B');
  check('money syncs to B', true);

  // B 斷線重進
  await B.send('Page.navigate', { url: BASE });
  await B.waitFor(`!document.getElementById('screen-game').hidden`, 15000, 'B auto-rejoins game');
  const playersAfter = await B.evalJs(`document.querySelectorAll('#gamePlayers li').length`);
  check('B reconnects into same room', playersAfter === 2, 'players=' + playersAfter);

  await shot(A, '/tmp/kc-a-game.png');
  await shot(B, '/tmp/kc-b-game.png');

  // 手機 390px
  const M = await launch(9335, '/tmp/kc-profile-m', 390, 844);
  await M.send('Page.navigate', { url: BASE });
  await M.waitFor(`!document.getElementById('screen-join').hidden`, 10000, 'mobile join screen');
  await M.waitFor(`!document.getElementById('publicRooms').textContent.includes('載入中')`, 10000, 'mobile game.js ready');
  await sleep(1000);
  const overflow = await M.evalJs(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('mobile 390px no horizontal overflow', overflow <= 1, 'overflow=' + overflow);
  await shot(M, '/tmp/kc-mobile.png');
  const mErrs = M.errors;
  M.ws.close(); M.proc.kill();
  if (mErrs.length) failures.push('mobile console errors: ' + mErrs.join(' | '));

  // console 錯誤
  check('A console errors = 0', A.errors.length === 0, A.errors.join(' | '));
  check('B console errors = 0', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  failures.push('exception: ' + e.message);
  console.log('EXCEPTION', e.message);
  try { await shot(A, '/tmp/kc-a-fail.png'); } catch {}
  try { await shot(B, '/tmp/kc-b-fail.png'); } catch {}
} finally {
  A.ws.close(); A.proc.kill();
  B.ws.close(); B.proc.kill();
}
console.log(failures.length ? `\nVERIFY ${failures.length} FAILED: ${failures.join(' ; ')}` : '\nVERIFY ALL PASSED');
process.exit(failures.length ? 1 : 0);
