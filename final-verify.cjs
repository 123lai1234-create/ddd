const https = require('https');
const tests = [
  ['POST', '/api/markers/record', '{"code":"9999","items":[{"time":1786406400,"text":"FINAL_VERIFY","source":"auto"}]}'],
  ['GET', '/api/healthz', null],
  ['GET', '/api/markers/history?code=9999&days=1', null]
];
let i = 0;
(function next() {
  if (i >= tests.length) return;
  const t = tests[i++];
  const r = https.request({
    method: t[0],
    hostname: 'donttalk.vercel.app',
    path: t[1],
    headers: t[2] ? { 'Content-Type': 'application/json' } : {}
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log(t[0], t[1].substring(0, 50), '->', res.statusCode, d.substring(0, 180));
      if (i < tests.length) setTimeout(next, 500);
    });
  });
  r.setTimeout(10000, () => r.destroy());
  r.on('error', e => console.log('err', e.message));
  if (t[2]) r.write(t[2]);
  r.end();
})();