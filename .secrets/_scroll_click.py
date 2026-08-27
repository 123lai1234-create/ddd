import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# Scroll down then click Add users
print("--- Scroll")
r = call("scroll", {"tabId": TAB, "y": 600, "x": 0})
print(r.stdout[:200], r.stderr[:200])

print("--- Wait")
r = call("wait", {"ms": 1000, "tabId": TAB})
print(r.stdout[:200])

print("--- Click Add users with text= selector")
r = call("click", {"tabId": TAB, "selector": "text=Add users"})
print(r.stdout[:200], r.stderr[:200])

print("--- Wait for dialog")
r = call("wait", {"ms": 3000, "tabId": TAB})
print(r.stdout[:100])

print("--- Page text")
r = call("query", {"tabId": TAB, "what": "page_text", "selector": "body"})
print(r.stdout[:4000])
