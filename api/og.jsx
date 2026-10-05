import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

async function loadCjkFont(text) {
  if (!/[　-鿿豈-﫿]/.test(text)) return null;
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@700&text=${encodeURIComponent(text)}&display=swap`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Vercel Edge; +https://vercel.com)' } }
    ).then(r => r.text());
    const url = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
    if (!url) return null;
    return fetch(url).then(r => r.arrayBuffer());
  } catch {
    return null;
  }
}

const TAG_COLORS = {
  'Protein AI':  { bg: '#1a1020', border: '#a050e8', text: '#c080f8' },
  'Gene AI':     { bg: '#0e1820', border: '#2080d0', text: '#60b8f8' },
  'NGS':         { bg: '#0e1a10', border: '#30a040', text: '#60d870' },
  'RPG':         { bg: '#1a1000', border: '#e8c060', text: '#f8d880' },
  'Research':    { bg: '#0a0a1a', border: '#6060c0', text: '#9090e8' },
  'Portfolio':   { bg: '#14100a', border: '#c8a060', text: '#e8c080' },
  'Interactive': { bg: '#0a1814', border: '#20c0a0', text: '#40e8c0' },
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('t') || '不說').slice(0, 70);
  const sub   = (searchParams.get('s') || '工程 × 生醫 × AI 平台作品集').slice(0, 110);
  const tag   = (searchParams.get('tag') || '').slice(0, 24);

  const allText = title + sub + tag;
  const cjkData = await loadCjkFont(allText);

  const fonts = cjkData
    ? [{ name: 'NotoSansSC', data: cjkData, weight: 700, style: 'normal' }]
    : [];
  const ff = cjkData ? '"NotoSansSC", sans-serif' : 'sans-serif';

  const tc = TAG_COLORS[tag] || { bg: '#1a1428', border: '#7a5c1e', text: '#e8c060' };
  const titleSize = title.length > 24 ? (title.length > 40 ? 50 : 60) : 72;

  return new ImageResponse(
    <div
      style={{
        height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        backgroundColor: '#07050d', padding: '72px 88px 64px',
        fontFamily: ff, position: 'relative',
      }}
    >
      {/* Left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7,
        background: 'linear-gradient(180deg, #e8c060 0%, #9a6020 60%, #07050d 100%)' }} />

      {/* Top-right grid decoration */}
      <div style={{ position: 'absolute', right: 72, top: 56, display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.18 }}>
        {[0,1,2,3,4].map(r => (
          <div key={r} style={{ display: 'flex', gap: 6 }}>
            {[0,1,2,3,4,5].map(c => (
              <div key={c} style={{ width: 5, height: 5, borderRadius: '50%', background: '#e8c060' }} />
            ))}
          </div>
        ))}
      </div>

      {/* Tag badge */}
      {tag && (
        <div style={{ display: 'flex', marginBottom: 28 }}>
          <div style={{
            background: tc.bg, border: `1.5px solid ${tc.border}`,
            borderRadius: 6, padding: '7px 18px',
            fontSize: 17, color: tc.text, letterSpacing: 2,
            textTransform: 'uppercase', fontWeight: 700,
          }}>{tag}</div>
        </div>
      )}

      {/* Title */}
      <div style={{ fontSize: titleSize, fontWeight: 700, color: '#f0e6c8', lineHeight: 1.2, marginBottom: 22, maxWidth: 900 }}>{title}</div>

      {/* Sub */}
      <div style={{ fontSize: 25, color: '#5a4a2a', lineHeight: 1.55, marginBottom: 56, maxWidth: 820 }}>{sub}</div>

      {/* Bottom author strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: '#1a1428', border: '1.5px solid #7a5c1e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, color: '#e8c060',
        }}>JT</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 15, color: '#2a1a00', letterSpacing: 1.2 }}>donttalk.vercel.app</div>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts,
    }
  );
}
