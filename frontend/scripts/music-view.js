(() => {
    const stage = document.querySelector('.ck-stage[data-music-view]');
    if (!stage) return;

    const buttons = Array.from(stage.querySelectorAll('[data-music-mode]'));
    const preferenceKey = 'chillkara.musicView';

    function applyMode(mode) {
        stage.dataset.musicView = mode;
        for (const button of buttons) {
            button.setAttribute('aria-pressed', String(button.dataset.musicMode === mode));
        }

        const lyrics = stage.querySelector('#lyrics-container');
        const activeLine = lyrics?.querySelector('.lyric-line.active');
        if (activeLine && mode !== 'studio') {
            const offset = activeLine.getBoundingClientRect().top - lyrics.getBoundingClientRect().top;
            lyrics.scrollTop += offset - (lyrics.clientHeight - activeLine.offsetHeight) / 2;
        }
    }

    let savedMode;
    try { savedMode = localStorage.getItem(preferenceKey); } catch {}
    applyMode(buttons.some(button => button.dataset.musicMode === savedMode) ? savedMode : 'listen');

    for (const button of buttons) {
        button.addEventListener('click', () => {
            const mode = button.dataset.musicMode;
            applyMode(mode);
            try { localStorage.setItem(preferenceKey, mode); } catch {}
        });
    }
})();
