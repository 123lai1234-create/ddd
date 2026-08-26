"""Zoom into chart to see if candlesticks are there"""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()

    # 從 page source 抓 chart 結構
    page.goto("https://donttalk.vercel.app/stock?v=3", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(20000)

    # Get candle data from chart
    result = page.evaluate("""
        () => {
            try {
                var arr = window.candleSeries ? window.candleSeries.data() : null;
                if (!arr && typeof candleSeries !== 'undefined' && candleSeries) {
                    arr = candleSeries.data();
                }
                return JSON.stringify({
                    found: !!arr,
                    len: arr ? arr.length : 0,
                    first: arr && arr[0] ? {t: arr[0].time, o: arr[0].open, c: arr[0].close, h: arr[0].high, l: arr[0].low} : null,
                    last: arr && arr.length > 0 ? {t: arr[arr.length-1].time, o: arr[arr.length-1].open, c: arr[arr.length-1].close, h: arr[arr.length-1].high, l: arr[arr.length-1].low} : null,
                });
            } catch(e) { return 'ERR: ' + e.message; }
        }
    """)
    print(f"Chart data: {result}")

    # Screenshot zoomed into chart area
    page.screenshot(path="D:\\project\\helpers\\debug\\05-chart-zoom.png",
                    clip={"x": 350, "y": 100, "width": 700, "height": 700})
    print("Screenshot 05-chart-zoom.png saved")

    browser.close()
