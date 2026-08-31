"""Check what track 0's lyrics field looks like in production tracks.json"""
import json, urllib.request
r = urllib.request.urlopen('https://donttalk.vercel.app/music/tracks.json')
data = json.loads(r.read().decode('utf-8'))

t0 = data['tracks'][0]
print(f"Track 0:")
print(f"  title: {t0['title']!r}")
print(f"  url: {t0['url']!r}")
print(f"  lyricsUrl: {t0.get('lyricsUrl')!r}")
print(f"  lyrics: type={type(t0.get('lyrics')).__name__}, len={len(t0['lyrics']) if t0.get('lyrics') else 0}")
print(f"  lyricsTimed: {t0.get('lyricsTimed')!r}")
if t0.get('lyrics'):
    print(f"  lyrics first 3: {t0['lyrics'][:3]}")
    print(f"  lyrics last 3: {t0['lyrics'][-3:]}")
