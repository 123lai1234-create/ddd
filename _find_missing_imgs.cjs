const fs = require('fs');

const files = [
  'D:/project/astro/src/pages/report.astro',
  'D:/project/astro/src/pages/protein-mpnn.astro',
];

const missing = [
  'results_esm2.png', 'rl_training.png', 'mpnn_loss.png',
  'demo_notebook.ipynb', 'outputs/'
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  console.log('\n=== ' + file.split('/').pop() + ' ===');
  for (const term of missing) {
    const idx = content.indexOf(term);
    if (idx >= 0) {
      console.log('Found', JSON.stringify(term), 'at', idx);
      console.log('Context:', JSON.stringify(content.slice(Math.max(0, idx - 80), idx + 80)));
    }
  }
}
