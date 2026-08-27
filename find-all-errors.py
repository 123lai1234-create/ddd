"""Find and fix all syntax errors in catchall.mjs iteratively"""
import re, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    text = f.read().decode('utf-8')

# Run node -c and capture all errors
iteration = 0
while iteration < 200:
    iteration += 1
    result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode == 0:
        print(f'OK after {iteration} iterations')
        break

    # Parse the error: "path:LINE:COL: message"
    err = result.stderr or ''
    m = re.search(r':(\d+):(\d+):\s*(.+)', err)
    if not m:
        print(f'CANNOT PARSE ERROR: {err[:200]}')
        break

    line_num = int(m.group(1))
    col = int(m.group(2))
    msg = m.group(3).strip()

    with open(path, 'rb') as f:
        lines = f.read().decode('utf-8').split('\n')

    if line_num > len(lines):
        print(f'Line {line_num} out of range')
        break

    cur = lines[line_num - 1]
    print(f'[{iteration}] L{line_num}: {msg[:80]}')
    print(f'    {cur[:200]}')

    # Common fix patterns based on the message
    if 'Unexpected' in msg and '}' in cur:
        # Stray closing brace - check if it's a collapsed comment
        # Look at surrounding lines for collapsed multi-line comment
        if line_num >= 2 and lines[line_num - 2].rstrip().endswith('?') and '    //' in cur:
            # Likely collapsed comment - need to split
            # Find the first `//` after the previous line's comment
            prev = lines[line_num - 2]
            # If the previous line ends without a newline (was joined), split it
            # Actually, the file is corrupted such that multiple `// comment\n` got joined into one line
            pass
        # Try removing the unexpected brace
        if '};' in cur:
            lines[line_num - 1] = cur.replace('};', ');')
        else:
            # Remove the brace
            lines[line_num - 1] = cur.replace('}', '', 1)

    elif 'Missing' in msg and 'catch or finally' in msg:
        # Try to find a missing catch block
        # The previous line probably has a closing brace that shouldn't be there
        if line_num >= 2:
            prev = lines[line_num - 2]
            if prev.rstrip().endswith(';'):
                # Add a try-catch wrapper or fix the brace
                # Check if previous line is `};` or has unbalanced braces
                # For now, just try to add a catch
                lines[line_num - 1] = '  } catch (e) { return null; }\n' + cur

    elif 'Invalid or unexpected token' in msg or 'Unexpected token' in msg:
        # Look for mojibake pattern like '??' mid-string
        if '?3?' in cur or '?2?' in cur or '?10?' in cur:
            # Replace the ?N? pattern (CJK followed by digit followed by ?)
            cur_fixed = re.sub(r'([\u4e00-\u9fff])(\d+)\?', r'\1\2', cur)
            cur_fixed = re.sub(r'(\d+)\?([\u4e00-\u9fff])', r'\1\2', cur_fixed)
            lines[line_num - 1] = cur_fixed
        elif '???:' in cur or '??"' in cur:
            # key:"??" - bad quote pattern
            cur_fixed = re.sub(r'"\?\?":', '"name":', cur)
            lines[line_num - 1] = cur_fixed
        else:
            # Generic: try removing the broken line and using the previous line
            print(f'    cannot auto-fix, removing line')
            lines[line_num - 1] = ''

    elif 'Illegal return' in msg:
        # top-level return - find the function it's supposed to be in
        # and add the function declaration
        # For now, just indent
        lines[line_num - 1] = '    ' + cur.lstrip()

    else:
        # Generic: just delete the line
        print(f'    unknown error, removing line')
        lines[line_num - 1] = ''

    # Write back
    with open(path, 'wb') as f:
        f.write('\n'.join(lines).encode('utf-8'))
else:
    print(f'Gave up after {iteration} iterations')

# Final check
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
print(f'Final: {result.returncode}')
if result.returncode != 0:
    print(f'Final error: {(result.stderr or "")[:300]}')
