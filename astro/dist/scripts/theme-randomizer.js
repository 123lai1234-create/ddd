/**
 * Per-session theme randomizer — picks one palette on first load,
 * persists for the session so navigation doesn't flicker.
 * Overrides CSS variables declared in polish.css.
 */
(function () {
    const THEMES = [
        {
            name: 'neon-tokyo',
            vars: {
                '--accent-cyan': '#00e5ff',
                '--accent-pink': '#ff2d95',
                '--accent-purple': '#a855f7',
                '--accent-mint': '#22ffa7',
                '--accent-amber': '#fde047',
                '--bg-g1': 'rgba(255,45,149,0.14)',
                '--bg-g2': 'rgba(0,229,255,0.12)',
                '--bg-g3': 'rgba(168,85,247,0.08)',
            }
        },
        {
            name: 'bio-lab',
            vars: {
                '--accent-cyan': '#7bf0be',
                '--accent-pink': '#ff8392',
                '--accent-purple': '#b59cff',
                '--accent-mint': '#22ffa7',
                '--accent-amber': '#ffbc72',
                '--bg-g1': 'rgba(123,240,190,0.12)',
                '--bg-g2': 'rgba(88,215,255,0.12)',
                '--bg-g3': 'rgba(255,188,114,0.08)',
            }
        },
        {
            name: 'cyber-rose',
            vars: {
                '--accent-cyan': '#ffb4d8',
                '--accent-pink': '#ff2d95',
                '--accent-purple': '#c471ff',
                '--accent-mint': '#fde047',
                '--accent-amber': '#ff8392',
                '--bg-g1': 'rgba(255,45,149,0.18)',
                '--bg-g2': 'rgba(196,113,255,0.14)',
                '--bg-g3': 'rgba(255,131,146,0.1)',
            }
        },
        {
            name: 'deep-space',
            vars: {
                '--accent-cyan': '#58d7ff',
                '--accent-pink': '#7c4dff',
                '--accent-purple': '#4fc3f7',
                '--accent-mint': '#00e5ff',
                '--accent-amber': '#ffd54f',
                '--bg-g1': 'rgba(124,77,255,0.16)',
                '--bg-g2': 'rgba(88,215,255,0.14)',
                '--bg-g3': 'rgba(79,195,247,0.08)',
            }
        },
        {
            name: 'sunset',
            vars: {
                '--accent-cyan': '#ffbc72',
                '--accent-pink': '#ff6b9d',
                '--accent-purple': '#ff8a65',
                '--accent-mint': '#ffd180',
                '--accent-amber': '#fde047',
                '--bg-g1': 'rgba(255,107,157,0.15)',
                '--bg-g2': 'rgba(255,188,114,0.13)',
                '--bg-g3': 'rgba(253,224,71,0.08)',
            }
        },
        {
            name: 'matrix',
            vars: {
                '--accent-cyan': '#22ffa7',
                '--accent-pink': '#7bf0be',
                '--accent-purple': '#00e5ff',
                '--accent-mint': '#22ffa7',
                '--accent-amber': '#fde047',
                '--bg-g1': 'rgba(34,255,167,0.14)',
                '--bg-g2': 'rgba(123,240,190,0.1)',
                '--bg-g3': 'rgba(0,229,255,0.08)',
            }
        },
        {
            name: 'holo-purple',
            vars: {
                '--accent-cyan': '#e2a8ff',
                '--accent-pink': '#ff2d95',
                '--accent-purple': '#a855f7',
                '--accent-mint': '#58d7ff',
                '--accent-amber': '#fde047',
                '--bg-g1': 'rgba(168,85,247,0.18)',
                '--bg-g2': 'rgba(255,45,149,0.12)',
                '--bg-g3': 'rgba(226,168,255,0.08)',
            }
        },
    ];

    const STORAGE_KEY = 'portfolio_theme_v1';
    let theme;

    try {
        const cached = sessionStorage.getItem(STORAGE_KEY);
        if (cached) theme = THEMES.find(t => t.name === cached);
    } catch (_) { }

    if (!theme) {
        theme = THEMES[Math.floor(Math.random() * THEMES.length)];
        try { sessionStorage.setItem(STORAGE_KEY, theme.name); } catch (_) { }
    }

    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.theme = theme.name;

    // Expose a small reroll helper for manual testing
    window.__rerollTheme = function () {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) { }
        location.reload();
    };
})();
