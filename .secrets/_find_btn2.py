import subprocess, sys, json, os
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} {args_str[:200]} ===")
    out = r.stdout
    if len(out) > 3000:
        out = out[:3000] + "..."
    print("STDOUT:", out)
    print("STDERR:", r.stderr[:500] if r.stderr else "")
    return r

# Try multiple selector strategies for "Add users" button
selectors = [
    "button:contains('Add users')",
    "button:contains('Add')",
    "[aria-label*='Add users' i]",
    "button[aria-label='Add users']",
    "*[role='button']",
    "button",
    ".cfc-base-cta-button",
    "[class*='add']",
]

for sel in selectors:
    print(f"--- Trying selector: {sel}")
    r = call("query", {"tabId": TAB, "what": "list", "selector": sel, "limit": 20})
