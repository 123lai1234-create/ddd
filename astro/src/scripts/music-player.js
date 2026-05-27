/**
 * Music Player - Full Featured Audio Player
 * Playlist management, equalizer, visualizer, LRC lyrics with precise timing sync
 */

(function () {
    'use strict';

    // LRC Parser
    function parseLRC(text) {
        const lines = text.split('\n');
        const lyrics = [];
        const timeTags = [];

        // Regex for LRC timestamps: [mm:ss.xx] or [mm:ss]
        const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2}))?\]/g;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Parse metadata lines (ignore)
            if (trimmed.startsWith('[ti:') || trimmed.startsWith('[ar:') ||
                trimmed.startsWith('[al:') || trimmed.startsWith('[by:') ||
                trimmed.startsWith('[offset:')) {
                return;
            }

            // Parse timestamps
            let match;
            let timestamps = [];
            let remainingText = trimmed;

            timeRegex.lastIndex = 0;
            while ((match = timeRegex.exec(trimmed)) !== null) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const centiseconds = match[3] ? parseInt(match[3]) : 0;
                const time = minutes * 60 + seconds + centiseconds / 100;
                timestamps.push(time);
            }

            // Remove timestamps from text
            remainingText = trimmed.replace(timeRegex, '').trim();
            if (!remainingText) return;

            // If no timestamps found, treat as plain text
            if (timestamps.length === 0) {
                lyrics.push({ time: null, text: remainingText });
                return;
            }

            // Create entry for each timestamp (for multiple timestamps same text)
            timestamps.forEach(time => {
                lyrics.push({ time, text: remainingText });
            });
        });

        // Sort by time
        lyrics.sort((a, b) => {
            if (a.time === null) return 1;
            if (b.time === null) return -1;
            return a.time - b.time;
        });

        return lyrics;
    }

    // State
    const state = {
        playlist: [],
        currentIndex: -1,
        isPlaying: false,
        isShuffle: false,
        repeatMode: 'none',
        volume: 75,
        quality: 'medium',
        favorites: new Set(),
        lyricsCache: {},
        currentLyrics: [],
        currentLyricIndex: -1,
        isLRCFormat: false,
        stats: {
            totalPlayedTime: 0,
            todayPlays: 0,
            mostPlayed: null,
            playCounts: {}
        }
    };

    // DOM Elements
    let elements = {};

    // Initialize
    function init() {
        cacheElements();
        bindEvents();
        loadFromStorage();

        if (state.playlist.length === 0 && window.DEFAULT_PLAYLIST) {
            state.playlist = [...window.DEFAULT_PLAYLIST];
        }

        renderPlaylist();
        updateStats();
        setupAudioContext();
    }

    function cacheElements() {
        elements = {
            playlist: document.getElementById('playlist'),
            audioPlayer: document.getElementById('audio-player'),
            playBtn: document.getElementById('play-btn'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn'),
            shuffleBtn: document.getElementById('shuffle-btn'),
            repeatBtn: document.getElementById('repeat-btn'),
            volumeBtn: document.getElementById('volume-btn'),
            volumeSlider: document.getElementById('volume-slider'),
            volumeValue: document.getElementById('volume-value'),
            progressBar: document.getElementById('progress-bar'),
            progressFill: document.getElementById('progress-fill'),
            progressHandle: document.getElementById('progress-handle'),
            timeCurrent: document.getElementById('time-current'),
            timeTotal: document.getElementById('time-total'),
            trackTitle: document.getElementById('track-title'),
            trackArtist: document.getElementById('track-artist'),
            albumArt: document.getElementById('album-art'),
            searchInput: document.getElementById('search-input'),
            addMusicBtn: document.getElementById('add-music-btn'),
            modal: document.getElementById('add-music-modal'),
            modalClose: document.getElementById('modal-close'),
            addMusicConfirm: document.getElementById('add-music-confirm'),
            lyrics: document.getElementById('lyrics'),
            lyricsContainer: document.getElementById('lyrics-container'),
            equalizer: document.getElementById('equalizer'),
            eqReset: document.getElementById('eq-reset'),
            qualitySelect: document.getElementById('quality-select'),
            totalSongs: document.getElementById('total-songs'),
            totalDuration: document.getElementById('total-duration'),
            statPlayed: document.getElementById('stat-played'),
            statPlays: document.getElementById('stat-plays'),
            statMostPlayed: document.getElementById('stat-most-played')
        };
    }

    function bindEvents() {
        elements.playBtn?.addEventListener('click', togglePlay);
        elements.prevBtn?.addEventListener('click', prevTrack);
        elements.nextBtn?.addEventListener('click', nextTrack);
        elements.shuffleBtn?.addEventListener('click', toggleShuffle);
        elements.repeatBtn?.addEventListener('click', toggleRepeat);

        elements.volumeBtn?.addEventListener('click', toggleMute);
        elements.volumeSlider?.addEventListener('input', setVolume);

        elements.progressBar?.addEventListener('click', seek);

        elements.audioPlayer?.addEventListener('timeupdate', updateProgress);
        elements.audioPlayer?.addEventListener('timeupdate', syncLyrics);
        elements.audioPlayer?.addEventListener('ended', onTrackEnded);
        elements.audioPlayer?.addEventListener('loadedmetadata', onMetadataLoaded);
        elements.audioPlayer?.addEventListener('error', onAudioError);

        elements.searchInput?.addEventListener('input', filterPlaylist);

        elements.addMusicBtn?.addEventListener('click', () => openModal());
        elements.modalClose?.addEventListener('click', () => closeModal());
        elements.addMusicConfirm?.addEventListener('click', addNewMusic);
        elements.modal?.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeModal();
        });

        elements.eqReset?.addEventListener('click', resetEqualizer);
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', updateEqualizer);
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        elements.qualitySelect?.addEventListener('change', changeQuality);

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Genre filter
        document.querySelectorAll('.genre-btn').forEach(btn => {
            btn.addEventListener('click', () => filterByGenre(btn.dataset.genre));
        });

        elements.lyricsContainer?.addEventListener('click', toggleLyricsPanel);
    }

    let audioContext, analyser, dataArray;

    function setupAudioContext() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            const source = audioContext.createMediaElementSource(elements.audioPlayer);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }

    function renderPlaylist(filter = '') {
        if (!elements.playlist) return;

        const filtered = state.playlist.filter(song => {
            if (!filter) return true;
            const query = filter.toLowerCase();
            return song.title.toLowerCase().includes(query) ||
                song.artist.toLowerCase().includes(query);
        });

        elements.playlist.innerHTML = filtered.map((song, idx) => {
            const actualIndex = state.playlist.indexOf(song);
            const isActive = actualIndex === state.currentIndex;
            const isFavorite = state.favorites.has(song.id);
            const hasLyrics = song.hasLyrics || state.lyricsCache[song.id];
            const isLRC = state.lyricsCache[song.id]?.isLRC;

            return `
                <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${actualIndex}">
                    <div class="item-cover">
                        ${song.cover ? `<img src="${song.cover}" alt="">` : '<span>🎵</span>'}
                    </div>
                    <div class="item-info">
                        <div class="item-title">${song.title}</div>
                        <div class="item-artist">${song.artist}</div>
                    </div>
                    <div class="item-meta">
                        ${hasLyrics ? `<span class="has-lyrics" title="${isLRC ? '動態歌詞' : '歌詞'}">${isLRC ? '🎤' : '📝'}</span>` : ''}
                        <span class="item-duration">${formatTime(song.duration)}</span>
                    </div>
                    <button class="item-favorite ${isFavorite ? 'active' : ''}" data-id="${song.id}">
                        ${isFavorite ? '❤️' : '🤍'}
                    </button>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => playTrack(parseInt(item.dataset.index)));
        });
        document.querySelectorAll('.item-favorite').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(btn.dataset.id);
            });
        });

        elements.totalSongs.textContent = state.playlist.length;
        elements.totalDuration.textContent = formatTime(
            state.playlist.reduce((acc, s) => acc + s.duration, 0)
        );
    }

    function filterPlaylist(e) {
        renderPlaylist(e.target.value);
    }

    function filterByGenre(genre) {
        // Update active button
        document.querySelectorAll('.genre-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.genre === genre);
        });

        // Filter and render playlist
        if (!elements.playlist) return;

        const filtered = genre === 'all'
            ? state.playlist
            : state.playlist.filter(song => song.genre === genre);

        elements.playlist.innerHTML = filtered.map((song, idx) => {
            const actualIndex = state.playlist.indexOf(song);
            const isActive = actualIndex === state.currentIndex;
            const isFavorite = state.favorites.has(song.id);
            const hasLyrics = song.hasLyrics || state.lyricsCache[song.id];
            const isLRC = state.lyricsCache[song.id]?.isLRC;

            return `
                <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${actualIndex}">
                    <div class="item-cover">
                        ${song.cover ? `<img src="${song.cover}" alt="">` : '<span>🎵</span>'}
                    </div>
                    <div class="item-info">
                        <div class="item-title">${song.title}</div>
                        <div class="item-artist">${song.artist}</div>
                    </div>
                    <div class="item-meta">
                        ${hasLyrics ? `<span class="has-lyrics" title="${isLRC ? '動態歌詞' : '歌詞'}">${isLRC ? '🎤' : '📝'}</span>` : ''}
                        <span class="item-duration">${formatTime(song.duration)}</span>
                    </div>
                    <button class="item-favorite ${isFavorite ? 'active' : ''}" data-id="${song.id}">
                        ${isFavorite ? '❤️' : '🤍'}
                    </button>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => playTrack(parseInt(item.dataset.index)));
        });
        document.querySelectorAll('.item-favorite').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(btn.dataset.id);
            });
        });

        elements.totalSongs.textContent = filtered.length;
        elements.totalDuration.textContent = formatTime(
            filtered.reduce((acc, s) => acc + s.duration, 0)
        );
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        if (tab === 'favorites') {
            const favFilter = state.playlist.filter(s => state.favorites.has(s.id));
            renderPlaylistFiltered(favFilter);
        } else {
            renderPlaylist();
        }
    }

    function renderPlaylistFiltered(songs) {
        if (!elements.playlist) return;

        elements.playlist.innerHTML = songs.map((song) => {
            const actualIndex = state.playlist.indexOf(song);
            const isActive = actualIndex === state.currentIndex;

            return `
                <div class="playlist-item ${isActive ? 'active' : ''}" data-index="${actualIndex}">
                    <div class="item-cover">
                        ${song.cover ? `<img src="${song.cover}" alt="">` : '<span>🎵</span>'}
                    </div>
                    <div class="item-info">
                        <div class="item-title">${song.title}</div>
                        <div class="item-artist">${song.artist}</div>
                    </div>
                    <div class="item-duration">${formatTime(song.duration)}</div>
                </div>
            `;
        }).join('');
    }

    function playTrack(index) {
        if (index < 0 || index >= state.playlist.length) return;

        state.currentIndex = index;
        const song = state.playlist[index];

        elements.audioPlayer.src = song.url;
        elements.audioPlayer.play().catch(e => console.log('Autoplay blocked'));

        elements.trackTitle.textContent = song.title;
        elements.trackArtist.textContent = song.artist;
        elements.playBtn.textContent = '⏸️';
        state.isPlaying = true;
        state.currentLyricIndex = -1;

        if (song.cover) {
            elements.albumArt.style.backgroundImage = `url(${song.cover})`;
            document.querySelector('.album-placeholder')?.remove();
        }

        loadLyrics(song.id);

        document.querySelectorAll('.playlist-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.index) === index);
        });

        state.stats.todayPlays++;
        state.stats.playCounts[song.id] = (state.stats.playCounts[song.id] || 0) + 1;
        updateMostPlayed();
        saveToStorage();
    }

    function togglePlay() {
        if (state.currentIndex === -1) {
            if (state.playlist.length > 0) {
                playTrack(0);
            }
            return;
        }

        if (state.isPlaying) {
            elements.audioPlayer.pause();
            elements.playBtn.textContent = '▶️';
        } else {
            elements.audioPlayer.play();
            elements.playBtn.textContent = '⏸️';
        }
        state.isPlaying = !state.isPlaying;
    }

    function prevTrack() {
        if (elements.audioPlayer.currentTime > 3) {
            elements.audioPlayer.currentTime = 0;
        } else {
            playTrack((state.currentIndex - 1 + state.playlist.length) % state.playlist.length);
        }
    }

    function nextTrack() {
        if (state.isShuffle) {
            const randomIndex = Math.floor(Math.random() * state.playlist.length);
            playTrack(randomIndex);
        } else {
            playTrack((state.currentIndex + 1) % state.playlist.length);
        }
    }

    function toggleShuffle() {
        state.isShuffle = !state.isShuffle;
        elements.shuffleBtn.classList.toggle('active', state.isShuffle);
    }

    function toggleRepeat() {
        const modes = ['none', 'all', 'one'];
        const currentIdx = modes.indexOf(state.repeatMode);
        state.repeatMode = modes[(currentIdx + 1) % modes.length];

        elements.repeatBtn.classList.toggle('active', state.repeatMode !== 'none');
        elements.repeatBtn.textContent = state.repeatMode === 'one' ? '🔂' : '🔁';
    }

    function onTrackEnded() {
        if (state.repeatMode === 'one') {
            elements.audioPlayer.currentTime = 0;
            elements.audioPlayer.play();
        } else {
            nextTrack();
            if (state.repeatMode === 'none' && state.currentIndex === 0) {
                state.isPlaying = false;
                elements.playBtn.textContent = '▶️';
            }
        }
    }

    function updateProgress() {
        const current = elements.audioPlayer.currentTime;
        const duration = elements.audioPlayer.duration || 0;
        const percent = (current / duration) * 100;

        elements.progressFill.style.width = `${percent}%`;
        elements.progressHandle.style.left = `${percent}%`;
        elements.timeCurrent.textContent = formatTime(current);

        updateVisualizer();
    }

    function onMetadataLoaded() {
        elements.timeTotal.textContent = formatTime(elements.audioPlayer.duration);
    }

    function seek(e) {
        const rect = elements.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        elements.audioPlayer.currentTime = percent * elements.audioPlayer.duration;
    }

    function setVolume(e) {
        state.volume = parseInt(e.target.value);
        elements.audioPlayer.volume = state.volume / 100;
        elements.volumeValue.textContent = `${state.volume}%`;
        updateVolumeIcon();
        saveToStorage();
    }

    function toggleMute() {
        if (state.volume > 0) {
            elements.audioPlayer.dataset.prevVolume = state.volume;
            elements.audioPlayer.volume = 0;
            elements.volumeSlider.value = 0;
            state.volume = 0;
        } else {
            state.volume = elements.audioPlayer.dataset.prevVolume || 75;
            elements.audioPlayer.volume = state.volume / 100;
            elements.volumeSlider.value = state.volume;
        }
        elements.volumeValue.textContent = `${state.volume}%`;
        updateVolumeIcon();
    }

    function updateVolumeIcon() {
        if (state.volume === 0) {
            elements.volumeBtn.textContent = '🔇';
        } else if (state.volume < 33) {
            elements.volumeBtn.textContent = '🔈';
        } else if (state.volume < 66) {
            elements.volumeBtn.textContent = '🔉';
        } else {
            elements.volumeBtn.textContent = '🔊';
        }
    }

    function updateVisualizer() {
        const canvas = document.getElementById('visualizer-canvas');
        if (!canvas || !analyser) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, width, height);

        const barWidth = width / dataArray.length * 2.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = dataArray[i] * height / 255;
            const hue = (i / dataArray.length) * 360;
            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    const eqPresets = {
        flat: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        pop: [3, 5, 4, 2, -1, -2, 2, 4, 5],
        rock: [5, 4, 2, 0, -2, 2, 4, 5, 5],
        jazz: [4, 3, 1, 2, -1, -1, 1, 3, 4],
        classical: [4, 3, 2, 1, 0, 0, 2, 3, 4],
        bass: [6, 5, 3, 0, -2, -4, -3, 0, 2]
    };

    function updateEqualizer() {
        const bands = document.querySelectorAll('.eq-slider');
        bands.forEach(slider => {
            const value = slider.value;
            slider.nextElementSibling.textContent = value;
        });
    }

    function applyPreset(preset) {
        const values = eqPresets[preset];
        if (!values) return;

        document.querySelectorAll('.eq-slider').forEach((slider, idx) => {
            slider.value = values[idx];
            slider.nextElementSibling.textContent = values[idx];
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === preset);
        });
    }

    function resetEqualizer() {
        applyPreset('flat');
    }

    function changeQuality(e) {
        state.quality = e.target.value;
        saveToStorage();
    }

    function toggleFavorite(id) {
        if (state.favorites.has(id)) {
            state.favorites.delete(id);
        } else {
            state.favorites.add(id);
        }
        renderPlaylist(elements.searchInput?.value || '');
    }

    function openModal() {
        elements.modal.style.display = 'flex';
    }

    function closeModal() {
        elements.modal.style.display = 'none';
        document.querySelectorAll('#add-music-modal input, #add-music-modal textarea').forEach(el => {
            el.value = '';
        });
    }

    function addNewMusic() {
        const title = document.getElementById('new-title').value.trim();
        const artist = document.getElementById('new-artist').value.trim();
        const album = document.getElementById('new-album').value.trim();
        const url = document.getElementById('new-url').value.trim();
        const cover = document.getElementById('new-cover').value.trim();
        const duration = parseInt(document.getElementById('new-duration').value) || 180;
        const lyrics = document.getElementById('new-lyrics').value.trim();

        if (!title || !url) {
            alert('請填寫標題和音樂 URL');
            return;
        }

        const songId = 'custom-' + Date.now();
        const song = {
            id: songId,
            title,
            artist: artist || '未知藝術家',
            album: album || '未知專輯',
            url,
            cover,
            duration,
            hasLyrics: !!lyrics
        };

        if (lyrics) {
            // Auto-detect LRC format
            const isLRC = /\[\d{1,2}:\d{2}(?:\.\d{2})?\]/.test(lyrics);
            state.lyricsCache[songId] = {
                lyrics: isLRC ? parseLRC(lyrics) : lyrics.split('\n').filter(l => l.trim()),
                isLRC
            };
        }

        state.playlist.push(song);
        renderPlaylist();
        closeModal();
        saveToStorage();
    }

    async function loadLyrics(songId) {
        // Check cache
        if (state.lyricsCache[songId]) {
            const cached = state.lyricsCache[songId];
            renderLyrics(cached.lyrics || cached, cached.isLRC);
            return;
        }

        // Check inline lyrics in song data
        const song = state.playlist.find(s => s.id === songId);
        if (song?.lyrics && song.lyrics.length > 0) {
            const isLRC = song.lyrics.some(l => /^\[.*\]/.test(l));
            const parsed = isLRC ? parseLRC(song.lyrics.join('\n')) : song.lyrics;
            state.lyricsCache[songId] = { lyrics: parsed, isLRC };
            renderLyrics(parsed, isLRC);
            return;
        }

        // Try to fetch LRC first, then TXT
        try {
            const lrcResponse = await fetch(`/music/lyrics/${songId}.lrc`);
            if (lrcResponse.ok) {
                const text = await lrcResponse.text();
                const parsed = parseLRC(text);
                state.lyricsCache[songId] = { lyrics: parsed, isLRC: true };
                renderLyrics(parsed, true);
                return;
            }
        } catch (e) { }

        try {
            const txtResponse = await fetch(`/music/lyrics/${songId}.txt`);
            if (txtResponse.ok) {
                const text = await txtResponse.text();
                const lines = text.split('\n').filter(l => l.trim());
                state.lyricsCache[songId] = { lyrics: lines, isLRC: false };
                renderLyrics(lines, false);
                return;
            }
        } catch (e) { }

        renderLyrics([], false);
    }

    function renderLyrics(lyricsData, isLRC) {
        if (!elements.lyrics) return;

        state.isLRCFormat = isLRC;

        // Handle both formats: old (array) and new (object)
        const lyrics = Array.isArray(lyricsData) ? lyricsData : lyricsData.lyrics || [];
        const useLRC = lyricsData.isLRC !== undefined ? lyricsData.isLRC : isLRC;

        state.currentLyrics = lyrics;

        if (lyrics.length === 0) {
            elements.lyrics.innerHTML = '<p class="lyric-line no-lyrics">♪ 純音樂 ♪</p>';
            return;
        }

        elements.lyrics.innerHTML = lyrics.map((item, idx) => {
            const text = useLRC ? item.text : item;
            const time = useLRC ? item.time : null;
            return `<p class="lyric-line" data-index="${idx}" data-time="${time || ''}">${escapeHtml(text)}</p>`;
        }).join('');
    }

    function syncLyrics() {
        if (!elements.lyrics || state.currentLyrics.length === 0) return;

        const currentTime = elements.audioPlayer.currentTime;
        const lyrics = state.currentLyrics;

        let currentLineIdx = -1;

        if (state.isLRCFormat) {
            // LRC format: precise time matching
            for (let i = lyrics.length - 1; i >= 0; i--) {
                const lyricTime = lyrics[i].time;
                if (lyricTime !== null && currentTime >= lyricTime) {
                    currentLineIdx = i;
                    break;
                }
            }
        } else {
            // TXT format: linear distribution
            const duration = elements.audioPlayer.duration || 1;
            const totalLines = lyrics.length;
            const timePerLine = duration / totalLines;
            currentLineIdx = Math.min(
                Math.floor(currentTime / timePerLine),
                totalLines - 1
            );
        }

        if (currentLineIdx !== state.currentLyricIndex) {
            state.currentLyricIndex = currentLineIdx;
            highlightCurrentLyric(currentLineIdx);
        }
    }

    function highlightCurrentLyric(index) {
        const lines = elements.lyrics?.querySelectorAll('.lyric-line');
        if (!lines) return;

        lines.forEach((line, idx) => {
            line.classList.toggle('active', idx === index);
            line.classList.toggle('passed', idx < index);
        });

        const activeLine = elements.lyrics?.querySelector('.lyric-line.active');
        if (activeLine) {
            activeLine.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    function toggleLyricsPanel() {
        elements.lyricsContainer?.classList.toggle('expanded');
    }

    function updateStats() {
        elements.statPlays.textContent = state.stats.todayPlays;
        elements.statPlayed.textContent = formatTime(state.stats.totalPlayedTime);
        elements.statMostPlayed.textContent = state.stats.mostPlayed || '-';
    }

    function updateMostPlayed() {
        let maxPlays = 0;
        let mostPlayedSong = null;

        for (const [id, count] of Object.entries(state.stats.playCounts)) {
            if (count > maxPlays) {
                maxPlays = count;
                mostPlayedSong = state.playlist.find(s => s.id === id);
            }
        }

        state.stats.mostPlayed = mostPlayedSong?.title || null;
    }

    function saveToStorage() {
        const data = {
            playlist: state.playlist,
            volume: state.volume,
            quality: state.quality,
            favorites: Array.from(state.favorites),
            lyricsCache: state.lyricsCache,
            stats: state.stats
        };
        localStorage.setItem('music-player-data', JSON.stringify(data));
    }

    function loadFromStorage() {
        try {
            const data = JSON.parse(localStorage.getItem('music-player-data'));
            if (data) {
                state.playlist = data.playlist || [];
                state.volume = data.volume ?? 75;
                state.quality = data.quality || 'medium';
                state.favorites = new Set(data.favorites || []);
                state.lyricsCache = data.lyricsCache || {};
                state.stats = data.stats || state.stats;
            }
        } catch (e) {
            console.log('Failed to load from storage');
        }

        if (elements.audioPlayer) {
            elements.audioPlayer.volume = state.volume / 100;
        }
        if (elements.volumeSlider) {
            elements.volumeSlider.value = state.volume;
        }
        if (elements.volumeValue) {
            elements.volumeValue.textContent = `${state.volume}%`;
        }
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function onAudioError(e) {
        console.error('Audio error:', e);
        elements.trackTitle.textContent = '載入失敗，請檢查音樂連結';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();