/* Music Upload — 透過 Vercel Edge Function + Neon Postgres 持久化。
 *
 * MP3 切成 3MB chunks 上傳（繞 Vercel Edge Function 4.5MB body 限制）：
 *   1. POST /api/music-upload?action=init       body: { id, name, artist, audioType, totalChunks }
 *   2. POST /api/music-upload?action=chunk&id=X&idx=N  body: <binary chunk>
 *   3. POST /api/music-upload?action=finalize&id=X  body: { lyrics, audioType }
 *
 * 歌詞來源（按優先順序）：
 *   1. ID3 USLT frame 自動抽出（music-metadata parseBlob）— 背景跑，自動填
 *   2. 用戶另外上傳的歌詞檔
 *
 * 播放：<audio src="/api/music-stream?id=X"> + fetch /api/music-lyrics?id=X
 *
 * 進頁面時：GET /api/music-list → 拿所有上傳 → 復原成 track 推給 player
 *
 * 密碼 123 只防一般使用者（前端代碼看得到，擋不了有心人）。
 */
(function () {
  'use strict';

  const UPLOAD_PASSWORD = '123';
  const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB binary per chunk
  const API_BASE = '/api';

  // ---- 工具 ----
  function $(id) { return document.getElementById(id); }

  function showToast(msg) {
    if (window.musicPlayer && typeof window.musicPlayer.showToast === 'function') {
      window.musicPlayer.showToast(msg);
    } else {
      console.log('[Upload]', msg);
    }
  }

  function randomId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function whenPlayerReady(cb) {
    if (window.musicPlayer && Array.isArray(window.musicPlayer.tracks) && window.musicPlayer.tracks.length > 0) {
      return cb(window.musicPlayer);
    }
    document.addEventListener('musicplayerready', () => cb(window.musicPlayer), { once: true });
  }

  // ---- 狀態 ----
  let audioFile = null;
  let lyricsFile = null;
  let id3Lyrics = null;       // 從 MP3 ID3 USLT 自動抽的歌詞
  let id3LyricsStatus = '';   // 'parsing' | 'found' | 'none' | 'error'
  let unlocked = false;
  let modalMode = 'upload';    // 'upload' | 'admin'

  // ---- Modal ----
  function setModalMode(mode) {
    modalMode = mode;
    const isAdmin = (mode === 'admin');
    $('modal-header-title').textContent = isAdmin ? '🔒 管理歌曲' : '📤 上傳歌曲';
    $('modal-header-desc').textContent = isAdmin
      ? '已上傳的歌曲，點 ✕ 刪除'
      : '選一個 MP3 跟歌詞檔（.txt / .srt / .lrc），就能直接加到播放清單';
  }

  function openModal(mode) {
    setModalMode(mode || 'upload');
    $('upload-modal').classList.add('open');
    if (unlocked) {
      showUnlockedForm();
    } else {
      $('upload-gate').style.display = '';
      $('upload-form').style.display = 'none';
      $('admin-panel').style.display = 'none';
    }
  }

  function showUnlockedForm() {
    $('upload-gate').style.display = 'none';
    if (modalMode === 'admin') {
      $('upload-form').style.display = 'none';
      $('admin-panel').style.display = '';
      renderAdminPanel();
    } else {
      $('upload-form').style.display = '';
      $('admin-panel').style.display = 'none';
    }
  }

  function closeModal() {
    $('upload-modal').classList.remove('open');
  }
  function resetForm() {
    audioFile = null;
    lyricsFile = null;
    $('upload-audio-input').value = '';
    $('upload-lyrics-input').value = '';
    $('upload-audio-preview').style.display = 'none';
    $('upload-lyrics-preview').style.display = 'none';
    $('upload-audio-name').textContent = '';
    $('upload-lyrics-name').textContent = '';
    $('upload-track-name').value = '';
    $('upload-artist').value = '';
    const pw = $('upload-progress-wrap');
    if (pw) { pw.style.display = 'none'; $('upload-progress-bar').style.width = '0%'; }
    updateSubmitState();
  }

  function bindDropzone(dropId, inputId, previewId, nameId, onFile) {
    const drop = $(dropId);
    const input = $(inputId);
    if (!drop || !input) return;
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    input.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleFile(f);
    });
    function handleFile(f) {
      onFile(f);
      $(previewId).style.display = 'flex';
      $(nameId).textContent = f.name;
    }
  }

  function bindRemove(removeId, onRemove) {
    const btn = $(removeId);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
  }

  function updateSubmitState() {
    const name = ($('upload-track-name').value || '').trim();
    const ok = unlocked && audioFile && name;
    $('upload-submit-btn').disabled = !ok;
  }

  // 自製 ID3v2 解析器（純 client-side，無後端依賴）
  // 規格參考：http://id3.org/id3v2.3.0
  function parseId3Tags(uint8) {
    const result = { title: null, artist: null, lyrics: null };
    if (uint8.length < 10) return result;
    if (uint8[0] !== 0x49 || uint8[1] !== 0x44 || uint8[2] !== 0x33) return result;

    const tagSize = ((uint8[6] & 0x7f) << 21) | ((uint8[7] & 0x7f) << 14) | ((uint8[8] & 0x7f) << 7) | (uint8[9] & 0x7f);
    let pos = 10;
    const end = Math.min(10 + tagSize, uint8.length);

    // 跳過 extended header
    if ((uint8[5] & 0x40) !== 0 && pos + 4 <= end) {
      const extSize = ((uint8[pos] & 0x7f) << 21) | ((uint8[pos+1] & 0x7f) << 14) | ((uint8[pos+2] & 0x7f) << 7) | (uint8[pos+3] & 0x7f);
      pos += 4 + extSize;
    }

    while (pos + 10 <= end) {
      const frameId = String.fromCharCode(uint8[pos], uint8[pos+1], uint8[pos+2], uint8[pos+3]);
      const frameSize = (uint8[pos+4] << 24) | (uint8[pos+5] << 16) | (uint8[pos+6] << 8) | uint8[pos+7];
      if (frameId.charCodeAt(0) === 0) break;
      const frameStart = pos + 10;
      const frameEnd = Math.min(frameStart + frameSize, uint8.length);
      if (frameEnd > end) break;

      if (frameId === 'TIT2') {
        result.title = readTextFrame(uint8, frameStart, frameEnd);
      } else if (frameId === 'TPE1') {
        result.artist = readTextFrame(uint8, frameStart, frameEnd);
      } else if (frameId === 'USLT') {
        const enc = uint8[frameStart];
        let p = frameStart + 4;
        while (p < frameEnd && uint8[p] !== 0) p++;
        p++;
        const textBytes = uint8.subarray(p, frameEnd);
        result.lyrics = decodeId3Text(textBytes, enc).replace(/\0+$/g, '').trim();
      }

      pos = frameEnd;
    }
    return result;
  }

  // 讀取 ID3 text frame（TIT2/TPE1/TALB 等都是這個格式）
  function readTextFrame(uint8, start, end) {
    if (start >= end) return null;
    const enc = uint8[start];
    const textBytes = uint8.subarray(start + 1, end);
    return decodeId3Text(textBytes, enc).replace(/\0+$/g, '').trim();
  }

  function decodeId3Text(bytes, enc) {
    try {
      if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
      if (enc === 1 || enc === 2) return new TextDecoder('utf-16').decode(bytes);
      return new TextDecoder('iso-8859-1').decode(bytes);
    } catch (e) {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  // ---- LRClib 自動查歌詞 ----
  async function searchLRClib(track, artist) {
    if (!track) return null;
    try {
      const q = track;
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const results = await res.json();
      if (!Array.isArray(results) || results.length === 0) return null;

      // 過濾：有 artist 的話要比對，沒有的話取第一個
      let match = null;
      if (artist) {
        match = results.find(r =>
          (r.trackName && r.trackName.toLowerCase().includes(track.toLowerCase())) &&
          (r.artistName && r.artistName.toLowerCase().includes(artist.toLowerCase()))
        );
      }
      if (!match) match = results[0]; // fallback 第一個

      return {
        text: match.syncedLyrics || match.plainLyrics || null,
        source: match.trackName + ' — ' + match.artistName,
      };
    } catch (err) {
      console.warn('[Upload] LRClib search failed', err);
      return null;
    }
  }

  async function parseId3Lyrics(file) {
    if (!file) return;
    if (!/\.mp3$/i.test(file.name)) return;

    const skipId3Lyrics = $('upload-no-id3').checked;
    id3LyricsStatus = 'parsing';

    try {
      const buf = await file.arrayBuffer();
      const uint8 = new Uint8Array(buf);
      const tags = parseId3Tags(uint8);

      // 自動填入歌名/藝人（如果用戶還沒填）
      if (tags.title) {
        const nameInput = $('upload-track-name');
        if (!nameInput.value.trim()) nameInput.value = tags.title;
        updateSubmitState();
      }
      if (tags.artist) {
        const artistInput = $('upload-artist');
        if (!artistInput.value.trim()) artistInput.value = tags.artist;
      }

      // 1) 優先用 ID3 內嵌歌詞（如果用戶沒勾「不使用」）
      if (!skipId3Lyrics && tags.lyrics) {
        id3Lyrics = tags.lyrics;
        id3LyricsStatus = 'found';
        showToast(`🎤 自動抓到 MP3 內嵌歌詞（${tags.lyrics.length} 字元）`);
        return;
      }

      // 2) 自動查 LRClib
      if (tags.title) {
        showToast('🔍 自動從 LRClib 查歌詞…');
        const lrcResult = await searchLRClib(tags.title, tags.artist);
        if (lrcResult && lrcResult.text) {
          id3Lyrics = lrcResult.text;
          id3LyricsStatus = 'found';
          showToast(`🎶 LRClib 找到歌詞：「${lrcResult.source}」（${lrcResult.text.length} 字元）`);
        } else {
          id3Lyrics = null;
          id3LyricsStatus = 'none';
          showToast('ℹ️ 無歌詞，請另外上傳歌詞檔');
        }
      } else {
        id3Lyrics = null;
        id3LyricsStatus = 'none';
        showToast('ℹ️ MP3 無 ID3 標籤，請另外上傳歌詞檔');
      }
    } catch (err) {
      console.warn('[Upload] ID3 parse failed', err);
      id3Lyrics = null;
      id3LyricsStatus = 'error';
    }
  }

  function isMp3(f) {
    if (!f) return false;
    if (f.type && f.type.indexOf('audio/') === 0) return true;
    return /\.mp3$|\.wav$|\.m4a$|\.ogg$/i.test(f.name);
  }
  function isLyrics(f) {
    if (!f) return false;
    return /\.txt$|\.srt$|\.lrc$/i.test(f.name);
  }

  function tryUnlock() {
    const pwd = $('upload-password').value;
    if (pwd === UPLOAD_PASSWORD) {
      unlocked = true;
      try { sessionStorage.setItem('uploadUnlocked', '1'); } catch (e) {}
      // 更新 nav 上的 admin 按鈕狀態
      const adminBtn = $('admin-btn');
      if (adminBtn) adminBtn.classList.add('logged-in');
      showUnlockedForm();
      showToast(modalMode === 'admin' ? '🔓 已進入管理模式' : '🔓 已解鎖上傳功能');
    } else {
      showToast('❌ 密碼錯誤');
      $('upload-password').value = '';
      $('upload-password').focus();
    }
  }

  // ---- Admin Panel ----
  async function renderAdminPanel() {
    const container = $('admin-track-list');
    container.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 24px;">載入中...</p>';

    try {
      const res = await fetch(API_BASE + '/music-list', { method: 'GET' });
      if (!res.ok) throw new Error('list failed');
      const data = await res.json();
      const tracks = data.tracks || [];

      if (!tracks.length) {
        container.innerHTML = '<div class="admin-no-tracks">目前沒有上傳記錄</div>';
        return;
      }

      container.innerHTML = tracks.map(t => `
        <div class="admin-track-item">
          <div class="admin-track-info">
            <div class="admin-track-name">${escHtml(t.name || '')}</div>
            <div class="admin-track-artist">${escHtml(t.artist || '上傳歌曲')} &nbsp;·&nbsp; ${fmtBytes(t.audio_size || 0)}</div>
          </div>
          <button class="admin-delete-btn" data-id="${escAttr(t.id)}" data-name="${escAttr(t.name || '')}">✕ 刪除</button>
        </div>
      `).join('');

      container.querySelectorAll('.admin-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const name = btn.dataset.name;
          if (!confirm('確定刪除「' + name + '」？')) return;
          btn.textContent = '刪除中...';
          btn.disabled = true;
          try {
            const res = await fetch(API_BASE + '/music-upload?action=delete&id=' + encodeURIComponent(id), {
              method: 'POST',
              headers: { 'x-upload-password': UPLOAD_PASSWORD },
            });
            if (!res.ok) throw new Error('delete failed');
            btn.closest('.admin-track-item').remove();
            showToast('已刪除：' + name);
            // 同步通知 player 移除這首
            if (window.musicPlayer) {
              window.musicPlayer.tracks = window.musicPlayer.tracks.filter(t => t._dbId !== id);
              window.musicPlayer.renderTrackList();
            }
          } catch (err) {
            console.error('[Admin] delete failed', err);
            showToast('❌ 刪除失敗');
            btn.disabled = false;
            btn.textContent = '✕ 刪除';
          }
        });
      });
    } catch (err) {
      console.error('[Admin] load failed', err);
      container.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 24px;">載入失敗，稍後重試</p>';
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ---- 上傳核心 ----

  async function postJson(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-upload-password': UPLOAD_PASSWORD,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${path} failed: ${err.message || err.error || res.status}`);
    }
    return res.json();
  }

  async function postBinary(path, buffer) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-upload-password': UPLOAD_PASSWORD,
      },
      body: buffer,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${path} failed: ${err.message || err.error || res.status}`);
    }
    return res.json();
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file, 'utf-8');
    });
  }

  async function submitUpload() {
    if (!audioFile) { showToast('請選 MP3 檔案'); return; }
    const name = ($('upload-track-name').value || '').trim();
    if (!name) { showToast('請填歌曲名稱'); return; }
    const artist = ($('upload-artist').value || '').trim() || '上傳歌曲';

    const submitBtn = $('upload-submit-btn');
    const progressWrap = $('upload-progress-wrap');
    const progressBar = $('upload-progress-bar');
    const progressText = $('upload-progress-text');
    submitBtn.disabled = true;
    submitBtn.querySelector('.ai-btn-text').style.display = 'none';
    submitBtn.querySelector('.ai-btn-loading').style.display = '';
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    function setProgress(pct, label) {
      progressBar.style.width = pct + '%';
      if (label) progressText.textContent = label;
    }

    try {
      const id = randomId();
      const audioType = audioFile.type || 'audio/mpeg';
      const totalSize = audioFile.size;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

      // 1. init
      setProgress(5, '初始化...');
      await postJson('/music-upload?action=init', {
        id, name, artist, audioType, totalChunks,
      });

      // 2. chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkBlob = audioFile.slice(start, end);
        const buf = await chunkBlob.arrayBuffer();
        const pct = Math.round((end / totalSize) * 90);
        setProgress(pct, `📤 ${i + 1}/${totalChunks} — ${Math.round((end / totalSize) * 100)}%`);
        await postBinary(`/music-upload?action=chunk&id=${id}&idx=${i}`, buf);
      }

      // 3. finalize（連同歌詞）
      setProgress(95, '💾 儲存中...');
      // 歌詞優先順序：1) 用戶上傳的歌詞檔  2) parseId3Lyrics 已自動處理（ID3 USLT 或 LRClib）
      let lyricsText = '';
      if (lyricsFile) {
        try {
          lyricsText = await readFileAsText(lyricsFile);
          showToast('📝 使用上傳的歌詞檔');
        } catch (err) { console.warn('[Upload] lyrics read failed', err); }
      } else if (id3Lyrics) {
        lyricsText = id3Lyrics;
      }
      const finalResult = await postJson(`/music-upload?action=finalize&id=${id}`, {
        lyrics: lyricsText,
        audioType,
      });

      // 4. 推給 player
      const track = {
        name,
        audio: `${API_BASE}/music-stream?id=${id}`,
        lyrics: lyricsText ? `${API_BASE}/music-lyrics?id=${id}` : '',
        lang: 'TW',
        style: '上傳',
        artist,
        gender: 'X',
        album: '使用者上傳',
        duration: '0:00',
        lyricsOffset: 0,
        _isCustom: true,
        _dbId: id,
        _audioSize: finalResult.audioSize,
      };

      whenPlayerReady((player) => {
        const idx = player.addCustomTrack(track);
        if (idx === null || idx === undefined) {
          showToast('❌ 加到清單失敗');
        } else {
          try { player.playTrack(player.tracks.length - 1); } catch (e) { console.error(e); }
          setProgress(100, '✅ 完成');
          setTimeout(() => { progressWrap.style.display = 'none'; }, 1200);
          showToast('✅ 已上傳並開始播放：' + name);
          closeModal();
          resetForm();
        }
      });
    } catch (err) {
      console.error('[Upload] failed', err);
      showToast('❌ 上傳失敗：' + (err.message || err));
      setProgress(0, '');
      if (progressWrap) progressWrap.style.display = 'none';
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.ai-btn-text').style.display = '';
      submitBtn.querySelector('.ai-btn-loading').style.display = 'none';
      submitBtn.querySelector('.ai-btn-text').textContent = '✅ 加到播放清單';
      if (progressWrap && progressWrap.style.display !== 'none') {
        progressBar.style.width = '100%';
        progressText.textContent = '完成！';
      }
      updateSubmitState();
    }
  }

  // ---- 從 Neon 復原 ----
  async function restoreFromDB() {
    try {
      const res = await fetch(API_BASE + '/music-list', { method: 'GET' });
      if (!res.ok) {
        console.warn('[Upload] list failed', res.status);
        return;
      }
      const data = await res.json();
      const tracks = data.tracks || [];
      if (!tracks.length) return;

      whenPlayerReady((player) => {
        let restored = 0;
        for (const t of tracks) {
          try {
            player.addCustomTrack({
              name: t.name,
              audio: t.audioUrl,
              lyrics: t.lyricsUrl,
              lang: 'TW',
              style: '上傳',
              artist: t.artist || '上傳歌曲',
              gender: 'X',
              album: '使用者上傳',
              duration: '0:00',
              lyricsOffset: 0,
              _isCustom: true,
              _dbId: t.id,
            });
            restored++;
          } catch (e) { console.error('[Upload] restore one failed', e); }
        }
        if (restored > 0) {
          showToast(`🎵 已從雲端還原 ${restored} 首上傳歌曲`);
        }
      });
    } catch (err) {
      console.warn('[Upload] restore failed', err);
    }
  }

  // ---- 綁定 ----
  function bindAll() {
    $('upload-btn')?.addEventListener('click', () => openModal('upload'));
    $('admin-btn')?.addEventListener('click', () => openModal('admin'));
    $('upload-modal-close')?.addEventListener('click', closeModal);
    $('upload-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'upload-modal') closeModal();
    });

    $('upload-unlock-btn')?.addEventListener('click', tryUnlock);
    $('upload-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });

    try {
      if (sessionStorage.getItem('uploadUnlocked') === '1') {
        unlocked = true;
        const adminBtn = $('admin-btn');
        if (adminBtn) adminBtn.classList.add('logged-in');
      }
    } catch (e) {}

    bindDropzone('upload-audio-drop', 'upload-audio-input', 'upload-audio-preview', 'upload-audio-name', (f) => {
      if (!isMp3(f)) { showToast('只接受音訊檔（mp3 / wav / m4a / ogg）'); return; }
      audioFile = f;
      id3Lyrics = null;
      id3LyricsStatus = '';
      updateSubmitState();
      // 背景解析 ID3 標籤 + 自動查 LRClib（async，不阻擋 UI）
      parseId3Lyrics(f);
    });
    bindRemove('upload-audio-remove', () => {
      audioFile = null;
      $('upload-audio-input').value = '';
      $('upload-audio-preview').style.display = 'none';
      updateSubmitState();
    });

    bindDropzone('upload-lyrics-drop', 'upload-lyrics-input', 'upload-lyrics-preview', 'upload-lyrics-name', (f) => {
      if (!isLyrics(f)) { showToast('只接受 .txt / .srt / .lrc 歌詞檔'); return; }
      lyricsFile = f;
    });
    bindRemove('upload-lyrics-remove', () => {
      lyricsFile = null;
      $('upload-lyrics-input').value = '';
      $('upload-lyrics-preview').style.display = 'none';
    });

    $('upload-track-name')?.addEventListener('input', updateSubmitState);
    $('upload-artist')?.addEventListener('input', updateSubmitState);
    $('upload-submit-btn')?.addEventListener('click', submitUpload);

    restoreFromDB();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
})();
