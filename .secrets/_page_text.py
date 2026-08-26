import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} {json.dumps(args)[:200]} ===")
    out = r.stdout
    if len(out) > 4000:
        out = out[:4000] + "..."
    print("STDOUT:", out)
    print("STDERR:", r.stderr[:300] if r.stderr else "")
    return r

# Get page text
call("query", {"tabId": TAB, "what": "page_text"})
