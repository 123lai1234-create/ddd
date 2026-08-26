import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# Look for the add users button through listing all interactive elements
# Try shadow-piercing selectors
selectors = [
    ("a.clickable-element", "clickable-element"),
    ("button[class*='mdc-button']", "mdc-button"),
    ("button.mat-mdc-button-base", "mat-mdc-button-base"),
    ("div[class*='button']", "div.button"),
    ("[role='button']", "role-button"),
]

for desc, sel in selectors:
    r = call("query", {"tabId": TAB, "what": "exists", "selector": sel})
    out = r.stdout + r.stderr
    print(f"--- {desc}: {out[:200]}")

# Also dump HTML structure
r = call("query", {"tabId": TAB, "what": "page_text", "selector": "body"})
print("FULL body text:", r.stdout[:1500])
