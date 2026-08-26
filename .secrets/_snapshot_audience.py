import subprocess, sys, json
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"=== {tool} ===")
    print("STDOUT:", r.stdout)
    print("STDERR:", r.stderr)
    return r

# Take accessibility snapshot of Audience page
call("snapshot", {"tabId": 751771534})
