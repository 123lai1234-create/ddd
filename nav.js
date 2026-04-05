(function () {
    var hamburger = document.getElementById('hamburger');
    var navDrawer = document.getElementById('navDrawer');
    if (!hamburger || !navDrawer) return;

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
})();
