# -*- coding: utf-8 -*-
"""Update tracks.json: change lyricsUrl to point to actual LRC files"""
import json, os, sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)

print('Total tracks:', len(data['tracks']))
print('Tracks with lyricsUrl:', sum(1 for t in data['tracks'] if t.get('lyricsUrl')))

# Use regex match on MP3 filename pattern
fix_patterns = [
    (r'^02_\u5144\u5f1f\u672c\u8272\.mp3$', '01_\u5144\u5f1f\u672c\u8272.lrc'),
    (r'^04_\u6c34\u6ce5\u68ee\u6797\.mp3$', '05_\u6c34\u6ce5\u68ee\u6797.lrc'),
    (r'^05_\u8d81\u73fe\u5728\.mp3$', '07_\u8d81\u73fe\u5728.lrc'),
    (r'^06_\u56de\u4e0d\u53bb\u7684\u590f\u5929\.mp3$', '09_\u56de\u4e0d\u53bb\u7684\u590f\u5929.lrc'),
    (r'^\u4e0d\u6b7b\u7684\u811a_\u71b1\u8840\u6416\u6f6e\.mp3$', '25_\u4e0d\u6b7b\u7684\u811a_\u71b1\u8840\u6416\u6f6e.lrc'),
]

print('Pattern 1:', fix_patterns[0][0])
print('Test mp3:', data['tracks'][0].get('url', '').replace('/music/', ''))
print('Test match:', bool(re.match(fix_patterns[0][0], data['tracks'][0].get('url', '').replace('/music/', ''))))

applied = 0
for t in data['tracks']:
    mp3_url = t.get('url', '')
    mp3_base = mp3_url.replace('/music/', '')
    for pattern, new_lrc in fix_patterns:
        if re.match(pattern, mp3_base):
            new_url = '/music/' + new_lrc
            old_url = t.get('lyricsUrl')
            if old_url != new_url:
                t['lyricsUrl'] = new_url
                print('FIX:', mp3_url, '-> LRC:', old_url, '->', new_url)
                applied += 1
            break

with open('astro/public/music/tracks.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Applied', applied, 'fixes')
