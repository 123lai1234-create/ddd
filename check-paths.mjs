const paths = ['stock-app', 'stock-app/', 'stock-app/index.html', 'stock-app/dashboard.html', 'stock'];
for (const p of paths) {
  try {
    const r = await fetch('https://donttalk.vercel.app/' + p, { method: 'HEAD', redirect: 'manual' });
    console.log(p, r.status, r.headers.get('location') || '');
  } catch (e) { console.log(p, 'ERR', e.message); }
}
