"""Check which tracks have which lyricsUrl, and test if LRC fetch works in browser"""
import json
d = json.load(open('astro/public/music/tracks.json', encoding='utf-8'))

# Find tracks with parens (優化版)
for i, t in enumerate(d['tracks']):
    title = t['title']
    if '優化版' in title or i < 5:
        print(f"[{i}] title={title!r}")
        print(f"     url={t['url']!r}")
        print(f"     lyricsUrl={t.get('lyricsUrl')!r}")
        print()
