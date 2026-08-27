"""Count braces in catchall.mjs to find unmatched ones"""
path = 'astro/api/catchall.mjs'
with open(path, 'rb') as f:
    raw = f.read()
text = raw.decode('utf-8')

# Count opening and closing braces
opens = 0
closes = 0
in_string = False
string_char = None
i = 0
line = 1
last_open_line = 0
last_close_line = 0
open_lines = []
close_lines = []
while i < len(text):
    c = text[i]
    if c == '\n':
        line += 1
    elif in_string:
        if c == '\\' and i+1 < len(text):
            i += 2
            continue
        if c == string_char:
            in_string = False
    else:
        if c == '/' and i+1 < len(text) and text[i+1] == '/':
            # line comment
            while i < len(text) and text[i] != '\n':
                i += 1
            continue
        if c in '"\'':
            in_string = True
            string_char = c
        elif c == '{':
            opens += 1
            open_lines.append(line)
            last_open_line = line
        elif c == '}':
            closes += 1
            close_lines.append(line)
            last_close_line = line
    i += 1

print(f'opens: {opens}, closes: {closes}, diff: {opens - closes}')
print(f'last open: L{last_open_line}, last close: L{last_close_line}')
if opens != closes:
    # Find unmatched by stack simulation
    print('\nUnbalanced - simulating stack...')
    stack = []
    in_string = False
    string_char = None
    i = 0
    line = 1
    while i < len(text):
        c = text[i]
        if c == '\n':
            line += 1
        elif in_string:
            if c == '\\' and i+1 < len(text):
                i += 2
                continue
            if c == string_char:
                in_string = False
        else:
            if c == '/' and i+1 < len(text) and text[i+1] == '/':
                while i < len(text) and text[i] != '\n':
                    i += 1
                continue
            if c in '"\'':
                in_string = True
                string_char = c
            elif c == '{':
                stack.append((line, i))
            elif c == '}':
                if stack:
                    stack.pop()
                else:
                    print(f'  Extra }} at L{line}')
        i += 1
    if stack:
        print(f'  {len(stack)} unmatched {{ :')
        for ln, pos in stack[-5:]:
            # show context
            start = max(0, pos - 50)
            end = min(len(text), pos + 100)
            ctx = text[start:end].replace('\n', '\\n')
            print(f'    L{ln} pos {pos}: ...{ctx}...')
