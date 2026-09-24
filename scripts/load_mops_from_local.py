#!/usr/bin/env python3
"""
MOPS private placement / buyback loader — local parse + edge INSERT.

Vercel Hobby edge function:
  - 60s execution time limit
  - 4.5MB request body limit
6.7MB MOPS HTML page breaks both. So: download locally, parse to JSON rows,
send batches of ≤2000 rows as JSON. Edge just INSERTs.

Usage:
  python scripts/load_mops_from_local.py private
  python scripts/load_mops_from_local.py buyback
"""
import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.request

MOPS_API = "https://mops.twse.com.tw/mops/api/redirectToOld"
PRIVATE_BATCH = 1500
BUYBACK_BATCH = 50


def mops_post(api_name: str, parameters: dict) -> str:
    payload = {
        "apiName": api_name,
        "parameters": {"encodeURIComponent": 1, "step": 1, "firstin": 1, "off": 1, "TYPEK": "all", **parameters},
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(MOPS_API, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0")
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        return json.loads(r.read())["result"]["url"]


def mops_fetch(url: str) -> str:
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "Mozilla/5.0")
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
        return r.read().decode("utf-8", errors="ignore")


def edge_post(edge_base: str, path: str, payload: dict) -> dict:
    url = edge_base.rstrip("/") + path
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        return {"ok": False, "error": f"HTTP {e.code}", "body": err_body[:500]}


def mops_date_to_iso(s: str) -> str:
    if not s: return None
    s = s.strip()
    m = re.match(r"^(\d{2,3})/(\d{1,2})/(\d{1,2})$", s)
    if not m: return None
    y = int(m.group(1)); y = (y + 1911) if (y < 200) else y
    return f"{y}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"


def parse_private_html(html: str):
    """Returns deduped list of {announce_date, code, name, purpose}."""
    row_re = re.compile(r'<tr[^>]*class="(?:odd|even)"[^>]*>(.*?)</tr>', re.DOTALL)
    td_re = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
    inp_re = re.compile(r"name=['\"]([^'\"]+)['\"][^>]*value=['\"]([^'\"]*)['\"]")
    text_only = lambda s: re.sub(r"<[^>]+>", "", s).replace("&nbsp;", " ").strip()
    out = {}  # key: code|date → row
    for m in row_re.finditer(html):
        cells = td_re.findall(m.group(1))
        if len(cells) < 3: continue
        code = text_only(cells[0])
        name = text_only(cells[1])
        kind = text_only(cells[2])
        if not re.match(r"^\d{4,6}$", code): continue
        decide = None
        for im in inp_re.finditer(cells[3] or ""):
            if im.group(1) == "decide_date":
                decide = im.group(2); break
        announce = mops_date_to_iso(decide)
        key = f"{code}|{announce or 'null'}"
        if key in out: continue
        out[key] = {"announce_date": announce, "code": code, "name": name, "purpose": kind}
    return list(out.values())


def parse_buyback_segments(combined: str):
    """combined = '<!--MOPS:code:name-->\\n<html>\\n<!--MOPS:code2:name2-->\\n<html2>...'"""
    parts = re.split(r"<!--MOPS:(\d+):([^>]+?)-->", combined)
    out = []
    for i in range(1, len(parts), 3):
        code = parts[i]; name = parts[i+1]; seg = parts[i+2] or ""
        row_re = re.compile(r'<tr[^>]*class="(?:odd|even)"[^>]*>(.*?)</tr>', re.DOTALL)
        td_re = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
        text_only = lambda s: re.sub(r"<[^>]+>", "", s).replace("&nbsp;", " ").strip()
        for m in row_re.finditer(seg):
            cells = td_re.findall(m.group(1))
            if len(cells) < 2: continue
            seq = text_only(cells[0]); date = text_only(cells[1])
            out.append({"code": code, "name": name, "board_resolution_date": mops_date_to_iso(date), "sequence": seq})
    return out


def load_private(edge_base: str, password: str):
    print(f"[private] mops_post…")
    url = mops_post("ajax_t116sb01", {"co_id": ""})
    print(f"[private] fetch result.url (~6MB)…")
    t0 = time.time()
    html = mops_fetch(url)
    print(f"[private] downloaded {len(html):,} bytes in {time.time()-t0:.1f}s")
    rows = parse_private_html(html)
    print(f"[private] parsed {len(rows):,} unique rows")
    offset = 0
    total = 0
    while offset < len(rows):
        chunk = rows[offset:offset + PRIVATE_BATCH]
        payload = {
            "password": password,
            "dataset": "private",
            "rows": chunk,  # pre-parsed JSON rows
        }
        r = edge_post(edge_base, "/api/admin/load/mops_rows", payload)
        if not r.get("ok"):
            print(f"[private] chunk {offset}–{offset + len(chunk)} FAILED: {r}")
            return
        total += r.get("inserted", 0)
        print(f"[private] chunk {offset}–{offset + len(chunk)} inserted={r.get('inserted')}")
        offset += len(chunk)
    print(f"[private] DONE: {total:,} rows inserted")


def load_buyback(edge_base: str, password: str):
    print(f"[buyback] getting watchlist from /api/stocks…")
    with urllib.request.urlopen("https://donttalk.vercel.app/api/stocks", timeout=30) as r:
        watch = json.loads(r.read())
    codes = [s["code"] for s in watch if s.get("code")]
    if not codes:
        print("[buyback] no watchlist"); return
    print(f"[buyback] {len(codes)} codes, accumulating rows…")
    for j, code in enumerate(codes, 1):
        try:
            url = mops_post("ajax_t35sb01_q1", {"co_id": code})
            h = mops_fetch(url)
            rows = parse_buyback_segments(f"<!--MOPS:{code}:{code}-->\n{h}")
            if not rows: continue
            payload = {"password": password, "dataset": "buyback", "rows": rows}
            r = edge_post(edge_base, "/api/admin/load/mops_rows", payload)
            print(f"[buyback] {j}/{len(codes)} {code}: parsed={len(rows)} inserted={r.get('inserted', '?')}")
        except Exception as e:
            print(f"[buyback] {code} failed: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset", choices=["private", "buyback"])
    ap.add_argument("--password", default=os.environ.get("OPERATOR_PASSWORD", "test123"))
    ap.add_argument("--edge", default=os.environ.get("EDGE_BASE", "https://donttalk.vercel.app"))
    args = ap.parse_args()
    if args.dataset == "private":
        load_private(args.edge, args.password)
    else:
        load_buyback(args.edge, args.password)


if __name__ == "__main__":
    main()