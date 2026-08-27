"""Fix all 'uptrend_watch' message lines"""
import re
path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    text = f.read().decode('utf-8')

# Match any line starting with `message: "uptrend_watch` and ending with `"` on same line
pat = re.compile(r'message:\s*"uptrend_watch[^"]*",')
text_new = pat.sub('message: "uptrend_watch 計算失敗（可能缺 watchlist / market_price_bars 資料）",', text)
print(f'Replaced: {text.count("uptrend_watch") - text_new.count("uptrend_watch")} occurrences')

with open(path, 'wb') as f:
    f.write(text_new.encode('utf-8'))

import subprocess
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
if result.returncode == 0:
    print('OK')
else:
    print(f'STILL: {(result.stderr or "")[:200]}')
