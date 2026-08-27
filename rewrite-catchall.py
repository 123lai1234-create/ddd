"""Find and rewrite the operatorOk function block in catchall.mjs"""
import re, sys
sys.stdout.reconfigure(encoding='utf-8')

path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    text = f.read().decode('utf-8')

# Find the function that starts with "function operatorOk" and ends with the matching closing brace
# Look for the start
start_marker = 'function operatorOk(provided, request) {'
start_idx = text.find(start_marker)
if start_idx < 0:
    print('operatorOk function not found')
    sys.exit(1)

# Find the matching closing brace by counting
brace_count = 0
end_idx = start_idx + len(start_marker)
in_string = False
string_char = None
i = end_idx
while i < len(text):
    c = text[i]
    if in_string:
        if c == '\\':
            i += 2
            continue
        if c == string_char:
            in_string = False
    else:
        if c in '"\'':
            in_string = True
            string_char = c
        elif c == '/' and i+1 < len(text) and text[i+1] == '/':
            # line comment
            while i < len(text) and text[i] != '\n':
                i += 1
            continue
        elif c == '{':
            brace_count += 1
        elif c == '}':
            if brace_count == 0:
                end_idx = i + 1
                break
            brace_count -= 1
    i += 1

# Replace with clean version
new_func = '''function operatorOk(provided, request) {
  // IP allowlist
  const ipList = pickStr(process.env.STOCK_OPERATOR_IPS);
  if (ipList && request) {
    const ip = _clientIp(request);
    if (ip && _ipInList(ip, ipList)) {
      return true;
    }
  }
  // password fallback
  const expected = pickStr(process.env.STOCK_OPERATOR_PASSWORD);
  if (!expected) return false;
  if (typeof provided !== "string" || provided.length === 0) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}'''

# Replace
old_func = text[start_idx:end_idx]
print(f'Old function: {len(old_func)} bytes')
print(f'New function: {len(new_func)} bytes')

text = text[:start_idx] + new_func + text[end_idx:]

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))

# Verify
import subprocess
result = subprocess.run(['node', '-c', path], capture_output=True, text=True, encoding='utf-8', errors='replace')
if result.returncode == 0:
    print('OK node -c passed!')
else:
    err = (result.stderr or '').split('\n')[0:3]
    print(f'STILL: {" ".join(err)}')
