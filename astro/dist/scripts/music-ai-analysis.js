// 音樂 AI 分析腳本

class MusicAIAnalysis {
    constructor() {
        this.selectedFile = null;
        this.analysisResult = null;
        
        this.init();
    }

    init() {
        // Modal 控制
        const modal = document.getElementById('ai-modal');
        const openBtn = document.getElementById('ai-analyze-btn');
        const closeBtn = document.getElementById('ai-modal-close');
        
        if (openBtn && modal) {
            openBtn.addEventListener('click', () => this.openModal());
        }
        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
        }

        // Tab 切換
        document.querySelectorAll('.ai-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // 上傳相關
        this.setupUpload();

        // 分析按鈕
        document.getElementById('ai-analyze-upload-btn')?.addEventListener('click', () => this.analyzeFromUpload());
        document.getElementById('ai-analyze-text-btn')?.addEventListener('click', () => this.analyzeFromText());

        // 套用按鈕
        document.getElementById('ai-apply-btn')?.addEventListener('click', () => this.applyToPlaylist());
    }

    openModal() {
        const modal = document.getElementById('ai-modal');
        if (modal) {
            modal.classList.add('open');
            this.resetForm();
        }
    }

    closeModal() {
        const modal = document.getElementById('ai-modal');
        if (modal) {
            modal.classList.remove('open');
        }
    }

    resetForm() {
        this.selectedFile = null;
        this.analysisResult = null;
        
        // 重置檔案預覽
        const filePreview = document.getElementById('ai-file-preview');
        const fileInput = document.getElementById('ai-file-input');
        if (filePreview) filePreview.style.display = 'none';
        if (fileInput) fileInput.value = '';
        
        // 重置分析按鈕
        const uploadBtn = document.getElementById('ai-analyze-upload-btn');
        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.querySelector('.ai-btn-text').style.display = 'inline';
            uploadBtn.querySelector('.ai-btn-loading').style.display = 'none';
        }
        
        // 重置文字輸入
        document.getElementById('ai-song-name').value = '';
        document.getElementById('ai-artist').value = '';
        
        // 隱藏結果
        document.getElementById('ai-result').style.display = 'none';
    }

    switchTab(tabName) {
        // 切換 tab 按鈕狀態
        document.querySelectorAll('.ai-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // 切換 tab 內容
        document.querySelectorAll('.ai-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `ai-${tabName}-tab`);
        });
    }

    setupUpload() {
        const dropzone = document.getElementById('ai-dropzone');
        const fileInput = document.getElementById('ai-file-input');
        const removeBtn = document.getElementById('ai-remove-file');
        
        if (!dropzone || !fileInput) return;

        // 點擊上傳
        dropzone.addEventListener('click', () => fileInput.click());
        
        // 檔案選擇
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // 拖放上傳
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // 移除檔案
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                this.selectedFile = null;
                document.getElementById('ai-file-preview').style.display = 'none';
                document.getElementById('ai-analyze-upload-btn').disabled = true;
            });
        }
    }

    handleFile(file) {
        // 檢查檔案類型
        if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
            this.showToast('請上傳音頻檔案 (MP3, WAV, OGG, M4A)');
            return;
        }

        // 檢查檔案大小 (10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('檔案太大，請上傳小於 10MB 的檔案');
            return;
        }

        this.selectedFile = file;
        
        // 顯示檔案預覽
        const preview = document.getElementById('ai-file-preview');
        const nameEl = document.getElementById('ai-file-name');
        if (preview && nameEl) {
            nameEl.textContent = file.name;
            preview.style.display = 'flex';
        }
        
        // 啟用分析按鈕
        document.getElementById('ai-analyze-upload-btn').disabled = false;
    }

    async analyzeFromUpload() {
        if (!this.selectedFile) return;
        
        const btn = document.getElementById('ai-analyze-upload-btn');
        btn.disabled = true;
        btn.querySelector('.ai-btn-text').style.display = 'none';
        btn.querySelector('.ai-btn-loading').style.display = 'inline';

        try {
            const formData = new FormData();
            formData.append('audio', this.selectedFile);

            const response = await fetch('/api/music/analyze', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            this.analysisResult = result;
            this.showResult(result);

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showToast('分析失敗，請稍後再試');
        } finally {
            btn.disabled = false;
            btn.querySelector('.ai-btn-text').style.display = 'inline';
            btn.querySelector('.ai-btn-loading').style.display = 'none';
        }
    }

    async analyzeFromText() {
        const nameInput = document.getElementById('ai-song-name');
        const artistInput = document.getElementById('ai-artist');
        
        const songName = nameInput?.value.trim();
        if (!songName) {
            this.showToast('請輸入歌曲名稱');
            return;
        }

        const btn = document.getElementById('ai-analyze-text-btn');
        btn.disabled = true;
        btn.querySelector('.ai-btn-text').style.display = 'none';
        btn.querySelector('.ai-btn-loading').style.display = 'inline';

        try {
            const formData = new FormData();
            formData.append('name', songName);
            formData.append('artist', artistInput?.value.trim() || '');

            const response = await fetch('/api/music/analyze-text', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            this.analysisResult = result;
            this.showResult(result);

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showToast('分析失敗，請稍後再試');
        } finally {
            btn.disabled = false;
            btn.querySelector('.ai-btn-text').style.display = 'inline';
            btn.querySelector('.ai-btn-loading').style.display = 'none';
        }
    }

    showResult(result) {
        const resultEl = document.getElementById('ai-result');
        if (!resultEl) return;

        // 填充結果
        const genderMap = { M: '♂ 男歌手', F: '♀ 女歌手' };
        const langMap = { TW: '🇹🇼 台灣', EN: '🇺🇸 英文', JP: '🇯🇵 日文', KR: '🇰🇷 韓文' };
        
        document.getElementById('ai-result-gender').textContent = genderMap[result.gender] || result.gender || '--';
        document.getElementById('ai-result-language').textContent = langMap[result.language] || result.language || '--';
        document.getElementById('ai-result-style').textContent = result.style || '--';
        document.getElementById('ai-result-confidence').textContent = result.confidence ? `${Math.round(result.confidence * 100)}%` : '--';
        document.getElementById('ai-lyrics-content').textContent = result.lyrics || '無法生成歌詞';

        resultEl.style.display = 'block';
    }

    applyToPlaylist() {
        if (!this.analysisResult) return;
        
        // 這裡可以將分析結果應用到播放列表
        // 例如：下載歌詞檔案、更新 playlist.json 等
        
        const result = this.analysisResult;
        
        // 顯示套用成功的提示
        this.showToast(`已分析完成！\n性別: ${result.gender}\n語言: ${result.language}\n曲風: ${result.style}`);
        
        // 可以選擇下載歌詞
        if (result.lyrics) {
            this.downloadLyrics(result.lyrics, result.filename || 'song');
        }
        
        this.closeModal();
    }

    downloadLyrics(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_lyrics.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `✓ ${message}`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.musicAI = new MusicAIAnalysis();
});