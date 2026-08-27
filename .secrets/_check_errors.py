import subprocess, sys, json, base64
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# Take screenshot to PNG & save
r = call("screenshot", {"tabId": TAB})
data = json.loads(r.stdout)
content_b64 = data["content"]
prefix = "data:image/png;base64,"
if content_b64.startswith(prefix):
    img_b64 = content_b64[len(prefix):]
    img_bytes = base64.b64decode(img_b64)
    out_path = r"D:\project\.secrets\_audience_screenshot2.png"
    with open(out_path, "wb") as f:
        f.write(img_bytes)
    print(f"Saved {len(img_bytes)} bytes")

# Get errors / console messages
r = call("errors", {"tabId": TAB})
print("ERRORS:", r.stdout[:600], r.stderr[:300])

r = call("console", {"tabId": TAB, "limit": 20})
print("CONSOLE:", r.stdout[:1000], r.stderr[:300])
