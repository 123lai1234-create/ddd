"""Find all mojibake patterns in catchall.mjs"""
import re

with open('astro/api/catchall.mjs', 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8', errors='replace')

# Find lines with mojibake characters (replacement char \ufffd or ??)
mojibake_lines = []
for i, line in enumerate(text.split('\n'), 1):
    if '\ufffd' in line or '??' in line:
        mojibake_lines.append((i, line.rstrip()[:150]))

print(f'Found {len(mojibake_lines)} mojibake lines')
for i, line in mojibake_lines[:30]:
    print(f'  L{i}: {line!r}')
