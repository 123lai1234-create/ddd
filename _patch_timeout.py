import os

dist = r'D:\project\astro\dist'
count = 0

for root, dirs, files in os.walk(dist):
    for fn in files:
        if not fn.endswith('.html'):
            continue
        fp = os.path.join(root, fn)
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'const reader = resp.body.getReader()' not in content:
            continue
        if 'gotToken' in content:
            continue  # already patched

        orig = content

        # Patch 1: add timeout vars after 'let buf = ...'
        marker1 = "let buf = ''\n      // Process one complete"
        replacement1 = ("let buf = ''\n      let gotToken = false;\n"
                       "      const timeoutId = setTimeout(function() { if (!gotToken) { console.log('[ChatWidget] TIMEOUT: no token in 30s'); reader.cancel(); } }, 30000);\n"
                       "      // Process one complete")
        content = content.replace(marker1, replacement1)

        # Patch 2: gotToken=true + clearTimeout on token event
        marker2 = "if (evt === 'token' && data.content) {\n          if (typing.parentNode)"
        replacement2 = ("if (evt === 'token' && data.content) {\n"
                        "          gotToken = true;\n"
                        "          clearTimeout(timeoutId);\n"
                        "          if (typing.parentNode)")
        content = content.replace(marker2, replacement2)

        # Patch 3: clearTimeout on done event
        marker3 = "} else if (evt === 'done') {\n          if (typing.parentNode)"
        replacement3 = ("} else if (evt === 'done') {\n"
                        "          clearTimeout(timeoutId);\n"
                        "          if (typing.parentNode)")
        content = content.replace(marker3, replacement3)

        # Patch 4: clearTimeout in finally
        marker4 = "} finally {\n      sendBtn.disabled = false;"
        replacement4 = ("} finally {\n"
                        "      clearTimeout(timeoutId);\n"
                        "      sendBtn.disabled = false;")
        content = content.replace(marker4, replacement4)

        if content != orig:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            count += 1
            print('patched:', fp)
        else:
            print('WARN - no change:', fp)

print('total patched:', count)
