// Default playlist for music player

const DEFAULT_PLAYLIST = [
    {
        id: 'track-01',
        title: '內卷共和國',
        artist: '獨立音樂人',
        album: '社會觀察系列',
        genre: '搖滾',
        url: '/music/track-01-内卷共和国---fc2a4520-78c6-4b07-b13b-9cb338bb2feb.mp3',
        cover: '',
        duration: 240,
        lyrics: []
    },
    {
        id: 'track-02',
        title: '深圳凌晨四點的光',
        artist: '獨立音樂人',
        album: '城市系列',
        genre: '抒情',
        url: '/music/track-02-深圳凌晨四点的光---f0726dee-b260-4ec4-9b6a-2dd13c9c0113.mp3',
        cover: '',
        duration: 210,
        lyrics: []
    },
    {
        id: 'track-03',
        title: '擺爛主義者',
        artist: '獨立音樂人',
        album: '社會觀察系列',
        genre: '另類',
        url: '/music/track-03-摆烂主义者---23931c6e-8eb7-43dd-a9e5-e62e236c543c.mp3',
        cover: '',
        duration: 225,
        lyrics: []
    },
    {
        id: 'track-04',
        title: '房價像風箏一樣飛走了',
        artist: '獨立音樂人',
        album: '社會觀察系列',
        genre: '民謠',
        url: '/music/track-04-房价像风筝一样飞走了---fa0f3e04-93b3-4852-80ca-e8212e823b20.mp3',
        cover: '',
        duration: 255,
        lyrics: []
    },
    {
        id: 'track-05',
        title: '畢業等於失業',
        artist: '獨立音樂人',
        album: '社會觀察系列',
        genre: '另類',
        url: '/music/track-05-毕业等于失业---9a55310a-7278-4124-87dd-2c6d142a49d7.mp3',
        cover: '',
        duration: 240,
        lyrics: []
    },
    {
        id: 'track-06',
        title: '外賣小哥的藍色多瑙河',
        artist: '獨立音樂人',
        album: '城市系列',
        genre: '古典跨界',
        url: '/music/track-06-外卖小哥的蓝色多瑙河---aa4ec65f-f1e1-4a04-8ddd-4a8338ac8243.mp3',
        cover: '',
        duration: 230,
        lyrics: []
    },
    {
        id: 'track-07',
        title: '六便士與月亮',
        artist: '獨立音樂人',
        album: '城市系列',
        genre: '抒情',
        url: '/music/track-07-六便士与月亮---65b662ae-f285-4631-83ca-a98c80e4db2c.mp3',
        cover: '',
        duration: 245,
        lyrics: []
    },
    {
        id: 'track-08',
        title: '租住在北平等的彩虹',
        artist: '獨立音樂人',
        album: '城市系列',
        genre: '流行',
        url: '/music/track-08-租住在北平等的彩虹---78a16b19-acd6-4087-bfce-8c0069bcbf81.mp3',
        cover: '',
        duration: 235,
        lyrics: []
    },
    {
        id: 'track-09',
        title: '打工人狂想曲',
        artist: '獨立音樂人',
        album: '社會觀察系列',
        genre: '搖滾',
        url: '/music/track-09-打工人狂想曲---1b3116c8-f5f6-4f36-b27e-b39d16315dba.mp3',
        cover: '',
        duration: 260,
        lyrics: []
    },
    {
        id: 'track-10',
        title: '這個時代的藝術家',
        artist: '獨立音樂人',
        album: '社會觀察系列',
        genre: '另類',
        url: '/music/track-10-这个时代的艺术家---771c5519-c626-4955-a42a-23c5b48cc4f7.mp3',
        cover: '',
        duration: 250,
        hasLyrics: true,
        lyricsUrl: '/music/01-這個時代的藝術家.txt'
    }
];

// Extract unique genres for filtering
const GENRES = [...new Set(DEFAULT_PLAYLIST.map(song => song.genre))];

window.DEFAULT_PLAYLIST = DEFAULT_PLAYLIST;
window.GENRES = GENRES;
