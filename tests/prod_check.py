# production check
import urllib.request, urllib.error
for path in ("/f1/A0003", "/api/line/health", "/f1/index.html"):
    url = f"https://donttalk.vercel.app{path}"
    try:
        method = "POST" if path == "/f1/A0003" else "GET"
        body = b"{}" if method == "POST" else None
        headers = {"content-type": "application/json"} if method == "POST" else {}
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        r = urllib.request.urlopen(req, timeout=10)
        print(f"PROD {method} {path}  -> HTTP {r.status}  body.len={len(r.read())}")
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"PROD {method} {path}  -> HTTP {e.code}  body.len={len(body)}  snippet={body[:120]!r}")
    except Exception as e:
        print(f"PROD {method} {path}  -> ERR {type(e).__name__}: {e}")
