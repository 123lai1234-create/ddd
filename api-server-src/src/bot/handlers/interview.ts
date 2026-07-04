/**
 * 💼 Interview handler — random question bank for mock interviews.
 *
 *   interview start        → 隨機出 1 題
 *   interview hint         → 該題提示
 *   interview answer       → 參考答案
 *   interview              → 主題摘要
 *
 * Question bank lives in JSON next to this file (questions.json) so it's
 * easy to grow without touching code.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Handler, Ctx } from "../dispatcher";
import type { LineMessage } from "../../lib/line";
import { topicCard, TOPICS, THEME, textBubble } from "../../lib/flex-topics";

const T = TOPICS.find((t) => t.id === "interview")!;

interface Question {
  id: string;
  category: string;
  question: string;
  hint: string;
  answer: string;
}

let bank: Question[] | null = null;
async function loadBank(): Promise<Question[]> {
  if (bank) return bank;
  const file = path.join(__dirname, "questions.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    bank = JSON.parse(raw);
  } catch {
    // fallback: tiny inline bank so the bot still works
    bank = [
      {
        id: "esm2-1",
        category: "Protein AI",
        question: "ESM-2 跟傳統 one-hot encoding 差在哪？",
        hint: "想想 transformer 怎麼學 context。",
        answer: "ESM-2 是 transformer-based protein language model，從大量序列中學 context-aware embedding；one-hot 只有位置資訊、無語意。ESM-2 embedding 可用於相似度、結構預測下游任務。",
      },
      {
        id: "bo-1",
        category: "Optimization",
        question: "Bayesian Optimization 為什麼適合蛋白質設計這類黑盒函數？",
        hint: "想想樣本成本 vs 評估次數。",
        answer: "BO 用 surrogate (GP) + acquisition function 樣本高效，適合濕實驗 / 昂貴 oracle（蛋白質 fitness 一次要好幾小時）。比 grid search / random search 樣本少 10-100x。",
      },
      {
        id: "crispr-1",
        category: "Gene",
        question: "CRISPR-Cas9 的 off-target 怎麼評估？",
        hint: "想想 PAM 序列 + mismatch tolerance。",
        answer: "GUIDE-seq / CIRCLE-seq 全基因體定序找 off-target cleavage；in silico 用 sgRNA 對基因體做 mismatch search + 機器學習評分 (CFD / MIT score)。",
      },
    ];
  }
  return bank!;
}

// Session state: per-user current question
const session = new Map<string, string>();

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const interview: Handler = {
  name: "interview",
  priority: 50,
  match: (t) => /^(interview|面試)(\s|$)/i.test(t.trim()),
  run: async (text, ctx) => {
    const arg = text.replace(/^interview\s*/i, "").trim().toLowerCase();
    const uid = ctx.userId ?? "anon";

    if (!arg || arg === "menu") {
      return [topicCard(T, `${T.blurb}\n\n指令：\n• interview start — 隨機出 1 題\n• interview hint — 提示\n• interview answer — 參考答案`, {
        buttons: [
          { label: "🎲 隨機出題", text: "interview start", color: T.color },
          { label: "完整版 →", uri: T.url },
        ],
      })];
    }

    if (arg === "start" || arg === "next") {
      const bank = await loadBank();
      const q = pickRandom(bank);
      session.set(uid, q.id);
      return [textBubble(
        `💼 ${q.category} 面試題\n\nQ: ${q.question}\n\n輸入 \`interview hint\` 看提示，\n\`interview answer\` 看參考答案。`,
        THEME.fg,
      )];
    }

    if (arg === "hint" || arg === "answer") {
      const qid = session.get(uid);
      if (!qid) return [textBubble("還沒出題，輸入 `interview start`", THEME.muted)];
      const bank = await loadBank();
      const q = bank.find((x) => x.id === qid);
      if (!q) return [textBubble("題目遺失，輸入 `interview start` 重新抽", THEME.red)];
      const body = arg === "hint" ? `💡 提示\n\n${q.hint}` : `📝 參考答案\n\n${q.answer}`;
      return [textBubble(body, THEME.fg)];
    }

    return [textBubble("指令：`start` / `hint` / `answer`", THEME.muted)];
  },
};
handlers.register(interview);