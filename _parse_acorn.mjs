// Try parsing with acorn to get better error
try {
  const acorn = await import('acorn');
  const fs = await import('node:fs');
  const code = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8');
  acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: false });
  console.log('OK');
} catch (e) {
  console.log('ERROR:', e.message);
  console.log('Loc:', JSON.stringify(e.loc));
  console.log('Pos:', e.pos);
}
