#!/usr/bin/env python3
"""Audit 4 個關鍵頁面：顏色、字型、layout、hierarchy、card pattern、間距"""
import re
import json
import os
T = os.environ.get('TEMP', r'C:\Users\User\AppData\Local\Temp')

pages = {
    "home": os.path.join(T, "home.html"),
    "music": os.path.join(T, "music.html"),
    "thesis": os.path.join(T, "thesis.html"),
    "works": os.path.join(T, "works.html"),
}

for name, path in pages.items():
    html = open(path, encoding="utf-8").read()
    print(f"\n========== {name.upper()} ({len(html):,} bytes) ==========")

    # 顏色（CSS hex）
    colors = sorted(set(re.findall(r'#[0-9a-fA-F]{3,6}\b', html)))
    print(f"  colors used: {colors[:15]}")

    # 字型
    fonts = sorted(set(re.findall(r'font-family\s*:\s*["\']?([^"\';}{]+)', html)))
    print(f"  fonts: {fonts[:5]}")

    # CSS 檔案
    css = re.findall(r'<link[^>]+href="([^"]+\.css[^"]*)"', html)
    print(f"  CSS files: {css[:4]}")

    # 標題層級
    h1 = re.findall(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)
    h2 = re.findall(r'<h2[^>]*>(.*?)</h2>', html, re.DOTALL)
    h3 = len(re.findall(r'<h3', html))
    print(f"  h1: {len(h1)} {h1[0][:80].strip() if h1 else ''}")
    print(f"  h2: {len(h2)}, h3: {h3}")

    # section / div 結構
    sections = len(re.findall(r'<section', html))
    articles = len(re.findall(r'<article', html))
    cards = len(re.findall(r'class="[^"]*card', html))
    grids = len(re.findall(r'display\s*:\s*grid|class="[^"]*grid', html))
    print(f"  sections: {sections}, articles: {articles}, cards: {cards}, grids: {grids}")

    # glassmorphism / backdrop-filter
    glass = len(re.findall(r'backdrop-filter|backdrop-filter|rgba\(', html))
    print(f"  glass/alpha: {glass}")

    # 漸層
    grads = len(re.findall(r'linear-gradient|radial-gradient|conic-gradient', html))
    print(f"  gradients: {grads}")

    # 圓角
    radii = set(re.findall(r'border-radius\s*:\s*([^;}\n]+)', html))
    print(f"  border-radius values: {sorted(radii)[:8]}")

    # padding
    pads = set(re.findall(r'padding\s*:\s*([^;}\n]+)', html))
    print(f"  padding values: {sorted(pads)[:8]}")

    # 動畫
    anims = len(re.findall(r'transition\s*:|animation\s*:|@keyframes', html))
    print(f"  animations: {anims}")
