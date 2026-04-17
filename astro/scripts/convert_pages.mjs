import { promises as fs } from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve('../frontend');
const pagesDir = path.resolve('src/pages');
const skip = new Set(['index.html', 'game.html']);

const cleanSlug = {
    about_me: 'about',
    gene_ai: 'gene-ai',
    protein_mpnn: 'protein-mpnn',
    interview_prep: 'interview',
};

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

    // Page-local scripts (rewrite to absolute /scripts/...)
    const localBodyScripts = extractAll(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, bodyInner)
        .filter(s => !s.startsWith('http'))
        .map(s => '/' + s.replace(/^\.?\//, ''));
    // External CDN scripts from entire <head> (e.g. chart.js, 3dmol — may sit before COMMON_HEAD)
    const headCdnScripts = extractAll(/<script[^>]*\ssrc=["'](https?:\/\/[^"']+)["'][^>]*>\s*<\/script>/gi, headBlock);
    // Also pick up CDN scripts inside body (rare but safe)
    const bodyCdnScripts = extractAll(/<script[^>]*\ssrc=["'](https?:\/\/[^"']+)["'][^>]*>\s*<\/script>/gi, bodyInner);
    const pageScripts = [...headCdnScripts, ...bodyCdnScripts, ...localBodyScripts];

    // Inline <script>...</script> blocks in head (no src attr) — need preserving
    // (protein_mpnn's window.load3Dmol loader lives here)
    const inlineHeadRe = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    const headInlineBlocks = [];
    let m;
    while ((m = inlineHeadRe.exec(headBlock)) !== null) {
        const body = m[1].trim();
        if (body) headInlineBlocks.push(body);
    }
    const headInlineRaw = headInlineBlocks.map(b => `<script is:inline>${b}</script>`).join('\n');

    const rawSlug = file.replace(/\.html$/, '');
    const slug = cleanSlug[rawSlug] ?? rawSlug;
    const astroName = slug + '.astro';

    const content = `---
import Base from '../layouts/Base.astro';
const bodyHtml = ${JSON.stringify(bodyInner)};
const headInline = ${JSON.stringify(headInlineRaw)};
---
<Base
    title=${JSON.stringify(title)}
    description=${JSON.stringify(description)}
    bodyPage=${JSON.stringify(bodyPage)}
    pageStyles={${JSON.stringify(pageStyles)}}
    pageScripts={${JSON.stringify(pageScripts)}}
    headInline={headInline}
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
