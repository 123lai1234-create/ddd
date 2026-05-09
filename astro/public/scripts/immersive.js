/* ════════════════════════════════════════════════════════════════
   IMMERSIVE EXPERIENCE ENGINE FOR ASTRO
   ════════════════════════════════════════════════════════════════ */

class AstroImmersiveExperience {
    constructor() {
        this.scrollY = 0;
        this.revealElements = [];
        this.init();
    }

    init() {
        this.setupScrollReveal();
        this.setupEventListeners();
        this.setupPageTransition();
    }

    /* 滾動觸發動畫設置 */
    setupScrollReveal() {
        this.revealElements = document.querySelectorAll('.scroll-reveal');
        
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('active');
                        observer.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            });

            this.revealElements.forEach(el => observer.observe(el));
        } else {
            // Fallback for older browsers
            this.revealElements.forEach(el => el.classList.add('active'));
        }
    }

    /* 事件監聽器設置 */
    setupEventListeners() {
        window.addEventListener('scroll', () => this.handleScroll());
        
        // 互動式元素回饋
        document.querySelectorAll('.interactive-element').forEach(el => {
            el.addEventListener('mouseenter', () => this.playInteractiveEffect(el));
        });
    }

    /* 滾動事件處理 */
    handleScroll() {
        this.scrollY = window.scrollY;
        
        // 更新滾動進度指示器
        const scrollProgress = (this.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        document.documentElement.style.setProperty('--scroll-progress', scrollProgress + '%');
    }

    /* 頁面轉場動畫 */
    setupPageTransition() {
        document.querySelectorAll('a[href^="/"]').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (!href || href === '#') return;

                e.preventDefault();
                
                const transition = document.createElement('div');
                transition.className = 'page-transition';
                document.body.appendChild(transition);

                setTimeout(() => {
                    window.location.href = href;
                }, 600);
            });
        });
    }

    /* 互動式效果 */
    playInteractiveEffect(element) {
        const ripple = document.createElement('div');
        ripple.style.position = 'absolute';
        ripple.style.width = '20px';
        ripple.style.height = '20px';
        ripple.style.background = 'radial-gradient(circle, rgba(168, 85, 247, 0.5), transparent)';
        ripple.style.borderRadius = '50%';
        ripple.style.pointerEvents = 'none';
        ripple.style.animation = 'rippleEffect 0.6s ease-out forwards';
        
        element.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }
}

/* 初始化沉浸式體驗 */
document.addEventListener('DOMContentLoaded', () => {
    window.astroImmersive = new AstroImmersiveExperience();
});

/* CSS 動畫定義 */
const style = document.createElement('style');
style.textContent = `
    @keyframes rippleEffect {
        0% {
            width: 20px;
            height: 20px;
            opacity: 1;
        }
        100% {
            width: 200px;
            height: 200px;
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
