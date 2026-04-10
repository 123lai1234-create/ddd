(function () {
    var SITE_SHELL = window.SITE_SHELL_CONFIG || {};

    function renderAttr(name, value) {
        return value ? ' ' + name + '="' + value + '"' : '';
    }

    function renderAnchor(link) {
        return '<a href="' + link.href + '"' +
            renderAttr('class', link.classes) +
            renderAttr('target', link.target) +
            renderAttr('rel', link.rel || (link.target === '_blank' ? 'noreferrer' : '')) +
            renderAttr('style', link.style) +
            '>' + link.label + '</a>';
    }

    function renderNavLinkItems(links) {
        return links.map(function (link) {
            return '<li>' + renderAnchor(link) + '</li>';
        }).join('');
    }

    function renderAnchorList(links) {
        return links.map(renderAnchor).join('');
    }

    function renderInlineFooter(footer) {
        var separator = footer.separatorHtml || '&nbsp;·&nbsp;';
        var links = (footer.links || []).map(function (link) {
            return separator + renderAnchor(link);
        }).join('');
        return '<footer>' + footer.noteHtml + links + '</footer>';
    }

    function renderStandardFooter(footer) {
        return '<footer><div>' +
            (footer.titleHtml || '') +
            (footer.noteHtml || '') +
            '</div><div class="footer-links">' +
            renderAnchorList(footer.links || []) +
            '</div></footer>';
    }

    function renderSiteShell() {
        var pageKey = document.body && document.body.dataset ? document.body.dataset.page : '';
        var page = SITE_SHELL[pageKey];
        if (!page) return;

        var navTarget = document.querySelector('[data-site-nav]');
        if (navTarget) {
            navTarget.outerHTML = '<nav><a href="' + page.brandHref + '" class="nav-brand">' +
                page.brandHtml +
                '</a><ul class="nav-links">' +
                renderNavLinkItems(page.navLinks || []) +
                '</ul><button class="hamburger" id="hamburger" aria-label="開啟選單"><span></span><span></span><span></span></button></nav>' +
                '<div class="nav-drawer" id="navDrawer">' + renderAnchorList(page.drawerLinks || []) + '</div>';
        }

        var footerTarget = document.querySelector('[data-site-footer]');
        if (footerTarget && page.footer) {
            footerTarget.outerHTML = page.footer.variant === 'inline'
                ? renderInlineFooter(page.footer)
                : renderStandardFooter(page.footer);
        }
    }

    renderSiteShell();

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
