import sys, os, json, re
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from faster_whisper import WhisperModel

tracks_json = "D:/project/astro/public/music/tracks.json"
music_dir = "D:/project/astro/public/music"
out_base = "D:/project/astro/public/music"
model_size = "base"
language = "zh"

# 載入 tracks.json
with open(tracks_json, "r", encoding="utf-8") as f:
    data = json.load(f)

# 建立 id -> track 對照
track_map = {t["id"]: t for t in data["tracks"]}

# 找出缺 lyricsUrl 的曲目
missing = [t for t in data["tracks"] if not t.get("lyricsUrl")]
print(f"共 {len(missing)} 首缺歌詞", flush=True)

# 載入模型一次
print("loading model base ...", flush=True)
model = WhisperModel(model_size, device="cpu", compute_type="int8")

def timestamp_lrc(seconds):
    m, s = divmod(seconds, 60)
    return "[%02d:%05.2f]" % (int(m), s)

def sanitize_filename(name):
    # 去除不合法的檔名字元
    return re.sub(r'[\\/:*?"<>|]', '', name)

def format_lrc(segments):
    lines = []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        t0 = round(seg.start, 2)
        lines.append((t0, text))
    return lines

results = []
for i, track in enumerate(missing):
    mp3_path = os.path.join(music_dir, os.path.basename(track["url"]))
    title = track["title"]
    tid = track["id"]
    print(f"\n[{i+1}/{len(missing)}] 處理: [{tid}] {title}", flush=True)

    if not os.path.exists(mp3_path):
        print(f"  MP3 不存在: {mp3_path}，跳過", flush=True)
        results.append((tid, title, "MP3_NOT_FOUND", None))
        continue

    try:
        segments, info = model.transcribe(
            mp3_path,
            language=language,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
            word_timestamps=False,
        )

        seg_list = [(seg.start, seg.end, seg.text.strip()) for seg in segments if seg.text.strip()]
        print(f"  轉錄完成: {len(seg_list)} 句, language={info.language}({info.language_probability:.2f})", flush=True)

        if not seg_list:
            results.append((tid, title, "NO_SPEECH", None))
            print("  無語音內容，可能為純音樂", flush=True)
            continue

        # 寫 LRC 檔：用 歌曲標題_序號.lrc 或乾淨標題.lrc
        safe_title = sanitize_filename(title)
        lrc_name = f"{str(tid).zfill(2)}_{safe_title}.lrc"
        lrc_path = os.path.join(out_base, lrc_name)

        with open(lrc_path, "w", encoding="utf-8") as f:
            f.write(f"[ti:{title}]\n")
            f.write(f"[ar:{track.get('artist','未知藝術家')}]\n")
            f.write(f"[al:{track.get('album','AI Demo Tracks')}]\n")
            for (t0, t1, text) in seg_list:
                f.write(f"{timestamp_lrc(t0)}{text}\n")

        # 更新 tracks.json 的 lyricsUrl
        track["lyricsUrl"] = f"/music/{lrc_name}"

        print(f"  LRC 寫入: {lrc_name} ({len(seg_list)} 行)", flush=True)
        results.append((tid, title, "OK", lrc_name))

    except Exception as e:
        print(f"  錯誤: {e}", flush=True)
        results.append((tid, title, f"ERROR: {e}", None))

# 寫回 tracks.json
with open(tracks_json, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("\n\n========== 完成報告 ==========")
ok = [r for r in results if r[2] == "OK"]
no_speech = [r for r in results if r[2] == "NO_SPEECH"]
err = [r for r in results if r[2] not in ("OK", "NO_SPEECH")]
print(f"成功: {len(ok)}  首")
print(f"無語音: {len(no_speech)} 首")
print(f"錯誤: {len(err)} 首")
if no_speech:
    print("無語音曲目:", [r[1] for r in no_speech])
if err:
    for r in err:
        print(f"  錯誤 {r[0]} {r[1]}: {r[2]}")
print("tracks.json 已更新")
