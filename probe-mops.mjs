// Test MOPS endpoints for big_holders
async function test(url, label) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/json',
        'Referer': 'https://mopsfin.twse.com.tw/',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      },
    });
    console.log(`${label}: ${r.status} ${r.statusText}  type=${r.headers.get('content-type')}`);
    const text = await r.text();
    console.log(`  size=${text.length}, preview=${text.slice(0, 200).replace(/\n/g, ' ')}\n`);
  } catch (e) { console.log(`${label}: ERROR ${e.message}\n`); }
}

await test('https://mopsfin.twse.com.tw/server-java/t146sb05?firstin=true&step=1&colorchg=&off=1&keyword=2330', 'MOPS t146sb05 (大股東持股)');
await test('https://mopsfin.twse.com.tw/server-java/t57sb01?step=1&firstin=true&off=1&keyword4=&code1=&code2=&code3=&checkbtn=0&queryName=co_id&inpuType=co_id&TYPEK=all&co_id=2330', 'MOPS t57sb01 (股權變動)');
await test('https://www.tse.com.tw/static/stocks/data/listed/listed.json', 'TWSE listed');
await test('https://mops.twse.com.tw/server-java/t05st03', 'MOPS t05st03 (基本資料)');
