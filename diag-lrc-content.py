"""Pull deployed LRC + verify the binary search logic works on real data"""
import urllib.request, sys, json, re

sys.stdout.reconfigure(encoding='utf-8')

# Get a real LRC file
url = 'https://donttalk.vercel.app/music/03_%E4%B8%8D%E6%9C%8D%E8%BC%B8.lrc'
text = urllib.request.urlopen(url, timeout=10).read().decode('utf-8')
print(f"LRC size: {len(text)} bytes")
print("First 5 lines:")
for ln in text.split('\n')[:5]:
    print(f"  {ln!r}")

# Parse it like the deployed JS does
def parse_lrc(text):
    lines = text.split('\n')
    out = []
    tag_re = re.compile(r'\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]')
    meta_re = re.compile(r'^\[(ti|ar|al|length|by|offset|re|ve):', re.IGNORECASE)
    for raw in lines:
        line = raw.strip()
        if not line: continue
        if meta_re.match(line): continue
        times = []
        for m in tag_re.finditer(line):
            mm, ss, ms = int(m.group(1)), int(m.group(2)), int(m.group(3).ljust(3, '0')[:3]) if m.group(3) else 0
            times.append(mm*60 + ss + ms/1000)
        if not times: continue
        text_only = tag_re.sub('', line).strip()
        for t in times:
            out.append({'time': t, 'text': text_only})
    out.sort(key=lambda x: x['time'])
    return out

timed = parse_lrc(text)
print(f"\nParsed {len(timed)} timed lines")
print(f"First 5: {timed[:5]}")
print(f"Last 3: {timed[-3:]}")

# Binary search like findCurrentLyricLine
def find_idx(timed, current):
    lo, hi, idx = 0, len(timed)-1, -1
    while lo <= hi:
        mid = (lo+hi)>>1
        if timed[mid]['time'] <= current:
            idx = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return idx

print("\n=== Sync test at various currentTime ===")
for t in [0, 5, 10, 11, 30, 60, 90, 120, 180, 240]:
    idx = find_idx(timed, t)
    line = timed[idx]['text'] if idx >= 0 else 'NONE'
    print(f"  t={t:>3}s → idx={idx:>2} → '{line}'")
