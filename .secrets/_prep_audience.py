import subprocess, sys, json, base64
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# Navigate Audience tab to clean URL (no #auto-focus)
r = call("navigate", {"tabId": TAB, "url": "https://console.cloud.google.com/auth/audience?project=herms-496408"})
print("Navigate:", r.stdout[:200])

# Wait
r = call("wait", {"ms": 2000, "tabId": TAB})
print("Wait:", r.stdout[:100])

# Take a screenshot of Audience tab - this will be visible tab actually
r = call("screenshot", {"tabId": TAB})
data = json.loads(r.stdout)
content_b64 = data["content"]
prefix = "data:image/png;base64,"
if content_b64.startswith(prefix):
    img_b64 = content_b64[len(prefix):]
    img_bytes = base64.b64decode(img_b64)
    out_path = r"D:\project\.secrets\_audience_v3.png"
    with open(out_path, "wb") as f:
        f.write(img_bytes)
    print(f"Saved {len(img_bytes)} bytes to {out_path}")

# Verify page text still has the user count
r = call("query", {"tabId": TAB, "what": "page_text", "selector": "body"})
pt = json.loads(r.stdout)["content"]
import re
m = re.search(r"(\d+)\s*位使用", pt)
print(f"\nUser count check: {m.group(0) if m else 'NOT FOUND'}")
