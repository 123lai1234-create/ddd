// Test financial_reports sources
async function test(url, label) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    });
    const text = await r.text();
    console.log(`${label}: ${r.status}  type=${r.headers.get('content-type')}  size=${text.length}`);
    console.log(`  preview: ${text.slice(0, 250).replace(/\n/g, ' ')}\n`);
  } catch (e) { console.log(`${label}: ERROR ${e.message}\n`); }
}

await test('https://www.moneydj.com/KMDJ/Stock/Stock.aspx?a=fin&code=2330', 'MoneyDJ 2330 財務');
await test('https://www.moneydj.com/KMDJ/Stock/2330/2330.djhtm', 'MoneyDJ 2330 overview');
await test('https://stockq.cn/Stock/2330', 'StockQ 2330');
await test('https://www.stockfeel.com.tw/stockdata/2330', 'StockFeel 2330');
await test('https://investor.tsmc.com/chinese/annual-reports', 'TSMC IR');
await test('https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=2330', 'Goodinfo 2330 財務');
