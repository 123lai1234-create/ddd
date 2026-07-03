/* Music Player — extracted from src/pages/music.astro
 * Loads tracks from <script type="application/json" id="music-tracks"> injected by the .astro page.
 * Falls back to /music/playlist.json fetch if not present.
 */
(function () {
  'use strict';

  // ---- 讀取 tracks（由頁面以 application/json 注入，或 fallback fetch） ----
  function readInlineTracks() {
    const node = document.getElementById('music-tracks');
    if (!node) return null;
    try { return JSON.parse(node.textContent || '[]'); } catch (e) { return null; }
  }

  async function loadTracks() {
    const inline = readInlineTracks();
    if (Array.isArray(inline) && inline.length > 0) return inline;
    try {
      const res = await fetch('/music/playlist.json');
      const data = await res.json();
      return data.tracks || [];
    } catch (e) { return []; }
  }

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
      this.queue = [];
      this.queueIdx = 0;
      this.prevPressTime = 0;
      this.isLiked = false;
      this.isMuted = false;
      this.savedVolume = 80;
      this.playMode = 'sequence';
      this.playbackSpeed = 1;
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.volume = this.savedVolume / 100;
      this.likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');
      this.repostedSongs = JSON.parse(localStorage.getItem('repostedSongs') || '[]');
      this.playStats = JSON.parse(localStorage.getItem('playStats') || '{"total":0,"liked":0,"history":[]}');
      this.lyricsOffset = parseFloat(localStorage.getItem('lyricsOffset') || '0');
      this.init();
    }

    async init() {
      this.tracks = await loadTracks();
      this.trackListEl = document.getElementById('track-list');

      if (this.tracks.length === 0) {
        this.trackListEl.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 50px;">載入失敗：請檢查網路或聯繫管理員</p>';
        return;
      }

      this.filteredTracks = [...this.tracks];
      this.renderTrackList();
      this.updateStats();
      this.updateLyricsOffsetUI();

      this.trackSearch = document.getElementById('track-search');
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
      this.barVolume.style.setProperty('--volume', this.savedVolume + '%');
      this.barLikeBtn = document.getElementById('bar-like-btn');
      this.barAlbum = document.getElementById('bar-album');
      this.lyricsContainer = document.getElementById('lyrics-container');
      this.lyricsCount = document.getElementById('lyrics-count');
      this.bindEvents();
    }

    updateStats() {
      document.getElementById('total-tracks').textContent = this.tracks.length;
      document.getElementById('liked-count').textContent = this.likedSongs.length;
    }

    bindEvents() {
      this.trackSearch.addEventListener('input', () => this.applyFilters());
      document.getElementById('lang-filter').addEventListener('change', (e) => { this.currentLang = e.target.value; this.applyFilters(); });
      document.getElementById('style-filter').addEventListener('change', (e) => { this.currentStyle = e.target.value; this.applyFilters(); });
      document.getElementById('gender-filter').addEventListener('change', (e) => { this.currentGender = e.target.value; this.applyFilters(); });

      this.trackListEl.addEventListener('click', (e) => {
        const row = e.target.closest('.track-row');
        const addBtn = e.target.closest('.add-queue-btn');
        const repostBtn = e.target.closest('.repost-btn');
        const dlBtn = e.target.closest('.download-btn');
        const mvBtn = e.target.closest('.mv-btn');

        if (dlBtn) { e.stopPropagation(); this.downloadTrack(parseInt(dlBtn.dataset.idx)); return; }
        if (repostBtn) { e.stopPropagation(); this.toggleRepost(parseInt(repostBtn.dataset.idx)); return; }
        if (addBtn) { e.stopPropagation(); this.addToQueue(parseInt(addBtn.dataset.idx)); return; }
        if (mvBtn) { e.stopPropagation(); this.openMVModal(parseInt(mvBtn.dataset.idx)); return; }
        if (row) { const idx = parseInt(row.dataset.idx); this.queue = [idx]; this.queueIdx = 0; this.playTrack(idx); }
      });

      this.barPlay.addEventListener('click', () => this.togglePlay());
      this.barLikeBtn.addEventListener('click', () => this.toggleLike());
      document.getElementById('bar-share-btn')?.addEventListener('click', () => this.shareTrack());

      this.barPrev.addEventListener('click', () => { const prevIdx = this.getPrevIdx(); if (prevIdx !== -1) this.playTrack(prevIdx); });
      this.barNext.addEventListener('click', () => { const nextIdx = this.getNextIdx(); if (nextIdx !== -1) this.playTrack(nextIdx); });
      this.barProgress.addEventListener('input', () => { if(this.audio.duration) this.audio.currentTime = (parseFloat(this.barProgress.value) / 100) * this.audio.duration; });
      this.barVolume.addEventListener('input', () => { this.savedVolume = parseInt(this.barVolume.value); this.audio.volume = this.savedVolume / 100; this.isMuted = this.savedVolume === 0; this.barVolume.style.setProperty('--volume', this.savedVolume + '%'); });
      document.getElementById('bar-vol-btn')?.addEventListener('click', () => this.toggleMute());

      document.getElementById('bar-mode')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.mode-option');
        if (opt) { this.playMode = opt.dataset.mode; this.updateModeUI(); this.showToast('模式：' + {'sequence':'順序播放','shuffle':'隨機播放','repeat':'全部循環','repeat-one':'單曲循環'}[this.playMode]); }
      });

      document.getElementById('bar-speed')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.speed-option');
        if (opt) { this.playbackSpeed = parseFloat(opt.dataset.speed); this.audio.playbackRate = this.playbackSpeed; document.getElementById('speed-label').textContent = this.playbackSpeed + 'x'; this.updateSpeedUI(); }
      });

      document.getElementById('bar-eq-btn')?.addEventListener('click', () => {
        document.getElementById('eq-panel').classList.toggle('open');
      });

      document.getElementById('eq-close')?.addEventListener('click', () => {
        document.getElementById('eq-panel').classList.remove('open');
      });

      this.barAlbum.addEventListener('click', () => this.openPlayerModal());
      document.getElementById('close-modal-btn')?.addEventListener('click', () => this.closePlayerModal());
      document.getElementById('player-modal')?.addEventListener('click', (e) => { if(e.target.id === 'player-modal') this.closePlayerModal(); });
      document.getElementById('modal-play')?.addEventListener('click', () => this.togglePlay());
      document.getElementById('modal-prev')?.addEventListener('click', () => { const prevIdx = this.getPrevIdx(); if (prevIdx !== -1) this.playTrack(prevIdx); });
      document.getElementById('modal-next')?.addEventListener('click', () => { const nextIdx = this.getNextIdx(); if (nextIdx !== -1) this.playTrack(nextIdx); });
      document.getElementById('modal-progress')?.addEventListener('input', (e) => { if(this.audio.duration) this.audio.currentTime = (parseFloat(e.target.value) / 100) * this.audio.duration; });

      document.getElementById('shortcuts-btn')?.addEventListener('click', () => this.toggleShortcuts());
      document.getElementById('close-shortcuts')?.addEventListener('click', () => this.toggleShortcuts());
      document.getElementById('shortcuts-overlay')?.addEventListener('click', () => this.toggleShortcuts());

      document.getElementById('mobile-lyrics-toggle')?.addEventListener('click', () => {
        document.querySelector('.lyrics-panel').classList.add('mobile-open');
      });
      document.getElementById('mobile-lyrics-close')?.addEventListener('click', () => {
        document.querySelector('.lyrics-panel').classList.remove('mobile-open');
      });

      document.querySelectorAll('.translate-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.translate-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.lyricsMode = tab.dataset.mode;
          this.renderLyrics();
        });
      });

      // 歌詞偏移控制
      document.getElementById('lyrics-offset-minus')?.addEventListener('click', () => {
        this.lyricsOffset -= 0.5;
        this.updateLyricsOffsetUI();
      });
      document.getElementById('lyrics-offset-plus')?.addEventListener('click', () => {
        this.lyricsOffset += 0.5;
        this.updateLyricsOffsetUI();
      });
      document.getElementById('lyrics-offset-reset')?.addEventListener('click', () => {
        this.lyricsOffset = 0;
        this.updateLyricsOffsetUI();
      });

      this.audio.addEventListener('timeupdate', () => {
        if (this.audio.duration && this.audio.currentTime > 0) {
          const progress = (this.audio.currentTime / this.audio.duration) * 100;
          this.barProgress.value = progress;
          this.barProgress.style.setProperty('--progress', progress + '%');
          this.barCurrentTime.textContent = this.formatTime(this.audio.currentTime);
          const progressEl = document.querySelector('.track-row.playing .track-progress-bar');
          if (progressEl) progressEl.style.width = progress + '%';
          this.updateLyricsSync();

          const modalProgress = document.getElementById('modal-progress');
          if (modalProgress) { modalProgress.value = progress; modalProgress.style.setProperty('--progress', progress + '%'); }
          document.getElementById('modal-current-time').textContent = this.formatTime(this.audio.currentTime);
        }
      });

      this.audio.addEventListener('loadedmetadata', () => {
        this.barDuration.textContent = this.formatTime(this.audio.duration);
        document.getElementById('modal-duration').textContent = this.formatTime(this.audio.duration);
      });

      this.audio.addEventListener('ended', () => {
        if (this.playMode === 'repeat-one') {
          this.audio.currentTime = 0;
          this.audio.play();
        } else {
          const nextIdx = this.getNextIdx();
          if (nextIdx !== -1) this.playTrack(nextIdx);
        }
      });

      this.audio.addEventListener('error', (e) => {
        const err = this.audio.error;
        let msg = '載入音訊失敗';
        if (err) {
          switch (err.code) {
            case MediaError.MEDIA_ERR_ABORTED: msg = '音訊載入被中斷'; break;
            case MediaError.MEDIA_ERR_NETWORK: msg = '網路錯誤，請檢查網路連線或確認開發伺服器正在運行'; break;
            case MediaError.MEDIA_ERR_DECODE: msg = '音訊格式解碼失敗'; break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = '不支援的音訊格式或檔案不存在'; break;
          }
        }
        console.error('[MusicPlayer] Audio error:', err?.code, err?.message, 'src:', this.audio.src);
        this.showToast('⚠️ ' + msg + '（' + this.cleanTrackName(this.filteredTracks[this.currentIndex]?.name || '') + '）');
      });

      this.audio.addEventListener('canplay', () => {
        console.log('[MusicPlayer] Audio ready, duration:', this.audio.duration);
      });

      this.audio.addEventListener('play', () => {
        this.isPlaying = true;
        this.renderTrackList();
        document.getElementById('play-icon').style.display = 'none';
        document.getElementById('pause-icon').style.display = '';
        document.getElementById('modal-play-icon').style.display = 'none';
        document.getElementById('modal-pause-icon').style.display = '';
        this.barAlbum.classList.add('playing');
        document.getElementById('modal-album')?.classList.add('playing');
      });

      this.audio.addEventListener('pause', () => {
        this.isPlaying = false;
        this.renderTrackList();
        document.getElementById('play-icon').style.display = '';
        document.getElementById('pause-icon').style.display = 'none';
        document.getElementById('modal-play-icon').style.display = '';
        document.getElementById('modal-pause-icon').style.display = 'none';
        this.barAlbum.classList.remove('playing');
        document.getElementById('modal-album')?.classList.remove('playing');
      });

      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch(e.code) {
          case 'Space': e.preventDefault(); this.togglePlay(); break;
          case 'ArrowLeft': e.preventDefault(); this.audio.currentTime -= 10; break;
          case 'ArrowRight': e.preventDefault(); this.audio.currentTime += 10; break;
          case 'ArrowUp': this.barVolume.value = Math.min(100, parseInt(this.barVolume.value) + 10); this.audio.volume = parseInt(this.barVolume.value) / 100; this.barVolume.style.setProperty('--volume', this.barVolume.value + '%'); break;
          case 'ArrowDown': this.barVolume.value = Math.max(0, parseInt(this.barVolume.value) - 10); this.audio.volume = parseInt(this.barVolume.value) / 100; this.barVolume.style.setProperty('--volume', this.barVolume.value + '%'); break;
          case 'KeyM': this.toggleMute(); break;
          case 'KeyS': this.playMode = 'shuffle'; this.updateModeUI(); this.showToast('隨機播放'); break;
          case 'KeyL': this.toggleLike(); break;
          case 'KeyJ': this.lyricsOffset -= 0.5; this.updateLyricsOffsetUI(); this.showToast('歌詞提前 0.5s'); break;
          case 'KeyK': this.lyricsOffset += 0.5; this.updateLyricsOffsetUI(); this.showToast('歌詞延後 0.5s'); break;
        }
      });
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

    getGenderIcon(g) {
      return g === 'F' ? '♀' : g === 'M' ? '♂' : '·';
    }
    getGenderClass(g) {
      return g === 'F' ? 'gender-f' : g === 'M' ? 'gender-m' : 'gender-x';
    }

    renderTrackList() {
      if (this.filteredTracks.length === 0) {
        this.trackListEl.innerHTML = '<p style="color: var(--accent); text-align: center; padding: 50px;">沒有符合條件的歌曲</p>';
        return;
      }
      const progress = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
      this.trackListEl.innerHTML = this.filteredTracks.map((track, i) => {
        const isPlayingNow = i === this.currentIndex;
        const isReposted = this.repostedSongs.includes(i);
        const gIcon = this.getGenderIcon(track.gender);
        const gCls = this.getGenderClass(track.gender);
        return '<div class="track-row ' + (isPlayingNow ? 'playing' : '') + '" data-idx="' + i + '">' +
          '<span class="track-num">' + (i + 1) + '</span>' +
          '<div class="track-wave"><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div><div class="wave-bar-sm"></div></div>' +
          '<div class="track-info"><p class="track-title">' + this.cleanTrackName(track.name) + ' <span class="srt-badge" title="此曲有 SRT 同步字幕">CC</span></p>' +
          '<p class="track-artist-list"><span class="gender-badge ' + gCls + '" title="' + (track.gender === 'F' ? '女歌手' : track.gender === 'M' ? '男歌手' : '性別未標') + '">' + gIcon + '</span>' + (track.artist || '--') + '</p>' +
          '<div class="track-progress"><div class="track-progress-bar" style="width:' + (isPlayingNow ? progress : 0) + '%"></div></div></div>' +
          '<span class="track-album">' + (track.album || '--') + '</span>' +
          '<span class="track-duration">' + (track.duration || '--:--') + '</span>' +
          '<div class="track-actions">' +
            '<button class="action-btn mv-btn" data-idx="' + i + '" title="觀看 MV">' +
              '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
            '</button>' +
            '<button class="action-btn repost-btn ' + (isReposted ? 'reposted' : '') + '" data-idx="' + i + '" title="轉發">' +
              '<svg viewBox="0 0 24 24" fill="' + (isReposted ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
            '</button>' +
            '<button class="action-btn download-btn" data-idx="' + i + '" title="下載">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            '</button>' +
            '<button class="action-btn add-queue-btn" data-idx="' + i + '" title="加入佇列">+</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    updateModeUI() {
      document.querySelectorAll('.mode-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === this.playMode);
      });
      const modeIcon = document.getElementById('mode-icon');
      if (modeIcon) {
        const icons = {
          sequence: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
          shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
          repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
          'repeat-one': '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="9" y1="12" x2="15" y2="12"/>'
        };
        modeIcon.innerHTML = icons[this.playMode] || icons.sequence;
      }
    }

    updateSpeedUI() {
      document.querySelectorAll('.speed-option').forEach(opt => {
        opt.classList.toggle('active', parseFloat(opt.dataset.speed) === this.playbackSpeed);
      });
    }

    downloadTrack(idx) {
      const track = this.filteredTracks[idx];
      if (!track) return;
      const a = document.createElement('a');
      a.href = track.audio;
      a.download = track.name + '.mp3';
      a.click();
      this.showToast('開始下載：' + this.cleanTrackName(track.name));
    }

    toggleRepost(idx) {
      const pos = this.repostedSongs.indexOf(idx);
      if (pos === -1) {
        this.repostedSongs.push(idx);
        this.showToast('已轉發');
      } else {
        this.repostedSongs.splice(pos, 1);
        this.showToast('已取消轉發');
      }
      localStorage.setItem('repostedSongs', JSON.stringify(this.repostedSongs));
      this.renderTrackList();
    }

    shareTrack() {
      const track = this.filteredTracks[this.currentIndex];
      if (!track) return;
      const shareUrl = window.location.origin + '/music?track=' + encodeURIComponent(track.name);
      if (navigator.share) {
        navigator.share({ title: track.name, text: track.artist, url: shareUrl });
      } else {
        navigator.clipboard.writeText(shareUrl);
        this.showToast('連結已複製');
      }
    }

    /**
     * 動態掛載 <track> 原生字幕（SRT 格式）到 this.audio。
     * 瀏覽器原生 CC 按鈕可開關，無需額外 UI。
     * 從 track.audio 路徑 /music/track_NNN.mp3 推出 /music/lyrics_NNN.srt
     */
    attachSubtitleTrack(track) {
      // 移除舊的 <track>
      const oldTracks = this.audio.querySelectorAll('track');
      oldTracks.forEach((t) => t.remove());

      // 從 audio 路徑推出 srt 路徑
      const m = (track.audio || '').match(/track_(\d+)\.mp3$/);
      if (!m) return;
      const trackNum = m[1];
      const srtPath = `/music/lyrics_${trackNum}.srt`;

      // 語言代碼映射（playlist 的 lang -> srclang）
      const langMap = { TW: 'zh', EN: 'en', JP: 'ja', KR: 'ko' };
      const srclang = langMap[track.lang] || 'zh';
      const labels = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };

      const trackEl = document.createElement('track');
      trackEl.kind = 'subtitles';
      trackEl.src = srtPath;
      trackEl.srclang = srclang;
      trackEl.label = labels[srclang] || srclang;
      // 預設不開啟原生字幕（避免跟自製歌詞面板重疊）；要看原生 CC 點瀏覽器播放器按鈕
      // trackEl.default = true;
      this.audio.appendChild(trackEl);

      console.log('[MusicPlayer] Subtitle track attached:', srtPath, srclang);
    }

    playTrack(index) {
      if (this.filteredTracks.length === 0) return;
      this.currentIndex = Math.max(0, Math.min(index, this.filteredTracks.length - 1));
      const track = this.filteredTracks[this.currentIndex];
      if (!track) return;

      this.playStats.total++;
      this.playStats.history.unshift({ name: track.name, time: Date.now() });
      if (this.playStats.history.length > 100) this.playStats.history.pop();
      localStorage.setItem('playStats', JSON.stringify(this.playStats));

      this.audio.pause();
      this.audio.src = track.audio;
      this.audio.volume = this.savedVolume / 100;
      this.audio.playbackRate = this.playbackSpeed;

      // 動態掛載 <track> 原生字幕（SRT）— 瀏覽器原生 CC 按鈕可開關
      this.attachSubtitleTrack(track);

      console.log('[MusicPlayer] Track set:', this.cleanTrackName(track.name), 'src:', this.audio.src, 'volume:', this.audio.volume);

      this.barTrackName.textContent = this.cleanTrackName(track.name);
      this.barTrackArtist.textContent = track.artist || '--';
      document.getElementById('modal-title').textContent = this.cleanTrackName(track.name);
      document.getElementById('modal-artist').textContent = track.artist || '--';

      if (track.cover) {
        document.getElementById('album-img').src = track.cover;
        document.getElementById('album-img').style.display = '';
        document.getElementById('album-fallback').style.display = 'none';
      } else {
        document.getElementById('album-img').style.display = 'none';
        document.getElementById('album-fallback').style.display = '';
      }

      this.isLiked = this.likedSongs.includes(this.currentIndex);
      this.updateLikeButton();
      this.renderTrackList();

      // 套用 per-track 歌詞偏移（從 playlist.json 讀取，預設 0）
      if (typeof track.lyricsOffset === 'number') {
        this.lyricsOffset = track.lyricsOffset;
        this.updateLyricsOffsetUI();
      }

      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('[MusicPlayer] Playing OK');
        }).catch(err => {
          console.error('[MusicPlayer] Play rejected:', err.name, err.message);
          if (err.name === 'NotAllowedError') {
            this.showToast('⚠️ 請點擊頁面任意處（讓瀏覽器授權音訊），再按播放鍵');
          } else {
            this.showToast('⚠️ 播放失敗：' + err.message);
          }
        });
      }

      this.loadLyrics(track.lyrics);
    }

    async loadLyrics(lyricsPath) {
      if (!lyricsPath) {
        this.lyrics = [];
        this.renderLyrics();
        this.lyricsCount.textContent = '0 句';
        return;
      }

      try {
        const res = await fetch(lyricsPath);
        const text = await res.text();
        this.lyrics = this.parseLyrics(text);
        this.renderLyrics();
        this.lyricsCount.textContent = this.lyrics.length + ' 句';
      } catch (err) {
        console.error('Failed to load lyrics:', err);
        this.lyrics = [];
        this.renderLyrics();
        this.lyricsCount.textContent = '載入失敗';
      }
    }

    parseLyrics(text) {
      const lines = text.split('\n').filter(l => l.trim());
      const lyrics = [];
      const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

      for (const line of lines) {
        const match = line.match(lrcRegex);
        if (match) {
          const mins = parseInt(match[1]);
          const secs = parseInt(match[2]);
          const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
          const time = mins * 60 + secs + ms / 1000;
          const text = match[4].trim();
          if (text) lyrics.push({ time, text });
        } else if (line.trim() && !line.startsWith('[')) {
          lyrics.push({ time: -1, text: line.trim() });
        }
      }

      if (lyrics.length > 0 && lyrics[0].time === -1) {
        const duration = this.audio.duration || 180;
        // 預留前 10% 當 intro，最後 5% 當 outro，平均分配中間行
        const introTime = duration * 0.05;
        const outroTime = duration * 0.03;
        const usableTime = duration - introTime - outroTime;
        const timePerLine = usableTime / (lyrics.length - 1 || 1);
        lyrics.forEach((l, i) => { 
          l.time = introTime + timePerLine * i;
        });
      }

      return lyrics.sort((a, b) => a.time - b.time);
    }

    renderLyrics() {
      if (this.lyrics.length === 0) {
        this.lyricsContainer.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 50px;">此歌曲暫無歌詞</p>';
        return;
      }

      this.lyricsContainer.innerHTML = this.lyrics.map((l, i) =>
        '<div class="lyric-line" data-time="' + l.time + '" data-idx="' + i + '">' +
          '<span class="lyric-time">' + (l.time >= 0 ? this.formatTime(l.time) : '') + '</span>' +
          '<span>' + l.text + '</span>' +
        '</div>'
      ).join('');

      this.lyricsContainer.querySelectorAll('.lyric-line').forEach(el => {
        el.addEventListener('click', () => {
          const time = parseFloat(el.dataset.time);
          if (time >= 0) this.audio.currentTime = time;
        });
      });
    }

    updateLyricsSync() {
      if (this.lyrics.length === 0) return;

      const currentTime = this.audio.currentTime + this.lyricsOffset;
      let activeIdx = -1;

      for (let i = this.lyrics.length - 1; i >= 0; i--) {
        if (this.lyrics[i].time >= 0 && this.lyrics[i].time <= currentTime) {
          activeIdx = i;
          break;
        }
      }

      // Only update and scroll when the active line changes
      if (activeIdx === this._lastActiveLyricIdx) return;
      this._lastActiveLyricIdx = activeIdx;

      this.lyricsContainer.querySelectorAll('.lyric-line').forEach((el, i) => {
        el.classList.remove('active', 'past');
        if (i === activeIdx) {
          el.classList.add('active');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (i < activeIdx) {
          el.classList.add('past');
        }
      });
    }

    updateLyricsOffsetUI() {
      const offsetEl = document.getElementById('lyrics-offset-value');
      if (offsetEl) {
        offsetEl.textContent = this.lyricsOffset + 's';
      }
      localStorage.setItem('lyricsOffset', this.lyricsOffset.toString());
    }

    toggleLike() {
      const idx = this.currentIndex;
      const pos = this.likedSongs.indexOf(idx);
      if (pos === -1) {
        this.likedSongs.push(idx);
        this.playStats.liked++;
        this.showToast('已加入到喜歡');
      } else {
        this.likedSongs.splice(pos, 1);
        this.playStats.liked = Math.max(0, this.playStats.liked - 1);
        this.showToast('已移除');
      }
      this.isLiked = this.likedSongs.includes(idx);
      this.updateLikeButton();
      localStorage.setItem('likedSongs', JSON.stringify(this.likedSongs));
      localStorage.setItem('playStats', JSON.stringify(this.playStats));
      this.updateStats();
    }

    updateLikeButton() {
      const svg = this.barLikeBtn.querySelector('svg');
      if (this.isLiked) {
        svg.setAttribute('fill', '#ef4444');
        this.barLikeBtn.classList.add('liked');
      } else {
        svg.setAttribute('fill', 'none');
        this.barLikeBtn.classList.remove('liked');
      }
    }

    togglePlay() {
      if (this.isPlaying) {
        this.audio.pause();
        this.isPlaying = false;
      } else if (!this.audio.src) {
        if (this.filteredTracks.length > 0) {
          this.playTrack(0);
        }
      } else {
        this.audio.play().then(() => {
          this.isPlaying = true;
        }).catch(err => {
          console.warn('Play failed:', err);
          this.showToast('⚠️ 播放失敗，請點歌曲播放');
        });
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      this.audio.volume = this.isMuted ? 0 : this.savedVolume / 100;
      this.barVolume.value = this.isMuted ? '0' : String(this.savedVolume);
      this.barVolume.style.setProperty('--volume', this.isMuted ? '0%' : this.savedVolume + '%');
    }

    getNextIdx() {
      if (this.playMode === 'repeat-one') return this.currentIndex;

      if (this.playMode === 'shuffle') {
        const available = [...Array(this.filteredTracks.length).keys()].filter(i => i !== this.currentIndex);
        if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
      }

      if (this.queue.length > 1 && this.queueIdx < this.queue.length - 1) {
        this.queueIdx++;
        return this.queue[this.queueIdx];
      }
      return (this.currentIndex + 1) % this.filteredTracks.length;
    }

    getPrevIdx() {
      const now = Date.now();
      if (this.audio.currentTime > 3 && now - this.prevPressTime > 2000) {
        this.prevPressTime = now;
        this.audio.currentTime = 0;
        return this.currentIndex;
      }
      this.prevPressTime = now;

      if (this.queue.length > 1 && this.queueIdx > 0) {
        this.queueIdx--;
        return this.queue[this.queueIdx];
      }
      return (this.currentIndex - 1 + this.filteredTracks.length) % this.filteredTracks.length;
    }

    addToQueue(idx) {
      if (!this.queue.includes(idx)) {
        this.queue.push(idx);
        this.showToast('已加入佇列');
      }
    }

    openPlayerModal() {
      document.getElementById('player-modal').classList.add('open');
    }

    closePlayerModal() {
      document.getElementById('player-modal').classList.remove('open');
    }

    openMVModal(idx) {
      const track = this.filteredTracks[idx] || this.tracks[idx];
      if (!track || !track.mv) { this.showToast('這首歌沒有 MV'); return; }
      let modal = document.getElementById('mv-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mv-modal';
        modal.className = 'mv-modal';
        modal.innerHTML = '<div class="mv-modal-content"><button class="mv-modal-close" id="mv-modal-close" aria-label="關閉 MV">✕</button><video id="mv-video" controls autoplay playsinline preload="metadata"></video><div class="mv-modal-title" id="mv-modal-title"></div></div>';
        document.body.appendChild(modal);
        document.getElementById('mv-modal-close').addEventListener('click', () => this.closeMVModal());
        modal.addEventListener('click', (e) => { if (e.target === modal) this.closeMVModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) this.closeMVModal(); });
        const v = document.getElementById('mv-video');
        v.addEventListener('error', () => this.showToast('MV 載入失敗，請稍後再試'));
        v.addEventListener('loadedmetadata', () => { v._duration = v.duration; });
      }
      const video = document.getElementById('mv-video');
      const src = track.mv.cdn || track.mv.local;
      video.poster = track.cover?.cdn || track.cover?.local || '';
      video.src = src;
      video.currentTime = 0;
      // Pause the background audio player so MV audio + music don't overlap
      this._mvWasPlaying = !this.audio.paused && this.audio.src;
      if (this._mvWasPlaying) this.audio.pause();
      video.play().catch((err) => { if (err.name !== 'AbortError') this.showToast('MV 播放失敗，請點擊影片手動播放'); });
      document.getElementById('mv-modal-title').textContent = track.name + ' · ' + (track.artist || '');
      modal.classList.add('open');
    }

    closeMVModal() {
      const modal = document.getElementById('mv-modal');
      if (modal) {
        const video = document.getElementById('mv-video');
        if (video) {
          video.pause();
          video.removeAttribute('src');
          video.load();
          video.poster = '';
        }
        // Resume background audio if it was playing before MV opened
        if (this._mvWasPlaying && this.audio.src) {
          this.audio.play().catch(() => {});
          this._mvWasPlaying = false;
        }
        modal.classList.remove('open');
      }
    }

    toggleShortcuts() {
      document.getElementById('shortcuts-panel').classList.toggle('open');
      document.getElementById('shortcuts-overlay').classList.toggle('open');
    }

    showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '✓ ' + msg;
      this.toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }

    formatTime(s) {
      return Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0');
    }

    cleanTrackName(name) {
      if (!name) return '--';
      return name.replace(/\.mp3$/i, '').replace(/_/g, ' ');
    }
  }

  // 啟動：DOM 已就緒就直接建實例；否則等 DOMContentLoaded
  function start() { window.musicPlayer = new MusicPlayer(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
