"""Fix all mojibake patterns in catchall.mjs based on common Chinese stock-related strings"""
import re, sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8')

# Known fixes
fixes = [
    # The operatorOk header (already fixed but might have remnants)
    ('//   ?�者都沒設 ??完全?��?（fail-closed）�?function operatorOk(provided, request) {',
     'function operatorOk(provided, request) {'),
    # Line 242 - stock names
    ('name: "?��???, ticker: "2330.TW"', 'name: "台積電", ticker: "2330.TW"'),
    ('name: "?�發�?, ticker: "2454.TW"', 'name: "聯發科", ticker: "2454.TW"'),
    ('name: "鴻海",   ticker: "2317.TW"', 'name: "鴻海",   ticker: "2317.TW"'),
    ('name: "?�大?�灣50", ticker: "0050.TW"', 'name: "元大台灣50", ticker: "0050.TW"'),
    # Line 305
    ('market_cap_?? null', 'market_cap: null'),
    # Other common patterns
    ('此股票�???K 線', '此股票沒有 K 線'),
    ('??market_price_bars', '進 market_price_bars'),
    ('??stock watchlist', '股票 watchlist'),
    ('??(stock watchlist)', '股票 watchlist'),
    ('??你�? IP', '白名單 IP'),
    ('??從�??�訪?', '從瀏覽器帶'),
    ('??完全?��?', '完全拒絕'),
    ('??cache stuck on polish-final version', 'cache stuck on polish-final version'),
    ('?��? IP', '加 IP'),
    ('?? +', ' allowlist +'),
    ('（任一?��??�可�?', '（任一通過即可）'),
    ('?��???', ' allowlist'),
    ('?��??', '白名單 IP'),
    ('?�選密碼', '可選密碼'),
    ('??mega edge-runtime router', '— mega edge-runtime router'),
    ('Vercel edge sets x-forwarded-for (?��??��?，第一?��?是 client IP)',
     'Vercel edge sets x-forwarded-for (IP 列表，第一個是 client IP)'),
    ('x-real-ip ??fallback', 'x-real-ip 是 fallback'),
    ('??poll_data', '用 poll_data'),
    ('??FinMind', '用 FinMind'),
    ('??a poll', '用 a poll'),
    ('CORS (?)', 'CORS (CORS_ORIGIN)'),
    ('CORS_ORIGIN ??CSV', 'CORS_ORIGIN 是 CSV'),
    ('allow ??逗號分', 'allow 用逗號分'),
    ('??全 ?', '全 ?'),
    ('??a', ''),  # catchall
    ('??', ''),    # generic removal
    ('\ufffd', ''),  # replacement char
]

# Apply fixes
applied = 0
for old, new in fixes:
    if old in text:
        count = text.count(old)
        text = text.replace(old, new)
        print(f'Fixed {count}x: {old[:40]!r} -> {new[:40]!r}')
        applied += count

# Remove any remaining \ufffd
if '\ufffd' in text:
    remaining = text.count('\ufffd')
    text = text.replace('\ufffd', '')
    print(f'Removed {remaining} replacement chars')
    applied += remaining

print(f'\nTotal fixes applied: {applied}')

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))

# Verify
import subprocess
result = subprocess.run(['node', '-c', path], capture_output=True, text=True)
if result.returncode == 0:
    print('\n✓ node -c passed!')
else:
    print(f'\n✗ Still has errors: {result.stderr[:200]}')
