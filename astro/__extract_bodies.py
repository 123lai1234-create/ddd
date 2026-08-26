import os, re
for f in ['D:/project/astro/src/pages/works.astro','D:/project/astro/src/pages/gene-ai.astro','D:/project/astro/src/pages/stem-cell.astro']:
 with open(f,'r',encoding='utf-8') as fh:
 data = fh.read()
 m = re.search(r'const bodyHtml = "(.*?)";\n', data, re.S)
 if m:
 body = m.group(1)
 body = body.replace('\\n','\n').replace('\\"','"').replace('\\t','\t')
 out = f.replace('D:/project/astro/src/pages/','').replace('.astro','.body.html')
 with open('D:/project/astro/' + out, 'w', encoding='utf-8') as o:
 o.write(body)
 print(out, '->', len(body), 'chars,', body.count('<section'), 'sections,', body.count('<div'), 'divs')
 else:
 print('NO MATCH in', f)
