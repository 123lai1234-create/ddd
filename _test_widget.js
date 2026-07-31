const https = require('https');
const req = https.get('https://donttalk.vercel.app/', res => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    const hasCwLoaded = html.includes('__cw_loaded');
    const hasRenderUrl = html.includes('donttalk-chat-bot-xc4e.onrender.com');
    // Find processBuf in the script
    const idx = html.indexOf('processBuf');
    if (idx > -1) {
      const snippet = html.slice(idx, idx+300);
      const hasCRLF = snippet.includes('\\r\\n\\r\\n') || snippet.includes('\\\\r\\\\n\\\\r\\\\n');
      console.log('processBuf found. Has CRLF?:', hasCRLF);
      console.log('Snippet:', snippet.slice(0, 200));
    } else {
      console.log('processBuf NOT found in HTML');
    }
    console.log('__cw_loaded:', hasCwLoaded);
    console.log('Render URL:', hasRenderUrl);
  });
});
req.on('error', e => console.error(e.message));
