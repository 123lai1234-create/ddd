"""Check chart data via injected JS that exposes to window"""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()

    page.goto("https://donttalk.vercel.app/stock?v=4", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(20000)

    # 用 init script 注入
    page.add_script_tag(content="""
        window.__diag = {
            cand: typeof candleSeries,
            chart: typeof chart,
        };
        if (typeof candleSeries !== 'undefined' && candleSeries) {
            try { window.__diag.candData = candleSeries.data().length; } catch(e) { window.__diag.candErr = e.message; }
        }
        if (typeof chart !== 'undefined' && chart) {
            try {
                window.__diag.psRight = chart.priceScale('right').options();
                window.__diag.psLeft = chart.priceScale('left').options();
                window.__diag.seriesList = chart.series ? chart.series().map(s => s.seriesType ? s.seriesType() : 'unknown') : 'no-method';
            } catch(e) { window.__diag.chartErr = e.message; }
        }
    """)
    page.wait_for_timeout(2000)
    diag = page.evaluate("() => JSON.stringify(window.__diag)")
    print(f"Diag: {diag}")

    browser.close()
