import subprocess, sys, json, base64
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# First, list tabs
r = call("get_tabs", {})
data = json.loads(r.stdout)
content = data["content"]
tabs = json.loads(content)
print("TABS:")
for t in tabs:
    print(f"  id={t['id']} active={t.get('active')} url={t.get('url','?')[:80]} title={t.get('title','?')[:60]}")

# Try screenshot with different parameter combos
combos = [
    {"tabId": TAB},
    {"tabId": str(TAB)},
    {"id": TAB},
]
for args in combos:
    print(f"\n=== screenshot {args}")
    r = call("screenshot", args)
    print("STDERR:", r.stderr[:300] if r.stderr else "(none)")
    out = r.stdout[:200] if r.stdout else "(none)"
    print("STDOUT:", out)
