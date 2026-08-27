import subprocess
import json

r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'query',
    json.dumps({'tabId': 751759855, 'selector': 'main', 'mode': 'html'})
], capture_output=True)

print("STDOUT:", r.stdout.decode()[:5000])
print("STDERR:", r.stderr.decode()[:1000])
