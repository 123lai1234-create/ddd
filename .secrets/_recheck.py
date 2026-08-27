import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# Check tabs
r = call("get_tabs", {})
data = json.loads(r.stdout)
content = data["content"]
tabs = json.loads(content)
print("TABS NOW:")
for i, t in enumerate(tabs):
    print(f"  [{i}] id={t['id']} active={t.get('active')} url={t.get('url','?')[:90]}")

# Let's also try to close the FIRST tab (DeepSeek homepage) to shift things
# Find DeepSeek homepage tab
deepseek_home = None
for t in tabs:
    if "deepseek.com" in t.get('url','') and "api_keys" not in t.get('url',''):
        deepseek_home = t
        break

if deepseek_home:
    print(f"\nFound DeepSeek homepage: {deepseek_home['id']}")
    # Don't close it - might disturb JT
