/* ── Reveal on scroll ── */
        const reveals = document.querySelectorAll('.reveal');

        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                }
            });
        }

            , {
                threshold: .1
            });
        reveals.forEach(r => obs.observe(r));

/* ── Active nav link ── */
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

        window.addEventListener('scroll', () => {
            let current = '';

            sections.forEach(s => {
                if (window.scrollY >= s.offsetTop - 100) current = s.id;
            });

            navLinks.forEach(a => {
                a.classList.toggle('active', a.getAttribute('href') === '#' + current);
            });
        });

        /* ── Tab switch ── */
        function switchTab(i) {
            document.querySelectorAll('.algo-tab').forEach((t, j) => t.classList.toggle('active', i === j));
            document.querySelectorAll('.algo-panel').forEach((p, j) => p.classList.toggle('active', i === j));
        }

        /* ── FAQ accordion ── */
        function toggleFaq(el) {
            const item = el.parentElement;
            const wasOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item').forEach(f => f.classList.remove('open'));
            if (!wasOpen) item.classList.add('open');
        }
