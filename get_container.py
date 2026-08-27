import subprocess
import json

r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'query',
    json.dumps({'tabId': 751759855, 'selector': '.music-container', 'mode': 'html'})
], capture_output=True)

print("STDOUT:", r.stdout.decode()[:5000])

# Also get page title
r2 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'query',
    json.dumps({'tabId': 751759855, 'selector': 'title', 'mode': 'text'})
], capture_output=True)
print("\nTitle:", r2.stdout.decode())
