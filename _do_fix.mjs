import { readFileSync, writeFileSync } from 'fs';

const fix = (file, before, after) => {
  const c = readFileSync(file, 'utf8');
  const idx = c.indexOf(before);
  if (idx < 0) { console.log('NOT FOUND:', file); return false; }
  const newC = c.split(before).join(after);
  writeFileSync(file, newC, 'utf8');
  console.log('FIXED:', file, 'removed', c.length - newC.length, 'chars');
  return true;
};

const base = 'D:/project/astro/src/pages/';

// about.astro
fix(base + 'about.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/about_me.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// about_me.astro
fix(base + 'about_me.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/about_me.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// works.astro
fix(base + 'works.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/works.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// gene_ai.astro
fix(base + 'gene_ai.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/gene_ai.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// ngs.astro
fix(base + 'ngs.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/ngs.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// video-gen.astro
fix(base + 'video-gen.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/video_gen.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// thesis.astro
fix(base + 'thesis.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/thesis.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// protein-mpnn.astro
fix(base + 'protein-mpnn.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/index.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// interview.astro
fix(base + 'interview.astro',
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/interview_prep.js"></script>\n\n    <button class="scroll-top"',
  '<button class="scroll-top"');

// diving.astro - has 3 script tags
const divingBefore =
  '<script src="scripts/app-config.js"></script>\n    <script src="scripts/cwa-loader.js"></script>\n    <script src="scripts/diving-charts.js"></script>\n\n    <button class="scroll-top"';
fix(base + 'diving.astro', divingBefore, '<button class="scroll-top"');
