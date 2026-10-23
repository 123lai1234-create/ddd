#!/usr/bin/env node
/**
 * sync-mascot-stats.mjs — 從實際 GLB 重新解析 3d-mascot 頁的統計常數
 *
 * 為什麼需要這個：
 *   /3d-mascot 頁的 STAT_TRIS / STAT_MATS / STAT_SIZE 是手填的，而模型每被 Blender
 *   重產一次這三個數就會漂移（2026-10-23 當天就漂了兩次）。頁面註解寫著
 *   「真實數據（直接解析 GLB 得出，勿手填）」，但沒有任何機制保證它真的被重算過。
 *
 * 用法（在 astro/ 下）：
 *   node scripts/sync-mascot-stats.mjs          # 更新 3d-mascot.astro
 *   node scripts/sync-mascot-stats.mjs --check  # 只檢查不寫入，有落差就 exit 1
 *   node scripts/sync-mascot-stats.mjs --round  # 大小改用四捨五入（預設是截尾）
 *
 * 為什麼預設截尾（floor）：
 *   本頁原本就���截尾寫法 —— 舊 GLB 4,062,280 B = 3.874 MB 寫成 "3.8 MB"。
 *   改成四捨五入會讓同一頁的寫法前後不一致。真的想要四捨五入就加 --round。
 *
 * 為什麼不自動 commit：
 *   模型反覆重產的時候，自動 commit 會把半成品推進 main。只改檔案、印出差異，
 *   剩下的交給人或 agent 判斷。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASTRO_DIR = resolve(__dirname, '..');

const GLB_REL = 'public/models/mascot-3d.glb';
const PAGE_REL = 'src/pages/3d-mascot.astro';

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const USE_ROUND = argv.includes('--round');

/** 讀 GLB 的 JSON chunk。回傳 { json, byteLength }。 */
function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.length < 12) throw new Error(`檔案太小，不像 GLB：${path}`);
  const magic = buf.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `不是 GLB 檔（magic = 0x${magic.toString(16)}，預期 0x${GLB_MAGIC.toString(16)} = "glTF"）：${path}`
    );
  }
  const declared = buf.readUInt32LE(8);
  if (declared !== buf.length) {
    throw new Error(
      `GLB 標頭宣告長度 ${declared}，實際 ${buf.length} —— 檔案可能被截斷`
    );
  }

  let off = 12;
  while (off + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(off);
    const chunkType = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (chunkType === CHUNK_JSON) {
      return { json: JSON.parse(buf.toString('utf8', start, start + chunkLen)), byteLength: buf.length };
    }
    off = start + chunkLen + ((4 - (chunkLen % 4)) % 4); // chunk 對齊到 4 bytes
  }
  throw new Error(`找不到 JSON chunk：${path}`);
}

/** 數三角面。primitives 有 indices 就用 indices，否則用 POSITION 頂點數。 */
function countTriangles(json) {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) {
        tris += Math.floor((json.accessors?.[prim.indices]?.count ?? 0) / 3);
      } else if (prim.attributes?.POSITION !== undefined) {
        tris += Math.floor((json.accessors?.[prim.attributes.POSITION]?.count ?? 0) / 3);
      }
    }
  }
  return tris;
}

/**
 * 三角面 -> 顯示字串。
 * 16 萬以下顯示整數（160 K），以上顯示到 0.1 K，避免出現 160240 這種長度。
 */
function fmtTris(n) {
  const k = n / 1000;
  return k >= 100 ? `${Math.round(k)} K` : `${(Math.round(k * 10) / 10).toFixed(1)} K`;
}

function fmtMb(bytes, round) {
  const mb = bytes / 1048576;
  const v = round ? Math.round(mb * 10) / 10 : Math.floor(mb * 10) / 10;
  return `${v.toFixed(1)} MB`;
}

function main() {
  const glbPath = resolve(ASTRO_DIR, GLB_REL);
  const pagePath = resolve(ASTRO_DIR, PAGE_REL);

  if (!existsSync(glbPath)) throw new Error(`找不到模型：${glbPath}`);
  if (!existsSync(pagePath)) throw new Error(`找不到頁面：${pagePath}`);

  const { json, byteLength } = readGlb(glbPath);
  const tris = countTriangles(json);
  const mats = (json.materials ?? []).length;

  if (tris === 0) throw new Error('解析到 0 個三角面，GLB 結構可能不是預期的');
  if (mats === 0) throw new Error('解析到 0 個材質，GLB 結構可能不是預期的');

  const next = {
    STAT_TRIS: fmtTris(tris),
    STAT_MATS: String(mats),
    STAT_SIZE: fmtMb(byteLength, USE_ROUND),
  };

  const generator = json.asset?.generator ?? '(無)';
  console.log(`GLB   : ${GLB_REL}`);
  console.log(`       ${byteLength.toLocaleString('en-US')} bytes = ${(byteLength / 1048576).toFixed(3)} MB`);
  console.log(`       generator = ${generator}`);
  console.log(`解析值 : ${tris.toLocaleString('en-US')} tris / ${mats} materials`);
  console.log(`大小慣例: ${USE_ROUND ? '四捨五入' : '截尾'}（${next.STAT_SIZE}）`);
  console.log('');

  let page = readFileSync(pagePath, 'utf8');
  const before = {};
  const changed = [];

  for (const [key, value] of Object.entries(next)) {
    const re = new RegExp(`(const\\s+${key}\\s*=\\s*')([^']*)(')`);
    const m = re.exec(page);
    if (!m) {
      console.error(`✗ 頁面裡找不到 ${key} 的宣告，跳過`);
      process.exitCode = 1;
      continue;
    }
    before[key] = m[2];
    if (m[2] !== value) {
      page = page.replace(re, `$1${value}$3`);
      changed.push(`${key}: ${m[2]} -> ${value}`);
    }
  }

  // ── 取代 STAT_TRIS 上方整段連續的 // 註解 ──
  // 只換第一行的話，人工補的舊筆記會殘留下來，跟新產生的數字互相矛盾。
  // 這段必須獨立於「數字有沒有變」來判斷：數字沒變但註解過期時也要清。
  const lines = page.split('\n');
  const trisIdx = lines.findIndex((l) => /^\s*const\s+STAT_TRIS\s*=/.test(l));
  if (trisIdx === -1) {
    console.error('✗ 頁面裡找不到 const STAT_TRIS 的宣告位置');
    process.exitCode = 1;
    return;
  }
  let blockStart = trisIdx;
  while (blockStart > 0 && /^\s*\/\//.test(lines[blockStart - 1])) blockStart--;
  const oldBlock = lines.slice(blockStart, trisIdx);

  const newBlock = [
    `// 真實數據 —— 由 scripts/sync-mascot-stats.mjs 直接解析 ${GLB_REL} 得出，不要手填。`,
    `// 解析結果：${tris.toLocaleString('en-US')} tris / ${mats} materials / ${byteLength.toLocaleString('en-US')} bytes`,
    `// 大小用${USE_ROUND ? '四捨五入' : '截尾'}（${fmtMb(byteLength, USE_ROUND)}）；改用另一種請加 --round 後重跑。`,
  ];

  const commentStale =
    oldBlock.length !== newBlock.length ||
    oldBlock.some((l, i) => l.trim() !== newBlock[i].trim());

  if (changed.length === 0 && !commentStale) {
    console.log('✓ 頁面統計已經跟 GLB 一致，沒有要改的。');
    return;
  }

  if (changed.length === 0) console.log('  （數字沒變，只清理過期註解）');
  console.log(`  註解區塊：${oldBlock.length} 行 -> ${newBlock.length} 行`);

  if (CHECK_ONLY) {
    console.log('');
    console.log('✗ --check 模式：頁面與 GLB 有落差，未寫入。');
    process.exitCode = 1;
    return;
  }

  lines.splice(blockStart, trisIdx - blockStart, ...newBlock);
  writeFileSync(pagePath, lines.join('\n'), 'utf8');
  console.log('');
  console.log(`✓ 已更新 ${PAGE_REL}（含 STAT_TRIS 上方的註解區塊）`);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}