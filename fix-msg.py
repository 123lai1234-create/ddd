"""Fix the specific message line that has encoding issues"""
path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    text = f.read().decode('utf-8')

# Find the line with the broken message
old = 'message: "uptrend_watch 閮?憭?嚗?蝻?watchlist / market_price_bars?,'
new = 'message: "uptrend_watch 計算失敗（可能缺 watchlist / market_price_bars 資料）",'

# Try a fuzzy match
import re
# The pattern: starts with message: "uptrend_watch
if old in text:
    text = text.replace(old, new)
    print('Replaced exactly')
else:
    # Find by partial match
    pat = re.compile(r'message:\s*"uptrend_watch[^"]+",')
    matches = pat.findall(text)
    print(f'Found {len(matches)} matching lines')
    for m in matches:
        print(f'  {m!r}')
    if matches:
        text = pat.sub('message: "uptrend_watch 計算失敗（可能缺 watchlist / market_price_bars 資料）",', text)
        print('Replaced by regex')

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))

import subprocess
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
if result.returncode == 0:
    print('OK')
else:
    print(f'STILL: {(result.stderr or "")[:200]}')
