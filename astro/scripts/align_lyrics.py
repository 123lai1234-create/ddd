#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os, sys, json, time, warnings
warnings.filterwarnings('ignore')
import stable_whisper
import mutagen

PUBLIC_DIR = r'D:\project\astro\public\music'
DIST_DIR   = r'D:\project\astro\dist\music'
PLAYLIST   = os.path.join(PUBLIC_DIR, 'playlist.json')
MODEL_SIZE = 'medium'

# 語言提示（加速 + 提高小語種準度）
LANG_MAP = {'TW': 'zh', 'EN': 'en', 'JP': 'ja', 'KR': 'ko'}

ALIGN_KW_BASE = dict(
    vad=True,
    demucs=False,
    regroup=True,
    suppress_silence=True,
    suppress_word_ts=False,
)

def sec_to_lrc(sec):
    m = int(sec // 60)
    s = sec - m * 60
    cs = int(round((s - int(s)) * 100))
    return f'[{m:02d}:{int(s):02d}.{cs:02d}]'

def main():
    with open(PLAYLIST, 'r', encoding='utf-8') as f:
        tracks = json.load(f)['tracks']
    print(f'[init] {len(tracks)} 首, model={MODEL_SIZE}, lang={LANG_HINT or "auto"}', flush=True)
    t_load = time.time()
    model = stable_whisper.load_model(MODEL_SIZE)
    print(f'[init] model loaded in {time.time()-t_load:.1f}s', flush=True)

    total_segments = 0
    failed = []
    grand_t0 = time.time()
    for i, tr in enumerate(tracks, 1):
        mp3_path = os.path.join(PUBLIC_DIR, os.path.basename(tr['audio']))
        lyrics_name = os.path.basename(tr['lyrics'])
        out_pub = os.path.join(PUBLIC_DIR, lyrics_name)
        out_dist = os.path.join(DIST_DIR, lyrics_name)
        if not os.path.exists(mp3_path):
            print(f'[{i:02d}/{len(tracks)}] SKIP (no mp3): {tr["name"]}', flush=True)
            failed.append(tr['name'])
            continue
        try:
            dur = mutagen.File(mp3_path).info.length
        except Exception:
            dur = -1
        print(f'[{i:02d}/{len(tracks)}] {tr["name"]} ({dur:.0f}s)', end=' ', flush=True)
        t0 = time.time()
        try:
            # transcribe + stable-ts refine 自動產生精準時間戳
            result = model.transcribe(mp3_path, **ALIGN_KW)
        except Exception as e:
            print(f'ERR: {e}', flush=True)
            failed.append(tr['name'])
            continue
        elapsed = time.time() - t0
        lines = []
        n = 0
        for seg in result:
            txt = (seg.text or '').strip()
            if not txt:
                continue
            lines.append(sec_to_lrc(seg.start) + txt)
            n += 1
        lrc_text = '\n'.join(lines) + '\n'
        for path in (out_pub, out_dist):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(lrc_text)
        total_segments += n
        print(f'-> {n} 句, {elapsed:.1f}s', flush=True)
    grand = time.time() - grand_t0
    print(f'\n=== 完成 ===', flush=True)
    print(f'  總句數: {total_segments}', flush=True)
    print(f'  失敗: {len(failed)} ({failed})', flush=True)
    print(f'  總時間: {grand/60:.1f} 分鐘', flush=True)

if __name__ == '__main__':
    main()
