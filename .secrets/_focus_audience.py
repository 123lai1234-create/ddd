import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} ===")
    print("STDOUT:", r.stdout)
    print("STDERR:", r.stderr)
    return r

# Highlight (visual outline) Audience tab 應該會 jump focus
call("highlight", {"tabId": 751771534, "selector": "body"})

# Wait a sec
call("wait", {"ms": 1500})

# Get all tabs after highlight
call("get_tabs", {})

# Then trigger a console.alert on audience tab to force user attention
call("eval", {"tabId": 751771534, "expression": "window.focus(); document.title = '👉👉 Audience 頁面已就緒 👈👈'"})

call("get_tabs", {})
