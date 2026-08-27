"""Fix all broken `??` patterns in catchall.mjs where my aggressive replace removed the ??"""
import re, sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8')

# Patterns where '??' was removed but should be there
# These are typically at end of expressions: `.pop()  null`, `sma()  0`, etc.
# A regex to find places where `  null` or `  0` or `  []` follows a closing paren or identifier
patterns = [
    (re.compile(r'\b(\w+)\(\) {1,3}(null|0|\[\])\b'), r'\1() ?? \2'),
    (re.compile(r'\b(\w+\([^)]*\)) {1,3}(null|0)\b'), r'\1 ?? \2'),
    (re.compile(r'\.length {1,3}0\b'), '.length ?? 0'),
    (re.compile(r'\.length {1,3}(\w+)\b'), r'.length ?? \1'),
    (re.compile(r'\b(\w+) {1,3}0\.\b'), r'\1 ?? 0.'),
    (re.compile(r'\b(\w+) {1,3}null\.\b'), r'\1 ?? null.'),
    (re.compile(r'\b(\w+) {1,3}null;'), r'\1 ?? null;'),
    (re.compile(r'\b(\w+) {1,3}0;'), r'\1 ?? 0;'),
    (re.compile(r'\b(\w+) {1,3}0,'), r'\1 ?? 0,'),
    (re.compile(r'\b(\w+) {1,3}0\)'), r'\1 ?? 0)'),
    (re.compile(r'\) {1,3}(0|null|\[\])\b'), r') ?? \1'),
    (re.compile(r'\] {1,3}(0|null|\[\])\b'), r'] ?? \1'),
    # The specific case: `.pop()  null` -> `.pop() ?? null`
    (re.compile(r'\.pop\(\) {1,3}(null|0)\b'), r'.pop() ?? \1'),
    # The case: `()  0` -> `() ?? 0`
    (re.compile(r'(\)) {1,3}(0|null)\b'), r'\1 ?? \2'),
]

# Apply
total = 0
for pattern, replacement in patterns:
    matches = pattern.findall(text)
    if matches:
        new_text, count = pattern.subn(replacement, text)
        if count > 0:
            print(f'{count}x {pattern.pattern[:50]!r}')
            text = new_text
            total += count

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))

print(f'\nTotal replacements: {total}')

# Verify
import subprocess
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
if result.returncode == 0:
    print('✓ node -c passed!')
else:
    # Show first error
    err = result.stderr.split('\n')[0:3] if result.stderr else ['no stderr']
    print(f'✗ Still has error: {" ".join(err)}')
