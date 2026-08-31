import re, json, sys
sys.stdout.reconfigure(encoding='utf-8')
with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)
patterns = [
    (r'^02_兄弟本色\.mp3$', '01_兄弟本色.lrc'),
    (r'^04_水泥森林\.mp3$', '05_水泥森林.lrc'),
    (r'^05_趁現在\.mp3$', '07_趁現在.lrc'),
    (r'^06_回不去的夏天\.mp3$', '09_回不去的夏天.lrc'),
    (r'^不死的腳_熱血搖滾\.mp3$', '25_不死的腳_熱血搖滾.lrc'),
]
for t in data['tracks']:
    mp3_url = t.get('url', '')
    mp3_base = mp3_url.replace('/music/', '')
    for pattern, new_lrc in patterns:
        if re.match(pattern, mp3_base):
            print('MATCH:', mp3_url, '->', new_lrc)
