#!/usr/bin/env python3
"""Seed markers DB with diverse stocks from warming_zone_scan.

Generates realistic marker_text based on each stock's actual MA state,
matching the format of existing 2330 markers:
  "站上三均線 + 5日/20日漲幅 {g5}%/{g20}%"
"""
import sys, json, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

API = 'https://donttalk-catchall.onrender.com'

def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': 'seed-markers/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def post(url, body, timeout=30):
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST',
        headers={'Content-Type': 'application/json', 'User-Agent': 'seed-markers/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

# 1) Fetch warming_zone_scan (already cached, fast second hit)
print('Fetching warming_zone_scan...')
wz = fetch(f'{API}/api/warming_zone_scan', timeout=120)
items = wz.get('items') or []
print(f'  Got {len(items)} items')

# 2) Filter to ones that actually hit 3 MAs (站上三均線 condition)
qualified = [it for it in items if it.get('cond1') and it.get('cond2') and it.get('cond3')]
print(f'  {len(qualified)} hit all three MA conditions')

# 3) For each, build a marker_text matching existing format
def fmt_marker(it):
        g5 = it.get('gain_5d_pct')
        g20 = it.get('gain_20d_pct')
        conds = []
        if it.get('cond1'): conds.append('MA5')
        if it.get('cond2'): conds.append('MA10')
        if it.get('cond3'): conds.append('MA20')
        if it.get('cond4'): conds.append('量增')
        if it.get('cond5'): conds.append('轉強')
        head = '站上三均線' if len(conds) >= 3 else f"通過{','.join(conds) or '條件'}"
        gain = ''
        if isinstance(g5, (int, float)) and isinstance(g20, (int, float)):
            gain = f' + 5日/20日漲幅 {g5:.2f}%/{g20:.2f}%'
        return head + gain

# 4) POST each code's marker individually (batch endpoint is per-code)
ok, fail = 0, 0
for it in qualified:
    code = it['code']
    text = fmt_marker(it)
    body = {
        'code': code,
        'items': [{
            'time': None,  # server defaults to today if invalid
            'text': text,
            'source': 'event',
        }],
    }
    try:
        resp = post(f'{API}/api/markers/record', body, timeout=15)
        ok += 1
        print(f'  ✓ {code} {it.get("name","")}: {text[:50]}')
    except urllib.error.HTTPError as e:
        fail += 1
        body_text = e.read().decode('utf-8', errors='replace')[:200]
        print(f'  ✗ {code}: HTTP {e.code} {body_text}')
    except Exception as e:
        fail += 1
        print(f'  ✗ {code}: {type(e).__name__} {str(e)[:100]}')

print()
print(f'Done: {ok} ok, {fail} fail')