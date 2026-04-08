import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = path.join(repoRoot, 'frontend');
const templatePath = path.join(frontendDir, 'templates', 'common-head.html');
const markerStart = '<!-- BEGIN COMMON_HEAD -->';
const markerEnd = '<!-- END COMMON_HEAD -->';

function indentBlock(block, indent) {
    return block
        .trim()
        .split('\n')
        .map(line => indent + line)
        .join('\n');
}

function replaceCommonHead(content, template) {
    const pattern = /^([ \t]*)<!-- BEGIN COMMON_HEAD -->[\s\S]*?^[ \t]*<!-- END COMMON_HEAD -->/m;
    const match = content.match(pattern);

    if (!match) {
        throw new Error('Missing COMMON_HEAD markers');
    }

    const indent = match[1] || '';
    const replacement = [
        indent + markerStart,
        indentBlock(template, indent),
        indent + markerEnd
    ].join('\n');

    return content.replace(pattern, replacement);
}

async function main() {
    const template = await fs.readFile(templatePath, 'utf8');
    const entries = await fs.readdir(frontendDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.html')) {
            continue;
        }

        const filePath = path.join(frontendDir, entry.name);
        const original = await fs.readFile(filePath, 'utf8');
        const updated = replaceCommonHead(original, template);

        if (updated !== original) {
            await fs.writeFile(filePath, updated, 'utf8');
        }
    }
}

main().catch(error => {
    console.error('[sync_frontend_heads] ' + error.message);
    process.exitCode = 1;
});