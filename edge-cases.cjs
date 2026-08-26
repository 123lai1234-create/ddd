const https = require('https');

// Test edge cases that might cause 500
const tests = [
  ['empty items', JSON.stringify({ code: "2330", items: [] })],
  ['null time', JSON.stringify({ code: "2330", items: [{ time: null, text: "test", source: "auto" }] })],
  ['string time', JSON.stringify({ code: "2330", items: [{ time: "abc", text: "test", source: "auto" }] })],
  ['undefined source', JSON.stringify({ code: "2330", items: [{ time: 1786406400, text: "test" }] })],
  ['missing text', JSON.stringify({ code: "2330", items: [{ time: 1786406400, source: "auto" }] })],
  ['empty text', JSON.stringify({ code: "2330", items: [{ time: 1786406400, text: "", source: "auto" }] })],
  ['null text', JSON.stringify({ code: "2330", items: [{ time: 1786406400, text: null, source: "auto" }] })],
  ['null source', JSON.stringify({ code: "2330", items: [{ time: 1786406400, text: "x", source: null }] })],
  ['undefined item fields', JSON.stringify({ code: "2330", items: [{}] })],
  ['empty source string', JSON.stringify({ code: "2330", items: [{ time: 1786406400, text: "x", source: "" }] })],
  ['negative time', JSON.stringify({ code: "2330", items: [{ time: -1, text: "x", source: "auto" }] })],
  ['zero time', JSON.stringify({ code: "2330", items: [{ time: 0, text: "x", source: "auto" }] })],
  ['huge time', JSON.stringify({ code: "2330", items: [{ time: 99999999999, text: "x", source: "auto" }] })],
  ['inf time', JSON.stringify({ code: "2330", items: [{ time: Infinity, text: "x", source: "auto" }] })],
  ['nan time', JSON.stringify({ code: "2330", items: [{ time: NaN, text: "x", source: "auto" }] })],
  ['10 items', JSON.stringify({ code: "2330", items: Array(10).fill({ time: 1786406400, text: "x", source: "auto" }) })],
  ['50 items', JSON.stringify({ code: "2330", items: Array(50).fill({ time: 1786406400, text: "x", source: "auto" }) })],
];

let i = 0;
function next() {
  if (i >= tests.length) return;
  const [name, body] = tests[i++];
  const r = https.request({
    method: 'POST',
    hostname: 'donttalk.vercel.app',
    path: '/api/markers/record',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      const mark = res.statusCode >= 500 ? '❌' : (res.statusCode >= 400 ? '⚠️ ' : '✅');
      console.log(mark, name.padEnd(30), '->', res.statusCode, d.substring(0, 120));
      setTimeout(next, 200);
    });
  });
  r.setTimeout(10000, () => { r.destroy(); console.log('❌', name, 'TIMEOUT'); setTimeout(next, 200); });
  r.on('error', e => console.log('err', name, e.message));
  r.write(body);
  r.end();
}
next();