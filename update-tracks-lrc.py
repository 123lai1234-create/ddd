"""Update tracks.json: set lyricsUrl to point to the new auto-generated LRC files"""
import json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

MUSIC_DIR = 'astro/public/music'
TRACKS_JSON = os.path.join(MUSIC_DIR, 'tracks.json')

# Get all LRC files
lrc_files = {}
for f in os.listdir(MUSIC_DIR):
    if f.endswith('.lrc'):
        lrc_files[os.path.splitext(f)[0]] = f
print(f'LRC files: {len(lrc_files)}')

# Load tracks.json
with open(TRACKS_JSON, encoding='utf-8') as f:
    data = json.load(f)

updated = 0
for t in data['tracks']:
    if not t.get('url'):
        continue
    mp3_base = os.path.splitext(t['url'].replace('/music/', ''))[0]
    # Try exact match first
    if mp3_base in lrc_files:
        new_url = '/music/' + lrc_files[mp3_base]
        if t.get('lyricsUrl') != new_url:
            t['lyricsUrl'] = new_url
            updated += 1
            print(f'  {t["title"]}: -> {new_url}')

with open(TRACKS_JSON, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'\nUpdated {updated} tracks')
