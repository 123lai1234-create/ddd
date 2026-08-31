"""
Auto-generate LRC files for all tracks using whisper.
- Process MP3 -> SRT-like segments -> LRC format [mm:ss.xx]lyrics
- Only process tracks that don't have LRC yet
- Skip tracks that have LRC (to avoid clobbering manual edits)
"""
import os, sys, json, re, time, glob, subprocess
sys.stdout.reconfigure(encoding='utf-8')

MUSIC_DIR = 'astro/public/music'
TRACKS_JSON = os.path.join(MUSIC_DIR, 'tracks.json')

def fmt_time(sec):
    """Format seconds as mm:ss.xx (LRC format)"""
    m = int(sec // 60)
    s = sec - m * 60
    return f'{m:02d}:{s:05.2f}'

def segments_to_lrc(segments, title='', artist='', album=''):
    """Convert whisper segments to LRC format string"""
    lines = []
    # Metadata header
    if title:    lines.append(f'[ti:{title}]')
    if artist:   lines.append(f'[ar:{artist}]')
    if album:    lines.append(f'[al:{album}]')
    lines.append(f'[length:{fmt_time(segments[-1]["end"] if segments else 0)}]')
    lines.append('')
    # Lyrics with timestamps
    for seg in segments:
        text = seg['text'].strip()
        if not text:
            continue
        # Clean text
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'[\[\]<>]', '', text)
        lines.append(f'[{fmt_time(seg["start"])}]{text}')
    return '\n'.join(lines) + '\n'

def find_tracks_without_lrc():
    """Find MP3 files that don't have a corresponding LRC"""
    with open(TRACKS_JSON, encoding='utf-8') as f:
        data = json.load(f)

    missing = []
    for t in data['tracks']:
        if not t.get('url'):
            continue
        mp3 = t['url'].replace('/music/', '')
        mp3_path = os.path.join(MUSIC_DIR, mp3)
        if not os.path.exists(mp3_path):
            continue
        # Check if LRC exists (any matching pattern)
        base = os.path.splitext(mp3)[0]
        # Check both exact match and any *.lrc with same title
        existing_lrc = None
        for lrc in glob.glob(os.path.join(MUSIC_DIR, '*.lrc')):
            lrc_base = os.path.splitext(os.path.basename(lrc))[0]
            # Strip numeric prefix to compare
            lrc_title = re.sub(r'^\d+_', '', lrc_base)
            mp3_title = re.sub(r'^\d+_', '', base)
            if lrc_title == mp3_title or lrc_base == base:
                existing_lrc = lrc
                break
        if existing_lrc:
            continue
        missing.append({
            'title': t.get('title', ''),
            'artist': t.get('artist', ''),
            'album': t.get('album', ''),
            'mp3': mp3,
            'mp3_path': mp3_path,
            'duration': t.get('duration', 0),
        })
    return missing

def transcribe_with_whisper(mp3_path, model):
    """Use whisper to transcribe and return segments"""
    import whisper
    result = model.transcribe(
        mp3_path,
        language='zh',
        task='transcribe',
        verbose=False,
        # Some songs are slower/lower pitched, these params help
        temperature=0.0,
        beam_size=5,
    )
    return result['segments']

def main():
    print('=== Auto-generate LRC with whisper ===\n')

    missing = find_tracks_without_lrc()
    print(f'Tracks without LRC: {len(missing)}')
    for t in missing:
        print(f'  {t["mp3"]}  ({t["duration"]}s)')

    if not missing:
        print('\nAll tracks have LRC!')
        return

    # Estimate time
    total_sec = sum(t['duration'] for t in missing)
    print(f'\nTotal audio: {total_sec}s ({total_sec/60:.1f} min)')
    # tiny model ~50x realtime on CPU
    est_minutes = total_sec / 50 / 60
    print(f'Estimated: ~{est_minutes:.1f} min with tiny model on CPU')

    if '--yes' not in sys.argv:
        resp = input('\nProceed? [y/N] ')
        if resp.lower() != 'y':
            print('Aborted')
            return

    print('\nLoading whisper tiny model...')
    import whisper
    model = whisper.load_model('tiny')

    for i, t in enumerate(missing):
        print(f'\n[{i+1}/{len(missing)}] {t["mp3"]}')
        t0 = time.time()
        try:
            segments = transcribe_with_whisper(t['mp3_path'], model)
        except Exception as e:
            print(f'  FAILED: {e}')
            continue

        lrc = segments_to_lrc(segments, t['title'], t['artist'], t['album'])

        # Write LRC
        base = os.path.splitext(t['mp3'])[0]
        # Strip numeric prefix to match existing LRC style
        lrc_name = re.sub(r'^\d+_', '', base) + '.lrc'
        lrc_path = os.path.join(MUSIC_DIR, lrc_name)
        with open(lrc_path, 'w', encoding='utf-8') as f:
            f.write(lrc)
        elapsed = time.time() - t0
        print(f'  {len(segments)} segments, {elapsed:.1f}s -> {lrc_name}')

    print('\nDone!')

if __name__ == '__main__':
    main()
