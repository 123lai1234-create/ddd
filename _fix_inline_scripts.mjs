import { readFileSync, writeFileSync } from 'fs';

const files = {
  'D:/project/astro/src/pages/about.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/about_me.js"></script>',
  ],
  'D:/project/astro/src/pages/about_me.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/about_me.js"></script>',
  ],
  'D:/project/astro/src/pages/works.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/works.js"></script>',
  ],
  'D:/project/astro/src/pages/gene_ai.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/gene_ai.js"></script>',
  ],
  'D:/project/astro/src/pages/ngs.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/ngs.js"></script>',
  ],
  'D:/project/astro/src/pages/video-gen.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/video_gen.js"></script>',
  ],
  'D:/project/astro/src/pages/thesis.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/thesis.js"></script>',
  ],
  'D:/project/astro/src/pages/protein-mpnn.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/index.js"></script>',
  ],
  'D:/project/astro/src/pages/interview.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/interview_prep.js"></script>',
  ],
  'D:/project/astro/src/pages/diving.astro': [
    '<script src="scripts/app-config.js"></script>',
    '<script src="scripts/cwa-loader.js"></script>',
    '<script src="scripts/diving-charts.js"></script>',
  ],
};

for (const [file, tags] of Object.entries(files)) {
  try {
    let content = readFileSync(file, 'utf8');
    let removed = 0;
    for (const tag of tags) {
      // Handle both with and without newline after
      const before = content.length;
      content = content.split(tag).join('');
      removed += before - content.length;
    }
    if (removed > 0) {
      writeFileSync(file, content, 'utf8');
      console.log('FIXED:', file, '- removed', removed, 'chars');
    } else {
      console.log('ALREADY CLEAN or NOT FOUND:', file);
    }
  } catch (e) {
    console.log('ERROR:', file, e.message);
  }
}
