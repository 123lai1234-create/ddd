import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# Wait a bit more, then dump page text
r = call("wait", {"ms": 3000, "tabId": TAB})
print("WAIT:", r.stdout[:100])

r = call("query", {"tabId": TAB, "what": "page_text", "selector": "body"})
print("PAGE TEXT:", r.stdout[:3500])
