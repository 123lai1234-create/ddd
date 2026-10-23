#!/usr/bin/env python3
"""One-shot patcher for the mirrored game at public/games/confinement-escape/index.html.

Two changes, both applied in place and idempotent:

1. Audio codec swap. The upstream build ships 8 Ogg Vorbis BGM loops. Safari on
   macOS/iOS cannot decode Ogg at all, so those loops were silent on iPhone and
   iPad. They have been transcoded to MP3 by scripts/ogg-to-mp3.py, so point the
   <audio src> values at the .mp3 twins.

2. Image loading hints. The game builds all of its markup from JS template
   strings, so almost every <img> was eager. Adding loading="lazy" +
   decoding="async" keeps the first paint small; in-viewport images still load
   immediately, so nothing visible gets deferred.

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


def main():
    with io.open(TARGET, 'r', encoding='utf-8', newline='') as fh:
        src = fh.read()

    before_audio = len(OGG_SRC.findall(src))
    src = OGG_SRC.sub(r'\1\2.mp3\3', src)

    # <img ...> without an existing loading= attribute
    img_tag = re.compile(r'<img(?![^>]*\sloading=)([^>]*)>')
    before_img = len(img_tag.findall(src))
    src = img_tag.sub(r'<img loading="lazy" decoding="async"\1>', src)

    with io.open(TARGET, 'w', encoding='utf-8', newline='') as fh:
        fh.write(src)

    with io.open(TARGET, 'rb') as fh:
        raw = fh.read()

    print('audio src  .ogg -> .mp3 : %d' % before_audio)
    print('img loading hints added : %d' % before_img)
    print('remaining .ogg refs     : %d' % len(OGG_SRC.findall(src)))
    print('BOM present             : %s' % (raw[:3] == b'\xef\xbb\xbf'))
    print('bytes                   : %d' % len(raw))
    return 0


if __name__ == '__main__':
    sys.exit(main())