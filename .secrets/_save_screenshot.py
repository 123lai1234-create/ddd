import subprocess, sys, json, base64, os
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

r = call("screenshot", {"tabId": TAB})
data = json.loads(r.stdout)
content_b64 = data["content"]  # data:image/png;base64,XXXX
prefix = "data:image/png;base64,"
assert content_b64.startswith(prefix)
img_b64 = content_b64[len(prefix):]
img_bytes = base64.b64decode(img_b64)
out_path = r"D:\project\.secrets\_audience_screenshot.png"
with open(out_path, "wb") as f:
    f.write(img_bytes)
print(f"Saved {len(img_bytes)} bytes to {out_path}")
