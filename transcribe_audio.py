import sys, os, json, re
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from faster_whisper import WhisperModel

audio = sys.argv[1]
model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
language = "zh"
out_lrc = sys.argv[3] if len(sys.argv) > 3 else None

model = WhisperModel(model_size, device="cpu", compute_type="int8")
segments, info = model.transcribe(
    audio,
    language=language,
    beam_size=5,
    vad_filter=True,
    condition_on_previous_text=False,
    word_timestamps=False,
)

lines = []
for seg in segments:
    text = seg.text.strip()
    if text:
        lines.append((round(seg.start, 2), round(seg.end, 2), text))

if out_lrc:
    # 寫成 LRC: 用每句起始時間
    with open(out_lrc, "w", encoding="utf-8") as f:
        for (t0, t1, text) in lines:
            m, s = divmod(t0, 60)
            f.write("[%02d:%05.2f]%s\n" % (int(m), s, text))
    print("WROTE LRC:", out_lrc, "segments:", len(lines), flush=True)
else:
    for (t0, t1, text) in lines:
        print("[%.2f] %s" % (t0, text), flush=True)
