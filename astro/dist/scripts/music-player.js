/**
 * Music Player - Full Featured Audio Player
 * Playlist management, equalizer, visualizer, lyrics
 */

(function () {
    'use strict';

    // State
    const state = {
        playlist: [],
        currentIndex: -1,
        isPlaying: false,
        isShuffle: false,
        repeatMode: 'none', // 'none', 'one', 'all'
        volume: 75,
        quality: 'medium',
        favorites: new Set(),
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
        // Playback controls
        elements.playBtn?.addEventListener('click', togglePlay);
        elements.prevBtn?.addEventListener('click', prevTrack);
        elements.nextBtn?.addEventListener('click', nextTrack);
        elements.shuffleBtn?.addEventListener('click', toggleShuffle);
        elements.repeatBtn?.addEventListener('click', toggleRepeat);

        // Volume
        elements.volumeBtn?.addEventListener('click', toggleMute);
        elements.volumeSlider?.addEventListener('input', setVolume);

        // Progress
        elements.progressBar?.addEventListener('click', seek);

        // Audio events
        elements.audioPlayer?.addEventListener('timeupdate', updateProgress);
        elements.audioPlayer?.addEventListener('ended', onTrackEnded);
        elements.audioPlayer?.addEventListener('loadedmetadata', onMetadataLoaded);
        elements.audioPlayer?.addEventListener('error', onAudioError);

        // Search
        elements.searchInput?.addEventListener('input', filterPlaylist);

        // Add music modal
        elements.addMusicBtn?.addEventListener('click', () => openModal());
        elements.modalClose?.addEventListener('click', () => closeModal());
        elements.addMusicConfirm?.addEventListener('click', addNewMusic);
        elements.modal?.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeModal();
        });

        // Equalizer
        elements.eqReset?.addEventListener('click', resetEqualizer);
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', updateEqualizer);
        });

        // Presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        // Quality
        elements.qualitySelect?.addEventListener('change', changeQuality);

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }

    // Audio Context for Visualizer
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

    // Playlist Management
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
                    <button class="item-favorite ${isFavorite ? 'active' : ''}" data-id="${song.id}">
                        ${isFavorite ? '❤️' : '🤍'}
                    </button>
                </div>
            `;
        }).join('');

        // Bind click events
        document.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => playTrack(parseInt(item.dataset.index)));
        });
        document.querySelectorAll('.item-favorite').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(btn.dataset.id);
            });
        });

        // Update totals
        elements.totalSongs.textContent = state.playlist.length;
        elements.totalDuration.textContent = formatTime(
            state.playlist.reduce((acc, s) => acc + s.duration, 0)
        );
    }

    function filterPlaylist(e) {
        renderPlaylist(e.target.value);
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

    // Playback
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

        // Album art
        if (song.cover) {
            elements.albumArt.style.backgroundImage = `url(${song.cover})`;
            document.querySelector('.album-placeholder')?.remove();
        }

        // Update playlist UI
        document.querySelectorAll('.playlist-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.index) === index);
        });

        // Stats
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

    // Progress
    function updateProgress() {
        const current = elements.audioPlayer.currentTime;
        const duration = elements.audioPlayer.duration || 0;
        const percent = (current / duration) * 100;

        elements.progressFill.style.width = `${percent}%`;
        elements.progressHandle.style.left = `${percent}%`;
        elements.timeCurrent.textContent = formatTime(current);

        // Visualizer update
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

    // Volume
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

    // Visualizer
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

    // Equalizer
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

    // Quality
    function changeQuality(e) {
        state.quality = e.target.value;
        // Re-encode URL based on quality (if audio CDN supports this)
        // For now just save preference
        saveToStorage();
    }

    // Favorites
    function toggleFavorite(id) {
        if (state.favorites.has(id)) {
            state.favorites.delete(id);
        } else {
            state.favorites.add(id);
        }
        renderPlaylist(elements.searchInput?.value || '');
    }

    // Add Music Modal
    function openModal() {
        elements.modal.style.display = 'flex';
    }

    function closeModal() {
        elements.modal.style.display = 'none';
        // Clear form
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

        const song = {
            id: 'custom-' + Date.now(),
            title,
            artist: artist || '未知藝術家',
            album: album || '未知專輯',
            url,
            cover,
            duration,
            lyrics: lyrics ? lyrics.split('\n') : []
        };

        state.playlist.push(song);
        renderPlaylist();
        closeModal();
        saveToStorage();
    }

    // Lyrics
    function showLyrics(lyrics) {
        if (!elements.lyrics || !lyrics) return;

        elements.lyrics.innerHTML = lyrics.map(line =>
            `<p class="lyric-line">${line}</p>`
        ).join('');
    }

    // Stats
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

    // Storage
    function saveToStorage() {
        const data = {
            playlist: state.playlist,
            volume: state.volume,
            quality: state.quality,
            favorites: Array.from(state.favorites),
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
                state.stats = data.stats || state.stats;
            }
        } catch (e) {
            console.log('Failed to load from storage');
        }

        // Set initial volume
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

    // Utilities
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function onAudioError(e) {
        console.error('Audio error:', e);
        elements.trackTitle.textContent = '載入失敗，請檢查音樂連結';
    }

    // Start when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();