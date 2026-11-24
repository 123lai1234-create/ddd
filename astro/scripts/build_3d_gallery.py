# -*- coding: utf-8 -*-
"""
產生《監獄逃脫》51 角色的「3D 檢視網站」：
  astro/public/3d-gallery/index.html   獨立頁（可旋轉 3D 模型 + 三視圖設計稿）
  astro/public/3d-gallery/thumbs/*.webp  角色方形縮圖（從設計稿左側主視覺裁出）

設計稿本身放在 astro/public/games/confinement-escape/images/views/，此頁直接引用，不重複佔空間。
"""
import json
import os
import re
import sys

from PIL import Image, ImageFilter
import numpy as np

ASTRO = r"D:\project\astro"
GAME = os.path.join(ASTRO, "public", "games", "confinement-escape")
OUT = os.path.join(ASTRO, "public", "3d-gallery")
THUMBS = os.path.join(OUT, "thumbs")
VIEWS_DIR = os.path.join(GAME, "images", "views")

RARITY_CLS = {"SSR": "rSSR", "SR": "rSR", "R": "rR", "N": "rN"}


# ---------- 名單 ----------
def parse_roster():
    with open(os.path.join(GAME, "index.html"), encoding="utf-8") as f:
        src = f.read()

    i = src.index("const CARDS={")
    j = src.index("\n};", i)
    cards = {}
    for cid, nm, r in re.findall(r'(\w+):\{name:"([^"]+)",\s*r:"(\w+)"', src[i:j]):
        cards[cid] = {"name": nm, "r": r, "kind": "角色"}

    k = src.index("const JUNK={")
    l = src.index("\n};", k)
    for cid, nm, emo, r in re.findall(
            r'(\w+):\{name:"([^"]+)",emoji:"([^"]+)",r:"(\w+)"', src[k:l]):
        cards[cid] = {"name": nm, "r": r, "kind": "物件", "emoji": emo}

    # 職業：CLASSES = 類型 -> {name, icon}；CARD_CLS = 角色 id -> 類型
    classes = {}
    m = re.search(r"const CLASSES=\{(.*?)\n\};", src, re.S)
    if m:
        for ct, cn, ci in re.findall(r'(\w+):\{name:"([^"]+)",icon:"([^"]+)"', m.group(1)):
            classes[ct] = {"name": cn, "icon": ci}

    card_cls = {}
    m = re.search(r"const CARD_CLS=\{(.*?)\n\};", src, re.S)
    if m:
        for cid, ct in re.findall(r'(\w+):"(\w+)"', m.group(1)):
            card_cls[cid] = ct

    cls = {}
    for cid, ct in card_cls.items():
        c = classes.get(ct)
        if c:
            cls[cid] = f"{c['icon']} {c['name']}"
    return cards, cls


# ---------- 縮圖 ----------
def subject_bbox(img, panel_right):
    arr = np.asarray(img.convert("RGB"), dtype=np.int16)
    h, w, _ = arr.shape
    right = max(8, panel_right)
    band = max(6, right // 24)
    samples = np.concatenate([arr[:, :band, :], arr[:, right - band:right, :]], axis=1)
    bg = np.median(samples, axis=1, keepdims=True)
    diff = np.abs(arr[:, :right, :] - bg).max(axis=2)
    mask = (diff > 26).astype(np.uint8)
    m = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    m = m.filter(ImageFilter.MaxFilter(9))
    m = m.filter(ImageFilter.MinFilter(5))
    ys, xs = np.nonzero(np.asarray(m) > 0)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def square_crop(img, bbox, size, pad=0.10):
    x0, y0, x1, y1 = bbox
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    side = max(x1 - x0, y1 - y0) * (1 + pad * 2)
    side = min(side, img.size[0], img.size[1])
    left, top = cx - side / 2.0, cy - side / 2.0
    box = (int(max(0, left)), int(max(0, top)),
           int(min(img.size[0], left + side)), int(min(img.size[1], top + side)))
    return img.crop(box).resize((size, size), Image.LANCZOS)


def make_thumbs(ids):
    os.makedirs(THUMBS, exist_ok=True)
    for cid in ids:
        src = os.path.join(VIEWS_DIR, cid + ".webp")
        if not os.path.exists(src):
            print("skip (no sheet):", cid)
            continue
        img = Image.open(src).convert("RGB")
        right = int(round(img.width * 0.54))
        bbox = subject_bbox(img, right)
        if not bbox:
            print("no bbox:", cid)
            continue
        square_crop(img, bbox, 360).save(
            os.path.join(THUMBS, cid + ".webp"), "WEBP", quality=80, method=5)


# ---------- 頁面 ----------
PAGE = r"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>監獄逃脫 51 角色 · 3D 檢視鑑摩</title>
<meta name="description" content="《禁閉逃殺：文字獄》51 隻角色的三視圖設計稿與可旋轉 3D 模型對照鑑摩。">
<style>
  :root{color-scheme:dark;--bg:#0e1014;--panel:#171a21;--line:#262c36;--fg:#e8ebf1;--dim:#8e9bb0;--acc:#7fd1ff}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--fg);
    font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,-apple-system,sans-serif}
  a{color:var(--acc)}
  .wrap{max-width:1400px;margin:0 auto;padding:28px 20px 80px}
  header{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:20px}
  h1{margin:0 0 6px;font-size:26px;letter-spacing:.02em}
  .sub{color:var(--dim);font-size:14px;line-height:1.7;margin:0}
  .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:18px 0 22px}
  .chip{border:1px solid var(--line);background:#12151b;color:var(--fg);padding:7px 13px;
    border-radius:999px;font-size:13px;cursor:pointer;transition:.15s}
  .chip:hover{border-color:#3c4657}
  .chip.on{background:var(--acc);color:#0b0d11;border-color:var(--acc);font-weight:600}
  .cnt{color:var(--dim);font-size:13px;margin-left:auto}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;
    cursor:pointer;transition:.15s;text-align:left;padding:0;color:inherit;font:inherit}
  .card:hover{border-color:var(--acc);transform:translateY(-2px)}
  .card .thumb{aspect-ratio:1;background:#0b0d11;display:block;object-fit:cover;width:100%}
  .card .meta{padding:9px 11px 12px}
  .card .nm{font-size:14px;font-weight:600;margin-bottom:3px}
  .card .tag{font-size:11px;color:var(--dim)}
  .r{font-size:11px;font-weight:700;padding:1px 6px;border-radius:5px;margin-right:6px;vertical-align:1px}
  .rSSR{background:#4a2d6b;color:#e0c7ff}
  .rSR{background:#254a6b;color:#c2e2ff}
  .rR{background:#2c5237;color:#c6f0d2}
  .rN{background:#3a3f49;color:#cfd6e2}
  .obj{font-size:10px;background:#4a3a1c;color:#f0dcb0;border-radius:5px;padding:1px 5px;margin-left:5px}
  #modal{position:fixed;inset:0;background:rgba(8,10,14,.88);display:none;z-index:50;
    align-items:center;justify-content:center;padding:24px}
  #modal.on{display:flex}
  .mbox{background:var(--panel);border:1px solid var(--line);border-radius:16px;
    max-width:1180px;width:100%;max-height:92vh;overflow:auto;padding:20px}
  .mhead{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
  .mhead h2{margin:0;font-size:20px}
  .tabs{display:flex;gap:8px;margin-left:auto}
  .mvwrap{position:relative;width:100%;aspect-ratio:3/2;background:#0b0d11;border-radius:12px;overflow:hidden}
  model-viewer{width:100%;height:100%;background:#0b0d11;--poster-color:#0b0d11}
  .sheet{width:100%;border-radius:12px;background:#0b0d11;display:block}
  .mfoot{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  button.btn{border:1px solid var(--line);background:#12151b;color:var(--fg);padding:9px 15px;
    border-radius:10px;font-size:14px;cursor:pointer;font-family:inherit}
  button.btn:hover{border-color:var(--acc)}
  button.btn.pri{background:var(--acc);color:#0b0d11;border-color:var(--acc);font-weight:600}
  .note{color:var(--dim);font-size:13px;line-height:1.75;margin-top:26px;border-top:1px solid var(--line);padding-top:16px}
  .note b{color:var(--fg)}
  .hide{display:none}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>監獄逃脫 51 角色 · 3D 檢視鑑摩</h1>
    <p class="sub">
      《禁閉逃殺：文字獄》全部 51 隻角色的<b>三視圖設計稿</b>與<b>可旋轉 3D 模型</b>對照瀏覽。<br>
      設計稿為「左側角色主視覺 + 右側正面／側面／背面」版面；點卡片可切換檢視。
    </p>
  </header>

  <div class="bar" id="bar">
    <button class="chip on" data-f="all">全部</button>
    <button class="chip" data-f="SSR">SSR</button>
    <button class="chip" data-f="SR">SR</button>
    <button class="chip" data-f="R">R</button>
    <button class="chip" data-f="N">N 物件</button>
    <button class="chip" data-f="obj">只看物件角色</button>
    <span class="cnt" id="cnt"></span>
  </div>

  <div class="grid" id="grid"></div>

  <div class="note">
    <b>三視圖規格</b>：轉面角度 0°（正面）→ 90°（左側面）→ 180°（背面），同張內三視圖等高、同接地線；
    背景為暖米褐垂直漸層，角色以緊貼短深的橢圓陰影接地。
    <b>物件角色</b>（椅／鐵櫃／棉被／襪子／罐頭／手電筒）已改為與其他 45 隻相同的人物角色美術。
    <br>遊戲頁：<a href="/games/confinement-escape">禁閉逃殺：文字獄</a>　·　3D 模型來源：
    <a href="https://github.com/123lai1234-create/ddd-models">123lai1234-create/ddd-models</a>
  </div>
</div>

<div id="modal" onclick="if(event.target===this)closeM()">
  <div class="mbox">
    <div class="mhead">
      <h2 id="mname">角色</h2>
      <div class="tabs">
        <button class="btn pri" id="tab3d">🎥 3D 模型</button>
        <button class="btn" id="tabv">📐 三視圖設計稿</button>
      </div>
    </div>
    <div id="pane3d"><div class="mvwrap"><div id="mvload" style="position:absolute;inset:0;display:grid;place-items:center;color:#8e9bb0;font-size:14px">載入 3D 模型中…</div></div></div>
    <div id="panev" class="hide"><img class="sheet" id="sheetimg" alt=""></div>
    <div class="mfoot">
      <button class="btn" onclick="closeM()">關閉</button>
      <a class="btn" id="gamelink" href="/games/confinement-escape">前往遊戲</a>
    </div>
  </div>
</div>

<script>
const ROSTER = __ROSTER__;
// ⚠️ 站台 trailingSlash=false，/3d-gallery/ 會被 308 轉成 /3d-gallery，
// 相對路徑因此從「根目錄」解析（thumbs/xxx 會變成 /thumbs/xxx → 404）。
// 所以這頁所有資源路徑一律用絕對路徑。
const MV_BASE = "/games/confinement-escape/";
const THUMB_BASE = "/3d-gallery/thumbs/";
const SHEET_BASE = "/games/confinement-escape/images/views/";
let FILTER = "all", CUR = null, MV_READY = null;

const grid = document.getElementById("grid");
const cnt = document.getElementById("cnt");

function match(c){
  if(FILTER==="all") return true;
  if(FILTER==="obj") return c.kind==="物件";
  if(FILTER==="N") return c.r==="N";
  return c.r===FILTER;
}
function render(){
  const list = ROSTER.filter(match);
  cnt.textContent = list.length + " / " + ROSTER.length + " 隻";
  grid.innerHTML = list.map(c=>`
    <button class="card" data-id="${c.id}">
      <img class="thumb" loading="lazy" decoding="async" src="${THUMB_BASE}${c.id}.webp" alt="${c.name}">
      <div class="meta">
        <div class="nm"><span class="r ${c.rc}">${c.r}</span>${c.name}${c.kind==="物件"?'<span class="obj">物件</span>':""}</div>
        <div class="tag">${c.num>0?String(c.num).padStart(2,"0")+" · ":""}${c.cls||""}</div>
      </div>
    </button>`).join("");
  grid.querySelectorAll(".card").forEach(el=>{
    el.onclick = ()=>openM(el.dataset.id);
  });
}
document.getElementById("bar").addEventListener("click", e=>{
  const b = e.target.closest(".chip"); if(!b) return;
  document.querySelectorAll(".chip").forEach(x=>x.classList.toggle("on", x===b));
  FILTER = b.dataset.f; render();
});

function mvLoad(){
  if(MV_READY) return MV_READY;
  self.ModelViewerElement = Object.assign(self.ModelViewerElement||{},{dracoDecoderLocation:MV_BASE+"draco/"});
  MV_READY = import(MV_BASE+"model-viewer.min.js").then(()=>{
    const MV = customElements.get("model-viewer");
    if(MV && MV.setDRACODecoderLocation) MV.setDRACODecoderLocation(MV_BASE+"draco/");
  }).catch(e=>{MV_READY=null; throw e;});
  return MV_READY;
}

function openM(id){
  const c = ROSTER.find(x=>x.id===id); if(!c) return;
  CUR = c;
  document.getElementById("mname").innerHTML =
    `<span class="r ${c.rc}">${c.r}</span>${c.name}`;
  document.getElementById("sheetimg").src = SHEET_BASE + c.id + ".webp";
  document.getElementById("sheetimg").alt = c.name + " 三視圖設計稿";
  document.getElementById("gamelink").href = "/games/confinement-escape";
  document.getElementById("modal").classList.add("on");
  showTab("3d");
  mvLoad().then(()=>{
    const wrap = document.querySelector("#pane3d .mvwrap");
    if(!wrap || CUR.id!==id) return;
    wrap.innerHTML = '<model-viewer src="https://cdn.jsdelivr.net/gh/123lai1234-create/ddd-models@v4/models/'+id+'.glb"'
      + ' alt="'+c.name+' 3D" camera-controls camera-orbit="0deg 82deg 5.2m" camera-target="0m 1.0m 0m"'
      + ' field-of-view="30deg" exposure="0.85" shadow-intensity="0.7" interaction-prompt="none" ar-modes="none"></model-viewer>';
    wrap.querySelector("model-viewer").addEventListener("error",()=>{
      if(document.querySelector("#pane3d .mvwrap")===wrap)
        wrap.innerHTML='<div style="display:grid;place-items:center;height:100%;color:#ff8a8a">3D 模型載入失敗</div>';
    });
  }).catch(()=>{
    const el = document.querySelector("#mvload");
    if(el) el.textContent = "3D 檢視器載入失敗，請檢查連線後再試一次。";
  });
}
function showTab(t){
  const p3 = document.getElementById("pane3d"), pv = document.getElementById("panev");
  const b3 = document.getElementById("tab3d"), bv = document.getElementById("tabv");
  if(t==="3d"){p3.classList.remove("hide");pv.classList.add("hide");b3.classList.add("pri");bv.classList.remove("pri");}
  else{p3.classList.add("hide");pv.classList.remove("hide");bv.classList.add("pri");b3.classList.remove("pri");}
}
document.getElementById("tab3d").onclick = ()=>showTab("3d");
document.getElementById("tabv").onclick = ()=>showTab("v");
function closeM(){document.getElementById("modal").classList.remove("on");}
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeM(); });

render();
</script>
</body>
</html>
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    cards, cls = parse_roster()

    # 以設計稿清單為準（51 隻，檔名確定存在）
    man_path = r"D:\Users\Downloads\confinement-escape-51-views\_web\views.json"
    with open(man_path, encoding="utf-8") as f:
        man = json.load(f)

    roster = []
    for cid, v in man["views"].items():
        meta = cards.get(cid, {})
        roster.append({
            "id": cid,
            "num": v.get("num", 0),
            "name": meta.get("name", v.get("name", cid)),
            "r": meta.get("r", "R"),
            "rc": RARITY_CLS.get(meta.get("r", "R"), "rR"),
            "kind": meta.get("kind", "角色"),
            "cls": cls.get(cid, ""),
        })
    roster.sort(key=lambda x: x["num"])

    print("roster:", len(roster))
    make_thumbs([r["id"] for r in roster])

    html = PAGE.replace("__ROSTER__", json.dumps(roster, ensure_ascii=False))
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("wrote", os.path.join(OUT, "index.html"))
    print("thumbs:", len(os.listdir(THUMBS)))


if __name__ == "__main__":
    main()
