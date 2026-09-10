// smoke-music-page.mjs — deploy gate
//
// 等 Vercel 部署完成后跑：node smoke/smoke-music-page.mjs
// 打开 https://donttalk.vercel.app/music?v=<random>（绕过 CDN 缓存），
// 等 DOMContentLoaded + 一段动画帧，截取 console 事件，断言：
//   1. 没有 `Cannot read properties of null (reading 'addEventListener')`
//   2. 没有 `t is not defined`
//   3. 没有 `404` 的静态资源 / Vercel Analytics script
//   4. 页面真的渲染了 music-player DOM（#audio-player / #playlist 存在）
//
// 退出码：0 = 通过，1 = 失败（打印失败原因）

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL_BASE = process.env.SMOKE_URL || 'https://donttalk.vercel.app';
const PATH = '/music';
const TIMEOUT_MS = 25_000;

const FORBIDDEN_PATTERNS = [
    { name: 'music-player null-binding', re: /Cannot read properties of null \(reading 'addEventListener'\)/ },
    { name: 'visualizer t-undefined',    re: /t is not defined/ },
    { name: '404 on donttalk assets',     re: /GET.*donttalk\.vercel\.app\/.* 404/ },
];

function nowTag() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

(async () => {
    const cacheBuster = `?v=smoke-${Date.now()}`;
    const target = `${URL_BASE}${PATH}${cacheBuster}`;
    console.log(`[smoke] target: ${target}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (compatible; DSH-Smoke/1.0) +https://dontalk.vercel.app',
    });
    const page = await context.newPage();

    const consoleEvents = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
        consoleEvents.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', (err) => {
        pageErrors.push(err.message);
    });
    page.on('requestfailed', (req) => {
        // 忽略 favicon 之类无关失败
        if (!/\/favicon|\/sw\.js|\/manifest/.test(req.url())) {
            failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
        }
    });
    page.on('response', (resp) => {
        if (resp.status() >= 400 && resp.url().includes('dontalk.vercel.app')) {
            failedRequests.push({ url: resp.url(), status: resp.status() });
        }
    });

    try {
        const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        if (!resp || !resp.ok()) {
            throw new Error(`navigation failed: status=${resp?.status()}`);
        }

        // 让 visualizer 跑几帧确认无 _loop 异常
        await page.waitForTimeout(2000);

        // 检查关键 DOM 元素
        const hasPlayer = await page.locator('#audio-player').count();
        const hasPlaylist = await page.locator('#playlist').count();
        const domOK = hasPlayer > 0 && hasPlaylist > 0;

        // 检查 audio src 是否绑定（playTrack 会设置 src）
        const audioSrc = await page.locator('#audio-player').getAttribute('src');

        // 截一张图作为证据
        const shotPath = `smoke/smoke-${nowTag()}.png`;
        await page.screenshot({ path: shotPath, fullPage: false });
        const consoleDumpPath = `smoke/smoke-${nowTag()}.log`;
        writeFileSync(
            consoleDumpPath,
            JSON.stringify({ consoleEvents, pageErrors, failedRequests, audioSrc, domOK }, null, 2),
            'utf8',
        );

        const violations = [];
        for (const ev of consoleEvents) {
            for (const fp of FORBIDDEN_PATTERNS) {
                if (fp.re.test(ev.text)) {
                    violations.push({ source: fp.name, type: ev.type, text: ev.text });
                }
            }
        }
        for (const msg of pageErrors) {
            for (const fp of FORBIDDEN_PATTERNS) {
                if (fp.re.test(msg)) {
                    violations.push({ source: fp.name, type: 'pageerror', text: msg });
                }
            }
        }
        // 404 也算违规
        for (const fr of failedRequests) {
            if (fr.status === 404 && /dontalk\.vercel\.app\/.*\.(js|css)/.test(fr.url)) {
                violations.push({ source: '404 on donttalk assets', type: 'response', text: fr.url });
            }
        }

        const summary = {
            target,
            domOK,
            audioSrc,
            consoleTotal: consoleEvents.length,
            pageErrors: pageErrors.length,
            failedRequests: failedRequests.length,
            violations,
            shot: shotPath,
            consoleDump: consoleDumpPath,
        };
        console.log('[smoke] summary:', JSON.stringify(summary, null, 2));

        if (!domOK) {
            console.error(`[smoke] FAIL: #audio-player or #playlist missing on ${target}`);
            process.exitCode = 1;
        } else if (violations.length > 0) {
            console.error(`[smoke] FAIL: ${violations.length} violation(s):`);
            for (const v of violations) console.error(`  - [${v.source}] ${v.text}`);
            process.exitCode = 1;
        } else {
            console.log('[smoke] PASS — no regressions detected');
        }
    } catch (err) {
        console.error(`[smoke] ERROR: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
