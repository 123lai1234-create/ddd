import React, { useState, useEffect, useRef } from 'react';

// Skill data for radar chart
const skillData = [
  { label: 'Frontend', value: 88 },
  { label: 'Python/AI', value: 85 },
  { label: 'Biomedical', value: 92 },
  { label: 'NGS/Genomics', value: 80 },
  { label: 'Research', value: 90 },
  { label: 'DevOps', value: 68 },
];

export default function AboutApp() {
  const [activeSection, setActiveSection] = useState('identity');
  const [contactForm, setContactForm] = useState({ name: '', email: '', organization: '', message: '' });
  const [contactStatus, setContactStatus] = useState('連線確認中…');
  const radarRef = useRef<HTMLCanvasElement>(null);

  // Draw radar chart
  useEffect(() => {
    const canvas = radarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const maxRadius = 80;

    // Draw circles
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (maxRadius / 4) * i, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(88,215,255,0.2)';
      ctx.stroke();
    }

    // Draw axes
    const n = skillData.length;
    skillData.forEach((skill, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = centerX + Math.cos(angle) * maxRadius;
      const y = centerY + Math.sin(angle) * maxRadius;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(88,215,255,0.3)';
      ctx.stroke();

      // Labels
      const labelX = centerX + Math.cos(angle) * (maxRadius + 20);
      const labelY = centerY + Math.sin(angle) * (maxRadius + 20);
      ctx.fillStyle = '#888';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(skill.label, labelX, labelY);
    });

    // Draw data polygon
    ctx.beginPath();
    skillData.forEach((skill, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (skill.value / 100) * maxRadius;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(123,240,190,0.3)';
    ctx.fill();
    ctx.strokeStyle = '#7bf0be';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, []);

  // Contact form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactStatus('送出中…');
    await new Promise(r => setTimeout(r, 1500));
    setContactStatus('✅ 訊息已送出！');
    setTimeout(() => setContactStatus('連線確認中…'), 3000);
  };

  // Progress bars animation
  useEffect(() => {
    document.querySelectorAll('[data-skill-bar]').forEach(el => {
      const bar = el.querySelector('.skill-bar-fill') as HTMLElement;
      if (bar) {
        const value = parseInt(el.getAttribute('data-skill-bar') || '0');
        setTimeout(() => { bar.style.width = `${value}%`; }, 100);
      }
    });
  }, []);

  return (
    <>
      <div data-site-nav />

      {/* Hero */}
      <header className="hero">
        <div className="hero-wrap">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot"></span>About Me · Engineering × Biomedical Research</div>
            <h1>工程、生醫與<br /><span>平台實作的交會點</span></h1>
            <p className="hero-sub">
              電資工程與生物醫學雙碩士背景，加上臨床訓練、藥廠行銷與研究第一線的實際歷練，讓這裡展示的每個作品都有真實場景的支撐。
            </p>
            <div className="cta-row">
              <a href="/works" className="btn btn-primary">看代表作品</a>
              <a href="https://www.linkedin.com/in/ctlai" target="_blank" rel="noreferrer" className="btn btn-secondary">LinkedIn</a>
            </div>
          </div>
          <div className="hero-panel">
            <div className="panel-title">Profile Snapshot</div>
            <div className="signal-grid">
              <div className="signal">
                <div className="k">Primary Identity</div>
                <div className="v">Engineer × Biomedical</div>
              </div>
              <div className="signal">
                <div className="k">Education</div>
                <div className="v">Electronic Eng. + Anatomy/Cell Biology</div>
              </div>
              <div className="signal">
                <div className="k">Work Axis</div>
                <div className="v">Frontend / App / NGS / Research</div>
              </div>
              <div className="signal">
                <div className="k">Output Style</div>
                <div className="v">Research → Product → Interface</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Navigation */}
        <nav style={{ display: 'flex', gap: '8px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {['identity', 'experience', 'education', 'skills', 'connect', 'links'].map(section => (
            <button
              key={section}
              className={`btn ${activeSection === section ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveSection(section)}
            >
              {section === 'identity' && '👤 '}
              {section === 'experience' && '📋 '}
              {section === 'education' && '🎓 '}
              {section === 'skills' && '🛠 '}
              {section === 'connect' && '📧 '}
              {section === 'links' && '🔗 '}
              {section.charAt(0).toUpperCase() + section.slice(1)}
            </button>
          ))}
        </nav>

        {/* Identity Section */}
        {activeSection === 'identity' && (
          <section>
            <div className="section-label">Identity</div>
            <h2 className="section-title">我在這個作品集裡扮演什麼角色</h2>
            <p className="section-sub">最明顯的主線不是單一職稱，而是持續在工程、研究與平台介面三條線之間移動。</p>
            <div className="card-grid">
              <div className="card">
                <div className="tiny">Role 01</div>
                <h3>介面與應用開發者</h3>
                <p>從前後端網站、應用程式到互動工作台，把分析流程轉成可操作的使用體驗。</p>
              </div>
              <div className="card">
                <div className="tiny">Role 02</div>
                <h3>生物醫學研究導向</h3>
                <p>長期處於研究與臨床邊界，讓 NGS、變異解讀與 assay workflow 有真正的場景感。</p>
              </div>
              <div className="card">
                <div className="tiny">Role 03</div>
                <h3>平台型整合者</h3>
                <p>能把模型、資料、流程與 UI 接成一體，是本站從蛋白質 AI 延伸到基因 AI、再接回 NGS 的核心價值。</p>
              </div>
            </div>
          </section>
        )}

        {/* Experience Section */}
        {activeSection === 'experience' && (
          <section>
            <div className="section-label">Experience</div>
            <h2 className="section-title">經歷主軸</h2>
            <div className="timeline">
              <div className="timeline-card">
                <div className="time-tag">2020 / 07 — 迄今</div>
                <div className="timeline-copy">
                  <h3>工程師：前後端介面開發、網站與應用程式</h3>
                  <p>這一段經歷直接對應到目前本站的互動作品形式：不是單純放成果，而是把技術包成一個能操作、能展示、能說故事的平台。</p>
                </div>
              </div>
              <div className="timeline-card">
                <div className="time-tag">2014 / 01 — 2019 / 03</div>
                <div className="timeline-copy">
                  <h3>生物醫學研究及相關工作</h3>
                  <p>這段背景讓目前做的 NGS、變異解讀、基因平台與生醫資料頁面有了真正的應用場景與判斷脈絡。</p>
                </div>
              </div>
              <div className="timeline-card">
                <div className="time-tag">Cross-domain layer</div>
                <div className="timeline-copy">
                  <h3>臨床、醫藥行銷、智財與產品轉譯</h3>
                  <p>醫藥行銷師背景、專業訓練與考核，曾協助團隊獲得國家新創獎與 2 項發明專利。</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Education Section */}
        {activeSection === 'education' && (
          <section>
            <div className="section-label">Education</div>
            <h2 className="section-title">教育背景</h2>
            <div className="card-grid">
              <div className="card">
                <div className="tiny">2022 / 09 — 2025 / 08</div>
                <h3>Electronic Engineering</h3>
                <p>National Taipei University of Technology, Taipei Tech。這條線補足系統、電子與工程開發邏輯。</p>
              </div>
              <div className="card">
                <div className="tiny">2015 / 09 — 2017 / 08</div>
                <h3>Anatomy and Cell Biology</h3>
                <p>National Yang-Ming University。這條線是本站所有生醫與基因體頁面的研究基礎。</p>
              </div>
              <div className="card">
                <div className="tiny">Cross-training</div>
                <h3>持續進修與工具訓練</h3>
                <p>涵蓋程式、APP、音訊與相關工具的多種職訓與在職訓練，反映持續跨域擴充。</p>
              </div>
            </div>
          </section>
        )}

        {/* Skills Section */}
        {activeSection === 'skills' && (
          <section>
            <div className="section-label">Skills</div>
            <h2 className="section-title">技能組合</h2>
            <div className="skills-grid">
              <div className="skill-card">
                <div className="tiny">Software</div>
                <h3>程式與開發</h3>
                <p>Java、Python、C，以及前後端網站與應用程式實作能力。</p>
                <div className="tag-row">
                  <span className="tag">Java</span>
                  <span className="tag">Python</span>
                  <span className="tag">C</span>
                  <span className="tag">Frontend</span>
                </div>
              </div>
              <div className="skill-card">
                <div className="tiny">Biomedical</div>
                <h3>生醫與基因體應用</h3>
                <p>生物醫學研究、NGS、變異分析與研究工作流理解。</p>
                <div className="tag-row">
                  <span className="tag">NGS</span>
                  <span className="tag">Variant Interpretation</span>
                  <span className="tag">Genomics</span>
                </div>
              </div>
              <div className="skill-card">
                <div className="tiny">Translation</div>
                <h3>產品與敘事轉譯</h3>
                <p>醫藥、臨床與智財相關訓練，擅長把技術成果轉譯成產品故事、展示內容與可被非研究背景理解的介面。</p>
                <div className="tag-row">
                  <span className="tag">Product Framing</span>
                  <span className="tag">Research Translation</span>
                  <span className="tag">Clinical Context</span>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', alignItems: 'start' }}>
              <div>
                <div className="section-label" style={{ marginBottom: '12px' }}>Radar</div>
                <div className="skill-radar-wrap">
                  <canvas ref={radarRef}></canvas>
                </div>
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: '12px' }}>Proficiency</div>
                <div className="skill-bar-list">
                  {skillData.map(skill => (
                    <div key={skill.label} className="skill-bar-item" data-skill-bar={skill.value}>
                      <span>{skill.label}</span>
                      <div className="skill-bar-track"><div className="skill-bar-fill"></div></div>
                      <span className="skill-pct">{skill.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Connect Section */}
        {activeSection === 'connect' && (
          <section>
            <div className="section-label">Connect</div>
            <h2 className="section-title">聯絡我</h2>
            <div className="contact-layout">
              <div className="contact-panel">
                <div className="tiny">Get in touch</div>
                <h3>合作洽詢</h3>
                <p>研究合作、產品開發、平台整合，歡迎留言。</p>
              </div>
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="contact-name">姓名</label>
                    <input
                      id="contact-name"
                      type="text"
                      value={contactForm.name}
                      onChange={e => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      type="email"
                      value={contactForm.email}
                      onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="contact-organization">公司 / 單位</label>
                    <input
                      id="contact-organization"
                      type="text"
                      value={contactForm.organization}
                      onChange={e => setContactForm(prev => ({ ...prev, organization: e.target.value }))}
                      placeholder="Lab, company, hospital, startup..."
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="contact-message">訊息內容</label>
                    <textarea
                      id="contact-message"
                      value={contactForm.message}
                      onChange={e => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="想聊的主題、合作方向、研究需求或平台想法"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary">送出留言</button>
                <div className="form-status">{contactStatus}</div>
              </form>
            </div>
          </section>
        )}

        {/* Links Section */}
        {activeSection === 'links' && (
          <section>
            <div className="section-label">Links</div>
            <h2 className="section-title">延伸入口</h2>
            <div className="link-grid">
              <div className="link-card">
                <div className="tiny">External</div>
                <h3>個人網站首頁</h3>
                <p>Wix 原始個人站，包含 About Me、Research Blog 與作品入口。</p>
                <a href="https://jtlai0921.wixsite.com/mysite" target="_blank" rel="noreferrer">前往網站</a>
              </div>
              <div className="link-card">
                <div className="tiny">External</div>
                <h3>About Me 原頁</h3>
                <p>保留原始 About Me 版面，方便比對本站本地化整理後的版本。</p>
                <a href="https://jtlai0921.wixsite.com/mysite/about-me" target="_blank" rel="noreferrer">開啟 About Me</a>
              </div>
              <div className="link-card">
                <div className="tiny">External</div>
                <h3>LinkedIn</h3>
                <p>補充履歷與社群身份入口。</p>
                <a href="https://www.linkedin.com/in/ctlai" target="_blank" rel="noreferrer">前往 LinkedIn</a>
              </div>
            </div>
          </section>
        )}
      </main>

      <div data-site-footer />
      <button className="scroll-top" aria-label="返回頂部">↑</button>
    </>
  );
}