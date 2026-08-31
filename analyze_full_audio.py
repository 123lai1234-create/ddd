import wave, struct, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
w = wave.open(sys.argv[1])
n = w.getnframes()
d = w.readframes(n)
samples = struct.unpack('<%dh' % (len(d) // 2), d)
sr = w.getframerate()
duration = n / sr

# 全檔 RMS（音壓）
total_rms = (sum(x*x for x in samples) / max(1, len(samples))) ** 0.5
peak = max(abs(x) for x in samples)

# 每 10 秒分段的 RMS
seg_sec = 10
seg_n = sr * seg_sec
print(f"duration={duration:.1f}s  total_RMS={total_rms:.1f}  peak={peak}")
for i in range(0, len(samples), seg_n):
    chunk = samples[i:i+seg_n]
    if not chunk:
        break
    rms = (sum(x*x for x in chunk) / len(chunk)) ** 0.5
    seg_idx = i // seg_n
    print(f"  [{seg_idx*seg_sec:>3}-{(seg_idx+1)*seg_sec:>3}s] RMS={rms:7.1f}")

# 檢查是否有大段靜音
silent_count = sum(1 for s in samples if abs(s) < 100)
print(f"\n靜音樣本數 (<100): {silent_count} / {len(samples)} = {silent_count*100/len(samples):.1f}%")