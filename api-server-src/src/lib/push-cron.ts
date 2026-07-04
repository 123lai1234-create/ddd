/**
 * Cron push worker — fan-out by topic.
 *
 * 4 jobs (call from cron):
 *   pushJob("stock")        — 每日 09:00 台股掃描
 *   pushJob("protein")      — 週一 09:00 arXiv 蛋白質 AI 論文摘要 (mock)
 *   pushJob("ngs")          — 週三 09:00 NGS 小知識 (mock)
 *   pushJob("blog")         — 週五 09:00 當週新文章 (from astro content collection)
 *   pushJob("interview")    — 每日 20:00 每日一面試題
 *
 * Quiet hours check: skip users whose push_quiet_hrs covers current time.
 * Topics filter: only send to users whose topics JSONB contains the job topic.
 */

import { sql } from "drizzle-orm";
import { db, lineSubscribersTable } from "../_shims/db";
import { pushMessage } from "../lib/line";
import { cached } from "../lib/cache";
import { scanWatchlist } from "../lib/scan-watchlist";
import { scanFlex } from "../lib/flex-templates";
import { textBubble, TOPICS, THEME } from "../lib/flex-topics";
import { logger } from "../lib/logger";

type TopicId = typeof TOPICS[number]["id"];

interface PushPayload {
  topic: TopicId;
  messages: (userId: string) => Promise<Array<{ type: "flex"; altText: string; contents: unknown } | { type: "text"; text: string }>>;
}

// ---- Job implementations ----

const stockJob: PushPayload = {
  topic: "stock",
  messages: async () => {
    const results = await cached("scan", 60 * 5, scanWatchlist);
    const date = new Date().toISOString().slice(0, 10);
    return [scanFlex(results, date)];
  },
};

const proteinJob: PushPayload = {
  topic: "protein",
  messages: async () => {
    // Mock: pull 1 recent paper from arXiv (cached 12h)
    const papers = await cached("arxiv:protein", 12 * 3600, async () => {
      try {
        const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:q-bio.BM&sortBy=submittedDate&max_results=1");
        const xml = await r.text();
        const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(xml);
        const linkMatch = /<id>([\s\S]*?)<\/id>/.exec(xml);
        return titleMatch && linkMatch ? [{ title: titleMatch[1].trim(), url: linkMatch[1].trim() }] : [];
      } catch {
        return [{ title: "ESM-2 + ProteinMPNN 整合設計的最新進展", url: "https://arxiv.org/abs/2410.xxxxx" }];
      }
    });
    const p = papers[0];
    const body = p
      ? `🧬 本週蛋白質 AI 新論文\n\n${p.title}\n${p.url}\n\n完整版 👉 ${TOPICS.find((t) => t.id === "protein")!.url}`
      : "🧬 本週尚無新論文";
    return [textBubble(body, THEME.fg)];
  },
};

const ngsJob: PushPayload = {
  topic: "ngs",
  messages: async () => {
    const tips = [
      "📊 NGS Tip: Coverage 30x 是 WGS variant calling 的甜蜜點，<20x false positive 飆升。",
      "📊 NGS Tip: PCR-free library prep 避免 duplicate bias，但需要更多 input DNA (≥1 µg)。",
      "📊 NGS Tip: Read length 150bp paired-end 是 illumina 的最佳平衡點，超過效益遞減。",
      "📊 NGS Tip: BaseQuality Score Recalibration (BQSR) 用已知 SNP 做品質校正，必跑。",
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    return [textBubble(tip, THEME.fg)];
  },
};

const interviewJob: PushPayload = {
  topic: "interview",
  messages: async () => {
    // Reuse the same bank as the inline handler
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const bankPath = path.join(__dirname, "../bot/handlers/questions.json");
    const bank = JSON.parse(await readFile(bankPath, "utf8")).questions as Array<{ category: string; question: string; answer: string }>;
    const q = bank[Math.floor(Math.random() * bank.length)];
    return [textBubble(`💼 每日面試題\n\n${q.category}\n\nQ: ${q.question}\n\n提示：\n${q.answer.split("。")[0]}。\n\n👉 完整版：${TOPICS.find((t) => t.id === "interview")!.url}`, THEME.fg)];
  },
};

const blogJob: PushPayload = {
  topic: "blog",
  messages: async () => {
    // Reuse blog handler logic
    const mod = await import("../bot/handlers/blog");
    // crude: hit listPosts via dynamic import — not exposed, so fall back to disk walk
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const candidates = [
      path.resolve(process.cwd(), "../astro/src/content/blog"),
      path.resolve(process.cwd(), "astro/src/content/blog"),
    ];
    let dir: string | null = null;
    for (const p of candidates) {
      try { await fs.access(p); dir = p; break; } catch { /* skip */ }
    }
    if (!dir) return [textBubble("📖 本週無新文章", THEME.muted)];
    const entries = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
    if (!entries.length) return [textBubble("📖 本週無新文章", THEME.muted)];
    // pick most recent by file mtime
    const stats = await Promise.all(entries.map(async (f) => ({ f, t: (await fs.stat(path.join(dir!, f))).mtimeMs })));
    stats.sort((a, b) => b.t - a.t);
    const top = stats[0];
    return [textBubble(`📖 本週新文\n\n${top.f.replace(".md", "")}\n👉 ${TOPICS.find((t) => t.id === "blog")!.url}`, THEME.fg)];
  },
};

const JOBS: Record<TopicId, PushPayload | null> = {
  stock: stockJob,
  protein: proteinJob,
  gene: null,    // not yet
  ngs: ngsJob,
  mpnn: null,    // not push-relevant
  blog: blogJob,
  interview: interviewJob,
};

// ---- Quiet hours ----

function inQuietHours(now: Date, hhmmRange: string): boolean {
  // "22:00-08:00" → boolean (handles wrap-around)
  const [start, end] = hhmmRange.split("-");
  if (!start || !end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const a = toMin(start), b = toMin(end);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

// ---- Runner ----

export async function pushJob(topic: TopicId): Promise<{ subscribers: number; sent: number; failed: number; skipped: number }> {
  const job = JOBS[topic];
  if (!job) {
    logger.warn({ topic }, "push job not registered");
    return { subscribers: 0, sent: 0, failed: 0, skipped: 0 };
  }

  // Subscribers whose topics JSONB contains this topic id
  const subs = await db.execute(sql`
    SELECT user_id, push_quiet_hrs, muted
    FROM line_subscribers
    WHERE topics @> ${JSON.stringify([topic])}::jsonb
      AND muted = 0
  `);
  const rows = subs.rows as Array<{ user_id: string; push_quiet_hrs: string; muted: number }>;

  let sent = 0, failed = 0, skipped = 0;
  const now = new Date();
  for (const s of rows) {
    if (inQuietHours(now, s.push_quiet_hrs)) {
      skipped++;
      continue;
    }
    try {
      const messages = await job.messages(s.user_id);
      await pushMessage(s.user_id, messages);
      await db.execute(sql`UPDATE line_subscribers SET last_pushed_at = NOW() WHERE user_id = ${s.user_id}`);
      sent++;
    } catch (err) {
      failed++;
      logger.error({ err, userId: s.user_id, topic }, "push failed");
    }
  }

  logger.info({ topic, subscribers: rows.length, sent, failed, skipped }, "push job done");
  return { subscribers: rows.length, sent, failed, skipped };
}

// ---- Operator endpoint ----

import { Router, type IRouter, type Request, type Response } from "express";

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

export const pushRouter: IRouter = Router();

pushRouter.post("/line/push/:topic", async (req: Request, res: Response) => {
  if (!operatorOk(req.body?.password ?? req.query.password)) {
    return res.status(403).json({ ok: false, error: "operator password required" });
  }
  const topic = req.params.topic as TopicId;
  if (!(topic in JOBS)) {
    return res.status(400).json({ ok: false, error: `unknown topic: ${topic}` });
  }
  try {
    const result = await pushJob(topic);
    return res.json({ ok: true, topic, ...result });
  } catch (err) {
    logger.error({ err, topic }, "push endpoint failed");
    return res.status(500).json({ ok: false, error: "internal error" });
  }
});