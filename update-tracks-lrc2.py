"""Update tracks.json: set lyricsUrl for tracks that still have none - match by stripping prefix"""
import json, os, sys, re
sys.stdout.reconfigure(encoding='utf-8')

MUSIC_DIR = 'astro/public/music'
TRACKS_JSON = os.path.join(MUSIC_DIR, 'tracks.json')

# Get all LRC files - both raw basename and stripped basename
lrc_files = {}
for f in os.listdir(MUSIC_DIR):
    if f.endswith('.lrc'):
        raw = os.path.splitext(f)[0]
        # strip leading NN_ prefix
        stripped = re.sub(r'^\d+_', '', raw)
        lrc_files[raw] = f
        lrc_files[stripped] = f
print(f'LRC file keys (raw + stripped): {len(lrc_files)}')

# Load tracks.json
with open(TRACKS_JSON, encoding='utf-8') as f:
    data = json.load(f)

updated = 0
for t in data['tracks']:
    if t.get('lyricsUrl'):
        continue
    if not t.get('url'):
        continue
    mp3_raw = os.path.splitext(t['url'].replace('/music/', ''))[0]
    mp3_stripped = re.sub(r'^\d+_', '', mp3_raw)
    lrc_name = lrc_files.get(mp3_raw) or lrc_files.get(mp3_stripped)
    if lrc_name:
        new_url = '/music/' + lrc_name
        t['lyricsUrl'] = new_url
        updated += 1
        print(f'  {t["title"]}: -> {new_url}')

with open(TRACKS_JSON, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'\nUpdated {updated} tracks')
