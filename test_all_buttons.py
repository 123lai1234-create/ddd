"""
批次測試 stock-app 所有頁面的按鈕，找出 bug 和沒資料的問題。
"""
import sys
import io
# 設定 stdout 為 UTF-8 以避免 cp950 編碼錯誤
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright
import json
import os
from datetime import datetime

PAGES = [
    "index.html",
    "dashboard.html",
    "etf.html",
    "signal-filter.html",
    "stock-damo-filter.html",
    "etf-filter.html",
    "uptrend-watch.html",
    "sold-too-early.html",
    "revenue.html",
    "conference.html",
    "admin_logs.html",
    "etf_holdings.html",
    "etf_holdings_tracker.html",
    "etf_holdings_pivot.html",
    "warming.html",
    "exdiv.html",
    "macro.html",
    "ai-capex.html",
    "heatmap.html",
    "price-compare.html",
    "rebalance.html",
]

BASE_URL = "https://donttalk.vercel.app/stock-app/"
SCREENSHOT_DIR = "d:/project/test_screenshots"
RESULTS_FILE = "d:/project/test_results.json"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def collect_interactive_elements(page):
    elements = []
    selectors = [
        "button:not([disabled])",
        "a[href]:not([href='#']):not([href=''])",
        "[role='button']:not([disabled])",
        "input[type='button']:not([disabled])",
        "input[type='submit']:not([disabled])",
    ]
    seen_texts = set()
    for sel in selectors:
        try:
            for el in page.query_selector_all(sel):
                if not el.is_visible():
                    continue
                text = (el.inner_text() or el.text_content() or "").strip()
                if not text or len(text) > 80:
                    text = el.get_attribute("aria-label") or el.get_attribute("title") or f"<{el.get_attribute('tag')}>"
                text = text.strip()[:60]
                if text in seen_texts:
                    continue
                seen_texts.add(text)
                elements.append({
                    "text": text,
                    "el": el,
                })
        except Exception:
            continue
    return elements


def test_page(browser, page_name):
    url = BASE_URL + page_name
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()

    console_errors = []
    page_errors = []
    failed_requests = []

    page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda err: page_errors.append(str(err)))
    page.on("requestfailed", lambda req: failed_requests.append(f"{req.url} - {req.failure}"))

    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(2500)

    safe_name = page_name.replace("/", "_").replace(".html", "")
    page.screenshot(path=f"{SCREENSHOT_DIR}/{safe_name}_initial.png", full_page=True)

    elements = collect_interactive_elements(page)

    results = {
        "page": page_name,
        "url": url,
        "screenshot_initial": f"{SCREENSHOT_DIR}/{safe_name}_initial.png",
        "console_errors": console_errors,
        "page_errors": page_errors,
        "failed_requests": failed_requests[:30],
        "elements_found": len(elements),
        "buttons_tested": [],
    }

    tested_count = 0
    for i, el_info in enumerate(elements):
        if tested_count >= 8:
            break
        try:
            text = el_info["text"]
            el = el_info["el"]

            href = el.get_attribute("href") or ""
            if href.startswith("http") and "donttalk" not in href:
                continue

            before_console = len(console_errors)

            try:
                el.click(timeout=3000)
            except Exception as e:
                results["buttons_tested"].append({"text": text, "click_ok": False, "error": str(e)[:80]})
                continue

            page.wait_for_timeout(700)

            new_errors = console_errors[before_console:]
            page.screenshot(path=f"{SCREENSHOT_DIR}/{safe_name}_click_{tested_count}.png", full_page=False)

            results["buttons_tested"].append({
                "text": text,
                "click_ok": True,
                "new_console_errors": new_errors[:3],
            })
            tested_count += 1

        except Exception as e:
            results["buttons_tested"].append({"text": el_info.get("text", "?"), "error": str(e)[:120]})

    ctx.close()
    return results


def main():
    all_results = []
    print(f"開始測試 {len(PAGES)} 個頁面...")
    print(f"時間：{datetime.now().isoformat()}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for i, page_name in enumerate(PAGES):
            print(f"\n[{i+1}/{len(PAGES)}] 測試 {page_name}...")
            try:
                result = test_page(browser, page_name)
                all_results.append(result)
                ce = len(result["console_errors"])
                pe = len(result["page_errors"])
                fr = len(result["failed_requests"])
                bt = result["elements_found"]
                print(f"   [OK] 元素 {bt} | Console {ce} | Page {pe} | FailedReq {fr}")
            except Exception as e:
                all_results.append({"page": page_name, "fatal_error": str(e)})
                print(f"   [FAIL] {e}")
        browser.close()

    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2, default=str)

    print(f"\n結果：{RESULTS_FILE}")
    print(f"截圖：{SCREENSHOT_DIR}/")
    print("="*60)
    print("問題摘要")
    print("="*60)
    for r in all_results:
        if r.get("fatal_error"):
            print(f"[LOAD_FAIL] {r['page']}: {r['fatal_error'][:80]}")
            continue
        issues = []
        if r["page_errors"]:
            issues.append(f"PageErr x{len(r['page_errors'])}")
        if r["console_errors"]:
            issues.append(f"ConsoleErr x{len(r['console_errors'])}")
        if r["failed_requests"]:
            issues.append(f"FailedReq x{len(r['failed_requests'])}")
        if issues:
            print(f"[ISSUE] {r['page']}: {', '.join(issues)}")
        else:
            print(f"[OK] {r['page']}")


if __name__ == "__main__":
    main()