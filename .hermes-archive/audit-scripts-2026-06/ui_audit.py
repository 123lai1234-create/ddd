"""Static UI health check: analyze CSS structure, design tokens, consistency.

This is NOT a beauty judge - it finds objective problems:
- Color values not in the design system (hardcoded)
- Inconsistent padding/spacing scale
- Font size jumps that don't follow a typographic scale
- Duplicate/conflicting CSS rules
- Missing design tokens (CSS custom properties)
- Width/height hardcoded that should be fluid
"""
import re
import subprocess
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(r"D:\project\astro")

# 1. 抓所有 CSS 檔案
css_files = sorted((ROOT / "public/styles").glob("*.css"))
print(f"Found {len(css_files)} CSS files:")
total_size = 0
for f in css_files:
    total_size += f.stat().st_size
    print(f"  {f.name}: {f.stat().st_size:,} bytes")
print(f"  TOTAL: {total_size:,} bytes ({total_size/1024:.1f} KB)")
print()

# 2. 收集所有顏色
print("="*70)
print("=== Color usage analysis ===")
print("="*70)

color_counter = Counter()
color_contexts = defaultdict(list)  # color → [(file, line, snippet)]

# 顏色 regex: hex, rgb(), rgba(), hsl()
color_re = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)')

for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for i, line in enumerate(content.split('\n'), 1):
        for m in color_re.finditer(line):
            color = m.group(0).lower()
            color_counter[color] += 1
            if len(color_contexts[color]) < 3:
                color_contexts[color].append((f.name, i, line.strip()[:80]))

print(f"Total color references: {sum(color_counter.values())}")
print(f"Unique colors: {len(color_counter)}")
print()
print("Top 30 most-used colors:")
for color, count in color_counter.most_common(30):
    print(f"  {count:4d}× {color}")
print()

# 3. 檢查有沒有「裸色」（未用 CSS variable）
print("="*70)
print("=== Hardcoded colors (not using var(--xxx)) ===")
print("="*70)
# 看哪些檔案用 var(--xxx) vs 直接寫色
var_users = set()
hardcoded_files = []
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    has_var = bool(re.search(r'var\(--', content))
    has_color = bool(color_re.search(content))
    if has_var:
        var_users.add(f.name)
    if has_color and not has_var:
        hardcoded_files.append(f.name)

print(f"CSS files using var(--xxx): {len(var_users)}/{len(css_files)}")
print(f"Files with ONLY hardcoded colors (no var): {len(hardcoded_files)}")
for f in hardcoded_files:
    print(f"  - {f}")
print()

# 4. CSS 變數分析
print("="*70)
print("=== CSS Custom Properties (--variables) per file ===")
print("="*70)
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    # 找 :root { --xxx: ... } 區塊
    var_defs = re.findall(r'--([a-zA-Z0-9_-]+)\s*:', content)
    if var_defs:
        unique = set(var_defs)
        print(f"  {f.name}: defines {len(unique)} variables")

# 5. Padding/Spacing scale
print()
print("="*70)
print("=== Padding/margin values (the rhythm) ===")
print("="*70)
spacing_counter = Counter()
spacing_re = re.compile(r'(?:padding|margin|gap)(?:-[a-z]+)?\s*:\s*([^;}{]+);')
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in spacing_re.finditer(content):
        for val in m.group(1).split():
            val = val.strip()
            # 只看 px / rem
            if re.match(r'^-?\d+\.?\d*(?:px|rem)$', val):
                spacing_counter[val] += 1

print("Top 30 most-used spacing values (px/rem only):")
for val, count in spacing_counter.most_common(30):
    print(f"  {count:4d}× {val}")
print()

# 6. Font size scale
print("="*70)
print("=== Font size values ===")
print("="*70)
fs_counter = Counter()
fs_re = re.compile(r'font-size\s*:\s*([^;}{]+);')
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in fs_re.finditer(content):
        for val in m.group(1).split():
            val = val.strip().rstrip(';').rstrip(',')
            if re.match(r'^-?\d+\.?\d*(?:px|rem|em)$', val):
                fs_counter[val] += 1

print("Top 25 most-used font sizes:")
for val, count in fs_counter.most_common(25):
    print(f"  {count:4d}× {val}")
print()

# 7. Border radius scale
print("="*70)
print("=== Border radius values ===")
print("="*70)
br_counter = Counter()
br_re = re.compile(r'border-radius\s*:\s*([^;}{]+);')
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in br_re.finditer(content):
        val = m.group(1).strip()
        br_counter[val] += 1

print("All border-radius values:")
for val, count in br_counter.most_common(20):
    print(f"  {count:4d}× {val}")
print()

# 8. Shadow values
print("="*70)
print("=== Box-shadow values ===")
print("="*70)
shadow_count = 0
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    shadow_count += len(re.findall(r'box-shadow\s*:', content))
print(f"Total box-shadow rules: {shadow_count}")

# 9. 找出可能的「重複或衝突」色票
print()
print("="*70)
print("=== Top 5 most-used colors - check if they form a coherent palette ===")
print("="*70)
top5 = color_counter.most_common(5)
for color, count in top5:
    print(f"  {color} used {count}×")

# 10. 重複 CSS 規則偵測（同檔內重複 selector）
print()
print("="*70)
print("=== Duplicate selectors within same file ===")
print("="*70)
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    selectors = re.findall(r'^([^{}@/*]+)\{', content, re.MULTILINE)
    selector_counts = Counter(s.strip() for s in selectors if s.strip() and not s.strip().startswith(('@', '/*')))
    dups = [(s, c) for s, c in selector_counts.items() if c > 1]
    if dups:
        print(f"\n  {f.name}:")
        for s, c in dups[:5]:
            print(f"    {c}× {s[:60]}")
