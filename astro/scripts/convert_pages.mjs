import { promises as fs } from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve('../frontend');
const pagesDir = path.resolve('src/pages');
const skip = new Set(['index.html', 'game.html']);

function extract(re, src, group = 1) {
    const m = src.match(re);
    return m ? m[group] : '';
}

function extractAll(re, src) {
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return out;
}

async function convert(file) {
    const raw = await fs.readFile(path.join(frontendDir, file), 'utf8');
    const title = extract(/<title>([\s\S]*?)<\/title>/i, raw).trim();
    const description = extract(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i, raw);
    const bodyMatch = raw.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
    const bodyAttrs = bodyMatch ? bodyMatch[1] : '';
    const bodyInner = bodyMatch ? bodyMatch[2] : '';
    const bodyPage = extract(/data-page=["']([^"']+)["']/i, bodyAttrs);

    const headBlock = extract(/<\/head>/i, raw) !== ''
        ? raw.slice(0, raw.search(/<\/head>/i))
        : raw;
    const afterCommon = headBlock.split(/<!--\s*END COMMON_HEAD\s*-->/i).pop();
    const pageStyles = extractAll(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']/gi, afterCommon)
        .filter(h => !h.startsWith('http'))
        .map(h => '/' + h.replace(/^\.?\//, ''));

    const pageScripts = extractAll(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, bodyInner)
        .filter(s => !s.startsWith('http'))
        .map(s => '/' + s.replace(/^\.?\//, ''));

    const slug = file.replace(/\.html$/, '');
    const astroName = slug + '.astro';

    const content = `---
import Base from '../layouts/Base.astro';
const bodyHtml = ${JSON.stringify(bodyInner)};
---
<Base
    title=${JSON.stringify(title)}
    description=${JSON.stringify(description)}
    bodyPage=${JSON.stringify(bodyPage)}
    pageStyles={${JSON.stringify(pageStyles)}}
    pageScripts={${JSON.stringify(pageScripts)}}
>
    <Fragment set:html={bodyHtml} />
</Base>
`;
    await fs.writeFile(path.join(pagesDir, astroName), content, 'utf8');
    console.log(`converted ${file} → ${astroName} (styles:${pageStyles.length} scripts:${pageScripts.length})`);
}

async function main() {
    const entries = await fs.readdir(frontendDir);
    for (const f of entries) {
        if (!f.endsWith('.html') || skip.has(f)) continue;
        await convert(f);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
