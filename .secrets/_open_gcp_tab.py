import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} ===")
    print("STDOUT:", r.stdout)
    print("STDERR:", r.stderr)
    print("RC:", r.returncode)
    return r

# 1. 確認當前所有 tabs
r = call("get_tabs", {})

# 2. 切到新開的 tab 751771534
call("navigate", {"tabId": 751771534, "url": "https://console.cloud.google.com/auth/audience?project=herms-496408"})
