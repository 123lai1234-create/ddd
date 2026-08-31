"""Debug title comparison"""
import json, os

with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)

print("Tracks in json:")
for i, t in enumerate(data['tracks']):
    title = t.get('title', '')
    print(f"  {i}: {title!r} (mp3: {t.get('url')!r}, lrc: {t.get('lyricsUrl')!r})")
    if '兄弟' in title or '水泥' in title or '趁' in title or '夏天' in title or '不死的' in title:
        print(f"    >>> MATCHED target: {title!r}")

print("\n\nExpected titles:")
for k in ['兄弟本色', '水泥森林', '趁現在', '回不去的夏天', '不死的腳_熱血搖滾']:
    print(f"  {k!r} bytes: {k.encode('utf-8')!r}")
