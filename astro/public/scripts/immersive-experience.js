/* ════════════════════════════════════════════════════════════════
   IMMERSIVE EXPERIENCE ENGINE - 沉浸式體驗引擎
   ════════════════════════════════════════════════════════════════ */

class ImmersiveExperience {
    constructor() {
        this.particles = [];
        this.scrollY = 0;
        this.parallaxElements = [];
        this.revealElements = [];
        this.init();
    }

    init() {
        this.createParticles();
        this.setupParallax();
        this.setupScrollReveal();
        this.setupEventListeners();
        this.animate();
    }

    /* 1. 動態粒子系統 */
    createParticles() {
        const container = document.querySelector('.immersive-bg') || document.body;
        const particleCount = Math.min(50, Math.floor(window.innerWidth / 20));

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';
            particle.style.width = (Math.random() * 3 + 1) + 'px';
            particle.style.height = particle.style.width;
            particle.style.animationDuration = (Math.random() * 10 + 15) + 's';
            particle.style.animationDelay = Math.random() * 5 + 's';
            
            container.appendChild(particle);
            this.particles.push(particle);
        }
    }

    /* 2. 視差滾動設置 */
    setupParallax() {
        this.parallaxElements = document.querySelectorAll('[data-parallax]');
        this.updateParallax();
    }

    updateParallax() {
        this.parallaxElements.forEach(element => {
            const speed = parseFloat(element.dataset.parallax) || 0.5;
            const yOffset = this.scrollY * speed;
            element.style.transform = `translateY(${yOffset}px)`;
        });
    }

    /* 3. 滾動觸發動畫 */
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

    /* 4. 事件監聽器設置 */
    setupEventListeners() {
        window.addEventListener('scroll', () => this.handleScroll());
        window.addEventListener('resize', () => this.handleResize());
        
        // 頁面轉場動畫
        document.querySelectorAll('a[href^="/"]').forEach(link => {
            link.addEventListener('click', (e) => this.handlePageTransition(e));
        });

        // 互動式元素回饋
        document.querySelectorAll('.interactive-element').forEach(el => {
            el.addEventListener('mouseenter', () => this.playInteractiveEffect(el));
        });
    }

    /* 5. 滾動事件處理 */
    handleScroll() {
        this.scrollY = window.scrollY;
        this.updateParallax();
        
        // 更新滾動進度指示器
        const scrollProgress = (this.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        document.documentElement.style.setProperty('--scroll-progress', scrollProgress + '%');
    }

    /* 6. 視窗大小改變處理 */
    handleResize() {
        // 重新計算粒子數量
        const newParticleCount = Math.min(50, Math.floor(window.innerWidth / 20));
        if (newParticleCount !== this.particles.length) {
            this.particles.forEach(p => p.remove());
            this.particles = [];
            this.createParticles();
        }
    }

    /* 7. 頁面轉場動畫 */
    handlePageTransition(e) {
        const href = e.currentTarget.getAttribute('href');
        if (!href || href === '#') return;

        e.preventDefault();
        
        const transition = document.createElement('div');
        transition.className = 'page-transition';
        document.body.appendChild(transition);

        setTimeout(() => {
            window.location.href = href;
        }, 600);
    }

    /* 8. 互動式效果 */
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

    /* 9. 動畫循環 */
    animate() {
        requestAnimationFrame(() => this.animate());
    }

    /* 10. 音效視覺化 */
    createSoundVisualization() {
        const container = document.createElement('div');
        container.className = 'sound-wave';
        
        for (let i = 0; i < 5; i++) {
            const bar = document.createElement('div');
            bar.className = 'sound-bar';
            container.appendChild(bar);
        }
        
        return container;
    }
}

/* 初始化沉浸式體驗 */
document.addEventListener('DOMContentLoaded', () => {
    window.immersiveExperience = new ImmersiveExperience();
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
