import subprocess, sys, json, base64
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    return r

# click Add users (already clicked - let me wait then snapshot)
r = call("wait", {"tabId": TAB, "ms": 2000})
print("After wait:", r.stdout[:100])

# Snapshot
r = call("snapshot", {"tabId": TAB})
print("SNAPSHOT:", r.stdout[:4000])
