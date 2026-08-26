"""
stock-app 全按鈕系統測試 v3 — 直接 navigate 到每個 URL
"""
import os
import re
import time
import json
from playwright.sync_api import sync_playwright

OUT = "D:\\project\\helpers\\audit"
os.makedirs(OUT, exist_ok=True)

results = []
console_all = []


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


PAGES = [
    ("index-股票版", "/stock-app/index.html"),
    ("sitemap-網站地圖", "/stock-app/sitemap.html"),
    ("etf-ETF版", "/stock-app/etf.html"),
    ("warming-升溫區", "/stock-app/warming.html"),
    ("exdiv-除權息", "/stock-app/exdiv.html"),
    ("macro-總經數據", "/stock-app/macro.html"),
    ("signal-filter-股票訊號篩選", "/stock-app/signal-filter.html"),
    ("etf-filter-ETF訊號篩選", "/stock-app/etf-filter.html"),
    ("etf_holdings-ETF共同持股", "/stock-app/etf_holdings.html"),
    ("etf_holdings_tracker-ETF持股變動", "/stock-app/etf_holdings_tracker.html"),
    ("sold-too-early-賣飛股票", "/stock-app/sold-too-early.html"),
    ("uptrend-watch-上升趨勢", "/stock-app/uptrend-watch.html"),
    ("heatmap-漲跌市值", "/stock-app/heatmap.html"),
    ("price-compare-走勢比較", "/stock-app/price-compare.html"),
    ("rebalance-資產再平衡", "/stock-app/rebalance.html"),
    ("ai-capex-AI資本支出", "/stock-app/ai-capex.html"),
    ("revenue-月營收", "/stock-app/revenue.html"),
    ("conference-法說會", "/stock-app/conference.html"),
    ("admin_logs-系統Log", "/stock-app/admin_logs.html"),
    ("stock-damo-股票DAMO", "/stock-app/stock-damo.html"),
]

INLINE_TARGETS = [
    # (page, button selector, name)
    ("index", "button.index-tab-btn:has-text('加權')", "加權"),
    ("index", "button.index-tab-btn:has-text('櫃買')", "櫃買"),
    ("index", "#btnScan", "全部掃描"),
    ("index", ".fib-toggle-btn:has-text('Fib')", "Fib 回檔線"),
    ("index", ".fib-toggle-btn:has-text('量價')", "量價圖"),
    ("index", ".fib-toggle-btn:has-text('MACD')", "MACD"),
    ("index", ".timeframe-btns button:has-text('2M')", "2M"),
    ("index", ".timeframe-btns button:has-text('4M')", "4M"),
    ("index", ".timeframe-btns button:has-text('1Y')", "1Y"),
    ("index", "button:has-text('啟動盤中監控')", "啟動盤中監控"),
    ("index", "button:has-text('操盤報表')", "操盤報表"),
    ("index", "button:has-text('收件者管理')", "收件者管理"),
    ("index", "button:has-text('Marker 歷史')", "Marker 歷史"),
    ("index", "button:has-text('畫圖')", "畫圖"),
    ("index", "button:has-text('事件標記')", "事件標記"),
]


def test_page(browser, name, path):
    """訪問單一頁面，截圖、抓 console errors"""
    log(f"=== {name} ({path}) ===")
    ctx2 = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx2.new_page()
    page_errs = []
    req_fails = []
    page.on("console", lambda msg, ne=page_errs: ne.append(f"[{msg.type}] {msg.text[:200]}") if msg.type in ("error",) else None)
    page.on("pageerror", lambda err, ne=page_errs: ne.append(f"[pageerror] {str(err)[:200]}"))
    page.on("requestfailed", lambda req, rf=req_fails: rf.append(f"[reqfail] {req.url}") if "/donttalk.vercel.app" in req.url else None)

    try:
        r = page.goto(f"https://donttalk.vercel.app{path}", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(4000)  # 等 JS 跑完
        status = r.status if r else "?"

        # 抓關鍵 elements
        info = page.evaluate("""
            () => {
                var out = {
                    title: document.title,
                    h1: (document.querySelector('h1')||{}).innerText || '',
                    bodyText: (document.body.innerText || '').slice(0, 200),
                    emptyDash: (document.body.innerText.match(/-{3,}/g) || []).length,
                    loadingOverlay: document.getElementById('loadingOverlay')?.style?.display || 'unknown',
                    hasCanvas: !!document.querySelector('canvas'),
                    hasChart: typeof candleSeries !== 'undefined' && candleSeries,
                };
                return JSON.stringify(out);
            }
        """)
        ss = f"{OUT}\\page_{re.sub(r'[^\\w]', '_', name)}.png"
        page.screenshot(path=ss, full_page=False)

        # Count errors
        err_count = len(page_errs)
        req_fail_count = len(req_fails)
        unique_errs = list(set(page_errs))[:5]

        log(f"  status={status}  page_errs={err_count}  req_fails={req_fail_count}")
        log(f"  info: {info[:200]}")
        if unique_errs:
            for e in unique_errs[:3]:
                log(f"    err: {e[:150]}")
        log(f"  screenshot: {ss}")

        results.append({
            "name": name,
            "path": path,
            "status": status,
            "info": info,
            "page_errors": unique_errs,
            "req_fails": list(set(req_fails))[:10],
            "screenshot": ss,
        })
    except Exception as e:
        log(f"  [ERR] {e}")
        try:
            page.screenshot(path=f"{OUT}\\err_{re.sub(r'[^\\w]', '_', name)}.png", full_page=False)
        except:
            pass
        results.append({"name": name, "path": path, "ok": False, "errors": [str(e)]})
    finally:
        ctx2.close()


def test_inline_on_index(browser):
    """在 index 頁測各個 inline 按鈕"""
    log("=== Test inline buttons on index ===")
    ctx2 = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx2.new_page()
    errs = []
    page.on("console", lambda msg, ne=errs: ne.append(f"[{msg.type}] {msg.text[:200]}") if msg.type == "error" else None)
    page.on("pageerror", lambda err, ne=errs: ne.append(f"[pageerror] {str(err)[:200]}"))

    try:
        page.goto("https://donttalk.vercel.app/stock-app/index.html", wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(4000)
        ss = f"{OUT}\\inline_baseline.png"
        page.screenshot(path=ss, full_page=False)
        log(f"  baseline: {ss}")

        for page_name, sel, name in INLINE_TARGETS:
            log(f"  Test: {name} ({sel})")
            try:
                els = page.locator(sel)
                count = els.count()
                if count == 0:
                    log(f"    [SKIP] not found")
                    results.append({"name": f"inline-{name}", "ok": False, "errors": ["not found"]})
                    continue
                # Find visible
                clicked = False
                for i in range(count):
                    if els.nth(i).is_visible():
                        try:
                            els.nth(i).click(timeout=2000)
                            clicked = True
                            log(f"    clicked (idx {i})")
                            break
                        except:
                            pass
                if not clicked:
                    log(f"    [SKIP] no visible")
                    continue
                page.wait_for_timeout(2500)
                ss = f"{OUT}\\inline_{re.sub(r'[^\\w]', '_', name)}.png"
                page.screenshot(path=ss, full_page=False)
                log(f"    screenshot: {ss}")
                results.append({"name": f"inline-{name}", "ok": True, "screenshot": ss})
            except Exception as e:
                log(f"    [ERR] {e}")
                results.append({"name": f"inline-{name}", "ok": False, "errors": [str(e)[:200]]})
    finally:
        ctx2.close()


def main():
    with sync_playwright() as p:
        log("Launching browser (headed)...")
        browser = p.chromium.launch(headless=False, args=["--no-sandbox"])

        # 1) 每個頁面 navigate
        for name, path in PAGES:
            test_page(browser, name, path)

        # 2) Inline 按鈕
        test_inline_on_index(browser)

        # Report
        log(f"\n=== Total: {len(results)} ===")
        ok = sum(1 for r in results if r.get("ok", True))
        log(f"OK: {ok} / {len(results)}")
        for r in results:
            status = "✓" if r.get("ok", True) else "✗"
            err = r.get("errors") or r.get("page_errors") or []
            err_summary = (" | " + "; ".join(err[:2])) if err else ""
            log(f"  [{status}] {r['name']:45s}{err_summary[:150]}")

        with open(f"{OUT}\\report.json", "w", encoding="utf-8") as f:
            json.dump({"results": results}, f, ensure_ascii=False, indent=2)
        log(f"Report: {OUT}\\report.json")

        log("Browser stays open 30s...")
        time.sleep(30)
        browser.close()
        log("Done.")


if __name__ == "__main__":
    main()
