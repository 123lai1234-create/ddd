#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""三視圖設計稿接入（2026-11-23）

把 51 隻角色的造型設計稿接進《禁閉逃殺：文字獄》遊戲頁：

1. 新增 openView(id)：開 modal 顯示該角色的三視圖設計稿
   （左：主視覺／右：正面・側面・背面），並可一鍵跳到 3D 檢視。
2. showCard()：在「🎥 3D 檢視」旁加「📐 設計稿」按鈕。
3. junkPanel()：6 隻 N 白卡（物件角色）也加「📐 設計稿」按鈕。
4. avatar()：6 隻物件角色的卡面改用 images/avatars-v2/<id>.webp
   （新版 Format A 畫風；放獨立資料夾，上游同步不會覆蓋）。

素材位置（不隨上游同步被洗掉）：
- images/views/<id>.webp          51 張設計稿
- images/avatars-v2/<id>.webp     6 隻物件角色的新卡面
- 獨立頁 /3d-gallery/             51 隻一覽（模型 + 設計稿切換）

本檔是 patch-game-html.py 的第 5 步，可單獨執行（python patch_game_design_sheets.py <index.html>）。
所有替換都是 idempotent：重跑不會重複套用，上游重同步後重跑即可恢復。
"""
import io
import sys

MARK = 'MIRROR FEATURE: DESIGN SHEETS'

VIEW_IDS = [
    'arsonist', 'ashen', 'assassin', 'bartender', 'berserker', 'bodyguard',
    'bomb', 'boss', 'butcher', 'chair', 'chef', 'chemist', 'climber', 'courier',
    'detective', 'diver', 'exorcist', 'fatty', 'fatty2', 'gambler', 'geneFreak',
    'gourmet', 'hacker', 'herbalist', 'hunter', 'janitor', 'leader', 'locker',
    'lucky', 'medic', 'mediocre', 'merc', 'miner', 'paramedic', 'qing', 'quilt',
    'runner', 'scavenger', 'sentinel', 'shade', 'sniper', 'sock', 'survivor',
    'tamer', 'tin', 'torch', 'trucker', 'tycoon', 'vampire', 'veteran', 'witch',
]

# 插入設計稿 JS 的候選錨點（依序嘗試）
JS_ANCHORS = [
    '/* ===================== GUIDE ===================== */',
    'function showCard(id){',
]

DESIGN_JS = '''/* ===== MIRROR FEATURE: DESIGN SHEETS ===== */
// 51 隻角色的三視圖設計稿（主視覺 + 正面／側面／背面），放在 images/views/<id>.webp。
// 6 隻 N 白卡（物件角色）另有新版 Format A 畫風卡面，放在 images/avatars-v2/<id>.webp。
const VIEWS=new Set(%s);
function openView(id){
  const nm=(CARDS[id]&&CARDS[id].name)||(JUNK[id]&&JUNK[id].name)||id;
  openModal(`<h3 style="margin:0 0 8px">📐 ${nm} · 設計稿</h3>
  <img src="images/views/${id}.webp" alt="${nm} 三視圖設計稿" loading="lazy" decoding="async" style="width:100%%;border-radius:10px;background:#0e1014;display:block">
  <div class="dim small" style="margin-top:8px">左：角色主視覺　右：正面／側面／背面（轉面 0° → 90° → 180°）</div>
  <div class="row" style="margin-top:12px"><button onclick="closeModal()">關閉</button>${GLB3D.has(id)?`<button class="pri" style="margin-left:auto" onclick="open3D('${id}')">🎥 3D 檢視</button>`:""}</div>`);
}
function viewBtn(id){
  return `<button onclick="openView('${id}')">📐 設計稿</button>`;
}
/* ===== END MIRROR FEATURE: DESIGN SHEETS ===== */
''' % repr(VIEW_IDS).replace("'", "'")

# showCard() 的按鈕列：上游 + 3D viewer 補丁後的樣子 → 加上設計稿按鈕
ROW_OLD = '''    ${GLB3D.has(id)?`<div class="row" style="margin-top:8px"><button class="pri" onclick="open3D('${id}')">🎥 3D 檢視</button></div>`:""}
'''
ROW_NEW = '''    ${(GLB3D.has(id)||VIEWS.has(id))?`<div class="row" style="margin-top:8px">${GLB3D.has(id)?`<button class="pri" onclick="open3D('${id}')">🎥 3D 檢視</button>`:""}${VIEWS.has(id)?viewBtn(id):""}</div>`:""}
'''

# junkPanel()：6 隻白卡加設計稿按鈕
JUNK_OLD = '''<button class="mini" onclick="sellJunk('${k}')">遣散 🪙${SAVE.junk[k]*JUNK_PRICE}</button></div>'''
JUNK_NEW = '''<button class="mini" onclick="openView('${k}')">📐 設計稿</button> <button class="mini" onclick="sellJunk('${k}')">遣散 🪙${SAVE.junk[k]*JUNK_PRICE}</button></div>'''

# avatar()：6 隻物件角色改用新版卡面（獨立資料夾，不受上游同步影響）
AVATAR_OLD = '''if(JUNK[id])return `<img loading="lazy" decoding="async" class="avimg" src="images/avatars/${id}.webp" alt="" draggable="false" onerror="this.outerHTML='<span class=emo>${JUNK[id].emoji}</span>'">`;'''
AVATAR_NEW = '''if(JUNK[id])return `<img loading="lazy" decoding="async" class="avimg" src="images/avatars-v2/${id}.webp" alt="" draggable="false" onerror="this.outerHTML='<span class=emo>${JUNK[id].emoji}</span>'">`;'''

# 設計稿 modal 的底部列：加一個「51 隻一覽」按鈕導到獨立頁 /3d-gallery
FOOTER_OLD = '''<button onclick="closeModal()">關閉</button>${GLB3D.has(id)?`<button class="pri" style="margin-left:auto" onclick="open3D('${id}')">🎥 3D 檢視</button>`:""}</div>`);'''
FOOTER_NEW = '''<button onclick="closeModal()">關閉</button><button onclick="location.href='/3d-gallery'">📚 51 隻一覽</button>${GLB3D.has(id)?`<button class="pri" style="margin-left:auto" onclick="open3D('${id}')">🎥 3D 檢視</button>`:""}</div>`);'''


def patch(src):
    """回傳 (新內容, 套用幾條規則)。"""
    fired = 0

    # 1) 設計稿 JS 區塊
    if MARK not in src:
        for anchor in JS_ANCHORS:
            if anchor in src:
                src = src.replace(anchor, DESIGN_JS + '\n' + anchor, 1)
                fired += 1
                break
        else:
            raise RuntimeError('找不到 JS 插入錨點（%s）' % ' / '.join(JS_ANCHORS))

    # 2) showCard 按鈕
    if ROW_NEW not in src and ROW_OLD in src:
        src = src.replace(ROW_OLD, ROW_NEW, 1)
        fired += 1

    # 3) junkPanel 按鈕
    if JUNK_NEW not in src and JUNK_OLD in src:
        src = src.replace(JUNK_OLD, JUNK_NEW, 1)
        fired += 1

    # 4) 6 隻物件角色卡面
    if AVATAR_NEW not in src and AVATAR_OLD in src:
        src = src.replace(AVATAR_OLD, AVATAR_NEW, 1)
        fired += 1

    # 5) 設計稿 modal 加「51 隻一覽」按鈕（獨立頁 /3d-gallery）
    if FOOTER_NEW not in src and FOOTER_OLD in src:
        src = src.replace(FOOTER_OLD, FOOTER_NEW, 1)
        fired += 1

    return src, fired


def main():
    target = (sys.argv[1] if len(sys.argv) > 1 else
              r'D:\project\astro\public\games\confinement-escape\index.html')
    with io.open(target, 'r', encoding='utf-8', newline='') as fh:
        src = fh.read()
    src, fired = patch(src)
    with io.open(target, 'w', encoding='utf-8', newline='') as fh:
        fh.write(src)
    print('design sheets rules applied : %d (of 4)' % fired)
    return 0


if __name__ == '__main__':
    sys.exit(main())
