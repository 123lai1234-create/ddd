#!/usr/bin/env python3
"""Patcher for the mirrored game at public/games/confinement-escape/index.html.

Keeps the local mirror deployable after a re-sync from upstream
(gagatim/confinement-escape-text). Every step is idempotent: re-running on an
already-patched file is a no-op, and each step prints how many times it fired.

1. Audio codec swap. Upstream ships 8 Ogg Vorbis BGM loops. Safari on macOS/iOS
   cannot decode Ogg at all, so those loops were silent on iPhone and iPad. They
   are transcoded to MP3 by scripts/ogg-to-mp3.py, so point the <audio src>
   values at the .mp3 twins.

2. Image loading hints. The game builds all of its markup from JS template
   strings, so almost every <img> was eager. Adding loading="lazy" +
   decoding="async" keeps the first paint small; in-viewport images still load
   immediately, so nothing visible gets deferred.

3. YouTube embed removal. Battle and escape-success screens played a track
   through the YouTube IFrame API - a third-party iframe, the only non-CC0 asset
   in the game, and a privacy leak for a game that otherwise needs no backend.
   The player container, the iframe_api script injection, the YT.Player wiring,
   the BGM_READY branch in syncBgm(), the #bgmBox CSS and the YouTube credit
   line all go. Those two screens now reuse CC0 tracks that already ship in
   music/: battles fall back to the Epic Boss Battle loop, escape success to the
   Triumphant fanfare.

4. 3D viewer (2026-11-10). The 51 Q-style doll characters have GLBs at
   models/<id>.glb. The card detail modal (showCard) gains a "3D 檢視" button
   under the name/stats in the detail header that opens a model-viewer overlay
   (drag to rotate, scroll to zoom). The viewer and its Draco decoder are
   vendored in the game folder (model-viewer.min.js, draco/) - no third-party
   requests. Anchors are upstream text, so a re-sync + re-run of this script
   re-applies it. (2026-11-10 晚：按鈕從底部列移到頭部；手機 390px 上詳情內容
   951px、可見框 715px，底部按鈕落在折疊線下點不到。）
   (2026-11-11: GLBs moved out of the deployment to jsDelivr CDN
   (github.com/123lai1234-create/ddd-models, tag v1) so the 51 models
   (~26 MB) no longer count against the Vercel Hobby 100 MB upload limit.
   model-viewer + draco/ stay vendored locally; only the .glb files come
   from the CDN. The URL is assembled in VIEWER_JS via GLB_CDN_BASE, and a
   migration rule below rewrites the old relative models/<id>.glb URL in an
   already-patched index.html.)

Reads and writes UTF-8 without a BOM, because the file is a faithful mirror of
upstream and the byte layout matters for future re-syncs.
"""

import io
import os
import re
import sys

TARGET = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'public', 'games', 'confinement-escape', 'index.html',
)

OGG_SRC = re.compile(r'(src="music/)([^"]+)\.ogg(")')

# The mirror is served from /games/confinement-escape/, so every relative asset
# path (images/, music/, sfx/, voice/) has to resolve from that folder. Upstream
# ships the game for a site root and has no <base>, so a re-sync that only copies
# index.html over would 404 every asset. Inserted idempotently here so the
# re-sync path can never lose it again.
BASE_ANCHOR = '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
BASE_TAG = '<base href="/games/confinement-escape/">\n'

# Exact (old, new) pairs. Exact strings rather than regex because these touch
# minified-ish JS where a greedy pattern would silently eat the wrong lines.
#
# 2026-11-02: upstream reshuffled the BGM block (BGM_KEYS / BOSS_BGM now sit
# between BGM_ID and the BGM globals) and rewrote the footer credit line. The
# old rules stopped matching and the patch silently stopped firing, so both the
# pre- and post-reshuffle wordings are listed side by side.
YOUTUBE_REMOVALS = [
    # the header comment + the player setup + iframe_api injection in loadBgm()
    (
        '// 依場景換曲：選單 main、遠征探索 run、無盡深淵 abyss（music/ 裡的 CC0 曲子）；\n'
        '// 戰鬥中與逃出成功的畫面 battle 改播 YouTube 嵌入播放器（不下載音檔）。\n'
        '// 瀏覽器規定要使用者點過頁面才能出聲，所以第一次點擊時才開始播\n'
        'const BGM_ID="2uGf8-vfFLI";\n',
        '// 依場景換曲：選單 main、遠征探索 run、無盡深淵 abyss（music/ 裡的 CC0 曲子）。\n'
        '// 瀏覽器規定要使用者點過頁面才能出聲，所以第一次點擊時才開始播。\n'
        '// 2026-10-23：戰鬥與逃出成功原本走 YouTube 嵌入播放器，已整段移除\n'
        '// （第三方 iframe + 非 CC0 曲目），改播 music/ 裡既有的 CC0 曲子。\n',
    ),
    (
        '// 依場景換曲：選單 main、遠征探索 run、無盡深淵 abyss（music/ 裡的 CC0 曲子）；\n'
        '// 戰鬥中與逃出成功的畫面 battle 改播 YouTube 嵌入播放器（不下載音檔）。\n'
        '// 瀏覽器規定要使用者點過頁面才能出聲，所以第一次點擊時才開始播\n'
        'const BGM_ID="2uGf8-vfFLI";\n'
        'const BGM_KEYS=',
        '// 依場景換曲：選單 main、遠征探索 run、無盡深淵 abyss（music/ 裡的 CC0 曲子）。\n'
        '// 瀏覽器規定要使用者點過頁面才能出聲，所以第一次點擊時才開始播。\n'
        '// 2026-10-23：戰鬥與逃出成功原本走 YouTube 嵌入播放器，已整段移除\n'
        '// （第三方 iframe + 非 CC0 曲目），改播 music/ 裡既有的 CC0 曲子。\n'
        'const BGM_KEYS=',
    ),
    (
        'let BGM=null,BGM_READY=false,BGM_STARTED=false,BGM_CUR=null;',
        'let BGM_STARTED=false,BGM_CUR=null;',
    ),
    (
        '  window.onYouTubeIframeAPIReady=()=>{\n'
        '    BGM=new YT.Player("bgmPlayer",{videoId:BGM_ID,\n'
        '      playerVars:{loop:1,playlist:BGM_ID,controls:1,playsinline:1,rel:0,modestbranding:1},\n'
        '      events:{onReady(){BGM_READY=true;BGM.setVolume(35);BGM_CUR=null;syncBgm();}}});\n'
        '  };\n'
        '  const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";'
        'document.head.appendChild(s);\n',
        '',
    ),
    # battles / escape success now reuse CC0 tracks already in music/
    (
        'if(VIEW==="battle"){ // 競技場、雙人對決（含網路對戰）的戰鬥用各自的專屬曲，'
        '其他戰鬥用 YouTube 那首\n',
        'if(VIEW==="battle"){ // 競技場、雙人對決（含網路對戰）用各自的專屬曲，'
        '其餘戰鬥用 Epic Boss Battle\n',
    ),
    (
        '    // 競技場、雙人對決（含網路對戰）的戰鬥用各自的專屬曲，其他戰鬥用 YouTube 那首\n',
        '    // 競技場、雙人對決（含網路對戰）用各自的專屬曲，其餘戰鬥用 Epic Boss Battle\n',
    ),
    (
        '    return "battle";\n'
        '  }\n'
        '  if(VIEW==="run"&&RUN&&!RUN.active&&RUN.escaped)return "battle";',
        '    return "arena";\n'
        '  }\n'
        '  if(VIEW==="run"&&RUN&&!RUN.active&&RUN.escaped)return "ach";'
        ' // 逃出成功：凱旋號角',
    ),
    # the YouTube playback branch in syncBgm()
    (
        '\n  if(BGM_READY){if(w==="battle"){BGM.seekTo(0,true);BGM.playVideo();}'
        'else BGM.pauseVideo();}',
        '',
    ),
    # the player container in the footer
    ('<div id="bgmBox"><div id="bgmPlayer"></div></div>', ''),
    # its CSS
    (
        '#bgmBox{width:200px;height:113px;border-radius:8px;overflow:hidden;'
        'background:#000;flex-shrink:0}\n'
        '#bgmBox iframe{width:100%;height:100%;border:0}\n',
        '',
    ),
    # the YouTube credit line in the footer - the track is gone, so the
    # attribution has to go with it. The CC0 OpenGameArt credits stay.
    # Both the old wording and the 2026-11-02 rewrite are listed.
    (
        '      ・戰鬥／破關：<b>DEgITx - Machine Paradigm</b>・出處 '
        '<a href="https://www.youtube.com/watch?v=2uGf8-vfFLI" target="_blank" '
        'rel="noopener">YouTube</a>\n'
        '      （作者頻道 <a href="https://www.youtube.com/@DEgITx" target="_blank" '
        'rel="noopener">@DEgITx</a>），版權屬於原作者，透過 YouTube 嵌入播放器播放。<br>\n',
        '',
    ),
    (
        '      ・戰鬥／破關：<b>Machine Paradigm</b> — Music: Alexey Kasyanchuk (DEgITx)・出處 '
        '<a href="https://www.youtube.com/watch?v=2uGf8-vfFLI" target="_blank" '
        'rel="noopener">YouTube</a>\n'
        '      （<a href="https://degitx.com/links" target="_blank" rel="noopener">作者連結</a>・'
        '<a href="https://www.youtube.com/@DEgITx" target="_blank" rel="noopener">@DEgITx</a>）・授權 '
        '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" '
        'rel="noopener">CC BY 4.0</a>，透過 YouTube 嵌入播放器播放。<br>\n',
        '',
    ),
    # the changelog entry announcing that credit line. This fork does not ship
    # that track, so the entry would describe a change players cannot see.
    (
        '  {d:"2026-11-02",t:["說明頁的配樂標示補上「戰鬥／破關」曲目的作者全名'
        '（Alexey Kasyanchuk / DEgITx）、作者連結與 CC BY 4.0 授權連結"]},\n',
        '',
    ),
]

# ---- 4. 3D viewer (2026-11-10) ----
# GLB 模型走 jsDelivr CDN（2026-11-11）：新版 51 隻臉貼圖 GLB 合計約 26 MB，
# 放進部署會讓整包衝破 Vercel Hobby 100 MB 上限，所以模型本體放在公開 repo
# 123lai1234-create/ddd-models（models/<id>.glb），用固定 tag v3 當正式網址
# （tag 網址是 immutable 快取，不怕 @main 的同步延遲；新版模型出新 tag 再改
# 這裡，並把舊 tag 加進 OLD_GLB_CDN_BASES 讓遷移規則換掉它）。model-viewer
# 與 Draco 解碼器仍是本站自帶檔案，不連外站的只有模型。
GLB_CDN_BASE = 'https://cdn.jsdelivr.net/gh/123lai1234-create/ddd-models@v3/models'
OLD_GLB_CDN_BASES = ['https://cdn.jsdelivr.net/gh/123lai1234-create/ddd-models@v1/models',
                     'https://cdn.jsdelivr.net/gh/123lai1234-create/ddd-models@v2/models']
VIEWER_CSS_ANCHOR = '#modal.show{display:flex}\n'
VIEWER_CSS = '''/* 3D 檢視浮層（model-viewer；按需載入，不影響首屏） */
.mvwrap{position:relative;width:100%;height:62vh;height:62dvh;min-height:320px;background:#0b0d10;border-radius:12px;overflow:hidden}
.mvwrap model-viewer{width:100%;height:100%;display:block;background:radial-gradient(circle at 50% 30%,#232830,#0b0d10 70%)}
.mvloading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dim)}
.mverr{padding:12px;text-align:center;color:var(--dim)}
@media (max-width:480px){.mvwrap{height:56vh;height:56dvh;min-height:280px}}
'''
VIEWER_JS_ANCHOR = 'function closeModal(){$("#modal").classList.remove("show");}\n'
VIEWER_JS = '''// ---- 3D 檢視：51 隻 Q 版娃娃風角色 GLB（jsDelivr CDN，見 GLB_CDN_BASE），按需載入 ----
// model-viewer 與 Draco 解碼器皆為本站自帶檔案（model-viewer.min.js、draco/）；
// 模型本體走 jsDelivr CDN（github.com/123lai1234-create/ddd-models@v2），
// 不放進 Vercel 部署，避開 Hobby 100 MB 上限。
const GLB3D=new Set(['arsonist','ashen','assassin','bartender','berserker','bodyguard','bomb','boss','butcher','chair','chef','chemist','climber','courier','detective','diver','exorcist','fatty','fatty2','gambler','geneFreak','gourmet','hacker','herbalist','hunter','janitor','leader','locker','lucky','medic','mediocre','merc','miner','paramedic','qing','quilt','runner','scavenger','sentinel','shade','sniper','sock','survivor','tamer','tin','torch','trucker','tycoon','vampire','veteran','witch']);
let MV_READY=null;
function mvLoad(){
  if(MV_READY)return MV_READY;
  self.ModelViewerElement=Object.assign(self.ModelViewerElement||{},{dracoDecoderLocation:'draco/'});
  MV_READY=import('./model-viewer.min.js').then(()=>{
    const MV=customElements.get('model-viewer');
    if(MV&&MV.setDRACODecoderLocation)MV.setDRACODecoderLocation('draco/');
  }).catch(e=>{MV_READY=null;throw e;});
  return MV_READY;
}
function open3D(id){
  const c=CARDS[id];
  openModal(`<h3 style="margin:0 0 8px">🎥 ${c.name} · 3D 檢視</h3>
  <div class="mvwrap"><div class="mvloading">載入 3D 模型中…</div></div>
  <div class="dim small" style="margin-top:8px">拖曳旋轉、滾輪／雙指縮放</div>
  <div class="row" style="margin-top:12px"><button onclick="showCard('${id}')">← 返回角色</button><button onclick="closeModal()" style="margin-left:auto">關閉</button></div>`);
  mvLoad().then(()=>{
    const wrap=document.querySelector('.mvwrap');
    if(!wrap)return;
    wrap.innerHTML=`<model-viewer src="__GLB_CDN_BASE__/${id}.glb" alt="${c.name} 3D" camera-controls camera-orbit="0deg 82deg 5.2m" camera-target="0m 1.0m 0m" field-of-view="30deg" exposure="0.85" shadow-intensity="0.7" interaction-prompt="none" ar-modes="none"></model-viewer>`;
    const mv=wrap.querySelector('model-viewer');
    mv.addEventListener('error',()=>{
      if(document.querySelector('.mvwrap')===wrap)wrap.innerHTML=`<div class="mverr">3D 模型載入失敗，請檢查連線後再試一次。</div>`;
    });
  }).catch(()=>{
    const el=document.querySelector('.mvloading');
    if(el)el.textContent='3D 檢視器載入失敗，請檢查連線後再試一次。';
  });
}
'''.replace('__GLB_CDN_BASE__', GLB_CDN_BASE)
VIEWER_BTN_OLD = '${canBreak(id)?`<button class="gold" onclick="BR_RES=null;confirmBreak(\'${id}\')">✨ 突破（${brOf(id)}→${brOf(id)+1}）</button>`:""}\n      <button onclick="closeModal()" style="margin-left:auto">關閉</button></div>'
VIEWER_BTN_NEW = '${canBreak(id)?`<button class="gold" onclick="BR_RES=null;confirmBreak(\'${id}\')">✨ 突破（${brOf(id)}→${brOf(id)+1}）</button>`:""}\n      ${GLB3D.has(id)?`<button class="pri" onclick="open3D(\'${id}\')">🎥 3D 檢視</button>`:""}\n      <button onclick="closeModal()" style="margin-left:auto">關閉</button></div>'
# 2026-11-10 晚：按鈕從底部列移到詳情頭部（名字／數值列下方）。手機 390px 上
# 詳情內容 951px、可見框 715px，底部按鈕落在折疊線下點不到；頭部按鈕不捲動
# 就看得到。錨點取數值列尾端（全檔唯一），避開全形空白比對。
VIEWER_BTN_TOP_ANCHOR = '💨 ${sv("spd",s.spd)}</div>\n'
VIEWER_BTN_TOP = '    ${GLB3D.has(id)?`<div class="row" style="margin-top:8px"><button class="pri" onclick="open3D(\'${id}\')">🎥 3D 檢視</button></div>`:""}\n'

def main():
    with io.open(TARGET, 'r', encoding='utf-8', newline='') as fh:
        src = fh.read()

    # 1. base tag for the /games/confinement-escape/ mount point
    before_base = 0
    if BASE_TAG not in src and BASE_ANCHOR in src:
        src = src.replace(BASE_ANCHOR, BASE_ANCHOR + BASE_TAG, 1)
        before_base = 1

    before_audio = len(OGG_SRC.findall(src))
    src = OGG_SRC.sub(r'\1\2.mp3\3', src)

    # <img ...> without an existing loading= attribute
    img_tag = re.compile(r'<img(?![^>]*\sloading=)([^>]*)>')
    before_img = len(img_tag.findall(src))
    src = img_tag.sub(r'<img loading="lazy" decoding="async"\1>', src)

    youtube_hits = 0
    fired = 0
    for old, new in YOUTUBE_REMOVALS:
        n = src.count(old)
        if n:
            src = src.replace(old, new)
            youtube_hits += n
            fired += 1

    # 4. 3D viewer: CSS, JS, and the showCard button. Each fires only when
    # its marker is absent, so re-running on an already-patched file is a
    # no-op (and a re-sync that wipes the viewer gets all four back).
    viewer_fired = 0
    if '/* 3D 檢視浮層' not in src and VIEWER_CSS_ANCHOR in src:
        src = src.replace(VIEWER_CSS_ANCHOR, VIEWER_CSS_ANCHOR + VIEWER_CSS, 1)
        viewer_fired += 1
    if 'function open3D(id)' not in src and VIEWER_JS_ANCHOR in src:
        src = src.replace(VIEWER_JS_ANCHOR, VIEWER_JS_ANCHOR + VIEWER_JS, 1)
        viewer_fired += 1
    # 2026-11-10 晚：按鈕改放詳情頭部（名字／數值列下方）。舊版在底部列的按鈕
    # 若還在，先拆掉；再把按鈕插到頭部。只有頭部錨點存在時才拆底部按鈕，
    # 避免錨點失效時按鈕整個消失。
    top_present = VIEWER_BTN_TOP in src
    if VIEWER_BTN_NEW in src and (top_present or VIEWER_BTN_TOP_ANCHOR in src):
        src = src.replace(VIEWER_BTN_NEW, VIEWER_BTN_OLD, 1)
        viewer_fired += 1
    if not top_present and VIEWER_BTN_TOP_ANCHOR in src:
        src = src.replace(VIEWER_BTN_TOP_ANCHOR, VIEWER_BTN_TOP_ANCHOR + VIEWER_BTN_TOP, 1)
        viewer_fired += 1
    # 2026-11-11: GLB 改走 jsDelivr CDN。已套過舊版補丁的 index.html 裡還
    # 留著相對路徑 src="models/${id}.glb"，把它改成 CDN 網址；新鮮重同步的
    # 檔案則由上面新版 VIEWER_JS 直接帶 CDN 網址，不需要這條。
    if 'src="models/${id}.glb"' in src:
        src = src.replace('src="models/${id}.glb"',
                          'src="' + GLB_CDN_BASE + '/${id}.glb"', 1)
        viewer_fired += 1
    # 2026-11-11: GLB 改走 v2 tag。已套過 v1 補丁的 index.html 裡 VIEWER_JS
    # 已存在（不會重插），裡面 baked 的 v1 網址要換成新版 GLB_CDN_BASE；
    # 舊 tag 之後都加進 OLD_GLB_CDN_BASES。
    for old_base in OLD_GLB_CDN_BASES:
        if old_base in src:
            src = src.replace(old_base, GLB_CDN_BASE)
            viewer_fired += 1

    with io.open(TARGET, 'w', encoding='utf-8', newline='') as fh:
        fh.write(src)

    with io.open(TARGET, 'rb') as fh:
        raw = fh.read()

    # Match the actual integration markers, not the bare word "YouTube" - the
    # explanatory comment left behind in loadBgm() mentions it on purpose.
    leftovers = len(re.findall(
        r'youtube\.com|youtu\.be|iframe_api|bgmPlayer|bgmBox|BGM_ID|BGM_READY|'
        r'onYouTubeIframeAPIReady|DEgITx|2uGf8-vfFLI',
        src, re.IGNORECASE,
    ))

    print('base tag inserted      : %d' % before_base)
    print('audio src  .ogg -> .mp3 : %d' % before_audio)
    print('img loading hints added : %d' % before_img)
    print('youtube edits applied   : %d (%d rule(s) fired)' % (youtube_hits, fired))
    print('3d viewer rules applied : %d (of 4)' % viewer_fired)
    print('remaining .ogg refs     : %d' % len(OGG_SRC.findall(src)))
    print('youtube leftovers       : %d' % leftovers)
    print('BOM present             : %s' % (raw[:3] == b'\xef\xbb\xbf'))
    print('bytes                   : %d' % len(raw))
    return 1 if leftovers else 0


if __name__ == '__main__':
    sys.exit(main())
