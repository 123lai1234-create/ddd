const https = require('https');

// Simulate what frontend recordMarkersToDB actually sends
// From stock-app/index.html line 2291-2305: each item has time, text, source, position, shape, color, close, ma5, ma10, ma20, ma60
const realPayload = {
  code: "2330",
  items: [
    // a buy_chase marker
    {
      time: 1786406400,
      text: "站上三均線 + 5日/20日漲幅 3.23%/15.14%",
      source: "trade",
      position: "aboveBar",
      shape: "arrowUp",
      color: "#e91e63",
      close: 2395,
      ma5: 2383,
      ma10: 2314.5,
      ma20: 2215.5,
      ma60: 1996.42
    },
    // an event marker (sell_stop)
    {
      time: 1786233600,
      text: "距 60 日高 16.01%, 跌破 MA20 (58.08)",
      source: "event",
      position: "aboveBar",
      shape: "arrowDown",
      color: "#4caf50",
      close: 55.6,
      ma5: null,
      ma10: null,
      ma20: 58.08,
      ma60: null
    },
    // an item with nulls only
    {
      time: 1786147200,
      text: "test marker 3",
      source: "event",
      position: "",
      shape: "circle",
      color: "",
      close: null,
      ma5: null,
      ma10: null,
      ma20: null,
      ma60: null
    }
  ]
};

const data = JSON.stringify(realPayload);
console.log('Payload size:', data.length, 'bytes');
console.log('Payload:', data.substring(0, 300) + '...');

const r = https.request({
  method: 'POST',
  hostname: 'donttalk.vercel.app',
  path: '/api/markers/record',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', d.substring(0, 800));
  });
});
r.setTimeout(15000, () => r.destroy());
r.on('error', e => console.log('err', e.message));
r.write(data);
r.end();