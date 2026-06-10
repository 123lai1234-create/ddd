// 音樂播放器核心腳本
// 從 music.astro 中抽取

class MusicPlayer {
    constructor() {
        this.tracks = [];
        this.filteredTracks = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.currentLang = 'all';
        this.currentStyle = 'all';
        this.currentGender = 'all';
        this.lyrics = [];
        this.lyricsOffset = 0; // 歌詞時間偏移（秒）
        this.queue = [];
        this.queueIdx = 0;
        this.prevPressTime = 0;
        this.isLiked = false;
        this.isMuted = false;
        this.savedVolume = 80;
        this.audio = new Audio();
        this.likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');
        
        // 載入歌詞偏移設定
        const savedOffset = localStorage.getItem('lyricsOffset');
        if (savedOffset) this.lyricsOffset = parseFloat(savedOffset);

        this.init();
    }

    async init() {
        this.renderSkeletons();
        this.tracks = await this.loadTracks();
        if (this.tracks.length === 0) {
            document.getElementById('track-list').innerHTML = '<p style="color: var(--accent); text-align: center; padding: 50px;">尚未添加歌曲</p>';
            return;
        }

        this.trackSearch = document.getElementById('track-search');
        this.trackListEl = document.getElementById('track-list');
        this.lyricsContainer = document.getElementById('lyrics-container');
        this.queueListEl = document.getElementById('queue-list');
        this.toastContainer = document.getElementById('toast-container');

        this.barTrackName = document.getElementById('bar-track-name');
        this.barTrackArtist = document.getElementById('bar-track-artist');
        this.barPlay = document.getElementById('bar-play');
        this.barPrev = document.getElementById('bar-prev');
        this.barNext = document.getElementById('bar-next');
        this.barProgress = document.getElementById('bar-progress');
        this.barCurrentTime = document.getElementById('bar-current-time');
        this.barDuration = document.getElementById('bar-duration');
        this.barVolume = document.getElementById('bar-volume');
        this.barLikeBtn = document.getElementById('bar-like-btn');
        this.barAlbum = document.getElementById('bar-album');

        this.bindEvents();
        this.applyFilters();
    }

    async loadTracks() {
        // 已修：優先用 astro 注入的 <script id="music-tracks"> 內嵌資料
        // 原本每次都 fetch('/music/playlist.json')，會跟部署 dist 內的版本脫鉤（性別錯就是這來源）
        const inline = document.getElementById('music-tracks');
        if (inline?.textContent?.trim()) {
            try {
                const data = JSON.parse(inline.textContent);
                if (Array.isArray(data)) return data;
                if (data?.tracks) return data.tracks;
            } catch (e) { /* 解析失敗就 fallback */ }
        }
        try {
            const res = await fetch('/music/playlist.json');
            const data = await res.json();
            return data.tracks || [];
        } catch { return []; }
    }

    bindEvents() {
        this.trackSearch.addEventListener('input', () => this.applyFilters());

        document.getElementById('lang-filter').addEventListener('change', (e) => {
            this.currentLang = e.target.value;
            this.applyFilters();
        });

        document.getElementById('style-filter').addEventListener('change', (e) => {
            this.currentStyle = e.target.value;
            this.applyFilters();
        });

        document.getElementById('gender-filter').addEventListener('change', (e) => {
            this.currentGender = e.target.value;
            this.applyFilters();
        });

        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const tabName = tab.dataset.tab;
                document.getElementById('lyrics-content').style.display = tabName === 'lyrics' ? 'block' : 'none';
                document.getElementById('queue-content').style.display = tabName === 'queue' ? 'block' : 'none';
            });
        });

        this.trackListEl.addEventListener('click', (e) => {
            const row = e.target.closest('.track-row');
            const addBtn = e.target.closest('.add-queue-btn');
            const downloadBtn = e.target.closest('.download-btn');

            if (downloadBtn) {
                e.stopPropagation();
                const idx = parseInt(downloadBtn.dataset.idx);
                this.downloadTrack(idx);
                return;
            }

            if (addBtn) {
                e.stopPropagation();
                this.addToQueue(parseInt(addBtn.dataset.idx));
                return;
            }

            if (row) {
                const idx = parseInt(row.dataset.idx);
                this.queue = [idx];
                this.queueIdx = 0;
                this.playTrack(idx);
            }
        });

        this.queueListEl.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.queue-remove');
            if (removeBtn) this.removeFromQueue(parseInt(removeBtn.dataset.qi));
        });

        this.barPlay.addEventListener('click', () => this.togglePlay());

        this.barLikeBtn.addEventListener('click', () => {
            const idx = this.currentIndex;
            const pos = this.likedSongs.indexOf(idx);
            if (pos === -1) { this.likedSongs.push(idx); this.showToast('已加入到喜歡'); }
            else { this.likedSongs.splice(pos, 1); this.showToast('已移除'); }
            this.isLiked = this.likedSongs.includes(idx);
            this.updateLikeButton();
            localStorage.setItem('likedSongs', JSON.stringify(this.likedSongs));
        });

        this.barPrev.addEventListener('click', () => {
            const prevIdx = this.getPrevIdx();
            if (prevIdx !== -1) this.playTrack(prevIdx);
        });

        this.barNext.addEventListener('click', () => {
            const nextIdx = this.getNextIdx();
            if (nextIdx !== -1) this.playTrack(nextIdx);
        });

        this.barProgress.addEventListener('input', () => {
            this.audio.currentTime = (parseFloat(this.barProgress.value) / 100) * this.audio.duration;
        });

        this.barVolume.addEventListener('input', () => {
            this.savedVolume = parseInt(this.barVolume.value);
            this.audio.volume = this.savedVolume / 100;
            this.isMuted = this.savedVolume === 0;
        });

        document.getElementById('bar-vol-btn')?.addEventListener('click', () => this.toggleMute());

        this.audio.addEventListener('timeupdate', () => {
            if (this.audio.duration && this.audio.currentTime > 0) {
                const progress = (this.audio.currentTime / this.audio.duration) * 100;
                this.barProgress.value = progress;
                this.barProgress.style.setProperty('--progress', `${progress}%`);
                this.barCurrentTime.textContent = this.formatTime(this.audio.currentTime);
                this.updateLyricsHighlight(this.audio.currentTime);

                const progressEl = document.querySelector('.track-row.playing .track-progress-bar');
                if (progressEl) progressEl.style.width = `${progress}%`;
            }
        });

        this.audio.addEventListener('loadedmetadata', () => {
            this.barDuration.textContent = this.formatTime(this.audio.duration);
        });

        this.audio.addEventListener('ended', () => this.playTrack(this.getNextIdx()));
        // 已修：play/pause 只切 .playing class + 更新 icon，不再 innerHTML 整列重繪
        // 原本會把 44 首歌 DOM 砍掉重建，scroll / hover 焦點 / progress bar 全部中斷
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.barAlbum.classList.add('playing');
            const cur = this.trackListEl.querySelector('.track-row.playing');
            if (cur) cur.classList.add('is-playing');
            const curIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            if (curIcon) curIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        });
        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.barAlbum.classList.remove('playing');
            const cur = this.trackListEl.querySelector('.track-row.is-playing');
            if (cur) cur.classList.remove('is-playing');
            const curIcon = document.getElementById('play-icon');
            const pauseIcon = document.getElementById('pause-icon');
            if (curIcon) curIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.code) {
                case 'Space': e.preventDefault(); this.togglePlay(); break;
                case 'ArrowLeft': e.preventDefault(); this.audio.currentTime -= 10; break;
                case 'ArrowRight': e.preventDefault(); this.audio.currentTime += 10; break;
                case 'ArrowUp': this.barVolume.value = Math.min(100, parseInt(this.barVolume.value) + 10); this.audio.volume = parseInt(this.barVolume.value) / 100; break;
                case 'ArrowDown': this.barVolume.value = Math.max(0, parseInt(this.barVolume.value) - 10); this.audio.volume = parseInt(this.barVolume.value) / 100; break;
                case 'KeyM': this.toggleMute(); break;
                // J = 歌詞提前（減少偏移），K = 歌詞延後（增加偏移）
                case 'KeyJ': this.adjustLyricsOffset(-0.5); break;
                case 'KeyK': this.adjustLyricsOffset(0.5); break;
            }
        });

        // 歌詞偏移按鈕
        document.getElementById('lyrics-offset-minus')?.addEventListener('click', () => this.adjustLyricsOffset(-0.5));
        document.getElementById('lyrics-offset-plus')?.addEventListener('click', () => this.adjustLyricsOffset(0.5));
        document.getElementById('lyrics-offset-reset')?.addEventListener('click', () => {
            this.lyricsOffset = 0;
            localStorage.setItem('lyricsOffset', '0');
            this.updateOffsetDisplay();
            this.showToast('歌詞偏移已重置');
        });
    }

    adjustLyricsOffset(delta) {
        this.lyricsOffset = Math.round((this.lyricsOffset + delta) * 10) / 10;
        localStorage.setItem('lyricsOffset', String(this.lyricsOffset));
        this.updateOffsetDisplay();
        this.showToast(`歌詞偏移: ${this.lyricsOffset > 0 ? '+' : ''}${this.lyricsOffset}s`);
    }

    updateOffsetDisplay() {
        const offsetEl = document.getElementById('lyrics-offset-value');
        if (offsetEl) {
            offsetEl.textContent = this.lyricsOffset > 0 ? `+${this.lyricsOffset}s` : `${this.lyricsOffset}s`;
        }
    }

    renderSkeletons() {
        let html = '';
        for (let i = 0; i < 8; i++) {
            html += `<div class="skeleton-row">
        <div class="skeleton" style="height:16px;width:20px;border-radius:4px;"></div>
        <div><div class="skeleton" style="height:16px;width:70%;margin-bottom:6px;"></div><div class="skeleton" style="height:12px;width:40%;"></div></div>
        <div class="skeleton" style="height:14px;width:60%;"></div>
        <div class="skeleton" style="height:14px;width:50%;"></div>
        <div class="skeleton" style="height:14px;width:40px;"></div>
        <div class="skeleton" style="height:20px;width:20px;"></div>
      </div>`;
        }
        document.getElementById('track-list').innerHTML = html;
    }

    applyFilters() {
        const search = this.trackSearch.value.toLowerCase();
        this.filteredTracks = this.tracks.filter(t => {
            const langOk = this.currentLang === 'all' || t.lang === this.currentLang;
            const styleOk = this.currentStyle === 'all' || t.style === this.currentStyle;
            const genderOk = this.currentGender === 'all' || t.gender === this.currentGender;
            const searchOk = !search || t.name.toLowerCase().includes(search) || (t.artist && t.artist.toLowerCase().includes(search));
            return langOk && styleOk && genderOk && searchOk;
        });
        this.renderTrackList();
    }

    renderTrackList() {
        if (this.filteredTracks.length === 0) {
            this.trackListEl.innerHTML = '<p style="color: var(--accent); text-align: center; padding: 50px;">沒有符合條件的歌曲</p>';
            return;
        }

        const progress = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;

        this.trackListEl.innerHTML = this.filteredTracks.map((track, i) => {
            const isPlayingNow = i === this.currentIndex;
            const gIcon = this.getGenderIcon(track.gender);
            const gCls = this.getGenderClass(track.gender);
            return `<div class="track-row ${isPlayingNow ? 'playing' : ''} ${this.isPlaying && isPlayingNow ? 'is-playing' : ''}" data-idx="${i}">
        <span class="track-num">${i + 1}</span>
        <div class="track-wave"><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div></div>
        <div class="track-info">
          <p class="track-title">${track.name}</p>
          <p class="track-artist-list"><span class="gender-badge ${gCls}" title="${track.gender === 'F' ? '女歌手' : track.gender === 'M' ? '男歌手' : '性別未標'}">${gIcon}</span>${track.artist || '--'}</p>
        </div>
        <span class="track-album">${track.album || '--'}</span>
        <span class="track-lang">${this.getLangLabel(track.lang)}</span>
        <span class="track-duration">${track.duration || '--:--'}</span>
        <div class="track-actions">
          <button class="download-btn" data-idx="${i}" title="下載">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="add-queue-btn" data-idx="${i}">+</button>
        </div>
        ${isPlayingNow ? `<div class="track-progress"><div class="track-progress-bar" style="width: ${progress}%"></div></div>` : ''}
      </div>`;
        }).join('');
    }

    async downloadTrack(idx) {
        const track = this.filteredTracks[idx];
        if (!track || !track.audio) return;
        
        try {
            this.showToast('開始下載...');
            const response = await fetch(track.audio);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${track.name}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            this.showToast('下載完成');
        } catch (err) {
            this.showToast('下載失敗');
            console.error('Download error:', err);
        }
    }

    getGenderIcon(g) {
        return g === 'F' ? '♀' : g === 'M' ? '♂' : '·';
    }
    getGenderClass(g) {
        return g === 'F' ? 'gender-f' : g === 'M' ? 'gender-m' : 'gender-x';
    }

    getLangLabel(lang) {
        const map = { TW: '🇹🇼', EN: '🇺🇸', JP: '🇯🇵', KR: '🇰🇷' };
        return map[lang] || '';
    }

    renderQueue() {
        if (this.queue.length === 0) {
            this.queueListEl.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 50px;">佇列是空的<br><span style="font-size: 0.8rem;">點擊 + 加入</span></p>';
            return;
        }
        this.queueListEl.innerHTML = this.queue.map((trackIdx, qi) => {
            const track = this.filteredTracks[trackIdx];
            if (!track) return '';
            const isCurrent = qi === this.queueIdx;
            const gIcon = this.getGenderIcon(track.gender);
            const gCls = this.getGenderClass(track.gender);
            return `<div class="queue-item ${isCurrent ? 'playing' : ''}" data-qi="${qi}">
        ${isCurrent ? '<div class="queue-dot"></div>' : '<div style="width: 10px;"></div>'}
        <div class="queue-info">
          <p class="queue-title">${track.name}</p>
          <p class="queue-artist"><span class="gender-badge ${gCls}">${gIcon}</span>${track.artist || '--'}</p>
        </div>
        <button class="queue-remove" data-qi="${qi}">✕</button>
      </div>`;
        }).join('');
    }

    addToQueue(idx) {
        if (!this.queue.includes(idx)) {
            this.queue.push(idx);
            this.showToast('已加入佇列');
            this.renderQueue();
        }
    }

    removeFromQueue(qi) {
        this.queue.splice(qi, 1);
        if (qi < this.queueIdx) this.queueIdx--;
        else if (qi === this.queueIdx && this.queue.length > 0) this.queueIdx = Math.min(this.queueIdx, this.queue.length - 1);
        this.renderQueue();
    }

    playTrack(index) {
        if (this.filteredTracks.length === 0) return;
        this.currentIndex = Math.max(0, Math.min(index, this.filteredTracks.length - 1));
        const track = this.filteredTracks[this.currentIndex];
        if (!track) return;

        this.audio.src = track.audio;
        this.audio.volume = this.savedVolume / 100;
        this.barTrackName.textContent = track.name;
        this.barTrackArtist.textContent = track.artist || '--';
        this.isLiked = this.likedSongs.includes(this.currentIndex);
        this.updateLikeButton();
        this.isPlaying = true;
        this.barAlbum.classList.add('playing');
        this.renderTrackList();
        this.loadLyrics(track);
    }

    updateLikeButton() {
        const svg = this.barLikeBtn.querySelector('svg');
        if (this.isLiked) { svg.setAttribute('fill', '#ef4444'); this.barLikeBtn.classList.add('liked'); }
        else { svg.setAttribute('fill', 'none'); this.barLikeBtn.classList.remove('liked'); }
    }

    togglePlay() {
        if (this.isPlaying) { this.audio.pause(); this.barAlbum.classList.remove('playing'); }
        else { this.audio.play(); this.barAlbum.classList.add('playing'); }
        this.isPlaying = !this.isPlaying;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.volume = this.isMuted ? 0 : this.savedVolume / 100;
        this.barVolume.value = this.isMuted ? '0' : String(this.savedVolume);
    }

    getNextIdx() {
        if (this.queue.length > 0 && this.queue.length > this.queueIdx) {
            this.queueIdx = (this.queueIdx + 1) % this.queue.length;
            return this.queue[this.queueIdx];
        }
        return (this.currentIndex + 1) % this.filteredTracks.length;
    }

    getPrevIdx() {
        const now = Date.now();
        if (now - this.prevPressTime < 10000) {
            if (this.queue.length > 0 && this.queue.length > this.queueIdx) {
                this.queueIdx = (this.queueIdx - 1 + this.queue.length) % this.queue.length;
                return this.queue[this.queueIdx];
            }
            return (this.currentIndex - 1 + this.filteredTracks.length) % this.filteredTracks.length;
        }
        this.prevPressTime = now;
        this.audio.currentTime = 0;
        return this.currentIndex;
    }

    async loadLyrics(track) {
        this.lyrics = [];
        this.lyricsOffset = parseFloat(localStorage.getItem('lyricsOffset') || '0');
        this.updateOffsetDisplay();

        // 1. 首先檢查本地歌詞檔案（優先使用）
        if (track.lyrics) {
            try {
                const localRes = await fetch(track.lyrics);
                if (localRes.ok) {
                    const localText = await localRes.text();
                    const hasTimeTags = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(localText);
                    
                    if (hasTimeTags) {
                        // 本地歌詞已有時間戳，直接使用
                        this.parseLRC(localText);
                        this.audio.play();
                        return;
                    } else {
                        // 本地歌詞沒有時間戳，顯示為普通文字
                        this.showPlainLyrics(localText);
                        this.audio.play();
                        return;
                    }
                }
            } catch { }
        }

        // 2. 如果本地歌詞獲取失敗，從 lrclib API 獲取同步歌詞
        // 只用歌曲名稱搜索，避免 artist 不匹配問題
        try {
            // 清理歌曲名稱（移除前綴如 "02_"）
            let cleanName = track.name.replace(/^\d+_/, '').trim();
            
            const res = await fetch(`https://lrclib.net/api/get?q=${encodeURIComponent(cleanName)}&artist_name=${encodeURIComponent(track.artist || '')}`);
            if (res.ok) {
                const data = await res.json();
                if (data?.syncedLyrics) { 
                    this.parseLRC(data.syncedLyrics); 
                    this.audio.play(); 
                    return; 
                }
            }
        } catch { }

        // 3. 嘗試只用歌曲名稱搜索（不帶 artist）
        try {
            let cleanName = track.name.replace(/^\d+_/, '').trim();
            const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanName)}`);
            if (res.ok) {
                const results = await res.json();
                if (Array.isArray(results) && results.length > 0) {
                    // 找到第一個匹配的歌詞
                    for (const result of results) {
                        if (result.syncedLyrics) {
                            this.parseLRC(result.syncedLyrics);
                            this.audio.play();
                            return;
                        }
                    }
                }
            }
        } catch { }

        // 4. 都沒有歌詞，顯示提示
        this.lyricsContainer.innerHTML = '<p style="color: var(--text-tertiary); text-align: center;">選擇曲目以顯示歌詞<br><span style="font-size: 0.8rem;">按 J/K 鍵調整歌詞時間偏移</span></p>';
        this.audio.play();
    }

    showPlainLyrics(text) {
        // 解析普通文字歌詞（沒有時間戳）
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('【') && !line.startsWith('['));
        
        this.lyrics = lines.map((text, idx) => ({
            time: idx * 5, // 每行約 5 秒
            text: text
        }));
        
        this.lyricsContainer.innerHTML = this.lyrics.map(l => 
            `<div class="lyric-line" data-time="${l.time}" style="opacity: 0.6;">${l.text}</div>`
        ).join('');
        
        // 添加說明
        this.lyricsContainer.innerHTML = `<p style="color: var(--text-tertiary); font-size: 0.75rem; text-align: center; margin-bottom: 16px;">📝 本地歌詞（無同步時間）</p>` + this.lyricsContainer.innerHTML;
        
        document.getElementById('lyrics-count').textContent = `${lines.length} 句`;
    }

    parseLRC(text) {
        this.lyrics = [];
        const lines = text.split('\n');
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        for (const line of lines) {
            const match = line.match(timeRegex);
            if (match) {
                const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3].padEnd(3, '0')) / 1000;
                const txt = line.replace(timeRegex, '').trim();
                if (txt) this.lyrics.push({ time, text: txt });
            }
        }
        this.showLyrics(this.lyrics);
    }

    showLyrics(lines) {
        document.getElementById('lyrics-count').textContent = `${lines.length} 句`;
        this.lyricsContainer.innerHTML = lines.map(l => `<div class="lyric-line" data-time="${l.time}">${l.text}</div>`).join('');
        this.lyricsContainer.querySelectorAll('.lyric-line').forEach(line => {
            line.addEventListener('click', () => { this.audio.currentTime = parseFloat(line.dataset.time) + this.lyricsOffset; });
        });
    }

    updateLyricsHighlight(time) {
        const lines = this.lyricsContainer.querySelectorAll('.lyric-line');
        let activeIdx = 0;
        
        // 應用歌詞偏移
        const adjustedTime = time - this.lyricsOffset;
        
        for (let i = 0; i < this.lyrics.length; i++) {
            if (this.lyrics[i].time <= adjustedTime) activeIdx = i;
            else break;
        }

        // Only scroll when the active line changes
        if (activeIdx === this._lastActiveLyricIdx) {
            lines.forEach((line, i) => {
                if (i === activeIdx) line.classList.add('active');
                else if (i < activeIdx) line.classList.add('past');
                else line.classList.remove('active', 'past');
            });
            return;
        }
        this._lastActiveLyricIdx = activeIdx;

        lines.forEach((line, i) => {
            line.classList.remove('active', 'past');
            if (i === activeIdx) line.classList.add('active');
            else if (i < activeIdx) line.classList.add('past');
        });
        const active = lines[activeIdx];
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `✓ ${msg}`;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    formatTime(s) {
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    }
}

document.addEventListener('DOMContentLoaded', () => { window.musicPlayer = new MusicPlayer(); });