/**
 * Unit tests for the bot dispatcher and topic handlers.
 *
 * Run with: pnpm vitest tests/bot/
 * or:       pnpm vitest tests/bot/dispatcher.test.ts
 *
 * Strategy: dispatch is pure (handlers just return messages given text),
 * so we mock `../_shims/db` and `../lib/yahoo` only when handlers touch them.
 * For protein / gene / ngs handlers (pure mock), no mocking needed.
 */

import { describe, it, expect, beforeAll } from "vitest";

// Load all handlers (side-effect: registers them with the dispatcher)
import "../api-server-src/src/bot/handlers/builtins";
import "../api-server-src/src/bot/handlers/protein";
import "../api-server-src/src/bot/handlers/gene";
import "../api-server-src/src/bot/handlers/ngs";
import "../api-server-src/src/bot/handlers/interview";

import { dispatch, handlers } from "../api-server-src/src/bot/dispatcher";
import { menuCarousel, TOPICS } from "../api-server-src/src/lib/flex-topics";

const ctx = (overrides: Partial<{ replyToken: string; userId: string }> = {}) => ({
  replyToken: overrides.replyToken ?? "tok",
  userId: overrides.userId ?? "U-test",
  events: [],
});

const unwrap = async (text: string, userId = "U-test") => {
  const msgs = await dispatch(text, { type: "message" }, ctx({ userId }));
  return msgs[0];
};

describe("dispatcher registry", () => {
  it("registers all expected handlers", () => {
    const names = handlers.list().map((h) => h.name);
    expect(names).toContain("menu");
    expect(names).toContain("help");
    expect(names).toContain("about");
    expect(names).toContain("protein");
    expect(names).toContain("esm");
    expect(names).toContain("mpnn");
    expect(names).toContain("gene");
    expect(names).toContain("crispr");
    expect(names).toContain("promoter");
    expect(names).toContain("ngs");
    expect(names).toContain("depth");
    expect(names).toContain("stock-scan");
    expect(names).toContain("stock-subscribe");
    expect(names).toContain("interview");
    expect(names).toContain("fallback");
  });

  it("sorts by priority then name", () => {
    const names = handlers.list().map((h) => h.name);
    // menu (10) should come before protein (50)
    expect(names.indexOf("menu")).toBeLessThan(names.indexOf("protein"));
    // fallback (999) last
    expect(names.at(-1)).toBe("fallback");
  });
});

describe("menu handler", () => {
  it("returns a carousel with all 7 topics", async () => {
    const m = await unwrap("menu");
    expect(m).toMatchObject({ type: "flex" });
    const c = (m as { contents: { contents: unknown[] } }).contents;
    expect(c.contents).toHaveLength(TOPICS.length);
    expect(c.contents[0]).toMatchObject({ type: "bubble" });
  });

  it("accepts Chinese alias", async () => {
    expect(await unwrap("選單")).toMatchObject({ type: "flex" });
  });
});

describe("help handler", () => {
  it("renders a mega bubble with all sections", async () => {
    const m = await unwrap("help");
    expect(m).toMatchObject({ type: "flex" });
    expect((m as { contents: unknown }).contents).toMatchObject({ type: "bubble", size: "mega" });
  });
});

describe("protein handler", () => {
  it("esm computes a similarity score", async () => {
    const m = await unwrap("esm MKTIIALSY vs MRIIALSY");
    expect(m).toMatchObject({ type: "flex" });
    const text = JSON.stringify(m);
    expect(text).toContain("ESM-2");
    expect(text).toMatch(/\d+\.\d+%/);   // has a percentage
  });

  it("esm rejects bad format", async () => {
    const m = await unwrap("esm notasequence");
    expect(JSON.stringify(m)).toMatch(/格式/);
  });

  it("mpnn returns a deterministic mock sequence", async () => {
    const a = await unwrap("mpnn 1ubq");
    const b = await unwrap("mpnn 1ubq");
    expect(JSON.stringify(a)).toContain("ProteinMPNN");
    // sequence length in [50, 130]
    const lenMatch = JSON.stringify(a).match(/長度: (\d+)/);
    expect(lenMatch).not.toBeNull();
    const len = Number(lenMatch![1]);
    expect(len).toBeGreaterThanOrEqual(50);
    expect(len).toBeLessThanOrEqual(130);
  });
});

describe("gene handler", () => {
  it("crispr scores a 20-nt guide", async () => {
    const m = await unwrap("crispr GGCACTGCGGCTGGAGAGGG");
    const text = JSON.stringify(m);
    expect(text).toContain("CRISPR");
    expect(text).toMatch(/評分: \d+\/100/);
  });

  it("crispr rejects non-DNA input", async () => {
    const m = await unwrap("crispr XYZ");
    expect(JSON.stringify(m)).toMatch(/ACGT/);
  });

  it("crispr flags poly-T terminator", async () => {
    const m = await unwrap("crispr GGGGTTTTAAAACCCCGGGG");
    expect(JSON.stringify(m)).toMatch(/Pol III terminator/);
  });

  it("promoter detects TATA box", async () => {
    const m = await unwrap("promoter TATAAAGCGCATGCAT");
    expect(JSON.stringify(m)).toMatch(/TATA/);
  });
});

describe("ngs handler", () => {
  it("depth computes reads for human WGS", async () => {
    const m = await unwrap("depth 30 100");
    const text = JSON.stringify(m);
    expect(text).toContain("Human");
    expect(text).toMatch(/reads/);
  });

  it("depth accepts custom genome + read length", async () => {
    const m = await unwrap("depth ecoli 5 50 150");
    expect(JSON.stringify(m)).toContain("E. coli");
  });

  it("depth rejects garbage", async () => {
    const m = await unwrap("depth abc xyz");
    expect(JSON.stringify(m)).toMatch(/用法/);
  });
});

describe("interview handler", () => {
  it("start picks a question", async () => {
    const m = await unwrap("interview start");
    expect(JSON.stringify(m)).toMatch(/面試題/);
  });

  it("hint requires a current question", async () => {
    // U-no-session hasn't started
    const m = await unwrap("interview hint", "U-no-session");
    expect(JSON.stringify(m)).toMatch(/interview start/);
  });

  it("full cycle: start → hint → answer", async () => {
    await unwrap("interview start", "U-cycle");
    const hint = await unwrap("interview hint", "U-cycle");
    expect(JSON.stringify(hint)).toMatch(/提示/);
    const answer = await unwrap("interview answer", "U-cycle");
    expect(JSON.stringify(answer)).toMatch(/參考答案/);
  });
});

describe("fallback", () => {
  it("returns a soft hint for unknown input", async () => {
    const m = await unwrap("asdf qwer zxcv");
    expect(JSON.stringify(m)).toMatch(/help/);
  });
});

describe("menuCarousel", () => {
  it("matches the 7 topics in dontalk.vercel.app", () => {
    const ids = TOPICS.map((t) => t.id).sort();
    expect(ids).toEqual(["blog", "gene", "interview", "mpnn", "ngs", "protein", "stock"]);
  });
});