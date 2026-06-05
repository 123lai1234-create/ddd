"""Systematic UI/UX audit by analyzing CSS files for:
- Font size system (consistency of type scale)
- Color system (reused values, defined tokens, contrast)
- Spacing (8px/16px grid adherence)
- Border-radius and shadow consistency
- RWD breakpoint consistency
"""
import re
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(r"D:\project\astro\public\styles")

# 1. 抓所有 CSS 檔案
css_files = sorted(ROOT.glob("*.css"))
print("="*70)
print(f"=== Auditing {len(css_files)} CSS files ===")
print("="*70)
for f in css_files:
    print(f"  {f.name}  ({f.stat().st_size} bytes)")

# 2. 收集所有 CSS 變數定義
all_vars = {}  # name → [values across files]
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'--([a-zA-Z0-9-]+)\s*:\s*([^;]+);', content):
        var_name = m.group(1)
        var_value = m.group(2).strip()
        all_vars.setdefault(var_name, []).append((f.name, var_value))

# 3. 收集所有字型大小
font_sizes = Counter()
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'font-size\s*:\s*([\d.]+)(px|rem|em)\b', content):
        val = float(m.group(1))
        unit = m.group(2)
        # 標準化為 px
        if unit == "rem":
            val = val * 16
        elif unit == "em":
            val = val * 16
        font_sizes[f"{int(val)}px"] += 1

print()
print("="*70)
print("=== Font sizes used (sorted by frequency) ===")
print("="*70)
total_font_rules = sum(font_sizes.values())
for size, count in font_sizes.most_common():
    bar = "█" * min(count, 50)
    print(f"  {size:>8}  {count:3d}×  {bar}")

# 4. 收集所有顏色
color_values = Counter()
hex_re = re.compile(r'#[0-9a-fA-F]{3,8}\b')
rgb_re = re.compile(r'rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)')
named_re = re.compile(r'\b(?:red|blue|green|black|white|yellow|orange|purple|pink|cyan|magenta|gray|grey)\b', re.IGNORECASE)

for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in hex_re.finditer(content):
        color_values[m.group(0).lower()] += 1
    for m in rgb_re.finditer(content):
        color_values[m.group(0)] += 1

print()
print("="*70)
print(f"=== Top 30 colors used (of {len(color_values)} unique) ===")
print("="*70)
for color, count in color_values.most_common(30):
    bar = "█" * min(count, 30)
    print(f"  {color:>22}  {count:3d}×  {bar}")

# 5. 收集所有 padding/margin 值
spacing_values = Counter()
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for prop in ['padding', 'margin', 'gap']:
        for m in re.finditer(rf'{prop}(?:-[a-z]+)?\s*:\s*([\d.]+)(px|rem|em)\b', content):
            val = float(m.group(1))
            unit = m.group(2)
            if unit in ("rem", "em"):
                val = val * 16
            spacing_values[f"{int(val)}px"] += 1

print()
print("="*70)
print("=== Spacing values (padding/margin/gap) ===")
print("="*70)
# 算 8px 倍數 vs 散亂
aligned_8 = sum(c for v, c in spacing_values.items() if int(v.replace('px','')) % 8 == 0)
aligned_4 = sum(c for v, c in spacing_values.items() if int(v.replace('px','')) % 4 == 0)
total_sp = sum(spacing_values.values())
print(f"  8px 倍數: {aligned_8}/{total_sp} ({aligned_8*100//total_sp}%)")
print(f"  4px 倍數: {aligned_4}/{total_sp} ({aligned_4*100//total_sp}%)")
print()
for v, c in spacing_values.most_common(20):
    n = int(v.replace('px',''))
    marker = "  " if n % 8 == 0 else "⚠"  # 標出非 8 倍數
    bar = "█" * min(c, 30)
    print(f"  {marker} {v:>6}  {c:3d}×  {bar}")

# 6. border-radius
radius_values = Counter()
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'border-radius\s*:\s*([^;]+);', content):
        val = m.group(1).strip()
        radius_values[val] += 1

print()
print("="*70)
print("=== border-radius values ===")
print("="*70)
for v, c in radius_values.most_common(20):
    print(f"  {v:>30}  {c}×")

# 7. box-shadow
shadow_values = Counter()
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'box-shadow\s*:\s*([^;]+);', content):
        val = m.group(1).strip()
        # 標準化（移除顏色差異）
        shadow_values[val] += 1

print()
print("="*70)
print("=== box-shadow values (top 15) ===")
print("="*70)
for v, c in shadow_values.most_common(15):
    short = v[:60] + "..." if len(v) > 60 else v
    print(f"  {c}×  {short}")

# 8. RWD breakpoints
breakpoints = Counter()
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'@media\s*\([^)]*max-width\s*:\s*(\d+)px[^)]*\)', content):
        breakpoints[f"{m.group(1)}px"] += 1

print()
print("="*70)
print("=== RWD breakpoints used ===")
print("="*70)
for v, c in sorted(breakpoints.items(), key=lambda x: int(x[0].replace('px',''))):
    print(f"  {v:>8}  {c}×")

# 9. CSS 變數定義 vs 使用（找出未使用的 token）
all_var_defs = set(all_vars.keys())
all_var_uses = Counter()
for f in css_files:
    content = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'var\(\s*--([a-zA-Z0-9-]+)', content):
        all_var_uses[m.group(1)] += 1

unused_vars = all_var_defs - set(all_var_uses.keys())
print()
print("="*70)
print(f"=== CSS variables: {len(all_var_defs)} defined, {len(all_var_uses)} used ===")
print("="*70)
if unused_vars:
    print(f"  ⚠ Defined but never used: {len(unused_vars)}")
    for v in sorted(unused_vars)[:20]:
        print(f"    --{v}")

print(f"\n  Most used variables:")
for v, c in all_var_uses.most_common(15):
    print(f"    --{v:30}  {c}×")
