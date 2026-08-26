import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} {args} ===")
    out = r.stdout
    if len(out) > 2000:
        out = out[:2000] + "..."
    print("STDOUT:", out)
    print("STDERR:", r.stderr[:500] if r.stderr else "")
    return r

# Find Add users button using query
call("query", {"tabId": TAB, "what": "exists", "selector": "button:has-text('Add users')"})
call("query", {"tabId": TAB, "what": "list", "selector": "button"})
