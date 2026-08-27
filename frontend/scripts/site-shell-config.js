window.SITE_SHELL_CONFIG = (function () {
    var STD_NAV = [
        { href: '/about', label: 'About Me' },
        { href: '/works', label: '作品總覽' },
        { href: '/ngs', label: 'NGS 定序' },
        { href: '/gene-ai', label: '基因 AI' },
        { href: '/firmware', label: '🔌 韌體' },
        { href: '/stem-cell', label: '🧫 幹細胞' },
        { href: '/protein-mpnn', label: 'ProteinMPNN' },
        { href: '/music', label: '🎵 音樂' },
        { href: '/interactive-showcase', label: '⚡ Tech Lab', classes: 'nav-cta' }
    ];

    var STD_DRAWER = [
        { href: '/', label: '首頁' },
        { href: '/about', label: 'About Me' },
        { href: '/works', label: '作品總覽' },
        { href: '/ngs', label: 'NGS 定序' },
        { href: '/gene-ai', label: '基因 AI' },
        { href: '/report', label: '專案報告' },
        { href: '/protein-mpnn', label: 'ProteinMPNN' },
        { href: '/music', label: '🎵 音樂播放' },
        { href: '/interactive-showcase', label: '⚡ 互動技術展示館' },
        { href: '/firmware', label: '🔌 韌體 MCU' },
        { href: '/interview-prep', label: '面試準備' },
        { href: '/stem-cell', label: '🧫 幹細胞研究' }
    ];

    var STD_FOOTER_LINKS = [
        { href: '/', label: '首頁' },
        { href: '/about', label: 'About Me' },
        { href: '/works', label: '作品總覽' },
        { href: '/gene-ai', label: '基因 AI' },
        { href: '/ngs', label: 'NGS 定序' },
        { href: '/protein-mpnn', label: 'ProteinMPNN' },
        { href: '/music', label: '🎵 音樂播放' },
        { href: '/report', label: '專案報告' },
        { href: '/firmware', label: '韌體' },
        { href: '/stem-cell', label: '幹細胞研究' },
        { href: '/interactive-showcase', label: '⚡ Tech Lab' },
        { href: 'https://jtlai0921.wixsite.com/mysite', label: '個人網站', target: '_blank', rel: 'noreferrer' }
    ];

    function stdFooter(title, note) {
        return {
            variant: 'standard',
            titleHtml: '<div class="footer-brand">' + title + '</div>',
            noteHtml: '<div class="footer-note">' + note + '</div>',
            links: STD_FOOTER_LINKS
        };
    }

    return {
        index: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>工程 × 生醫 AI',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('工程 × 生醫 × AI 作品集', '電資工程 × 生物醫學 × AI 平台作品集 · 2026')
        },
        about_me: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>About Me',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('About Me', '工程師 · 生醫研究者 · 跨域平台整合者')
        },
        works: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>作品總覽',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('作品總覽', '跨域作品總覽 · 蛋白質 AI · 基因 AI · NGS · 互動平台')
        },
        gene_ai: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>基因 AI 平台',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('基因資料平台', 'Sequence cache · knowledge retrieval · RAG-ready documents')
        },
        ngs: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>NGS 定序',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('NGS 實驗設計', '蛋白質設計 AI Pipeline · 基因體學模組 · 2026')
        },
        protein_mpnn: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>ProteinMPNN Demo',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('ProteinMPNN Interactive Workspace', '獨立工作台頁面 · 結合序列設計、結構預覽與初步評分')
        },
        report: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>蛋白質設計 AI',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('蛋白質設計 AI 報告', '作為大分子 AI 演算法研究方向的技術作品集專案製作 · 2026')
        },
        thesis: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>交易策略研究',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: {
                variant: 'inline',
                noteHtml: '碩士論文互動展示 · 電資工程研究所 · 利用遺傳演算法於利潤價格分布為基礎的交易策略最佳化技術之研究',
                links: [
                    { href: '/', label: '返回首頁' },
                    { href: '/works', label: '作品總覽' },
                    { href: '/about', label: 'About Me' }
                ]
            }
        },
        interview_prep: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>面試準備手冊',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('面試準備手冊', '模擬面試問答 · 數學推導 · Mini Project · 六週衝刺計劃')
        },
        firmware: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>韌體工程',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('韌體工程 · MCU Firmware', 'Nuvoton Cortex-M0 · EBI · RGB565 · Keil + J-Link · 2026')
        },
        stem_cell: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>幹細胞研究',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('幹細胞研究 · 國防醫學院', '神經血管再生修復 · MSC · NSC · Cell Sheet · 2018 精準醫療創新獎')
        },
        ingest: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>資料擷取',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('資料擷取平台', '自動化資料同步 · API 整合 · 2026')
        },
        interactive_showcase: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>⚡ Tech Lab',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('互動技術展示館', 'Three.js · Canvas · Web Animations API · A-Frame VR · WebAssembly · PWA · 2026')
        },
        music: {
            brandHref: '/',
            brandHtml: '<span class="nav-dot"></span>🎵 音樂播放',
            navLinks: STD_NAV,
            drawerLinks: STD_DRAWER,
            footer: stdFooter('音樂播放平台', '現代化音樂播放平台 · 等化器 · 視覺化效果 · 2026')
        }
    };
})();
