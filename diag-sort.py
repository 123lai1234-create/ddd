"""Find short tracks to test lyrics sync faster"""
import json
d = json.load(open('astro/public/music/tracks.json', encoding='utf-8'))
lrc_tracks = [(i, t) for i, t in enumerate(d['tracks']) if t.get('lyricsUrl')]
lrc_tracks.sort(key=lambda x: x[1]['duration'])
print("Shortest LRC tracks:")
for i, t in lrc_tracks[:10]:
    print(f"  [{i}] {t['title']:30s}  {t['duration']}s  mp3={t['url']}  lrc={t['lyricsUrl']}")
