"""Fix all `return ??` patterns to `return`"""
import re, sys
sys.stdout.reconfigure(encoding='utf-8')
path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    text = f.read().decode('utf-8')

# Find all `return ?? null` and `return ?? 0` and similar
text = re.sub(r'return \?\? (null|0)\b', r'return \1', text)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))

import subprocess
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
if result.returncode == 0:
    print('OK node -c passed!')
else:
    err = (result.stderr or '').split('\n')[0:3]
    print(f'STILL: {" ".join(err)}')
