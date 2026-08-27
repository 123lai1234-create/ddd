import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

r = call("get_tabs", {})
data = json.loads(r.stdout)
content = data["content"]
tabs = json.loads(content)
print("TABS:")
for t in tabs:
    print(f"  id={t['id']} active={t.get('active')} window={t.get('windowId')} url={t.get('url','?')[:100]} title={t.get('title','?')[:80]}")
