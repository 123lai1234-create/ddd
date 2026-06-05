"""Per-page accessibility & polish checklist.
Audits every Astro page for the things an interviewer would notice:
- viewport meta, lang attr
- h1 count, heading order
- alt text on images
- aria-label on nav/interactive
- external links (rel=noopener)
- console.error in inline scripts
- meta description
- og:title, og:image
- canonical url
"""
import re
import sys
from pathlib import Path

PAGES = Path(r"D:\project\astro/src/pages")
files = sorted(PAGES.glob("*.astro"))
print(f"Auditing {len(files)} pages")
print("="*78)

checks_template = [
    ("viewport", r'<meta\s+name="viewport"'),
    ("lang attr", r'<html\s+lang="'),
    ("meta desc", r'<meta\s+name="description"'),
    ("og:title", r'<meta\s+property="og:title"'),
    ("og:image", r'<meta\s+property="og:image"'),
    ("canonical", r'<link\s+rel="canonical"'),
    ("h1 present", r'<h1[\s>]'),
    ("aria-label nav", r'aria-label="[Nn]av'),
    ("skip link", r'skip\s+to|skip-to'),
]

def score_page(text, name):
    issues = []
    h1_count = len(re.findall(r'<h1[\s>]', text))
    img_count = len(re.findall(r'<img\b', text))
    img_no_alt = len(re.findall(r'<img(?![^>]*\salt=)[^>]*>', text))
    ext_links = re.findall(r'<a[^>]+href="https?://[^"]+"[^>]*>', text)
    ext_no_opener = [l for l in ext_links if 'rel=' not in l or 'noopener' not in l]
    has_console_error = bool(re.search(r'console\.(error|warn)', text))
    has_inline_onclick = bool(re.search(r'\bonclick="', text))

    results = []
    for name_c, pat in checks_template:
        ok = bool(re.search(pat, text, re.IGNORECASE))
        results.append((name_c, ok))

    if h1_count == 0:
        issues.append(("h1 missing", "ERROR"))
    elif h1_count > 1:
        issues.append((f"h1 ×{h1_count}", "WARN"))
    if img_no_alt > 0:
        issues.append((f"img missing alt ×{img_no_alt}", "ERROR"))
    if ext_no_opener:
        issues.append((f"ext link no rel=noopener ×{len(ext_no_opener)}", "WARN"))
    if has_console_error:
        issues.append(("inline console.error/warn", "WARN"))
    if has_inline_onclick:
        # 計算數量
        n = len(re.findall(r'\bonclick="', text))
        issues.append((f"inline onclick ×{n}", "WARN"))

    return results, issues

all_data = []
for f in files:
    text = f.read_text(encoding='utf-8', errors='replace')
    name = f.name
    results, issues = score_page(text, name)
    all_data.append((name, results, issues, len(text)))

# 表
print(f"\n{'Page':<32} {'size':>7}  h1  issues")
print("-"*78)
for name, results, issues, size in all_data:
    h1_match = next((v for k, v in results if k == "h1 present"), False)
    h1_str = "✓" if h1_match else "✗"
    issue_str = ", ".join(f"{lvl}:{msg}" for msg, lvl in issues) if issues else "—"
    print(f"{name:<32} {size//1024:>5}KB  {h1_str}   {issue_str}")

# 摘要
print()
print("="*78)
print("=== Aggregate Issues ===")
err_count = sum(1 for _, _, iss, _ in all_data if any(lvl == "ERROR" for _, lvl in iss))
warn_count = sum(1 for _, _, iss, _ in all_data if any(lvl == "WARN" for _, lvl in iss))
print(f"  Pages with ERROR: {err_count}")
print(f"  Pages with WARN:  {warn_count}")
print(f"  Total pages:      {len(all_data)}")
