/**
 * 📖 Blog handler — reads from the Astro content collection on disk.
 *
 *   blog              → 最新 3 篇
 *   blog <keyword>    → 關鍵字搜尋標題 + 摘要
 *
 * No DB. Reads from `astro/src/content/blog/*.md` at runtime.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Handler } from "../dispatcher";
import { TOPICS, topicCard, THEME, textBubble } from "../../lib/flex-topics";
import { logger } from "../../lib/logger";

const T = TOPICS.find((t) => t.id === "blog")!;

interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

const BLOG_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "../astro/src/content/blog"),
  path.resolve(process.cwd(), "astro/src/content/blog"),
];

let resolvedDir: string | null = null;
async function findBlogDir(): Promise<string | null> {
  if (resolvedDir) return resolvedDir;
  for (const p of BLOG_DIR_CANDIDATES) {
    try {
      await fs.access(p);
      resolvedDir = p;
      return p;
    } catch { /* keep searching */ }
  }
  return null;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
async function parsePost(file: string): Promise<Post | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const m = raw.match(FRONTMATTER_RE);
    if (!m) return null;
    const fm = m[1];
    const body = m[2];
    const get = (key: string): string => {
      const r = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm);
      return r ? r[1].trim().replace(/^["']|["']$/g, "") : "";
    };
    const slug = path.basename(file, ".md");
    // first non-empty line of body as excerpt
    const excerpt = body.split("\n").map((l) => l.trim()).find((l) => l.length > 10)?.slice(0, 80) ?? "";
    return {
      slug,
      title: get("title") || slug,
      date: get("date") || get("pubDate") || "",
      excerpt,
    };
  } catch (err) {
    logger.warn({ err, file }, "blog parse failed");
    return null;
  }
}

async function listPosts(limit = 3, keyword?: string): Promise<Post[]> {
  const dir = await findBlogDir();
  if (!dir) return [];
  const entries = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  const posts: Post[] = [];
  for (const f of entries) {
    const p = await parsePost(path.join(dir, f));
    if (!p) continue;
    if (keyword) {
      const hay = (p.title + " " + p.excerpt).toLowerCase();
      if (!hay.includes(keyword.toLowerCase())) continue;
    }
    posts.push(p);
  }
  posts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return posts.slice(0, limit);
}

function postToCard(p: Post, idx: number): LineMessage {
  return {
    type: "flex",
    altText: p.title,
    contents: {
      type: "bubble", size: "micro",
      header: {
        type: "box", layout: "vertical", backgroundColor: THEME.bg,
        contents: [{ type: "text", text: `📖 #${idx + 1}`, size: "xs", color: THEME.muted }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: p.title, weight: "bold", size: "sm", color: THEME.fg, wrap: true },
          { type: "text", text: p.excerpt, size: "xxs", color: THEME.muted, wrap: true },
          { type: "text", text: p.date, size: "xxs", color: THEME.muted },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: T.color,
          action: { type: "uri", label: "閱讀 →", uri: `${T.url.replace("/blog", "")}/blog/${p.slug}` },
        }],
      },
    },
  };
}

export const blog: Handler = {
  name: "blog",
  priority: 50,
  match: (t) => /^blog(\s|$)/i.test(t.trim()),
  run: async (text) => {
    const kw = text.replace(/^blog\s*/i, "").trim();
    const posts = await listPosts(3, kw || undefined);
    if (!posts.length) {
      const note = kw ? `找不到關於「${kw}」的文章` : "目前沒有文章";
      return [textBubble(`${note}\n網站：${T.url}`, THEME.muted)];
    }
    return posts.map((p, i) => postToCard(p, i));
  },
};
handlers.register(blog);