"""Debug mp3 URL match"""
import json
with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)
for t in data['tracks']:
    if t.get('lyricsUrl'):
        print(f"MP3: {t['url']!r}")
        print(f"LRC: {t['lyricsUrl']!r}")
        print()
