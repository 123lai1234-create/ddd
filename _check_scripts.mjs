import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const distDir = 'D:/project/astro/dist';
const pages = ['about', 'about_me', 'works', 'gene_ai', 'ngs', 'video-gen', 'thesis', 'protein-mpnn', 'interview', 'diving'];

for (const page of pages) {
  const idxPath = join(distDir, page, 'index.html');
  try {
    const html = readFileSync(idxPath, 'utf8');
    // Find all script src attributes
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/g)];
    const scriptSrcs = scripts.map(s => s[1]);
    const bad = scriptSrcs.filter(s => !s.startsWith('/') && !s.startsWith('http') && !s.startsWith('data:'));
    if (bad.length || scriptSrcs.length === 0) {
      console.log('\n=== ' + page + ' ===');
      console.log('All scripts:', scriptSrcs.join(', '));
      if (bad.length) console.log('BAD (relative):', bad.join(', '));
      if (scriptSrcs.length === 0) console.log('NO SCRIPTS!');
    }
  } catch (e) {
    console.log(page + ': FILE NOT FOUND');
  }
}
