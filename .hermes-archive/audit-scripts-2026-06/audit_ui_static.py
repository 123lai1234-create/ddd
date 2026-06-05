"""CSS/HTML static UI/UX audit.
Analyzes:
- Color palette consistency (CSS variables across files)
- Typography scale (font-size values used)
- Spacing system (padding/margin values)
- Border-radius consistency
- Shadow/elevation system
- Layout grid (max-width, container widths)
- Responsive breakpoints
- Design tokens presence
"""
import re
import subprocess
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(r"D:\project\astro/public/styles")
css_files = sorted(ROOT.glob("*.css"))
print(f"Found {len(css_files)} CSS files: {[f.name for f in css_files]}")
print()

# 1. CSS 變量使用
print("="*70)
print("=== CSS Variables (Design Tokens) ===")
print("="*70)
all_vars_def = Counter()
all_vars_use = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    # 定義：--foo: ...
    for m in re.finditer(r'--([a-zA-Z0-9-]+):\s*([^;]+);', text):
        all_vars_def[m.group(1)] += 1
    # 使用：var(--foo)
    for m in re.finditer(r'var\(\s*--([a-zA-Z0-9-]+)\s*[,)]', text):
        all_vars_use[m.group(1)] += 1

print(f"Variables defined: {len(all_vars_def)}")
print(f"Variables used:    {len(all_vars_use)}")
# 只在定義沒在用的（孤兒 token）
orphan = set(all_vars_def) - set(all_vars_use)
if orphan:
    print(f"\n  Orphan variables (defined but never used): {len(orphan)}")
    for v in sorted(orphan)[:10]:
        print(f"    --{v}  (defined in {all_vars_def[v]} files)")
else:
    print("  ✓ All defined variables are used")
# 用但沒定義的
undefined = set(all_vars_use) - set(all_vars_def)
if undefined:
    print(f"\n  Undefined variables (used but not defined): {len(undefined)}")
    for v in sorted(undefined)[:10]:
        print(f"    var(--{v})  (referenced in {all_vars_use[v]} files)")

# 2. 字型大小
print()
print("="*70)
print("=== Typography Scale (font-size values) ===")
print("="*70)
font_sizes = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'font-size:\s*([0-9.]+)(px|rem|em)', text):
        key = f"{m.group(1)}{m.group(2)}"
        font_sizes[key] += 1
print(f"Unique font-size values used: {len(font_sizes)}")
# 顯示前 20 名
print("Top font-sizes (by frequency):")
for size, count in font_sizes.most_common(20):
    print(f"  {size:>10}  ×{count}")

# 3. Padding/Margin 系統
print()
print("="*70)
print("=== Spacing Scale (padding/margin values) ===")
print("="*70)
spacings = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    # 抓 padding/margin 後面的數字
    for m in re.finditer(r'(?:padding|margin)(?:-[a-z]+)?:\s*[^;]*?([0-9.]+)(px|rem|em)', text):
        key = f"{m.group(1)}{m.group(2)}"
        spacings[key] += 1
print(f"Unique spacing values: {len(spacings)}")
print("Top spacings (by frequency):")
for s, c in spacings.most_common(15):
    print(f"  {s:>8}  ×{c}")
# 8px 倍數的 % 占比
on_8px = sum(c for s, c in spacings.items() if s.endswith('px') and float(s[:-2]) % 8 == 0)
on_4px = sum(c for s, c in spacings.items() if s.endswith('px') and float(s[:-2]) % 4 == 0)
total_px = sum(c for s, c in spacings.items() if s.endswith('px'))
if total_px > 0:
    print(f"\n  On 8px grid: {on_8px/total_px*100:.0f}%")
    print(f"  On 4px grid: {on_4px/total_px*100:.0f}%")

# 4. border-radius
print()
print("="*70)
print("=== Border Radius Values ===")
print("="*70)
radii = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'border-radius:\s*([^;]+);', text):
        val = m.group(1).strip()
        # 標準化
        normalized = re.sub(r'\s+', ' ', val)
        radii[normalized] += 1
print(f"Unique radius values: {len(radii)}")
print("Top radii:")
for r, c in radii.most_common(15):
    print(f"  {r:>20}  ×{c}")

# 5. box-shadow
print()
print("="*70)
print("=== Box Shadow / Elevation ===")
print("="*70)
shadows = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'box-shadow:\s*([^;]+);', text):
        val = m.group(1).strip()
        # 標準化：抓第一個 px 值判斷 elevation
        if px_match := re.match(r'(\d+)px', val):
            elev = int(px_match.group(1))
            if elev <= 4:
                bucket = "elevation-1 (0-4px)"
            elif elev <= 12:
                bucket = "elevation-2 (5-12px)"
            elif elev <= 24:
                bucket = "elevation-3 (13-24px)"
            else:
                bucket = "elevation-4 (25+px)"
            shadows[bucket] += 1
print("Elevation distribution:")
for b, c in shadows.most_common():
    print(f"  {b}: {c} usages")

# 6. 容器寬度
print()
print("="*70)
print("=== Container Max-Widths ===")
print("="*70)
widths = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'max-width:\s*([0-9]+)(px|rem)', text):
        key = f"{m.group(1)}{m.group(2)}"
        widths[key] += 1
print("Top max-widths:")
for w, c in widths.most_common(10):
    print(f"  {w:>10}  ×{c}")

# 7. RWD breakpoints
print()
print("="*70)
print("=== Responsive Breakpoints ===")
print("="*70)
breakpoints = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'@media\s*\([^)]*max-width:\s*(\d+)px', text):
        breakpoints[f"{m.group(1)}px"] += 1
print("Breakpoints (max-width):")
for bp, c in sorted(breakpoints.items(), key=lambda x: float(x[0][:-2])):
    print(f"  max-width: {bp}  ×{c}")

# 8. 顏色
print()
print("="*70)
print("=== Color Palette (raw hex values) ===")
print("="*70)
colors = Counter()
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    for m in re.finditer(r'#[0-9a-fA-F]{6}\b', text):
        colors[m.group(0).lower()] += 1
print(f"Unique colors used: {len(colors)}")
print("Top 20 colors:")
for c, n in colors.most_common(20):
    print(f"  {c}  ×{n}")

# 9. 顏色重複定義的紅旗
print()
print("="*70)
print("=== Page-specific :root variables (theme overrides) ===")
print("="*70)
theme_overrides = defaultdict(list)
for f in css_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    # 抓 body[data-page="xxx"] { ... } 區塊
    for m in re.finditer(r'body\[data-page="([^"]+)"\][^{]*\{([^}]+)\}', text):
        page = m.group(1)
        content = m.group(2)
        # 抓 CSS 變量定義
        for vm in re.finditer(r'--([a-zA-Z0-9-]+):\s*([^;]+);', content):
            theme_overrides[page].append((vm.group(1), vm.group(2).strip()))
if theme_overrides:
    print(f"Pages with custom theme: {len(theme_overrides)}")
    for page, vars in sorted(theme_overrides.items()):
        print(f"\n  {page}: {len(vars)} overrides")
        for vname, vval in vars[:5]:
            print(f"    --{vname}: {vval}")
        if len(vars) > 5:
            print(f"    ... and {len(vars)-5} more")

print()
print("="*70)
print("=== SUMMARY ===")
print("="*70)
print(f"  CSS files: {len(css_files)}")
print(f"  Total CSS LOC: {sum(f.stat().st_size for f in css_files)/1024:.1f} KB")
print(f"  Unique design tokens: {len(all_vars_def)}")
print(f"  Unique font sizes: {len(font_sizes)}")
print(f"  Unique spacings: {len(spacings)}")
print(f"  Unique colors: {len(colors)}")
print(f"  RWD breakpoints: {len(breakpoints)}")
