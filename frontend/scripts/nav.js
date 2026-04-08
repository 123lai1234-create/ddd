(function () {
    /* ── Hamburger / drawer ── */
    var hamburger = document.getElementById('hamburger');
    var navDrawer = document.getElementById('navDrawer');
    if (hamburger && navDrawer) {
        hamburger.addEventListener('click', function () {
            var open = navDrawer.classList.toggle('open');
            hamburger.classList.toggle('open', open);
            hamburger.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                navDrawer.classList.remove('open');
                hamburger.classList.remove('open');
                hamburger.setAttribute('aria-label', '開啟選單');
            }
        });

        navDrawer.querySelectorAll('a[href^="#"]').forEach(function (a) {
            a.addEventListener('click', function () {
                navDrawer.classList.remove('open');
                hamburger.classList.remove('open');
                hamburger.setAttribute('aria-label', '開啟選單');
            });
        });
    }

    /* ── Scroll-to-top ── */
    var scrollBtn = document.querySelector('.scroll-top');
    if (scrollBtn) {
        window.addEventListener('scroll', function () {
            scrollBtn.classList.toggle('show', window.scrollY > 420);
        }, { passive: true });
        scrollBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ── Scroll reveal ── */
    if (typeof IntersectionObserver !== 'undefined') {
        var revealObs = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                    revealObs.unobserve(e.target);
                }
            });
        }, { threshold: 0.07 });
        document.querySelectorAll('.reveal').forEach(function (el) {
            revealObs.observe(el);
        });
    }
})();
