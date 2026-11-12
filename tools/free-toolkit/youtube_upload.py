# -*- coding: utf-8 -*-
"""
youtube_upload.py — YouTube 上傳管線（產線 1+ 的輸出直接上架）
=============================================================

把 `out/line1_lyric_mv/` 產出的歌詞影片上傳到 YouTube，標題／描述／標籤／縮圖／播放清單全自動。

子命令：
    meta     產生上傳 metadata（JSON + YouTube Studio 可匯入的 CSV）
    auth     跑 OAuth 授權流程，印出授權網址，存 refresh token
    upload   依 metadata 上傳（videos.insert resumable → thumbnails.set → playlistItems.insert）
    csv      只輸出 YouTube Studio 匯入用的 CSV（手動上傳用）
    status   顯示 token 狀態、頻道資訊、今日剩餘配額估算

憑證來源（依序）：
    環境變數 YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN
    → C:\\Users\\User\\.minimax\\agents\\mavis\\.env
refresh token 存在 repo 外的 D:\\Tools\\youtube-oauth\\token.json（不會進版控）。

實測踩坑：
  - 授權網址一定要帶 access_type=offline + prompt=consent，否則拿不到 refresh token，
    之後就無法批次上傳（只會拿到一次性的 access token）。
  - redirect_uri 必須跟 OAuth 客��端設定完全一致，這裡用 http://localhost:8080。
  - videos.insert 一定要用 resumable 上傳：母片 8-60MB，simple multipart 很容易中斷。
  - 配額 2026/6 起 videos.insert 移到獨立的 Video Uploads 配額（預設 100 次/天），
    舊制是 1600 單位 / 每日 10000 單位（約 6 支/天）。實際以 Console 顯示為準。
"""

from __future__ import print_function

import argparse
import base64
import csv
import hashlib
import json
import os
import re
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common  # noqa: E402

OUT_DIR = os.path.join(common.OUT_ROOT, "youtube")
MV_DIR = os.path.join(common.OUT_ROOT, "line1_lyric_mv")
TOKEN_FILE = r"D:\Tools\youtube-oauth\token.json"
ENV_FILES = [
    r"C:\Users\User\.minimax\agents\mavis\.env",
    r"C:\Users\User\.mavis\agents\mavis\.env",
]
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]
REDIRECT_URI = "http://localhost:8080"
AUTH_PORT = 8080
SITE = "https://donttalk.vercel.app"
BRAND = "不說"

try:
    import requests
except ImportError:
    raise SystemExit("[ERROR] 需要 requests：pip install requests")


# ------------------------------------------------------------------ 憑證
def load_env():
    """讀 .env（不覆蓋已存在的環境變數）。"""
    env = {}
    for path in ENV_FILES:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def credentials():
    env = load_env()
    cid = os.environ.get("YT_CLIENT_ID") or env.get("YT_CLIENT_ID")
    csec = os.environ.get("YT_CLIENT_SECRET") or env.get("YT_CLIENT_SECRET")
    if not cid:
        raise RuntimeError("找不到 YT_CLIENT_ID（.env 或環境變數）")
    return cid, csec


def token_path():
    p = os.environ.get("YT_TOKEN_FILE") or TOKEN_FILE
    return p


def load_token():
    """回傳 {'refresh_token':..., 'access_token':..., 'expires_at':...} 或 None。"""
    env = load_env()
    rt = os.environ.get("YT_REFRESH_TOKEN") or env.get("YT_REFRESH_TOKEN")
    if rt:
        return {"refresh_token": rt}
    p = token_path()
    if os.path.exists(p):
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except (ValueError, OSError):
            return None
    return None


def save_token(data):
    p = token_path()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return p


# ------------------------------------------------------------------ 授權
class _Callback(BaseHTTPRequestHandler):
    code = None
    error = None

    def do_GET(self):
        q = self.path.split("?", 1)[-1]
        m = re.search(r"[?&]code=([^&]+)", q)
        e = re.search(r"[?&]error=([^&]+)", q)
        if m:
            _Callback.code = m.group(1)
            body = ("<html><body style='font-family:sans-serif;padding:40px'>"
                    "<h2>YT 授權完成 ✅</h2>"
                    "<p>可以關掉這個分頁了。</p></body></html>")
            code = 200
        else:
            if e:
                _Callback.error = e.group(1)
                body = ("<html><body style='font-family:sans-serif;padding:40px'>"
                        "<h2>授權沒有完成 ❌</h2><p>Google 回的錯誤：%s</p>"
                        "<p>把這個錯誤告訴智能體，換一種 redirect URI 再試。</p>"
                        "</body></html>" % _Callback.error)
            else:
                body = ("<html><body style='font-family:sans-serif;padding:40px'>"
                        "<h2>沒有拿到 code ❌</h2><p>請重跑 auth 子命令。</p></body></html>")
            code = 400
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *a):
        pass


def cmd_auth(args):
    cid, csec = credentials()
    scope = " ".join(SCOPES)
    redirect = "http://localhost:%d" % args.port
    url = ("https://accounts.google.com/o/oauth2/v2/auth?"
           "client_id=%s&redirect_uri=%s&response_type=code&scope=%s"
           "&access_type=offline&prompt=consent&include_granted_scopes=true"
           % (cid, redirect, requests.utils.quote(scope)))

    print("=" * 70)
    print("步驟 1：開啟這個網址 → 選擇 JT Lai 頻道 → 按「允許」")
    print("=" * 70)
    print(url)
    print("")
    print("（授權頁會回到 %s；也可以複製上面網址到任何瀏覽器）" % redirect)
    print("GCP 端 Authorized redirect URIs 必須有 %s" % redirect)

    if args.open:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        srv = HTTPServer(("127.0.0.1", args.port), _Callback)
    except OSError as e:
        print("[ERROR] 埠 %d  bind 失敗：%s" % (args.port, e))
        print("       換一個：--port 8765（但 GCP 端必須有對應的 redirect URI）")
        return 1
    print("等待瀏覽器回呼（最多 %d 秒）…" % args.timeout)
    srv.timeout = 5
    deadline = time.time() + args.timeout
    code = None
    while time.time() < deadline:
        srv.handle_request()
        if _Callback.code:
            code = _Callback.code
            break
    srv.server_close()
    if not code:
        if _Callback.error:
            print("[ERROR] Google 回傳錯誤：%s" % _Callback.error)
            if _Callback.error == "redirect_uri_mismatch":
                print("       → GCP 的 Authorized redirect URIs 沒有 %s。" % redirect)
                print("       → 換 --port 試試，或去 GCP 補上這個 URI。")
        else:
            print("[ERROR] 沒收到授權碼，流程中止（通常是沒點「允許」）。")
        return 1

    print("收到授權碼，換 token…")
    payload = {
        "code": code,
        "client_id": cid,
        "redirect_uri": redirect,
        "grant_type": "authorization_code",
    }
    if csec:
        payload["client_secret"] = csec
    r = requests.post("https://oauth2.googleapis.com/token", data=payload, timeout=60)
    if r.status_code >= 400:
        print("[ERROR] token 交換失敗 %s：%s" % (r.status_code, r.text[:300]))
        return 1
    data = r.json()
    rt = data.get("refresh_token")
    if not rt:
        print("[WARN] 這次沒有拿到 refresh token（可能之前授權過）。")
        print("       如果有 access_token，仍可手動上傳一次，但無法批次。")
        return 1
    data["created_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    p = save_token(data)
    print("✅ refresh token 已存：%s" % p)
    return 0


# -------------------------------------------------------------- token / API
def access_token():
    tok = load_token()
    if not tok:
        raise RuntimeError("沒有 token，先跑：python youtube_upload.py auth")
    rt = tok.get("refresh_token")
    if not rt:
        raise RuntimeError("token 檔沒有 refresh_token")
    cid, csec = credentials()
    payload = {
        "refresh_token": rt,
        "client_id": cid,
        "grant_type": "refresh_token",
    }
    if csec:
        payload["client_secret"] = csec
    r = requests.post("https://oauth2.googleapis.com/token", data=payload, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError("refresh 失敗 %s：%s" % (r.status_code, r.text[:300]))
    data = r.json()
    data["refresh_token"] = rt
    save_token(data)
    return data["access_token"], data.get("scope", "")


def api_get(path, token, params=None):
    r = requests.get("https://www.googleapis.com/youtube/v3/" + path, headers={
        "Authorization": "Bearer " + token}, params=params or {}, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError("%s -> %s：%s" % (path, r.status_code, r.text[:300]))
    return r.json()


# ------------------------------------------------------------- metadata
def load_songs():
    mpath = os.path.join(common.DATA_DIR, "songs.json")
    data = common.load_json(mpath, {"songs": []})
    return data.get("songs", []), data.get("music_dir", "")


def slug_of(sid):
    return re.sub(r"[^\w-]+", "-", sid, flags=re.UNICODE).strip("-")


def build_meta(args):
    songs, _ = load_songs()
    rows = []
    for s in songs:
        if not s.get("audio"):
            continue
        mv_dir = os.path.join(MV_DIR, s["id"])
        if not os.path.isdir(mv_dir):
            continue
        title = s.get("title") or s["id"]
        hook = s.get("lyric") or ""
        slug = slug_of(s["id"])
        song_url = "%s/music/songs/%s/" % (SITE, slug)

        for kind, vfile, thumb in (
            ("long", "master.mp4", "thumb_yt_1280x720.jpg"),
            ("shorts", "vertical_1080x1920.mp4", "thumb_ig_1080x1080.jpg"),
        ):
            if kind not in args.kinds:
                continue
            fp = os.path.join(mv_dir, vfile)
            if not os.path.exists(fp):
                continue
            tp = os.path.join(mv_dir, thumb)
            if kind == "long":
                vt = "%s｜歌詞影片 - %s" % (title, BRAND)
                desc = (
                    "%s\n\n%s — %s\n\n"
                    "歌詞同步顯示的 MV（Lyric Video），"
                    "由免費工具鏈自動排版、算繪、混音。\n\n"
                    "▸ 完整歌詞手冊 PDF：%s/music/lyric-book.pdf\n"
                    "▸ 單曲頁：%s\n"
                    "▸ 全曲庫：%s/music/songs/\n\n"
                    "#%s #donttalk #歌詞影片 #華語音樂 #原創歌詞 #歌词MV"
                    % (hook, title, BRAND, SITE, song_url, SITE, BRAND)
                )
                playlist = "%s · 歌詞影片" % BRAND
            else:
                vt = "%s 歌詞版｜%s" % (title, BRAND)
                desc = (
                    "%s\n\n%s — %s\n\n"
                    "Shorts 歌詞版｜完整 MV：%s\n"
                    "歌詞手冊：%s/music/lyric-book.pdf\n\n"
                    "#Shorts #%s #donttalk #歌詞影片 #華語音樂"
                    % (hook, title, BRAND, song_url, SITE, BRAND)
                )
                playlist = "%s · Shorts" % BRAND

            tags = [BRAND, "donttalk", "歌詞影片", "歌詞MV", "华语音乐",
                    "華語流行", "原創歌詞", title]
            if hook:
                tags.append(hook)
            if kind == "shorts":
                tags += ["Shorts", "YouTubeShorts"]

            rows.append({
                "id": "%s-%s" % (s["id"], kind),
                "song_id": s["id"],
                "kind": kind,
                "video_file": fp,
                "thumb_file": tp if os.path.exists(tp) else "",
                "title": vt[:100],
                "description": desc,
                "tags": ",".join(tags[:30]),
                "category_id": "10",
                "privacy": args.privacy,
                "playlist": playlist,
                "song_url": song_url,
            })
    return rows


def cmd_meta(args):
    rows = build_meta(args)
    os.makedirs(OUT_DIR, exist_ok=True)
    jp = os.path.join(OUT_DIR, "youtube-upload.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump({"generated": time.strftime("%Y-%m-%d %H:%M:%S"),
                   "privacy": args.privacy, "items": rows}, f, ensure_ascii=False, indent=2)
    cp = os.path.join(OUT_DIR, "youtube-upload.csv")
    write_csv(rows, cp)
    print("metadata：%d 支" % len(rows))
    print("  JSON：%s" % jp)
    print("  CSV ：%s" % cp)
    for r in rows[:3]:
        print("   - [%s] %s" % (r["kind"], r["title"]))
    return 0


def write_csv(rows, path):
    """YouTube Studio 匯入格式：title / description / tags / visibility / playlist。"""
    fields = ["title", "description", "tags", "visibility", "playlist",
              "video_file", "thumb_file", "song_url"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            out = dict(r)
            out["visibility"] = r["privacy"]
            w.writerow(out)


def cmd_csv(args):
    rows = build_meta(args)
    os.makedirs(OUT_DIR, exist_ok=True)
    cp = os.path.join(OUT_DIR, "youtube-upload.csv")
    write_csv(rows, cp)
    print("CSV（%d 支）：%s" % (len(rows), cp))
    return 0


# --------------------------------------------------------------- 上傳
def upload_video(row, token, playlist_id=None, progress=True):
    """resumable 上傳一支影片；回傳 videoId。"""
    path = row["video_file"]
    size = os.path.getsize(path)
    body = {
        "snippet": {
            "title": row["title"],
            "description": row["description"],
            "tags": [t for t in row["tags"].split(",") if t],
            "categoryId": row["category_id"],
        },
        "status": {
            "privacyStatus": row["privacy"],
            "selfDeclaredMadeForKids": False,
        },
    }
    r = requests.post(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(size),
        },
        data=json.dumps(body).encode("utf-8"), timeout=120)
    if r.status_code >= 400:
        raise RuntimeError("建立上傳工作階段失敗 %s：%s" % (r.status_code, r.text[:300]))
    session = r.headers.get("Location") or r.headers.get("location")
    if not session:
        raise RuntimeError("沒有拿到 resumable session URI")

    chunk = 8 * 1024 * 1024
    with open(path, "rb") as f:
        offset = 0
        while offset < size:
            data = f.read(chunk)
            end = offset + len(data) - 1
            rr = requests.put(session, headers={
                "Content-Type": "video/mp4",
                "Content-Length": str(len(data)),
                "Content-Range": "bytes %d-%d/%d" % (offset, end, size),
            }, data=data, timeout=300)
            if rr.status_code not in (200, 201, 308):
                raise RuntimeError("上傳片段失敗 %s：%s" % (rr.status_code, rr.text[:300]))
            offset += len(data)
            if progress:
                sys.stdout.write("\r  上傳 %s：%.0f%%" % (os.path.basename(path),
                                                         100.0 * offset / size))
                sys.stdout.flush()
    if progress:
        print("")
    return json.loads(rr.content.decode("utf-8"))["id"]


def set_thumbnail(video_id, thumb, token):
    if not thumb or not os.path.exists(thumb):
        return "沒有縮圖可設"
    with open(thumb, "rb") as f:
        r = requests.post(
            "https://www.googleapis.com/youtube/v3/thumbnails/set",
            headers={"Authorization": "Bearer " + token,
                     "Content-Type": "image/jpeg"},
            params={"videoId": video_id, "onBehalfOfContentOwner": ""},
            data=f.read(), timeout=120)
    if r.status_code >= 400:
        return "縮圖失敗 %s：%s" % (r.status_code, r.text[:200])
    return "縮圖已設"


def ensure_playlist(name, token):
    """找或建播放清單，回傳 id。"""
    r = requests.get("https://www.googleapis.com/youtube/v3/playlists",
                     headers={"Authorization": "Bearer " + token},
                     params={"part": "snippet", "mine": "true", "maxResults": 50},
                     timeout=60)
    if r.status_code < 400:
        for pl in r.json().get("items", []):
            if pl["snippet"]["title"] == name:
                return pl["id"]
    body = {"snippet": {"title": name, "description": "%s 歌詞影片合集" % BRAND}}
    r = requests.post("https://www.googleapis.com/youtube/v3/playlists",
                      headers={"Authorization": "Bearer " + token,
                               "Content-Type": "application/json"},
                      data=json.dumps(body).encode("utf-8"), timeout=60)
    if r.status_code >= 400:
        raise RuntimeError("建立播放清單失敗 %s：%s" % (r.status_code, r.text[:300]))
    return r.json()["id"]


def add_to_playlist(playlist_id, video_id, token):
    body = {"snippet": {"playlistId": playlist_id, "resourceId": video_id}}
    r = requests.post("https://www.googleapis.com/youtube/v3/playlistItems",
                      headers={"Authorization": "Bearer " + token,
                               "Content-Type": "application/json"},
                      data=json.dumps(body).encode("utf-8"), timeout=60)
    return r.status_code < 400


def cmd_upload(args):
    jp = os.path.join(OUT_DIR, "youtube-upload.json")
    if not os.path.exists(jp):
        print("[ERROR] 找不到 %s，先跑 meta 子命令" % jp)
        return 2
    with open(jp, encoding="utf-8") as f:
        data = json.load(f)
    items = data["items"]
    if args.kinds:
        items = [i for i in items if i["kind"] in args.kinds]
    if args.limit:
        items = items[:args.limit]
    if not items:
        print("沒有要上傳的項目")
        return 0

    token, scope = access_token()
    print("token OK（scope：%s）" % scope)
    ch = api_get("channels", token, {"part": "snippet,statistics", "mine": "true"})
    for c in ch.get("items", []):
        print("頻道：%s（%s） 訂閱 %s" % (c["snippet"]["title"],
                                          c["id"], c.get("statistics", {}).get("subscriberCount", "?")))

    playlists = {}
    rep = common.Report("YouTube 上傳")
    log = []
    for row in items:
        t0 = time.time()
        try:
            pl_name = row.get("playlist") or ""
            if pl_name and pl_name not in playlists:
                playlists[pl_name] = ensure_playlist(pl_name, token)
            vid = upload_video(row, token)
            thumb_note = set_thumbnail(vid, row.get("thumb_file"), token)
            if playlists.get(pl_name):
                add_to_playlist(playlists[pl_name], vid, token)
            url = "https://www.youtube.com/watch?v=%s" % vid
            note = "%s | %s | %.0fs" % (vid, thumb_note, time.time() - t0)
            rep.step(row["title"][:40], True, note)
            log.append({"title": row["title"], "video_id": vid, "url": url,
                        "kind": row["kind"], "privacy": row["privacy"]})
        except Exception as e:
            rep.step(row["title"][:40], False, str(e)[:200])
            log.append({"title": row["title"], "error": str(e)[:300]})

    lp = os.path.join(OUT_DIR, "uploaded.json")
    with open(lp, "w", encoding="utf-8") as f:
        json.dump({"uploaded_at": time.strftime("%Y-%m-%d %H:%M:%S"), "items": log},
                  f, ensure_ascii=False, indent=2)
    print("\n上傳紀錄：%s" % lp)
    return 0 if rep.finish() else 1


def cmd_status(args):
    tok = load_token()
    if not tok:
        print("沒有 token。跑：python youtube_upload.py auth")
        return 2
    print("token 檔：%s" % token_path())
    token, scope = access_token()
    print("scope：%s" % scope)
    ch = api_get("channels", token, {"part": "snippet,contentDetails,statistics", "mine": "true"})
    for c in ch.get("items", []):
        print("頻道：%s（%s）" % (c["snippet"]["title"], c["id"]))
        print("  影片數：%s  訂閱：%s"
              % (c.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads", "-"),
                 c.get("statistics", {}).get("subscriberCount", "?")))
    vids = api_get("videos", token, {"part": "snippet,status",
                                     "chart": "mostPopular", "maxResults": 1})
    print("  可讀取影片清單 OK（%d 筆）" % len(vids.get("items", [])))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="YouTube 上傳管線")
    ap.add_argument("--privacy", default="private",
                    help="public / unlisted / private（預設 private）")
    ap.add_argument("--kinds", default="long,shorts",
                    help="要包含的版本：long,shorts")
    ap.add_argument("--limit", type=int, default=0, help="只上傳前 N 支")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("meta")
    sub.add_parser("csv")
    sub.add_parser("status")
    a_auth = sub.add_parser("auth")
    a_auth.add_argument("--open", action="store_true", help="自動開瀏覽器")
    a_auth.add_argument("--timeout", type=int, default=300, help="等回呼秒數")
    a_auth.add_argument("--port", type=int, default=8080,
                        help="授權回呼埠（預設 8080；要和 GCP 的 redirect URI 一致）")
    sub.add_parser("upload")
    args = ap.parse_args(argv)
    args.kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]

    common.header("YouTube 上傳管線")
    if args.cmd == "auth":
        return cmd_auth(args)
    if args.cmd == "meta":
        return cmd_meta(args)
    if args.cmd == "csv":
        return cmd_csv(args)
    if args.cmd == "upload":
        return cmd_upload(args)
    if args.cmd == "status":
        return cmd_status(args)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
