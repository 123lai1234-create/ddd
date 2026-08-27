import json, os
d = json.load(open('astro/public/music/tracks.json', encoding='utf-8'))
lrc_tracks = [t for t in d['tracks'] if t.get('lyricsUrl')]
print(f'total tracks: {len(d["tracks"])}')
print(f'with lyricsUrl: {len(lrc_tracks)}')

# Check each LRC file exists
print('\n--- File existence check ---')
music_dir = 'astro/public/music'
for t in lrc_tracks:
    url = t['lyricsUrl']
    # Strip /music/ prefix
    filename = url.replace('/music/', '') if url.startswith('/music/') else url
    full = os.path.join(music_dir, filename)
    exists = os.path.exists(full)
    sz = os.path.getsize(full) if exists else 0
    marker = 'OK' if exists and sz > 50 else 'MISSING/TINY'
    print(f'{marker:14s} {sz:6d} {filename}')
