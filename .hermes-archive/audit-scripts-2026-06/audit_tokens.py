"""Extract design tokens from 8 key CSS files: colors, fonts, spacing, breakpoints."""
import re
import subprocess
from pathlib import Path
from collections import Counter, defaultdict

BASE = "https://donttalk.vercel.app"
CSS_FILES = [
    "shared.css",      # 全站共用
    "polish.css",      # 全站微調
    "index.css",       # 首頁
    "music.css",       # 音樂
    "thesis.css",      # thesis
    "gene_ai.css",     # gene-ai
    "ngs.css",         # ngs
    "interactive-showcase.css",  # interactive-showcase
]

# 抓所有 CSS
all_css = {}
for css in CSS_FILES:
    r = subprocess.run(["curl", "-s", "-L", f"{BASE}/styles/{css}"], capture_output=True, text=True, timeout=15)
    all_css[css] = r.stdout

# 1. 抓所有 color tokens (hex, rgba, named)
print("="*70)
print("=== Color token usage across CSS files ===")
print("="*70)
color_usage = defaultdict(Counter)  # color → {file: count}
for filename, css in all_css.items():
    # hex colors
    for m in re.finditer(r'#([0-9a-fA-F]{3,8})\b', css):
        c = "#" + m.group(1).lower()
        color_usage[c][filename] += 1
    # rgb/rgba
    for m in re.finditer(r'rgba?\(([^)]+)\)', css):
        c = m.group(0)
        color_usage[c][filename] += 1
    # hsla
    for m in re.finditer(r'hsla?\(([^)]+)\)', css):
        c = m.group(0)
        color_usage[c][filename] += 1

# 列出最常用的 30 個 color
print(f"Total unique colors: {len(color_usage)}")
top_colors = sorted(color_usage.items(), key=lambda x: -sum(x[1].values()))[:30]
print("\nTop 30 colors (by total usage):")
for color, files in top_colors:
    file_count = len(files)
    total = sum(files.values())
    files_str = ", ".join(f"{f}({n})" for f, n in files.most_common(3))
    print(f"  {color:35s}  {total:4d} uses  in {file_count} files  {files_str}")

# 2. 抓字型使用
print()
print("="*70)
print("=== Font family usage ===")
print("="*70)
font_usage = defaultdict(int)
font_size_usage = defaultdict(int)
font_weight_usage = defaultdict(int)
for filename, css in all_css.items():
    for m in re.finditer(r'font-family\s*:\s*([^;}]+)', css):
        ff = m.group(1).strip().rstrip(';')
        font_usage[ff] += 1
    for m in re.finditer(r'font-size\s*:\s*([^;}]+)', css):
        fs = m.group(1).strip().rstrip(';')
        font_size_usage[fs] += 1
    for m in re.finditer(r'font-weight\s*:\s*([^;}]+)', css):
        fw = m.group(1).strip().rstrip(';')
        font_weight_usage[fw] += 1

print("font-family values (sorted by usage):")
for ff, count in sorted(font_usage.items(), key=lambda x: -x[1])[:20]:
    print(f"  {count:4d}  {ff[:80]}")

print("\nfont-size values (sorted by usage):")
for fs, count in sorted(font_size_usage.items(), key=lambda x: -x[1])[:20]:
    print(f"  {count:4d}  {fs}")

print("\nfont-weight values (sorted by usage):")
for fw, count in sorted(font_weight_usage.items(), key=lambda x: -x[1]):
    print(f"  {count:4d}  {fw}")

# 3. 抓 padding / margin
print()
print("="*70)
print("=== Padding/Margin values ===")
print("="*70)
padding_values = Counter()
margin_values = Counter()
gap_values = Counter()
for filename, css in all_css.items():
    for m in re.finditer(r'padding\s*:\s*([^;}]+)', css):
        for val in m.group(1).split():
            if val and val[0].isdigit() or val.endswith('px') or val.endswith('em') or val.endswith('rem'):
                padding_values[val.strip().rstrip(';')] += 1
    for m in re.finditer(r'margin\s*:\s*([^;}]+)', css):
        for val in m.group(1).split():
            margin_values[val.strip().rstrip(';')] += 1
    for m in re.finditer(r'gap\s*:\s*([^;}]+)', css):
        gap_values[m.group(1).strip().rstrip(';')] += 1

print("Top 20 padding values:")
for v, c in padding_values.most_common(20):
    print(f"  {c:4d}  {v}")

print("\nTop 20 margin values:")
for v, c in margin_values.most_common(20):
    print(f"  {c:4d}  {v}")

print("\nTop 10 gap values:")
for v, c in gap_values.most_common(10):
    print(f"  {c:4d}  {v}")

# 4. RWD 斷點
print()
print("="*70)
print("=== Media query breakpoints ===")
print("="*70)
breakpoints = Counter()
for filename, css in all_css.items():
    for m in re.finditer(r'@media\s*\([^)]+\)', css):
        breakpoints[m.group(0)] += 1
print("Unique @media queries:")
for bp, count in sorted(breakpoints.items(), key=lambda x: -x[1])[:20]:
    print(f"  {count:4d}  {bp}")

# 5. 圓角 / 陰影
print()
print("="*70)
print("=== Border-radius & box-shadow values ===")
print("="*70)
radius_values = Counter()
shadow_values = Counter()
for filename, css in all_css.items():
    for m in re.finditer(r'border-radius\s*:\s*([^;}]+)', css):
        radius_values[m.group(1).strip().rstrip(';')] += 1
    for m in re.finditer(r'box-shadow\s*:\s*([^;}]+)', css):
        shadow_values[m.group(1).strip().rstrip(';')[:50]] += 1
print("Top 15 border-radius:")
for v, c in radius_values.most_common(15):
    print(f"  {c:4d}  {v}")
print("\nTop 10 box-shadow (truncated to 50 chars):")
for v, c in shadow_values.most_common(10):
    print(f"  {c:4d}  {v}")
