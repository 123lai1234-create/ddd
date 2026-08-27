import wave, struct, sys

path = sys.argv[1]
w = wave.open(path)
n = w.getnframes()
d = w.readframes(n)
s = struct.unpack('<%dh' % (len(d) // 2), d)
sr = w.getframerate()
duration = n / sr

# 4 segments: average abs (RMS approx) and peak
seg = n // 4
rms = []
peak = []
for i in range(4):
    chunk = s[i * seg:(i + 1) * seg]
    rms.append(round(sum(abs(x) for x in chunk) / max(1, len(chunk))))
    peak.append(max(abs(x) for x in chunk) if chunk else 0)

# Zero-crossing rate (speech has higher ZCR in mid band) - rough indicator
zcr = 0
for i in range(1, n, 200):
    if (s[i] > 0) != (s[i - 1] > 0):
        zcr += 1
zcr_rate = zcr / (n // 200)

print("duration=%.1fs sr=%d" % (duration, sr))
print("seg RMS:", rms)
print("seg peak:", peak)
print("zero-crossing rate (sampled):", round(zcr_rate, 4))
