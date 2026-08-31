"""Test whisper Python API on one Chinese song"""
import whisper, time, sys, os
sys.stdout.reconfigure(encoding='utf-8')

# Find a short track
music_dir = 'astro/public/music'
mp3s = sorted([f for f in os.listdir(music_dir) if f.endswith('.mp3')])
print(f'Found {len(mp3s)} mp3 files')
for f in mp3s[:3]:
    print(f'  {f}  {os.path.getsize(os.path.join(music_dir, f))} bytes')

# Pick the shortest
shortest = min(mp3s, key=lambda f: os.path.getsize(os.path.join(music_dir, f)))
path = os.path.join(music_dir, shortest)
print(f'\nUsing: {shortest}  ({os.path.getsize(path)} bytes)')

# Load model (tiny is fast, small is better)
print('\nLoading tiny model...')
t0 = time.time()
model = whisper.load_model('tiny')
print(f'  loaded in {time.time()-t0:.1f}s')

# Transcribe
print('\nTranscribing...')
t0 = time.time()
result = model.transcribe(path, language='zh', verbose=False)
print(f'  done in {time.time()-t0:.1f}s')

# Show segments
print(f'\n{len(result["segments"])} segments:')
for seg in result['segments'][:10]:
    print(f'  [{seg["start"]:.1f}s -> {seg["end"]:.1f}s]  {seg["text"].strip()}')
