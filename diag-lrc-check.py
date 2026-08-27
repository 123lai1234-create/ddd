"""Check which LRC URLs are 404 on production"""
import urllib.request, urllib.parse, json

with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    d = json.load(f)

results = []
for t in d['tracks']:
    if not t.get('lyricsUrl'):
        continue
    url = 'https://donttalk.vercel.app' + t['lyricsUrl']
    # URL encode the path components
    parts = urllib.parse.urlparse(url)
    encoded_path = urllib.parse.quote(parts.path)
    full = f'{parts.scheme}://{parts.netloc}{encoded_path}'
    try:
        req = urllib.request.Request(full, method='HEAD')
        r = urllib.request.urlopen(req, timeout=10)
        results.append((r.status, len(urllib.request.urlopen(full).read()), t['title'], t['lyricsUrl']))
    except urllib.error.HTTPError as e:
        results.append((e.code, 0, t['title'], t['lyricsUrl']))
    except Exception as e:
        results.append((-1, 0, t['title'], t['lyricsUrl']))

# Print summary
ok = [r for r in results if r[0] == 200]
bad = [r for r in results if r[0] != 200]
print(f'\nOK: {len(ok)}/{len(results)}')
print(f'BAD: {len(bad)}/{len(results)}')
if bad:
    print('\n--- 404 / failing LRCs ---')
    for status, size, title, url in bad:
        print(f'  {status}  title={title!r}  url={url!r}')

# Print all
print('\n--- All LRC URLs ---')
for status, size, title, url in results:
    marker = 'OK' if status == 200 else 'BAD'
    print(f'  {marker} {status}  size={size:>5d}  {url}')
