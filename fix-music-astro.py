"""Remove duplicate script tags from music.astro bodyHtml"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'astro/src/pages/music.astro'
with open(path, 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8')

# Literal pattern in the source (with escaped quotes)
old = '<script src=\\"scripts/app-config.js\\"></script>\\r\\n    <script src=\\"scripts/music-player.js\\"></script>\\r\\n'
new = ''  # remove entirely

if old in text:
    text = text.replace(old, new)
    with open(path, 'wb') as f:
        f.write(text.encode('utf-8'))
    print('REMOVED duplicate scripts')
    # Verify
    with open(path, 'rb') as f:
        new_text = f.read().decode('utf-8')
    print(f'Old length: {len(text) + len(old)}, new length: {len(new_text)}')
    if 'scripts/app-config.js' in new_text:
        print('WARNING: app-config.js still in text (probably the one in pageScripts which is fine)')
    if 'scripts/music-player.js' in new_text:
        print('WARNING: music-player.js still in text (probably the one in pageScripts which is fine)')
else:
    print('Pattern not found - dumping search area')
    idx = text.find('<!-- Scripts -->')
    if idx >= 0:
        import json
        print(json.dumps(text[idx:idx+300], ensure_ascii=False))
