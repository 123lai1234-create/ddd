# ogg-to-mp3.py - convert the mirrored game's Ogg Vorbis BGM to MP3.
#
# Why: Safari (macOS + iOS/iPadOS) cannot decode Ogg Vorbis at all, so the shipped
# <audio src="*.ogg"> loops played silently on iPhone/iPad. MP3 decodes everywhere.
# MP3 is also smaller than these Ogg encodes, so the deploy payload shrinks too.
#
# We ship MP3 only (no <source> fallback): an MP3 file is playable by every browser
# we target, so carrying both formats would only double the payload for no benefit.
#
# Uses PyAV (bundles FFmpeg + libmp3lame) - no external ffmpeg binary required.
# Idempotent: an .mp3 next to an .ogg is skipped unless --force is passed.
#
# Usage:
#   python scripts/ogg-to-mp3.py [dir] [--force]
#
# Default dir is public/games/confinement-escape/music.

import os
import sys

import av

DEFAULT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'public', 'games', 'confinement-escape', 'music',
)

BITRATE = 128_000      # plenty for looping game BGM
RATE = 44_100
LAYOUT = 'stereo'


def convert(src, dst):
    """Decode Ogg (any codec) -> resample to 44.1k stereo s16 -> encode MP3."""
    in_container = av.open(src)
    try:
        in_stream = in_container.streams.audio[0]
        out_container = av.open(dst, 'w', format='mp3')
        try:
            out_stream = out_container.add_stream('libmp3lame', rate=RATE)
            out_stream.layout = LAYOUT
            out_stream.bit_rate = BITRATE

            resampler = av.audio.resampler.AudioResampler(
                format='s16p', layout=LAYOUT, rate=RATE,
            )

            for frame in in_container.decode(in_stream):
                for resampled in resampler.resample(frame):
                    for packet in out_stream.encode(resampled):
                        out_container.mux(packet)

            # flush the encoder
            for packet in out_stream.encode():
                out_container.mux(packet)
        finally:
            out_container.close()
    finally:
        in_container.close()


def main(argv):
    force = '--force' in argv
    args = [a for a in argv if not a.startswith('--')]
    music_dir = args[0] if args else DEFAULT_DIR

    if not os.path.isdir(music_dir):
        print('not a directory: %s' % music_dir)
        return 1

    oggs = sorted(f for f in os.listdir(music_dir) if f.lower().endswith('.ogg'))
    if not oggs:
        print('no .ogg files in %s - nothing to do' % music_dir)
        return 0

    print('scanning %s (%d ogg file(s))' % (music_dir, len(oggs)))
    before = after = 0
    for name in oggs:
        src = os.path.join(music_dir, name)
        dst = os.path.join(music_dir, name[:-4] + '.mp3')

        if os.path.exists(dst) and not force:
            print('  skip   %-34s (mp3 already exists)' % name)
            continue

        before += os.path.getsize(src)
        try:
            convert(src, dst)
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print('  FAIL   %-34s %r' % (name, exc))
            if os.path.exists(dst):
                os.remove(dst)
            continue

        size = os.path.getsize(dst)
        after += size
        print('  ok     %-34s -> %-30s %6.2f MB'
              % (name, os.path.basename(dst), size / 1048576.0))

    if before and after:
        print('ogg %.2f MB -> mp3 %.2f MB (%.0f%% of original)'
              % (before / 1048576.0, after / 1048576.0, after / before * 100))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))