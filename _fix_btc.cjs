const fs = require('fs');
const file = 'D:/project/astro/public/stock/btc.html';
let c = fs.readFileSync(file, 'utf8');
const oldCode = `  async function fetchTWSE() {
    try {
      const r = await fetch(API + '/api/index/');
      const j = await r.json();
      const idx = j.index || j.data || j;
      document.getElementById('twseIndex').textContent = j.code || 'TWSE';
      const price = Number(idx.close || idx.value || 0);
      document.getElementById('twsePrice').textContent = price.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const chg = Number(idx.change_pct || idx.change || 0);
      const el = document.getElementById('twseChg');
      el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
      el.className = 'chg ' + (chg >= 0 ? 'up' : 'down');
      document.getElementById('twseVol').textContent = idx.volume ? (Number(idx.volume)/1e8).toFixed(2) + '億' : '-';
      document.getElementById('twseTs').textContent = j.as_of || new Date().toLocaleDateString('zh-TW');
      return idx;
    } catch (e) {
      document.getElementById('twsePrice').textContent = '載入失敗';
      return null;
    }
  }`;
const newCode = `  async function fetchTWSE() {
    try {
      // API shape: { code, latest: { close, change_pct, volume }, history, ... }
      const r = await fetch(API + '/api/index/TWSE');
      const j = await r.json();
      const idx = j.latest || j.index || j.data || j;
      document.getElementById('twseIndex').textContent = j.code || 'TWSE';
      const price = Number(idx.close || idx.value || 0);
      document.getElementById('twsePrice').textContent = price.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const chg = Number(idx.change_pct != null ? idx.change_pct : (idx.change || 0));
      const el = document.getElementById('twseChg');
      el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
      el.className = 'chg ' + (chg >= 0 ? 'up' : 'down');
      document.getElementById('twseVol').textContent = idx.volume ? (Number(idx.volume)/1e8).toFixed(2) + '億' : '-';
      document.getElementById('twseTs').textContent = idx.time_iso || idx.date || j.as_of || new Date().toLocaleDateString('zh-TW');
      return j;
    } catch (e) {
      document.getElementById('twsePrice').textContent = '載入失敗';
      return null;
    }
  }`;
if (c.includes(oldCode)) {
  c = c.replace(oldCode, newCode);
  fs.writeFileSync(file, c, 'utf8');
  console.log('FIXED');
} else {
  console.log('NOT FOUND');
}