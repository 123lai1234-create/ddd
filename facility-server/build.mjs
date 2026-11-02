// 打包「封鎖設施求生」serverless 後端：
//   facility-server/*.ts  →  api/games/[...all].mjs（單一自包含檔案，要 check-in）
//
// 因為本站 catchall 有 Vercel CLI 不 bundle ./ imports 的前例，
// 這支 function 也做成單檔，避免部署時漏 bundle。
// esbuild 取得方式（依序嘗試）：
//   1. 已安裝的 esbuild 套件（NODE_PATH 或 repo 內 node_modules）
//   2. astro/node_modules/esbuild（astro 的 vite 會帶 esbuild，只要 astro 依賴裝過就有）
//   3. 環境變數 ESBUILD_BIN 指向的 esbuild 執行檔
// 全部沒有時會印出安裝提示並以非零結束。

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "api", "games", "[...all].mjs");
const entry = join(here, "vercel-entry.ts");

function resolveEsbuildBin() {
  if (process.env.ESBUILD_BIN && existsSync(process.env.ESBUILD_BIN)) {
    return process.env.ESBUILD_BIN;
  }
  const req = createRequire(join(here, "package.json"));
  for (const spec of ["esbuild", "../astro/node_modules/esbuild"]) {
    try {
      const pkgPath = req.resolve(`${spec}/package.json`);
      const bin = join(dirname(pkgPath), "bin", "esbuild");
      if (existsSync(bin)) return bin;
    } catch {
      // try next
    }
  }
  return null;
}

const bin = resolveEsbuildBin();
if (!bin) {
  console.error(
    "找不到 esbuild。請先安裝（例如：npm i -D esbuild，或在 astro/ 裝好依賴後再跑），\n" +
      "或以 ESBUILD_BIN 環境變數指向 esbuild 執行檔。",
  );
  process.exit(1);
}

const r = spawnSync(
  bin,
  [
    entry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`,
    "--log-level=warning",
  ],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
