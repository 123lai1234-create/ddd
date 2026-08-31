const fs = require('fs');

const pagesDir = 'D:/project/astro/src/pages/';

const removals = {
  'about.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/about_me.js\\"></script>',
  ],
  'about_me.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/about_me.js\\"></script>',
  ],
  'works.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/works.js\\"></script>',
  ],
  'gene_ai.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/gene_ai.js\\"></script>',
  ],
  'ngs.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/ngs.js\\"></script>',
  ],
  'video-gen.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/video_gen.js\\"></script>',
  ],
  'thesis.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/thesis.js\\"></script>',
  ],
  'protein-mpnn.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/index.js\\"></script>',
  ],
  'interview.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/interview_prep.js\\"></script>',
  ],
  'diving.astro': [
    '<script src=\\"scripts/app-config.js\\"></script>',
    '<script src=\\"scripts/cwa-loader.js\\"></script>',
    '<script src=\\"scripts/diving-charts.js\\"></script>',
  ],
};

let totalFixed = 0;
for (const [filename, tags] of Object.entries(removals)) {
  const filepath = pagesDir + filename;
  let content;
  try {
    content = fs.readFileSync(filepath, 'utf8');
  } catch (e) {
    console.log('READ ERROR:', filename, e.message);
    continue;
  }
  let origLen = content.length;
  for (const tag of tags) {
    const idx = content.indexOf(tag);
    if (idx < 0) {
      console.log('TAG NOT FOUND in', filename + ':', tag.substring(0, 50));
    } else {
      content = content.split(tag).join('');
    }
  }
  if (content.length < origLen) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log('FIXED:', filename, 'removed', origLen - content.length, 'chars');
    totalFixed++;
  } else {
    console.log('ALREADY CLEAN:', filename);
  }
}
console.log('\nTotal files fixed:', totalFixed);
