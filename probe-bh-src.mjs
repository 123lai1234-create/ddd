// Test alternative big_holders sources
async function test(url, label, headers = {}) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    });
    const text = await r.text();
    const big5 = (() => {
      try {
        // Quick Big5 heuristic
        const buf = Buffer.from(text.slice(0, 2000), 'binary');
        return buf.toString('big5').length > 100 ? 'big5' : 'utf8';
      } catch { return '?'; }
    })();
    console.log(`${label}: ${r.status}  type=${r.headers.get('content-type')}  size=${text.length}  enc=${big5}`);
    console.log(`  preview: ${text.slice(0, 300).replace(/\n/g, ' ')}\n`);
  } catch (e) { console.log(`${label}: ERROR ${e.message}\n`); }
}

await test('https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=2330', 'Goodinfo 2330');
await test('https://www.wantgoo.com/stock/2330/holder', 'Wantgoo 2330 holders');
await test('https://stockchannels.com/2330.htm', 'StockChannels 2330');
await test('https://djinfo.cathaysec.com.tw/2330/holder', 'Cathay DJ 2330');
await test('https://openapi.twse.com.tw/v1/company/listed', 'TWSE openapi listed');
await test('https://www.tpex.org.tw/web/stock/exright/holderlist/holderlist.php?l=zh-tw&s=0&p=0', 'TPEX holderlist');
