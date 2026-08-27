"""Validate LRC files parse correctly"""
import re, os, json

d = json.load(open('astro/public/music/tracks.json', encoding='utf-8'))
music_dir = 'astro/public/music'

for t in d['tracks']:
    if not t.get('lyricsUrl'):
        continue
    url = t['lyricsUrl']
    fname = url.replace('/music/', '')
    path = os.path.join(music_dir, fname)
    if not os.path.exists(path):
        print(f"MISSING: {fname}")
        continue
    text = open(path, encoding='utf-8').read()
    tag_re = r'\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]'
    matches = re.findall(tag_re, text)
    if not matches:
        print(f"NO TIME TAGS: {fname}")
        continue
    times = []
    for m in matches:
        mm, ss, ms = m[0], m[1], m[2] or '0'
        times.append(int(mm)*60 + int(ss) + int(ms.ljust(3, '0')[:3])/1000)
    if not all(times[i] <= times[i+1] for i in range(len(times)-1)):
        print(f"UNSORTED: {fname}")
    last_time = times[-1]
    song_duration = t['duration']
    if last_time > song_duration + 5:
        print(f"OVERFLOW: {fname}  LRC ends at {last_time:.1f}s but song is {song_duration}s")

print("\nAll LRC files validated.")
