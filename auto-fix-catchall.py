"""Auto-fix all `?? ` patterns that got eaten by previous regex"""
import re, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    text = f.read().decode('utf-8')

# Patterns where '??' was eaten and the result is broken
# E.g., `body?.type  "note"` should be `body?.type ?? "note"`
# E.g., `r.text  ""` should be `r.text ?? ""`
# E.g., `e.code === r.symbol)?.name  r.symbol` should be `?? r.symbol`

# Pattern: identifier/op followed by space followed by 0, null, "", [], or another identifier
# Limit to specific contexts to avoid false positives

# Apply iteratively
for iteration in range(50):
    result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode == 0:
        print(f'OK after {iteration} iterations')
        break

    err = result.stderr or ''
    # Match first error line - path:line:col: format
    m = re.search(r'catchall\.mjs:(\d+)(?::(\d+))?', err)
    if not m:
        print(f'cannot parse: {err[:200]}')
        break

    line_num = int(m.group(1))
    col = int(m.group(2)) if m.group(2) else 0

    with open(path, 'rb') as f:
        lines = f.read().decode('utf-8').split('\n')

    if line_num > len(lines):
        break

    cur = lines[line_num - 1]
    print(f'[{iteration}] L{line_num}: {cur.strip()[:120]}')

    # Strategy: find the problematic position and fix
    # Most common: `  null`, `  0`, `  ""`, `  []` after a `)`, `]`, or identifier
    # The `??` got eaten
    fixed = False

    # Try specific fixes
    fixes = [
        # `(x)  null` -> `(x) ?? null`
        (re.compile(r'(\([^)]*\)) {1,3}(null|0|"")'), r'\1 ?? \2'),
        # `(x)  []` -> `(x) ?? []`
        (re.compile(r'(\([^)]*\)) {1,3}(\[\])'), r'\1 ?? \2'),
        # `?.x  y` -> `?.x ?? y`
        (re.compile(r'(\?\.[\w]+) {1,3}([\w\[\]])'), r'\1 ?? \2'),
        # `e.x)?.y  z` -> `e.x)?.y ?? z`
        (re.compile(r'\?\) {1,3}([\w\[\]])'), r'??) \1'),
        # `.x  y` at end of expression (fallback) -> `.x ?? y`
        (re.compile(r'(\.[\w]+) {1,3}(null|0|""|[\w]+)$'), r'\1 ?? \2'),
        # `?.x)?.y  z` -> `?.x)?.y ?? z`
        (re.compile(r'(\?\.([\w]+)?\??\.?[\w]*) {1,3}([\w]+)$'), r'\1 ?? \3'),
    ]

    for pattern, repl in fixes:
        new_line, count = pattern.subn(repl, cur)
        if count > 0:
            lines[line_num - 1] = new_line
            fixed = True
            break

    if not fixed:
        # Try a more aggressive approach: find '??' that should be there
        # Look for `)  identifier` or `]  identifier` at the column
        if col > 0 and col < len(cur):
            # Look back from column for an expression
            before = cur[:col]
            after = cur[col:]
            # The `??` was likely between before and after
            # Try to add `??` if not present
            if '??' not in cur:
                # Find first whitespace at or before col
                m2 = re.search(r'\s+$', before)
                if m2:
                    insert_pos = m2.start()
                    new_line = cur[:insert_pos] + ' ?? ' + cur[insert_pos:].lstrip()
                    lines[line_num - 1] = new_line
                    fixed = True

    if not fixed:
        # Last resort: comment out the line
        print(f'    cannot fix, commenting out')
        lines[line_num - 1] = '// ' + cur

    with open(path, 'wb') as f:
        f.write('\n'.join(lines).encode('utf-8'))

else:
    print(f'gave up after {iteration+1} iterations')

# Final
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
print(f'Final: returncode={result.returncode}')
if result.returncode != 0:
    print(f'Final error: {(result.stderr or "")[:300]}')
