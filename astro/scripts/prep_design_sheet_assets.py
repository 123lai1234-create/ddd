# -*- coding: utf-8 -*-
"""
把 51 張三視圖設計稿轉成網頁用素材：
  1) views/<id>.jpg      完整設計稿（主視覺 + 正側背三視圖），橫幅寬 <=1600
  2) avatars-v2/<id>.webp 僅 6 隻物件角色：從左側主視覺裁方形卡面 512x512
  3) views.json          id -> 檔名 對照表 + 標題

來源：
  - 45 隻人類角色 → confinement-escape-51-views/<NN>-<id>-<zh>.jpg （Format A 原圖）
  - 6 隻物件角色 → _redesign_final/<NN>-<id>-<zh>.jpg （本次改版後的 Format A）
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

SRC = r"D:\Users\Downloads\confinement-escape-51-views"
FINAL = os.path.join(SRC, "_redesign_final")
OUT_ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SRC, "_web")

JUNK_IDS = ["chair", "locker", "quilt", "sock", "tin", "torch"]
VIEW_MAXW = 1600
AVATAR_SIZE = 512


def parse_name(path):
    """'10-chair-斷腿椅子.jpg' -> (10, 'chair', '斷腿椅子')"""
    stem = os.path.splitext(os.path.basename(path))[0]
    m = re.match(r"^(\d+)-([A-Za-z0-9]+)-(.*)$", stem)
    if not m:
        return None
    return int(m.group(1)), m.group(2), m.group(3)


def collect():
    """回傳 [(num, id, zh, path, is_redesign)]，依編號排序。"""
    items = []
    for fn in os.listdir(SRC):
        if not fn.lower().endswith(".jpg"):
            continue
        p = parse_name(fn)
        if not p:
            continue
        num, cid, zh = p
        if cid in JUNK_IDS:
            continue
        items.append((num, cid, zh, os.path.join(SRC, fn), False))
    for fn in os.listdir(FINAL):
        if not fn.lower().endswith(".jpg"):
            continue
        p = parse_name(fn)
        if not p:
            continue
        num, cid, zh = p
        items.append((num, cid, zh, os.path.join(FINAL, fn), True))
    items.sort(key=lambda x: x[0])
    return items


def split_panel(img):
    """回傳左側主視覺區的右邊界 x（依左右分界推算）。"""
    w, _ = img.size
    # Format A：左約 54% 是場景主視覺，右 46% 是三視圖
    return int(round(w * 0.54))


def subject_bbox(img, panel_right):
    """在左側主視覺區找出角色主體的 bbox。

    背景是「只有垂直方向變化」的漸層 → 以每列左右邊緣帶為背景取樣，
    逐像素算與該列背景色的差，門檻化後取最大連通區域。
    """
    arr = np.asarray(img.convert("RGB"), dtype=np.int16)
    h, w, _ = arr.shape
    right = max(8, panel_right)
    band = max(6, right // 24)

    # 背景取樣：每列左邊緣帶 + 左面板右邊緣帶
    samples = np.concatenate(
        [arr[:, :band, :], arr[:, right - band:right, :]], axis=1
    )
    bg = np.median(samples, axis=1, keepdims=True)  # (h,1,3)

    diff = np.abs(arr[:, :right, :] - bg).max(axis=2)  # (h, right)
    mask = (diff > 26).astype(np.uint8)
    # 水平方向閉合 + 垂直方向開運算，去掉雜訊
    m = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    m = m.filter(ImageFilter.MaxFilter(9))     # 水平閉合
    m = m.filter(ImageFilter.MinFilter(5))     # 垂直開運算
    mask = np.asarray(m) > 0

    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return (x0, y0, x1, y1)


def square_crop(img, bbox, size, pad_ratio=0.10):
    """以 bbox 為中心裁正方形（含留白），再縮到 size。"""
    x0, y0, x1, y1 = bbox
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    side = max(x1 - x0, y1 - y0)
    side = side * (1 + pad_ratio * 2)
    side = min(side, img.size[0], img.size[1])
    left = cx - side / 2.0
    top = cy - side / 2.0
    box = (
        int(max(0, round(left))),
        int(max(0, round(top))),
        int(min(img.size[0], round(left + side))),
        int(min(img.size[1], round(top + side))),
    )
    return img.crop(box).resize((size, size), Image.LANCZOS)


def main():
    views_dir = os.path.join(OUT_ROOT, "views")
    avatars_dir = os.path.join(OUT_ROOT, "avatars-v2")
    os.makedirs(views_dir, exist_ok=True)
    os.makedirs(avatars_dir, exist_ok=True)

    items = collect()
    manifest = {"views": {}, "avatars": {}, "count": len(items)}

    for num, cid, zh, path, is_new in items:
        img = Image.open(path)
        img = img.convert("RGB")
        w, h = img.size

        # --- 設計稿 ---
        out = img.copy()
        if out.width > VIEW_MAXW:
            nh = round(h * VIEW_MAXW / out.width)
            out = out.resize((VIEW_MAXW, nh), Image.LANCZOS)
        vname = f"{cid}.jpg"
        out.save(os.path.join(views_dir, vname), "JPEG", quality=82, optimize=True, progressive=True)
        manifest["views"][cid] = {"file": vname, "name": zh, "num": num, "w": out.width, "h": out.height}

        # --- 6 隻物件角色的方形卡面 ---
        if cid in JUNK_IDS:
            panel_right = split_panel(img)
            bbox = subject_bbox(img, panel_right)
            if bbox:
                av = square_crop(img, bbox, AVATAR_SIZE)
                aname = f"{cid}.webp"
                av.save(os.path.join(avatars_dir, aname), "WEBP", quality=82, method=5)
                manifest["avatars"][cid] = {"file": aname, "bbox": list(bbox)}
            else:
                print(f"[warn] {cid}: 找不到主體 bbox", file=sys.stderr)

        print(f"{num:>2} {cid:<10} {w}x{h} -> views/{vname}"
              + ("  [新設計稿]" if is_new else "")
              + ("  +avatar" if cid in JUNK_IDS else ""))

    with open(os.path.join(OUT_ROOT, "views.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\n完成：{len(items)} 張 -> {OUT_ROOT}")


if __name__ == "__main__":
    main()
