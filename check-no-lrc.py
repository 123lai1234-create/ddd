import json, sys
sys.stdout.reconfigure(encoding='utf-8')
with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)
no_lrc = [t for t in data['tracks'] if not t.get('lyricsUrl')]
print(f'Without LRC: {len(no_lrc)}')
for t in no_lrc:
    title = t.get('title', '')
    url = t.get('url', '')
    print(f'  title={title!r}  url={url!r}')
