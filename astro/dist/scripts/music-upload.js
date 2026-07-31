/* Music Upload — client-side upload via blob URL.
 * Vercel static hosting 寫不了檔，所以上傳走 blob URL：
 * 選 MP3 + 歌詞 → 馬上加到 player.tracks → 可播，刷新就消失（再傳一次即可）。
 * 密碼只擋一般使用者，技術上擋不了有心人。
 */
(function () {
  'use strict';

  const UPLOAD_PASSWORD = '123';
  const PASSWORD_HASH_FALLBACK = 'pmWkWSBCL51Bfkhn79xPuKBKHz//H6B+mY6G9/eieuM='; // sha256("123") — 留著方便未來換

  // ---- 工具 ----
  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showToast(msg, type) {
    if (window.musicPlayer && typeof window.musicPlayer.showToast === 'function') {
      window.musicPlayer.showToast(msg);
    } else {
      console.log('[Upload]', msg);
    }
  }

  // ---- 等待 musicPlayer 就緒 ----
  function whenPlayerReady(cb) {
    if (window.musicPlayer && window.musicPlayer.tracks) return cb(window.musicPlayer);
    document.addEventListener('musicplayerready', () => cb(window.musicPlayer), { once: true });
  }

  // ---- 狀態 ----
  let audioFile = null;
  let lyricsFile = null;
  let unlocked = false;

  // ---- Modal 控制 ----
  function openModal() {
    $('upload-modal').classList.add('open');
    if (unlocked) {
      $('upload-gate').style.display = 'none';
      $('upload-form').style.display = '';
    } else {
      $('upload-gate').style.display = '';
      $('upload-form').style.display = 'none';
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
    updateSubmitState();
  }

  // ---- 檔案接收 ----
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

  // ---- 副檔名檢查 ----
  function isMp3(f) {
    if (!f) return false;
    if (f.type && f.type.indexOf('audio/') === 0) return true; // audio/mpeg, audio/mp3, audio/wav, audio/m4a ...
    return /\.mp3$|\.wav$|\.m4a$|\.ogg$/i.test(f.name);
  }
  function isLyrics(f) {
    if (!f) return false;
    return /\.txt$|\.srt$|\.lrc$/i.test(f.name);
  }

  // ---- 密碼驗證 ----
  function tryUnlock() {
    const pwd = $('upload-password').value;
    if (pwd === UPLOAD_PASSWORD) {
      unlocked = true;
      try { sessionStorage.setItem('uploadUnlocked', '1'); } catch (e) {}
      $('upload-gate').style.display = 'none';
      $('upload-form').style.display = '';
      $('upload-password').value = '';
      updateSubmitState();
      showToast('🔓 已解鎖上傳功能');
    } else {
      showToast('❌ 密碼錯誤');
      $('upload-password').value = '';
      $('upload-password').focus();
    }
  }

  // ---- 提交流程 ----
  function submitUpload() {
    if (!audioFile) {
      showToast('請選 MP3 檔案');
      return;
    }
    const name = ($('upload-track-name').value || '').trim();
    if (!name) {
      showToast('請填歌曲名稱');
      return;
    }
    const artist = ($('upload-artist').value || '').trim() || '上傳歌曲';

    const submitBtn = $('upload-submit-btn');
    submitBtn.disabled = true;
    submitBtn.querySelector('.ai-btn-text').style.display = 'none';
    submitBtn.querySelector('.ai-btn-loading').style.display = '';

    // 用 microtask 讓 UI 先更新
    setTimeout(() => doAddTrack(name, artist, submitBtn), 50);
  }

  function doAddTrack(name, artist, submitBtn) {
    try {
      // 1. MP3 → blob URL
      const audioUrl = URL.createObjectURL(audioFile);

      // 2. 歌詞 → blob URL（如果沒給歌詞，用空白 placeholder）
      let lyricsUrl = '';
      if (lyricsFile) {
        // 用 FileReader 同步轉 text 再包成 blob（避免 readAsText 異步）
        // 這裡 lyrics 檔不會太大，允許 sync read（FileReaderSync 在 worker 才支援；用 slice + text 讀）
        // 改用 promise
        readFileAsText(lyricsFile).then((text) => {
          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
          lyricsUrl = URL.createObjectURL(blob);
          finishAdd(name, artist, audioUrl, lyricsUrl, submitBtn);
        }).catch((err) => {
          console.error('[Upload] lyrics read failed', err);
          finishAdd(name, artist, audioUrl, '', submitBtn);
        });
      } else {
        finishAdd(name, artist, audioUrl, '', submitBtn);
      }
    } catch (err) {
      console.error('[Upload] failed', err);
      showToast('❌ 上傳失敗：' + (err.message || err));
      submitBtn.disabled = false;
      submitBtn.querySelector('.ai-btn-text').style.display = '';
      submitBtn.querySelector('.ai-btn-loading').style.display = 'none';
    }
  }

  function finishAdd(name, artist, audioUrl, lyricsUrl, submitBtn) {
    const track = {
      name: name,
      audio: audioUrl,
      lyrics: lyricsUrl,
      lang: 'TW',
      style: '上傳',
      artist: artist,
      gender: 'X',
      album: '使用者上傳',
      duration: '0:00',
      lyricsOffset: 0,
      _isCustom: true   // 標記為上傳曲目（將來可以單獨管理）
    };

    whenPlayerReady((player) => {
      const idx = player.addCustomTrack(track);
      if (idx === null || idx === undefined) {
        showToast('❌ 加到清單失敗');
      } else {
        // 自動播這首
        try { player.playTrack(player.tracks.length - 1); } catch (e) { console.error(e); }
        showToast('✅ 已加入播放清單並開始播放：' + name);
        closeModal();
        resetForm();
      }
      submitBtn.disabled = false;
      submitBtn.querySelector('.ai-btn-text').style.display = '';
      submitBtn.querySelector('.ai-btn-loading').style.display = 'none';
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file, 'utf-8');
    });
  }

  // ---- 綁定 ----
  function bindAll() {
    // 上傳按鈕
    $('upload-btn')?.addEventListener('click', openModal);
    $('upload-modal-close')?.addEventListener('click', closeModal);
    $('upload-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'upload-modal') closeModal();
    });

    // 密碼
    $('upload-unlock-btn')?.addEventListener('click', tryUnlock);
    $('upload-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });

    // 還原 unlock 狀態（同一個 session 不用重打）
    try {
      if (sessionStorage.getItem('uploadUnlocked') === '1') {
        unlocked = true;
      }
    } catch (e) {}

    // 拖放區
    bindDropzone('upload-audio-drop', 'upload-audio-input', 'upload-audio-preview', 'upload-audio-name', (f) => {
      if (!isMp3(f)) {
        showToast('只接受音訊檔（mp3 / wav / m4a / ogg）');
        return;
      }
      audioFile = f;
      // 自動填名稱（如果空著）
      const nameInput = $('upload-track-name');
      if (!nameInput.value.trim()) {
        const guessed = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (guessed) nameInput.value = guessed;
      }
      updateSubmitState();
    });
    bindRemove('upload-audio-remove', () => {
      audioFile = null;
      $('upload-audio-input').value = '';
      $('upload-audio-preview').style.display = 'none';
      updateSubmitState();
    });

    bindDropzone('upload-lyrics-drop', 'upload-lyrics-input', 'upload-lyrics-preview', 'upload-lyrics-name', (f) => {
      if (!isLyrics(f)) {
        showToast('只接受 .txt / .srt / .lrc 歌詞檔');
        return;
      }
      lyricsFile = f;
    });
    bindRemove('upload-lyrics-remove', () => {
      lyricsFile = null;
      $('upload-lyrics-input').value = '';
      $('upload-lyrics-preview').style.display = 'none';
    });

    // 名稱 / 歌手輸入
    $('upload-track-name')?.addEventListener('input', updateSubmitState);
    $('upload-artist')?.addEventListener('input', updateSubmitState);

    // 送出
    $('upload-submit-btn')?.addEventListener('click', submitUpload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
})();
