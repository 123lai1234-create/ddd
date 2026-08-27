"""
Fugle API Key 自動取得工具 v2 (unbuffered)
"""
import os
import sys
import re
import time
import json
import urllib.request
import urllib.error
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# 強制 unbuffered
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def verify_key(api_key: str) -> bool:
    log(f"Verifying API key {api_key[:8]}...{api_key[-4:]} against Fugle API...")
    req = urllib.request.Request(
        "https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/2330",
        headers={"Authorization": f"Bearer {api_key}", "User-Agent": "fugle-key-helper/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            inner = data.get("data", data)
            sym = inner.get("symbol", "?")
            name = inner.get("name", "?")
            price = inner.get("price", {}).get("close") or inner.get("closePrice") or inner.get("lastPrice") or "?"
            log(f"OK: API key VALID! Test: {sym} {name} 收盤 {price}")
            return True
    except urllib.error.HTTPError as e:
        log(f"FAIL: HTTP {e.code}: {e.reason}")
        return False
    except Exception as e:
        log(f"FAIL: {type(e).__name__}: {e}")
        return False


def main():
    log("===== Fugle API Key 自動取得工具 v2 =====")
    log("重要：瀏覽器開啟後請確認已登入 Fugle")

    with sync_playwright() as p:
        log("Launching Chromium (headed mode)...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()
        page.set_default_timeout(15000)

        log("[1/6] Navigating to https://developer.fugle.tw/docs/key/ ...")
        page.goto("https://developer.fugle.tw/docs/key/", wait_until="domcontentloaded")
        log(f"     Page title: {page.title()}")
        log(f"     Page URL: {page.url}")

        # 截圖確認目前狀態
        ss_path = "D:\\project\\helpers\\fugle-state-1-initial.png"
        page.screenshot(path=ss_path, full_page=True)
        log(f"     Screenshot saved: {ss_path}")

        # 等登入
        log("[2/6] Waiting for login (looking for 'API Key 清單')...")
        log("      >>> 請在彈出的 Chrome 視窗中登入 Fugle <<<")
        # 嘗試把視窗置頂（呼叫 Win32 SetWindowPos）
        try:
            import ctypes
            HWND_TOPMOST = -1
            SWP_NOMOVE = 0x0002
            SWP_NOSIZE = 0x0001
            SWP_SHOWWINDOW = 0x0040
            # 找 Chrome PID
            time.sleep(2)
            import subprocess
            ps_out = subprocess.check_output(['powershell', '-NoProfile', '-Command',
                "(Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'for Testing' } | Select-Object -First 1).MainWindowHandle"],
                timeout=5).decode().strip()
            if ps_out and ps_out != "0":
                hwnd = int(ps_out)
                ctypes.windll.user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
                log(f"      視窗已置頂 (hwnd={hwnd})")
        except Exception as e:
            log(f"      視窗置頂失敗（非必要）: {e}")
        try:
            page.wait_for_selector("text=API Key 清單", timeout=300000)
            log("     [OK] Logged in!")
        except PWTimeout:
            log("     [TIMEOUT] 'API Key 清單' 找不到，300 秒逾時")
            log("     檢查：1) 是否登入  2) 頁面是否有 API Key 清單")
            ss_path = "D:\\project\\helpers\\fugle-state-2-timeout.png"
            page.screenshot(path=ss_path, full_page=True)
            log(f"     Screenshot: {ss_path}")
            return

        time.sleep(1)

        # 砍掉所有現有 key
        log("[3/6] Deleting existing API keys...")
        for i in range(10):
            del_buttons = page.locator("button:has-text('刪除')")
            count = del_buttons.count()
            if count == 0:
                log(f"     No more keys to delete (after {i} attempts)")
                break
            log(f"     Attempt {i+1}: found {count} delete button(s), clicking first...")
            try:
                del_buttons.first.click(timeout=3000)
                time.sleep(0.5)
                # 看有沒有 confirm dialog
                for confirm_text in ["確定", "確認", "Delete", "OK", "是", "Yes"]:
                    confirm = page.locator(f"button:has-text('{confirm_text}')")
                    if confirm.count() > 0:
                        try:
                            confirm.first.click(timeout=2000)
                            log(f"        Clicked confirm '{confirm_text}'")
                            break
                        except:
                            pass
                time.sleep(1)
            except Exception as e:
                log(f"     Delete error: {e}")
                break

        time.sleep(1)
        ss_path = "D:\\project\\helpers\\fugle-state-3-after-delete.png"
        page.screenshot(path=ss_path, full_page=True)
        log(f"     Screenshot: {ss_path}")

        # 點「新增 API Key」
        log("[4/6] Clicking '新增 API Key'...")
        add_button = page.locator("button:has-text('新增 API Key')")
        if add_button.count() == 0:
            log("     [FAIL] Cannot find '新增 API Key' button")
            ss_path = "D:\\project\\helpers\\fugle-state-3b-no-add.png"
            page.screenshot(path=ss_path, full_page=True)
            log(f"     Screenshot: {ss_path}")
            return
        add_button.first.click()
        log("     Clicked '新增 API Key'")
        time.sleep(1)

        ss_path = "D:\\project\\helpers\\fugle-state-4-add-modal.png"
        page.screenshot(path=ss_path, full_page=True)
        log(f"     Screenshot (modal after add click): {ss_path}")

        # 填名字
        log("[5/6] Filling key name...")
        filled = False
        for sel in ["input[type='text']", "input[name='name']", "input.form-control", "input.modal-input", ".modal input", "input"]:
            inputs = page.locator(sel)
            if inputs.count() > 0:
                try:
                    inputs.first.fill("stock-app")
                    log(f"     Filled 'stock-app' in selector: {sel}")
                    filled = True
                    break
                except:
                    pass
        if not filled:
            log("     No input found, modal may skip name")

        time.sleep(0.5)
        ss_path = "D:\\project\\helpers\\fugle-state-5-after-fill.png"
        page.screenshot(path=ss_path, full_page=True)
        log(f"     Screenshot: {ss_path}")

        # 點確認/建立
        log("     Looking for submit button...")
        submitted = False
        for submit_text in ["確定", "建立", "新增", "Create", "OK", "確認", "Submit"]:
            submit = page.locator(f"button:has-text('{submit_text}')")
            if submit.count() > 0:
                try:
                    submit.first.click(timeout=2000)
                    log(f"     Clicked submit: '{submit_text}'")
                    submitted = True
                    break
                except:
                    pass
        if not submitted:
            log("     No submit button found, may have auto-submitted")

        time.sleep(3)  # 等 modal 出來
        ss_path = "D:\\project\\helpers\\fugle-state-6-after-submit.png"
        page.screenshot(path=ss_path, full_page=True)
        log(f"     Screenshot (after submit): {ss_path}")

        # 抓 UUID
        log("[6/6] Hunting for UUID in modal/dialog...")
        uuid_found = None
        for attempt in range(20):
            time.sleep(1)
            # 整頁文字
            try:
                body_text = page.locator("body").inner_text(timeout=2000)
                m = UUID_RE.search(body_text)
                if m:
                    uuid_found = m.group(0)
                    log(f"     Found UUID in body text: {uuid_found}")
                    break
            except:
                pass
            # input value
            for sel in ["input[readonly]", "input", "textarea"]:
                inputs = page.locator(sel)
                for i in range(inputs.count()):
                    try:
                        v = inputs.nth(i).input_value()
                        m = UUID_RE.search(v)
                        if m:
                            uuid_found = m.group(0)
                            log(f"     Found UUID in {sel}[{i}]: {uuid_found}")
                            break
                    except:
                        pass
                if uuid_found:
                    break
            # modal-specific
            for sel in [".modal-body", ".modal-content", "[role='dialog']"]:
                try:
                    text = page.locator(sel).first.inner_text(timeout=1000)
                    m = UUID_RE.search(text)
                    if m:
                        uuid_found = m.group(0)
                        log(f"     Found UUID in {sel}: {uuid_found}")
                        break
                except:
                    pass
            if uuid_found:
                break
            log(f"     attempt {attempt+1}/20...")

        if not uuid_found:
            log("[FAIL] UUID not found after 20 attempts")
            ss_path = "D:\\project\\helpers\\fugle-state-7-no-uuid.png"
            page.screenshot(path=ss_path, full_page=True)
            log(f"     Screenshot: {ss_path}")
            return

        log("")
        log("=" * 50)
        log(f"CAPTURED UUID: {uuid_found}")
        log("=" * 50)

        ok = verify_key(uuid_found)

        if ok:
            env_path = "D:\\project\\.fugle-key.json"
            with open(env_path, "w", encoding="utf-8") as f:
                json.dump({"api_key": uuid_found, "created": time.strftime("%Y-%m-%dT%H:%M:%S")}, f, indent=2)
            log(f"Saved to: {env_path}")
            log("")
            log(">>> 請把下面這行複製貼給 Mavis：")
            log(f">>> FUGLE_API_KEY={uuid_found}")
            log("")

            # 也寫成 .env format
            env_dot = "D:\\project\\.env.fugle"
            with open(env_dot, "w", encoding="utf-8") as f:
                f.write(f"FUGLE_API_KEY={uuid_found}\n")
            log(f"Also saved: {env_dot}")

        log("")
        log("Browser stays open 30s, close manually if needed")
        time.sleep(30)
        browser.close()
        log("Done.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Interrupted")
    except Exception as e:
        import traceback
        log(f"ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()
