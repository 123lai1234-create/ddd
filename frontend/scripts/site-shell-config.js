window.SITE_SHELL_CONFIG = {
    index: {
        brandHref: 'index.html',
        brandHtml: '<span class="dot"></span>工程 × 生醫 AI',
        navLinks: [
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'firmware.html', label: '🔌 韌體' },
            { href: '/games/', label: '🎮 遊戲中心' },
            { href: 'protein_mpnn.html', label: '互動展示', classes: 'nav-cta' }
        ],
        drawerLinks: [
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI 平台' },
            { href: 'report.html', label: '專案報告' },
            { href: 'firmware.html', label: '🔌 韌體 MCU' },
            { href: 'protein_mpnn.html', label: '互動展示' },
            { href: '/games/', label: '🎮 遊戲中心' }
        ],
        footer: {
            variant: 'standard',
            titleHtml: '<div class="footer-brand">工程 × 生醫 × AI 作品集</div>',
            noteHtml: '<div class="footer-note">電資工程 × 生物醫學 × AI 平台作品集 · 2026</div>',
            links: [
                { href: 'about_me.html', label: 'About Me' },
                { href: 'works.html', label: '作品總覽' },
                { href: 'protein_mpnn.html', label: '互動展示' },
                { href: 'demo_notebook.ipynb', label: '互動筆記本' },
                { href: 'report.html', label: '專案報告' },
                { href: 'https://jtlai0921.wixsite.com/mysite', label: '個人網站', target: '_blank', rel: 'noreferrer' },
                { href: 'gene_ai.html', label: '基因 AI 平台' },
                { href: '/games/', label: '🎮 遊戲中心' },
                { href: 'README.md', label: 'README' }
            ]
        }
    },
    about_me: {
        brandHref: 'index.html',
        brandHtml: '<span class="mark"></span>About Me',
        navLinks: [
            { href: 'works.html', label: '作品總覽' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'ngs.html', label: 'NGS' },
            { href: 'index.html', label: '首頁' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI' }
        ],
        footer: {
            variant: 'standard',
            titleHtml: '<div style="font-weight:700;color:var(--text)">About Me</div>',
            noteHtml: '<div>工程師 · 生醫研究者 · 跨域平台整合者</div>',
            links: [
                { href: 'index.html', label: '首頁' },
                { href: 'works.html', label: '作品總覽' },
                { href: 'gene_ai.html', label: '基因 AI' },
                { href: 'ngs.html', label: 'NGS' }
            ]
        }
    },
    works: {
        brandHref: 'index.html',
        brandHtml: '<span class="nav-dot"></span>作品總覽',
        navLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'ngs.html', label: 'NGS' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'thesis.html', label: '論文展示' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'thesis.html', label: '論文展示' }
        ],
        footer: {
            variant: 'standard',
            titleHtml: '<div style="font-weight:700;color:var(--text)">作品總覽</div>',
            noteHtml: '<div>跨域作品總覽 · 蛋白質 AI · 基因 AI · NGS · 互動平台</div>',
            links: [
                { href: 'about_me.html', label: 'About Me' },
                { href: 'index.html', label: '首頁' },
                { href: 'gene_ai.html', label: '基因 AI' },
                { href: 'ngs.html', label: 'NGS' }
            ]
        }
    },
    gene_ai: {
        brandHref: 'index.html',
        brandHtml: '<span class="mark"></span>Genome Data Platform',
        navLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'ngs.html', label: 'NGS' },
            { href: 'protein_mpnn.html', label: '互動展示', classes: 'nav-cta' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: '#sequence-vault', label: 'Live · 序列資料庫' },
            { href: '#knowledge-vault', label: 'Live · 知識檢索' },
            { href: '#rag-layer', label: 'Live · RAG 文件輸出' }
        ],
        footer: {
            variant: 'standard',
            titleHtml: '<div class="footer-brand">基因資料平台</div>',
            noteHtml: '<div>Sequence cache · knowledge retrieval · RAG-ready documents</div>',
            links: [
                { href: 'about_me.html', label: 'About Me' },
                { href: 'works.html', label: '作品總覽' },
                { href: 'index.html', label: '蛋白質 AI 首頁' },
                { href: 'ngs.html', label: 'NGS 頁面' },
                { href: 'report.html', label: '專案報告' },
                { href: 'https://jtlai0921.wixsite.com/mysite', label: '個人網站', target: '_blank', rel: 'noreferrer' }
            ]
        }
    },
    ngs: {
        brandHref: 'index.html',
        brandHtml: '<span class="dot"></span>NGS 定序',
        navLinks: [
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'index.html', label: '首頁' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'gene_ai.html', label: '基因 AI' }
        ],
        footer: {
            variant: 'standard',
            titleHtml: '<div style="font-size:.9rem;font-weight:600;color:var(--text)">NGS 實驗設計</div>',
            noteHtml: '<div class="footer-note">蛋白質設計 AI Pipeline · 基因體學模組 · 2026</div>',
            links: [
                { href: 'about_me.html', label: 'About Me' },
                { href: 'works.html', label: '作品總覽' },
                { href: 'index.html', label: '← 作品集首頁' },
                { href: 'gene_ai.html', label: '基因 AI' },
                { href: 'report.html', label: '專案報告' }
            ]
        }
    },
    protein_mpnn: {
        brandHref: 'index.html',
        brandHtml: '<span class="dot"></span>ProteinMPNN Demo',
        navLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'report.html', label: '專案報告' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'demo_notebook.ipynb', label: '互動筆記本', classes: 'nav-cta' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'report.html', label: '專案報告' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'demo_notebook.ipynb', label: '互動筆記本' }
        ],
        footer: {
            variant: 'standard',
            titleHtml: '<div class="footer-brand">ProteinMPNN Interactive Workspace</div>',
            noteHtml: '<div class="footer-note">獨立工作台頁面 · 結合序列設計、結構預覽與初步評分</div>',
            links: [
                { href: 'index.html', label: '首頁' },
                { href: 'works.html', label: '作品總覽' },
                { href: 'report.html', label: '專案報告' },
                { href: 'demo_notebook.ipynb', label: '互動筆記本' },
                { href: 'gene_ai.html', label: '基因 AI 平台' },
                { href: 'README.md', label: 'README' }
            ]
        }
    },
    report: {
        brandHref: 'index.html',
        brandHtml: '<span class="nav-dot"></span>蛋白質設計 AI',
        navLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: '關於我' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'report.html', label: '報告', classes: 'active' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: '關於我' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'report.html', label: '報告', classes: 'active' }
        ],
        footer: {
            variant: 'inline',
            noteHtml: '作為大分子 AI 演算法研究方向的技術作品集專案製作 • 2026',
            links: [
                { href: 'index.html', label: '返回首頁', style: 'color:var(--teal);text-decoration:none' },
                { href: 'ngs.html', label: 'NGS 定序', style: 'color:var(--teal);text-decoration:none' }
            ]
        }
    },
    thesis: {
        brandHref: 'index.html',
        brandHtml: '<span class="nav-dot"></span>交易策略研究',
        navLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS' },
            { href: 'gene_ai.html', label: '基因 AI' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI' }
        ],
        footer: {
            variant: 'inline',
            noteHtml: '碩士論文互動展示 · 電資工程研究所 · 利用遺傳演算法於利潤價格分布為基礎的交易策略最佳化技術之研究',
            links: [
                { href: 'index.html', label: '返回首頁' },
                { href: 'works.html', label: '作品總覽' },
                { href: 'about_me.html', label: 'About Me' }
            ]
        }
    },
    interview_prep: {
        brandHref: 'index.html',
        brandHtml: '<span class="nav-dot"></span>面試準備手冊',
        navLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'interview_prep.html', label: '面試', classes: 'active' }
        ],
        drawerLinks: [
            { href: 'index.html', label: '首頁' },
            { href: 'about_me.html', label: 'About Me' },
            { href: 'works.html', label: '作品總覽' },
            { href: 'ngs.html', label: 'NGS 定序' },
            { href: 'gene_ai.html', label: '基因 AI' },
            { href: 'interview_prep.html', label: '面試準備', classes: 'active' }
        ]
    }
};