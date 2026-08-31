import re, json, sys
sys.stdout.reconfigure(encoding='utf-8')
with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)
pat = re.compile(r'^02_兄弟本色\.mp3$')
for t in data['tracks']:
    mp3 = t.get('url', '').replace('/music/', '')
    if pat.match(mp3):
        print('FOUND:', mp3)
    if '兄弟' in mp3:
        print('  has 兄弟:', mp3, 'pat match:', bool(pat.match(mp3)))
