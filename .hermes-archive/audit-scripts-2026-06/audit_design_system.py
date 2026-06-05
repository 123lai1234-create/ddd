"""Audit the design system architecture across all pages.

For a hiring portfolio, "code quality" signals include:
- Are CSS variables defined once in shared.css and reused? (consistency)
- Are spacing values using a scale (4/8/16/24/32/48/64)? (not random numbers)
- Is there a typographic scale? (font-sizes follow 1.2 / 1.25 / 1.333 ratio)
- Are colors using HSL with --hue / --saturation base? (theming)
- Are class names following a convention? (BEM, utility-first, etc.)
- Is dark mode handled? (prefers-color-scheme or explicit toggle)
- Is there a spacing scale token system?
"""
import re
import subprocess
from pathlib import Path
from collections import Counter, defaultdict

BASE = "https://donttalk.vercel.app"

# 1. 抓所有 CSS 檔案
def fetch(url):
    r = subprocess.run(["curl", "-s", "-L", url], capture_output=True, text=True, timeout=20)
    return r.stdout

# 列出所有 styles/*.css
styles = [
    "shared", "polish", "dynamic", "immersive-experience", "music",
    "index", "works", "video_gen", "thesis", "stem_cell", "report",
    "protein_mpnn", "ngs", "interactive-showcase", "interview_prep",
    "index-content", "index-live", "index-mpnn", "gene_ai", "firmware",
    "about_me", "loading-indicator"
]
all_css = {}
for s in styles:
    css = fetch(f"{BASE}/styles/{s}.css")
    if css:
        all_css[s] = css

# 2. CSS variable 分析
print("="*70)
print("=== CSS Variables (design tokens) ===")
print("="*70)
vars_per_file = {}
all_vars = Counter()
for name, css in all_css.items():
    vars = re.findall(r'--([a-zA-Z][a-zA-Z0-9-]*)\s*:', css)
    vars_per_file[name] = Counter(vars)
    all_vars.update(vars)
    if vars:
        unique = len(set(vars))
        # 只列出在 ≥2 個檔案裡出現的 = shared tokens
        reused = sum(1 for v, c in Counter(vars).items() if c >= 2)
        print(f"  {name:30s}  {len(vars):3d} defs, {unique:3d} unique, {reused:3d} reused")

# 3. 找共用的設計 token
print()
print("="*70)
print("=== Top reused CSS variables (design tokens candidates) ===")
print("="*70)
token_candidates = []
for var, count in all_vars.items():
    files_with = sum(1 for css in all_css.values() if f"--{var}:" in css)
    if files_with >= 3:
        token_candidates.append((var, files_with))
for var, count in sorted(token_candidates, key=lambda x: -x[1])[:25]:
    print(f"  --{var:30s}  used in {count:2d} files")

# 4. 找 duplicate / near-duplicate tokens（命名不同但值類似）
print()
print("="*70)
print("=== Token value clustering (similar values, different names) ===")
print("="*70)
# 找所有 var 定義
value_map = defaultdict(list)  # value → list of (var, file)
for name, css in all_css.items():
    for m in re.finditer(r'--([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;]+);', css):
        var, val = m.group(1), m.group(2).strip()
        # 標準化 value（去尾空白、quote）
        if len(val) > 30 or val.startswith("rgb") or val.startswith("linear") or val.startswith("radial"):
            continue  # 跳過複雜值
        value_map[val].append((var, name))

# 找 value 一樣但名字不同的
dups = []
for val, occurrences in value_map.items():
    unique_names = set(v for v, _ in occurrences)
    if len(unique_names) > 1 and len(occurrences) >= 3:
        dups.append((val, occurrences))
print(f"Found {len(dups)} candidate duplicate-value tokens")
for val, occurrences in sorted(dups, key=lambda x: -len(x[1]))[:10]:
    print(f"\n  Value: {val!r}")
    for v, f in occurrences:
        print(f"      --{v:30s} in {f}.css")

# 5. 字型分析
print()
print("="*70)
print("=== Typography ===")
print("="*70)
all_font_sizes = Counter()
for css in all_css.values():
    # 抓 font-size
    for m in re.finditer(r'font-size\s*:\s*([^;]+);', css):
        val = m.group(1).strip()
        all_font_sizes[val] += 1
print(f"  Unique font-size values: {len(all_font_sizes)}")
for val, count in sorted(all_font_sizes.items(), key=lambda x: -x[1])[:20]:
    print(f"    {count:4d}×  {val}")

# 6. Spacing (padding/margin) - 找最常用的數字
print()
print("="*70)
print("=== Spacing values (padding/margin/gap) ===")
print("="*70)
spacing = Counter()
for css in all_css.values():
    for prop in ['padding', 'margin', 'gap']:
        for m in re.finditer(rf'{prop}\s*:\s*([^;]+);', css):
            val = m.group(1).strip()
            # 抓 px 數值
            for n in re.findall(r'(\d+(?:\.\d+)?)px', val):
                spacing[n] += 1
print(f"  Unique px values: {len(spacing)}")
for val, count in sorted(spacing.items(), key=lambda x: -float(x[0]))[:20]:
    print(f"    {val:>6s} px  ({count}× uses)")

# 7. Border radius
print()
print("="*70)
print("=== Border radius values ===")
print("="*70)
radii = Counter()
for css in all_css.values():
    for m in re.finditer(r'border-radius\s*:\s*([^;]+);', css):
        val = m.group(1).strip()
        radii[val] += 1
for val, count in sorted(radii.items(), key=lambda x: -x[1])[:15]:
    print(f"    {count:4d}×  {val}")

# 8. CSS 總行數
print()
print("="*70)
print("=== CSS line count (per file) ===")
print("="*70)
total_lines = 0
for name in styles:
    r = subprocess.run(["curl", "-s", "-I", "-L", f"{BASE}/styles/{name}.css"],
                       capture_output=True, text=True, timeout=10)
    # 用 Size 推算（粗略）
    for line in r.stdout.split("\n"):
        if "Content-Length:" in line:
            size = int(line.split(":")[1].strip())
            # 算行數
            css = fetch(f"{BASE}/styles/{name}.css")
            lines = css.count("\n")
            print(f"  {name:30s}  {lines:5d} lines  {size:7d} bytes")
            total_lines += lines
            break
print(f"\n  TOTAL: {total_lines} lines")
