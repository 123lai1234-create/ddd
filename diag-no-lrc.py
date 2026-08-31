"""Check tracks without LRC and see what fallback options we have"""
import json
with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total: {len(data["tracks"])}')
with_lrc = [t for t in data['tracks'] if t.get('lyricsUrl')]
without_lrc = [t for t in data['tracks'] if not t.get('lyricsUrl')]
print(f'with LRC: {len(with_lrc)}')
print(f'without LRC: {len(without_lrc)}')

print('\n=== Tracks without LRC ===')
for i, t in enumerate(data['tracks']):
    if not t.get('lyricsUrl'):
        print(f'  {i}: {t.get("title")!r} (album: {t.get("album")!r}, artist: {t.get("artist")!r})')
