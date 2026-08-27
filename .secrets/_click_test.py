import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} {json.dumps(args)[:200]} ===")
    out = r.stdout
    if len(out) > 1500:
        out = out[:1500] + "..."
    print("STDOUT:", out)
    print("STDERR:", r.stderr[:300] if r.stderr else "")
    return r

# Try various ways to click - maybe uid-based
# The snapshot I got earlier had uids e0, e1, etc. Let me try clicking by uid
test_selectors = [
    "uid=e7",  # the menu button
    "[uid='e7']",
    ":nth-match(button, 1)",  # Playwright special selectors
    "button >> nth=0",
    "text=Add users",
    "aria-ref=e7",
]
for sel in test_selectors:
    print(f"\n--- click sel={sel}")
    call("click", {"tabId": TAB, "selector": sel})
