/**
 * Hero Video Background - Random Rotation
 * 背景影片腳本：隨機輪播影片
 */

(function () {
    // 影片列表（從 D:\project\videos 目錄）
    const VIDEOS = [
        '/videos/5ae42f29-5a34-41e9-a27c-6631b45dd16a_watermarked.mp4',
        '/videos/6b95a3b8-no-watermark_watermarked.mp4',
        '/videos/179f1b00-2727-47ec-81d3-591d8405c762_watermarked.mp4',
        '/videos/314d4f6d-a33c-4ae9-98be-278f186e8b69_watermarked.mp4',
        '/videos/a0288e4b-f7ee-4e17-b24c-5d7d0f0a514f_watermarked.mp4',
        '/videos/bb49c6e0-0a76-4bc7-9e69-11f1737b4461_watermarked.mp4',
        '/videos/ca1772e9-acb6-496e-9a58-8a86f29e890a_watermarked.mp4',
        '/videos/cd66d66a-3dbb-4ed4-bd24-4a05add4b914_watermarked.mp4'
    ];

    // 切換間隔（毫秒）- 15秒切換一次
    const SWITCH_INTERVAL = 15000;

    function getRandomVideo(excludeCurrent) {
        let availableVideos = [...VIDEOS];
        if (excludeCurrent) {
            availableVideos = availableVideos.filter(v => v !== excludeCurrent);
        }
        return availableVideos[Math.floor(Math.random() * availableVideos.length)];
    }

    function initHeroVideo() {
        const video = document.querySelector('.hero-video');
        if (!video) {
            console.log('Hero video element not found');
            return;
        }

        const source = video.querySelector('source');
        if (!source) {
            console.log('Video source not found');
            return;
        }

        // 設置隨機影片
        let currentVideo = getRandomVideo();
        source.src = currentVideo;
        video.load();
        video.play().catch(() => {
            // 自動播放被阻止，忽略錯誤
        });

        // 定時切換影片
        setInterval(() => {
            const nextVideo = getRandomVideo(currentVideo);
            currentVideo = nextVideo;
            source.src = nextVideo;
            video.load();
            video.play().catch(() => { });
        }, SWITCH_INTERVAL);
    }

    // 頁面載入後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeroVideo);
    } else {
        initHeroVideo();
    }
})();