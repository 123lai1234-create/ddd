import subprocess, sys, json, re
mavis = r"C:\Users\User\.mavis\bin\mavis.cmd"
TAB = 751771534

def call(tool, args):
    args_str = json.dumps(args)
    r = subprocess.run([mavis, "browser", "tool", tool, args_str], capture_output=True, text=True, shell=False)
    print(f"RC={r.returncode}")
    print(f"STDOUT[:300]={r.stdout[:300]}")
    print(f"STDERR[:300]={r.stderr[:300] if r.stderr else ''}")
    return r

# Try with retry on empty
for attempt in range(3):
    r = call("query", {"tabId": TAB, "what": "page_text", "selector": "body"})
    if r.stdout.strip():
        try:
            data = json.loads(r.stdout)
            content = data.get("content", "")
            m = re.search(r"(\d+)\s*位使用", content)
            if m:
                print(f"\n>>> COUNT: {m.group(0)} (number={m.group(1)})")
                sys.exit(0)
            else:
                print(f"\n>>> COUNT: NOT FOUND in page text")
                print(f"Content snippet: {content[:200]}")
                sys.exit(0)
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
    if attempt < 2:
        import time
        time.sleep(2)
print("Failed after 3 attempts")
