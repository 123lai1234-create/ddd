import subprocess
import json

# Check for console errors
r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'errors',
    json.dumps({'tabId': 751759855, 'clear': False})
], capture_output=True)

print("=== Console Errors ===")
print(r.stdout.decode())

# Check for errors only
r2 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'errors',
    json.dumps({'tabId': 751759855, 'clear': True})
], capture_output=True)

print("\n=== Errors (cleared) ===")
print(r2.stdout.decode())
