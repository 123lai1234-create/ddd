import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} {json.dumps(args)[:200]} ===")
    print("STDOUT:", r.stdout[:600])
    print("STDERR:", r.stderr[:300] if r.stderr else "")
    return r

# Try various focusing approaches
print("\n--- 1. navigate with hash to force reload")
call("navigate", {"tabId": TAB, "url": "https://console.cloud.google.com/auth/audience?project=herms-496408#auto-focus"})

print("\n--- 2. wait")
call("wait", {"ms": 2000, "tabId": TAB})

print("\n--- 3. get_tabs")
call("get_tabs", {})

print("\n--- 4. Try press Ctrl+End + scroll to bottom")
call("press_key", {"tabId": TAB, "key": "End", "modifiers": ["Control"]})

print("\n--- 5. wait more")
call("wait", {"ms": 1500, "tabId": TAB})

print("\n--- 6. get_tabs again")
call("get_tabs", {})
