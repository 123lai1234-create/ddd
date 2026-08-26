import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} {json.dumps(args)[:300]} ===")
    out = r.stdout
    if len(out) > 6000:
        out = out[:6000] + "..."
    print("STDOUT:", out)
    print("STDERR:", r.stderr[:500] if r.stderr else "")
    return r

# Try various selector strategies for the "Add users" button which seems hidden in shadow DOM
selectors = [
    ("page_text body", "body"),
    ("exists input[type='email']", "input[type='email']"),
    ("exists mat-input", "input"),
    ("list text=Add users", "text=Add users"),
    ("list contains(text)", "div:has-text('Add users')"),
]

for desc, sel in selectors:
    print(f"\n--- {desc}: {sel}")
    call("query", {"tabId": TAB, "what": "exists", "selector": sel})

# Try text= syntax
print("\n--- text=Add")
call("query", {"tabId": TAB, "what": "text", "selector": "body", "value": "Add"})
