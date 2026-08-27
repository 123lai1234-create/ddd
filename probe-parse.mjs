const text = '[{"date": "2026-04", "title": "test"}]';
try {
  const parsed = JSON.parse(text);
  console.log('parsed type:', Array.isArray(parsed) ? 'array' : typeof parsed);
  console.log('parsed:', JSON.stringify(parsed).slice(0, 100));
  // simulate loadSectors logic
  let meta = {};
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    meta = parsed;
  } else if (Array.isArray(parsed)) {
    meta = { _legacy: parsed };
  }
  meta.industry = "TEST";
  console.log('after merge:', JSON.stringify(meta).slice(0, 100));
} catch (e) { console.log('err:', e.message); }
