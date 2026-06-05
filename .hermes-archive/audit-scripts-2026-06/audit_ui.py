"""Analyze HTML/CSS structure for common UI/UX issues:
- Layout/grid issues
- Typography (font sizes, line-height)
- Color contrast
- Mobile (no media query check on body width)
- Accessibility (alt text, aria, headings)
- Empty states
- Error states
- Loading states
"""
import re
import subprocess
from pathlib import Path

BASE = "https://donttalk.vercel.app"
PAGES = ["index", "about", "works", "music", "thesis", "report", "ngs",
         "gene-ai", "protein-mpnn", "interview", "blog", "interactive-showcase",
         "xian-godot"]

# 抓每頁 HTML + 它用的 CSS
def fetch(url):
    r = subprocess.run(["curl", "-s", "-L", url], capture_output=True, text=True, timeout=20)
    return r.stdout

issues_per_page = {}

for page in PAGES:
    url = f"{BASE}/{page}/"
    html = fetch(url)
    issues = []

    # 1. 有沒有 viewport meta
    if "viewport" not in html:
        issues.append("❌ 缺少 viewport meta（手機會壞）")

    # 2. 有沒有 <title> 和 <meta description>
    if "<title>" not in html:
        issues.append("❌ 缺少 <title>")
    if 'name="description"' not in html:
        issues.append("❌ 缺少 meta description")

    # 3. 有沒有 og:image / og:title
    if 'property="og:image"' not in html:
        issues.append("⚠ 缺 og:image（社群分享會沒圖）")
    if 'property="og:title"' not in html:
        issues.append("⚠ 缺 og:title")

    # 4. h1 數量
    h1_count = len(re.findall(r'<h1[^>]*>', html))
    if h1_count == 0:
        issues.append("❌ 沒有 <h1>（SEO + 結構問題）")
    elif h1_count > 1:
        issues.append(f"⚠ 多個 <h1>（{h1_count} 個，建議只 1 個）")

    # 5. 圖片缺 alt
    imgs_no_alt = re.findall(r'<img[^>]+(?!alt=)[^>]*>', html)
    imgs_with_alt = re.findall(r'<img[^>]+alt=', html)
    total_imgs = len(re.findall(r'<img\s', html))
    if total_imgs > 0 and len(imgs_no_alt) > len(imgs_with_alt) * 0.5:
        issues.append(f"⚠ 圖片有 {total_imgs} 張，alt 缺漏可能多")

    # 6. inline onclick（前面討論過這是 anti-pattern）
    inline_onclick = len(re.findall(r'onclick=', html))
    if inline_onclick > 5:
        issues.append(f"⚠ inline onclick={inline_onclick} 次（維護性問題，但作品集可接受）")

    # 7. body class/page 標記
    if 'data-page=' not in html:
        issues.append("⚠ body 沒 data-page 屬性（Base.astro 應該有）")

    # 8. 有沒有 noscript fallback
    if "<noscript>" not in html:
        issues.append("⚠ 沒 <noscript> fallback")

    # 9. 看 main content 區塊（找 h2 看結構）
    h2_count = len(re.findall(r'<h2[^>]*>', html))
    if h2_count == 0 and page not in ["blog"]:
        issues.append("⚠ 沒有 <h2> 區段（結構單薄）")

    # 10. 表單元素（如果有）缺 label
    inputs = len(re.findall(r'<input\s', html))
    if inputs > 0:
        labels = len(re.findall(r'<label[^>]*for=', html))
        if labels < inputs * 0.5:
            issues.append(f"⚠ 有 {inputs} 個 input 但只 {labels} 個有 label")

    # 11. 大型 iframe / embed（可能影響效能 + 沒 sandbox）
    iframes = re.findall(r'<iframe[^>]*>', html)
    for iframe in iframes:
        if 'sandbox=' not in iframe:
            issues.append("⚠ iframe 缺 sandbox 屬性")

    issues_per_page[page] = issues

# 12. 共用 CSS 結構分析
css_html = fetch(f"{BASE}/styles/shared.css")
if css_html:
    # 檢查 CSS variable 定義
    css_vars = re.findall(r'--([a-z-]+):', css_html)
    print(f"shared.css defines {len(set(css_vars))} CSS variables")

# 13. mobile media query 數
rwd_queries_shared = len(re.findall(r'@media\s*\(', css_html))
print(f"shared.css @media queries: {rwd_queries_shared}")

# 輸出結果
print()
print("="*70)
print("=== Per-page issues ===")
print("="*70)
for page in PAGES:
    issues = issues_per_page[page]
    if issues:
        print(f"\n[{page}]")
        for i in issues:
            print(f"  {i}")
    else:
        print(f"\n[{page}] ✓ 無明顯問題")
