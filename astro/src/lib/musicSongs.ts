/**
 * donttalk 音樂曲目：建置期資料載入器
 * ==========================================
 * 歌詞來源：astro/public/music/*.txt（站點自己的素材，單一事實來源）
 * 圖片來源：astro/public/music/cards/<slug>/（由 tools/free-toolkit 批次產出）
 *
 * 這支模組只在建置期跑（getStaticPaths / frontmatter），不會進客戶端 bundle。
 * 解析規則刻意與 tools/free-toolkit/build_manifest.py 一致，
 * 這樣工具鏈產出的卡片跟頁面顯示的標題／hook 才會對得上。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LyricSection {
    label: string;
    lines: string[];
}

export interface Song {
    /** 原始檔名（不含副檔名），例：07_愛的模樣 */
    id: string;
    /** URL 用的安全 slug，例：07_愛的模樣 */
    slug: string;
    title: string;
    /** Chorus 第一行；沒有 Chorus 就用第一句歌詞 */
    hook: string;
    sections: LyricSection[];
    /** 所有歌詞行（不分段） */
    lyrics: string[];
    /** 音檔的站台路徑，沒有就 null */
    audio: string | null;
    /** 封面圖的站台路徑，沒有就 null */
    cover: string | null;
    /** free-toolkit 是否已產出這首的社群素材 */
    hasCards: boolean;
}

const SKIP_NAMES = new Set(['lrc-guide.txt', 'readme.txt', 'readme.md']);
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.flac', '.ogg'];
const SECTION_RE = /^[【\[]\s*(.+?)\s*[】\]]$/;

/**
 * 找出 astro/public/music/ 的位置。
 *
 * 不能用 import.meta.url —— Astro 在建置期會把模組打包，
 * import.meta.url 指向的是產物路徑而不是原始碼位置，會靜默地找不到資料夾。
 * 改成從 process.cwd() 往上層逐一嘗試，cwd 是 astro/ 或 repo root 都找得到。
 */
function findMusicDir(): string | null {
    const candidates: string[] = [];
    try {
        candidates.push(path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'public', 'music'));
    } catch {
        /* import.meta.url 不可用就略過 */
    }

    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        candidates.push(path.join(dir, 'public', 'music'));
        candidates.push(path.join(dir, 'astro', 'public', 'music'));
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
    }
    return null;
}

const MUSIC_DIR = findMusicDir();
const CARDS_DIR = MUSIC_DIR ? path.join(MUSIC_DIR, 'cards') : '';

/** 與 tools/free-toolkit/build_manifest.py 的 slugify 保持一致。 */
export function slugify(id: string): string {
    return id.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
}

/** 說明文件（例如 UPLOAD-GUIDE.txt）不是歌詞，內容以 markdown 標題開頭。 */
function isDoc(text: string): boolean {
    for (const line of text.split(/\r?\n/)) {
        const s = line.trim();
        if (!s) continue;
        return s.startsWith('#');
    }
    return false;
}

interface Parsed {
    title: string;
    hook: string;
    sections: LyricSection[];
    lyrics: string[];
}

function parseLyrics(text: string, fallbackTitle: string): Parsed {
    const titleMatch = text.match(/=+\s*(.+?)\s*=+/);
    const title = titleMatch ? titleMatch[1].trim() : fallbackTitle;

    const sections: LyricSection[] = [];
    let current: LyricSection | null = null;
    const chorus: string[] = [];
    let first = '';

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('=')) continue;

        const sm = line.match(SECTION_RE);
        if (sm) {
            current = { label: sm[1].trim(), lines: [] };
            sections.push(current);
            continue;
        }
        if (!current) {
            current = { label: '', lines: [] };
            sections.push(current);
        }
        current.lines.push(line);
        if (!first) first = line;
        const l = current.label.toLowerCase();
        if (l.includes('chorus') || l.includes('副歌') || l.includes('疊')) {
            chorus.push(line);
        }
    }

    const lyrics = sections.flatMap((s) => s.lines);
    const hook = chorus[0] ?? first ?? '';
    return { title, hook, sections, lyrics };
}

/**
 * 音檔走 jsDelivr CDN，不是本站。
 *
 * donttalk 的音檔放在 astro/public/music/*.mp3，但站上不直接供檔——
 * tracks.json 裡每一首的 url 都指向 jsDelivr（分支 @123lai1234-create）。
 * 本站的 /music/*.mp3 回 404 是正常的，頁面也必須跟著走 CDN。
 */
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/123lai1234-create/ddd@123lai1234-create/astro/public/music';

function findAudio(id: string): string | null {
    if (!MUSIC_DIR) return null;
    for (const ext of AUDIO_EXT) {
        if (fs.existsSync(path.join(MUSIC_DIR, id + ext))) {
            return `${CDN_BASE}/${encodeURIComponent(id + ext)}`;
        }
    }
    // 大小寫不拘再找一次
    const lower = id.toLowerCase();
    for (const fn of fs.readdirSync(MUSIC_DIR)) {
        const ext = path.extname(fn).toLowerCase();
        if (!AUDIO_EXT.includes(ext)) continue;
        if (path.basename(fn, ext).toLowerCase() === lower) {
            return `${CDN_BASE}/${encodeURIComponent(fn)}`;
        }
    }
    return null;
}

function findCover(id: string): string | null {
    if (!MUSIC_DIR) return null;
    const coversDir = path.join(MUSIC_DIR, 'covers');
    if (!fs.existsSync(coversDir)) return null;
    const key = id.replace(/^\d+[-_]/, '');
    for (const fn of fs.readdirSync(coversDir)) {
        if (fn.replace(/^\d+[-_]/, '').replace(/\.[^.]+$/, '') === key) {
            return `/music/covers/${fn}`;
        }
    }
    return null;
}

let cache: Song[] | null = null;

/** 掃描 astro/public/music/ 的歌詞檔，回傳全部曲目（已排序）。 */
export function loadSongs(): Song[] {
    if (cache) return cache;

    const songs: Song[] = [];
    if (!MUSIC_DIR) {
        console.warn(
            '[musicSongs] 找不到 astro/public/music/（cwd=' + process.cwd() + '），'
                + '歌曲頁會是空的。請確認建置是在 astro/ 資料夾下執行。',
        );
        cache = songs;
        return songs;
    }

    const files = fs
        .readdirSync(MUSIC_DIR)
        .filter((fn) => fn.toLowerCase().endsWith('.txt') && !SKIP_NAMES.has(fn.toLowerCase()))
        .sort();

    for (const fn of files) {
        const full = path.join(MUSIC_DIR, fn);
        let text: string;
        try {
            text = fs.readFileSync(full, 'utf-8');
        } catch {
            continue;
        }
        if (isDoc(text)) continue;

        const id = path.basename(fn, path.extname(fn));
        const parsed = parseLyrics(text, id.replace(/^\d+[-_]/, ''));
        const slug = slugify(id);

        songs.push({
            id,
            slug,
            title: parsed.title,
            hook: parsed.hook,
            sections: parsed.sections,
            lyrics: parsed.lyrics,
            audio: findAudio(id),
            cover: findCover(id),
            hasCards: fs.existsSync(path.join(CARDS_DIR, slug)),
        });
    }

    cache = songs;
    return songs;
}

/** 依 slug 找單首歌。 */
export function findSong(slug: string): Song | undefined {
    return loadSongs().find((s) => s.slug === slug);
}

/** 社群素材（由 free-toolkit 產出）的站台路徑。 */
export function cardPath(slug: string, file: string): string {
    return `/music/cards/${slug}/${file}`;
}
