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
    print('remaining .ogg refs     : %d' % len(OGG_SRC.findall(src)))
    print('youtube leftovers       : %d' % leftovers)
    print('BOM present             : %s' % (raw[:3] == b'\xef\xbb\xbf'))
    print('bytes                   : %d' % len(raw))
    return 1 if leftovers else 0


if __name__ == '__main__':
    sys.exit(main())
