import fs from 'node:fs';
const code = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8');
const lines = code.split('\n');
// Node: line is 1-indexed, column is 1-indexed
// Position = sum of (line[0..L-1] lengths + 1 for newline) + (column - 1)
let pos = 0;
const targetLine = 53;
const targetCol = 100;
for (let i = 0; i < targetLine - 1; i++) pos += lines[i].length + 1;
pos += targetCol - 1;
console.log('Char at L53 col 100:', JSON.stringify(code[pos]));
// Find which line is this
let charCount = 0;
for (let i = 0; i < lines.length; i++) {
  if (charCount + lines[i].length >= pos) {
    console.log(`Actually at L${i+1} col ${pos - charCount + 1}`);
    console.log('Line content:', JSON.stringify(lines[i].substr(Math.max(0, pos - charCount - 5), 30)));
    break;
  }
  charCount += lines[i].length + 1;
}
