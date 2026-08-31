import sys, os, wave, struct
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

path = sys.argv[1]
# 轉wav
import subprocess, tempfile
wav_path = os.path.join(tempfile.gettempdir(), "probe4.wav")
subprocess.run(["ffmpeg", "-y", "-i", path, "-t", "30", "-ac", "1", "-ar", "16000", wav_path],
               capture_output=True)

w = wave.open(wav_path)
n = w.getnframes()
d = w.readframes(n)
samples = struct.unpack('<%dh' % (len(d) // 2), d)
w.close()

avg = sum(abs(x) for x in samples) / max(1, len(samples))
peak = max(abs(x) for x in samples) if samples else 0
zcr = sum(1 for i in range(1, len(samples), 100) if (samples[i] > 0) != (samples[i-1] > 0)) / (len(samples) // 100)

print(f"avg_amp={avg:.1f} peak={peak} zcr={zcr:.4f}")
if avg < 500:
    print("=> 幾乎無聲，可能是純音樂/環境音")
elif zcr > 0.15:
    print("=> 可能有語音/歌唱")
else:
    print("=> 有音頻但可能是純器樂")
