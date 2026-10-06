#!/usr/bin/env python3
"""
Trigger manual Render deploy for donttalk-catchall.
Usage:
  RENDER_TOKEN=<fresh-token-from-render-dashboard> python deploy.py
  RENDER_TOKEN=<token> python deploy.py --service srv-XXXXX

Get fresh token:
  Render dashboard → Account Settings → API Keys → Create API Key
  (or render.yaml "autoDeploy" trigger via git push only works if branch matches)

Last known service id: srv-davmbl8u01pc73fatrgg
"""
import os, json, sys, argparse, urllib.request

API = "https://api.render.com/v1"

def http(method, url_path, body=None):
    token = os.environ.get("RENDER_TOKEN")
    if not token:
        sys.exit("RENDER_TOKEN env var required. Get one from Render dashboard.")
    req = urllib.request.Request(
        f"{API}{url_path}",
        method=method,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--service", default="srv-davmbl8u01pc73fatrgg",
                   help="Render service id (default: donttalk-catchall)")
    p.add_argument("--list", action="store_true",
                   help="List recent deploys and exit")
    args = p.parse_args()

    if args.list:
        code, data = http("GET", f"/services/{args.service}/deploys?limit=5")
        if code != 200:
            sys.exit(f"list failed: {code} {data}")
        for d in data[:5]:
            commit = d.get("commit") or {}
            msg = (commit.get("message") or "(no message)") if isinstance(commit, dict) else "(no commit)"
            first_line = msg.splitlines()[0] if msg else "(empty)"
            print(f"{d.get('createdAt','?'):<30} {d.get('status','?'):<12} {first_line}")
        return

    print(f"Triggering deploy on {args.service} ...")
    code, data = http("POST", f"/services/{args.service}/deploys", body={"clearCache": "do_not_clear"})
    if code in (200, 201, 202):
        # Response shape: {"id": "...", "status": "...", ...} or wrapped in {"deploy": {...}}
        deploy_obj = data.get("deploy") if isinstance(data.get("deploy"), dict) else data
        deploy_id = deploy_obj.get("id") or data.get("id", "?")
        print(f"[OK] Deploy triggered: {deploy_id}")
        print(f"  Track: {API}/services/{args.service}/deploys/{deploy_id}")
        print(f"  Wait 1-3 min, then test: curl https://donttalk-catchall.onrender.com/api/signal_filter")
    else:
        sys.exit(f"deploy failed: {code} {json.dumps(data, indent=2)}")

if __name__ == "__main__":
    main()