#!/usr/bin/env python3
"""
LINE 26-card daily Flex carousel broadcast.
由 .github/workflows/line-push-daily.yml 每天 07:30 Asia/Taipei 觸發。

繞過 Vercel edge runtime（無法 reach api.line.me 的限制），直接從
GitHub Actions runner 打 LINE Messaging API。

Usage:
    LINE_CHANNEL_ACCESS_TOKEN=<token> python scripts/line_broadcast.py [--dry-run]
"""
import argparse
import http.client
import json
import os
import sys

# 與 astro/api/catchall.mjs 的 LINE_CARDS 同步 — 改任一邊要記得改另一邊
SITE_BASE = "https://donttalk.vercel.app"
# 用 http.client 而非 urllib.request：urllib 在 Python 3.11.16 + 含 CJK 的 JSON body
# 對 api.line.me POST 會在 putheader() raise UnicodeEncodeError (latin-1 can't encode CJK)。
# http.client 直接走 socket，繞過 urllib 內部那條編碼路徑。
LINE_BROADCAST_HOST = "api.line.me"
LINE_BROADCAST_PATH = "/v2/bot/message/broadcast"

CARDS = [
    # 基本面與消息面 (1-8)
    {"idx":  1, "cat": "基本面與消息面", "title": "月營收排行",     "url": "/revenue",                   "emoji": "📊"},
    {"idx":  2, "cat": "基本面與消息面", "title": "除息行事曆",     "url": "/exdiv",                     "emoji": "💰"},
    {"idx":  3, "cat": "基本面與消息面", "title": "法說會行程",     "url": "/conference",                "emoji": "📅"},
    {"idx":  4, "cat": "基本面與消息面", "title": "庫藏股快訊",     "url": "/buyback",                   "emoji": "🛡️"},
    {"idx":  5, "cat": "基本面與消息面", "title": "AI 資本支出",    "url": "/ai-capex",                  "emoji": "🤖"},
    {"idx":  6, "cat": "基本面與消息面", "title": "總體經濟指標",   "url": "/macro",                     "emoji": "🌍"},
    {"idx":  7, "cat": "基本面與消息面", "title": "大盤熱力圖",     "url": "/heatmap",                   "emoji": "🔥"},
    {"idx":  8, "cat": "基本面與消息面", "title": "AI 戰情室",      "url": "/ai-warroom",                "emoji": "🧠"},
    # ETF 持股分析 (9-14)
    {"idx":  9, "cat": "ETF 持股分析",   "title": "ETF 列表",       "url": "/etf",                       "emoji": "📋"},
    {"idx": 10, "cat": "ETF 持股分析",   "title": "ETF 篩選器",     "url": "/etf-filter",                "emoji": "🔍"},
    {"idx": 11, "cat": "ETF 持股分析",   "title": "ETF 持股明細",   "url": "/etf_holdings",              "emoji": "📑"},
    {"idx": 12, "cat": "ETF 持股分析",   "title": "ETF 持股樞紐",   "url": "/stock/etf_holdings_pivot",  "emoji": "🔄"},
    {"idx": 13, "cat": "ETF 持股分析",   "title": "ETF 持股追蹤",   "url": "/etf_holdings_tracker",      "emoji": "📈"},
    {"idx": 14, "cat": "ETF 持股分析",   "title": "升溫清單",       "url": "/warming",                   "emoji": "🌡️"},
    # 技術面 (15-20)
    {"idx": 15, "cat": "技術面",         "title": "漲幅排行",       "url": "/ranking",                   "emoji": "🏆"},
    {"idx": 16, "cat": "技術面",         "title": "強勢股觀察",     "url": "/uptrend-watch",             "emoji": "🚀"},
    {"idx": 17, "cat": "技術面",         "title": "賣太早回測",     "url": "/sold-too-early",            "emoji": "💸"},
    {"idx": 18, "cat": "技術面",         "title": "價格比較",       "url": "/price-compare",             "emoji": "⚖️"},
    {"idx": 19, "cat": "技術面",         "title": "大摩因子篩選",   "url": "/stock/stock-damo-filter",   "emoji": "🏛️"},
    {"idx": 20, "cat": "技術面",         "title": "訊號篩選 v2",    "url": "/signal-filter",             "emoji": "🎯"},
    # 加密貨幣 (21-23)
    {"idx": 21, "cat": "加密貨幣",       "title": "BTC 即時",       "url": "/btc",                       "emoji": "₿"},
    {"idx": 22, "cat": "加密貨幣",       "title": "加密回測",       "url": "/stock/backtest",            "emoji": "📉"},
    {"idx": 23, "cat": "加密貨幣",       "title": "匯率追蹤",       "url": "/currency",                  "emoji": "💱"},
    # 資產配置 (24-26)
    {"idx": 24, "cat": "資產配置",       "title": "投資組合再平衡", "url": "/rebalance",                 "emoji": "⚖️"},
    {"idx": 25, "cat": "資產配置",       "title": "期貨避險",       "url": "/futures",                   "emoji": "🛡️"},
    {"idx": 26, "cat": "資產配置",       "title": "投資儀表板",     "url": "/dashboard",                 "emoji": "📊"},
]


def make_bubble(card):
    return {
        "type": "bubble",
        "size": "micro",
        "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": "#6E5BD0", "paddingAll": "12px",
            "contents": [{
                "type": "text",
                "text": f"{card['idx']}/26 | {card['cat']}",
                "color": "#FFFFFF", "size": "sm", "weight": "bold"
            }]
        },
        "body": {
            "type": "box", "layout": "vertical", "spacing": "sm", "paddingAll": "14px",
            "contents": [
                {"type": "text", "text": card["emoji"], "size": "5xl", "align": "center"},
                {"type": "text", "text": card["title"], "size": "lg", "weight": "bold", "align": "center", "wrap": True},
                {"type": "text", "text": "網站頁面需要登入；LINE 僅回傳公開摘要。",
                 "size": "xxs", "color": "#999999", "align": "center", "wrap": True}
            ]
        },
        "footer": {
            "type": "box", "layout": "vertical",
            "contents": [{
                "type": "button", "style": "primary", "color": "#2E7D5B",
                "action": {"type": "uri", "label": "開啟網頁", "uri": SITE_BASE + card["url"]}
            }]
        }
    }


def post_broadcast(token, flex_payload):
    # 容錯：GitHub secret 可能被不小心貼上後面中文註解（會污染 Authorization header 變 CJK）。
    # HTTP header 規範只允許 ISO-8859-1，CJK 會讓 Python http.client putheader raise UnicodeEncodeError。
    # 取第一行當真 token，剩下的丟掉。
    clean_token = token.split("\n", 1)[0].strip()
    body = json.dumps({"messages": [flex_payload]}, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "Content-Length": str(len(body)),
    }
    conn = http.client.HTTPSConnection(LINE_BROADCAST_HOST, timeout=20)
    try:
        conn.request("POST", LINE_BROADCAST_PATH, body=body, headers=headers)
        resp = conn.getresponse()
        return resp.status, resp.read().decode("utf-8", errors="replace")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="build JSON only, don't POST")
    parser.add_argument("--batch-size", type=int, default=10, help="bubbles per carousel (LINE max 12)")
    args = parser.parse_args()

    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not token:
        print("ERROR: LINE_CHANNEL_ACCESS_TOKEN not set", file=sys.stderr)
        sys.exit(2)

    batches = []
    for i in range(0, len(CARDS), args.batch_size):
        batches.append(CARDS[i:i + args.batch_size])

    print(f"total cards: {len(CARDS)}")
    print(f"batches: {len(batches)} ({', '.join(str(len(b)) for b in batches)})")
    if args.dry_run:
        print("DRY RUN — not pushing")
        for b in batches:
            first, last = b[0]["idx"], b[-1]["idx"]
            flex = {
                "type": "flex",
                "altText": f"今日理財快訊 ({first}-{last}/26)",
                "contents": {"type": "carousel", "contents": [make_bubble(c) for c in b]}
            }
            print(f"  batch {first}-{last}: {len(json.dumps(flex, ensure_ascii=False))} bytes")
        return

    all_ok = True
    for b in batches:
        first, last = b[0]["idx"], b[-1]["idx"]
        flex = {
            "type": "flex",
            "altText": f"今日理財快訊 ({first}-{last}/26)",
            "contents": {"type": "carousel", "contents": [make_bubble(c) for c in b]}
        }
        status, body = post_broadcast(token, flex)
        ok = 200 <= status < 300
        all_ok = all_ok and ok
        print(f"  batch {first}-{last}: status={status} ok={ok} body={body[:120]}")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
