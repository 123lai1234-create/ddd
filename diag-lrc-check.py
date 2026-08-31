"""Check all LRC URLs return 200 (using urllib.request with proper encoding)"""
import json, urllib.request, urllib.parse, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)

ok = 0
bad = []
for t in data['tracks']:
    if not t.get('lyricsUrl'):
        continue
    # URL-encode the path part
    path = t['lyricsUrl']  # like /music/01_兄弟本色.lrc
    # split into segments and encode each
    parts = path.split('/')
    encoded_parts = [urllib.parse.quote(p) for p in parts]
    encoded_path = '/'.join(encoded_parts)
    url = 'https://donttalk.vercel.app' + encoded_path
    try:
        req = urllib.request.Request(url)
        r = urllib.request.urlopen(req, timeout=10)
        body = r.read()
        if r.status == 200 and len(body) > 50:
            ok += 1
        else:
            bad.append((t['title'], url, r.status, len(body)))
    except Exception as e:
        bad.append((t['title'], url, str(e)[:80], 0))

print(f'OK: {ok}')
print(f'BAD: {len(bad)}')
for title, url, err, size in bad:
    print(f'  {title}: {url}  ({err}, {size} bytes)')
