"""Check LRC URL vs MP3 URL prefix for all tracks"""
import json, urllib.request, os

with open('astro/public/music/tracks.json', encoding='utf-8') as f:
    data = json.load(f)

music_dir = 'astro/public/music'

print(f"{'idx':<4} {'title':<25} {'mp3':<25} {'lrc':<25} {'mp3_OK':<7} {'lrc_OK':<7} {'prefix_match'}")
print('-' * 120)

mismatches = 0
for i, t in enumerate(data['tracks']):
    if not t.get('lyricsUrl'):
        continue

    # Get the actual filename from URL
    mp3_name = t['url'].replace('/music/', '').replace('%20', ' ')
    lrc_name = t['lyricsUrl'].replace('/music/', '').replace('%20', ' ')

    # Local file checks
    mp3_path = os.path.join(music_dir, mp3_name)
    lrc_path = os.path.join(music_dir, lrc_name)
    mp3_ok = 'OK' if os.path.exists(mp3_path) else 'NO'
    lrc_ok = 'OK' if os.path.exists(lrc_path) else 'NO'

    # Extract the prefix (number before first _)
    mp3_prefix = mp3_name.split('_')[0] if '_' in mp3_name else ''
    lrc_prefix = lrc_name.split('_')[0] if '_' in lrc_name else ''
    prefix_match = 'OK' if mp3_prefix == lrc_prefix else 'MISMATCH'

    if mp3_prefix != lrc_prefix:
        mismatches += 1

    title = t.get('title', '')[:23]
    print(f"{i:<4} {title:<25} {mp3_name[:23]:<25} {lrc_name[:23]:<25} {mp3_ok:<7} {lrc_ok:<7} {prefix_match}")

print(f"\nTotal mismatches: {mismatches}")
