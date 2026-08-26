"""Debug chart - 抓 stock-app 載入 K 線時的 console errors + 抓 candleSeries 狀態"""
import os
import time
import json
from playwright.sync_api import sync_playwright

OUT = "D:\\project\\helpers\\debug"
os.makedirs(OUT, exist_ok=True)

def log(m): print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)

with sync_playwright() as p:
    log("Launching browser...")
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()

    all_msgs = []
    page.on("console", lambda m: all_msgs.append(f"[{m.type}] {m.text[:500]}"))
    page.on("pageerror", lambda e: all_msgs.append(f"[pageerror] {str(e)[:500]}"))

    log("Navigating to https://donttalk.vercel.app/stock ...")
    page.goto("https://donttalk.vercel.app/stock", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)  # 等 K 線載入

    # 抓 candleSeries 狀態
    log("Inspecting chart state...")
    state = page.evaluate("""
        () => {
            try {
                var out = {
                    hasChart: typeof chart !== 'undefined' && chart,
                    hasCandleSeries: typeof candleSeries !== 'undefined' && candleSeries,
                    chartVersion: typeof LightweightCharts !== 'undefined' ? LightweightCharts.version : 'no-lib',
                };
                if (candleSeries) {
                    try {
                        out.candleDataLen = candleSeries.data ? candleSeries.data().length : (candleSeries._internal__dataList ? candleSeries._internal__dataList.length : 'unknown');
                        out.candleDataFirst = candleSeries.dataByIndex ? (function(){
                            var d = candleSeries.dataByIndex(0);
                            return d ? JSON.stringify(d).slice(0,200) : 'null';
                        })() : 'no-method';
                        out.candleDataLast = candleSeries.dataByIndex ? (function(){
                            var d = candleSeries.dataByIndex(candleSeries.dataByIndex.length || 0);
                            return d ? JSON.stringify(d).slice(0,200) : 'null';
                        })() : 'no-method';
                    } catch(e) { out.candleErr = e.message; }
                }
                if (chart && chart.priceScale) {
                    try {
                        out.priceScales = {
                            right: { autoScale: chart.priceScale('right').options().autoScale, visible: chart.priceScale('right').options().visible },
                            left: { autoScale: chart.priceScale('left').options().autoScale, visible: chart.priceScale('left').options().visible },
                            vol: { autoScale: chart.priceScale('vol').options().autoScale, visible: chart.priceScale('vol').options().visible },
                        };
                    } catch(e) { out.psErr = e.message; }
                }
                return JSON.stringify(out);
            } catch(e) { return 'ERR: ' + e.message; }
        }
    """)
    log(f"Chart state: {state}")

    # Screenshot
    page.screenshot(path=f"{OUT}\\01-after-load.png", full_page=False)
    log(f"Screenshot: {OUT}\\01-after-load.png")

    # Filter msgs
    log("")
    log(f"=== ALL CONSOLE MESSAGES ({len(all_msgs)}) ===")
    seen = set()
    for m in all_msgs:
        key = m[:100]
        if key in seen: continue
        seen.add(key)
        log(f"  {m[:300]}")

    # Also check fetch /api/stock/2330 from inside the page
    log("")
    log("=== Re-fetch /api/stock/2330 from inside page ===")
    api_state = page.evaluate("""
        async () => {
            try {
                var r = await fetch('/api/stock/2330?days=120&_=' + Date.now());
                var j = await r.json();
                return JSON.stringify({
                    status: r.status,
                    source: j.source,
                    count: j.count || (j.candles ? j.candles.length : 0),
                    firstCandle: j.candles ? j.candles[0] : null,
                    lastCandle: j.candles ? j.candles[j.candles.length-1] : null,
                    hasMa: !!j.ma,
                    hasMarkers: !!j.markers,
                    hasCapital: !!j.capital,
                    hasFinancial: !!j.financial,
                    hasIncome: !!j.income,
                    keys: Object.keys(j),
                });
            } catch(e) { return 'ERR: ' + e.message; }
        }
    """)
    log(f"API state: {api_state}")

    # 點 1Y 觸發 render
    log("")
    log("=== Click 1Y to trigger render ===")
    try:
        page.locator("button:has-text('1Y')").first.click()
        page.wait_for_timeout(3000)
        page.screenshot(path=f"{OUT}\\02-1y.png", full_page=False)
        log("Screenshot: 02-1y.png")
    except Exception as e:
        log(f"click 1Y err: {e}")

    # 再次檢查 chart
    state2 = page.evaluate("""
        () => {
            try {
                if (typeof candleSeries === 'undefined' || !candleSeries) return 'no-candleSeries';
                var d = candleSeries.data ? candleSeries.data() : null;
                return JSON.stringify({
                    len: d ? d.length : 0,
                    first: d && d[0] ? {t: d[0].time, o: d[0].open, c: d[0].close} : null,
                    last: d && d.length > 0 ? {t: d[d.length-1].time, o: d[d.length-1].open, c: d[d.length-1].close} : null,
                });
            } catch(e) { return 'ERR: ' + e.message; }
        }
    """)
    log(f"After 1Y - candle data: {state2}")

    browser.close()
    log("Done.")
