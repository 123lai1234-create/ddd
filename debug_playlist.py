import subprocess
import json

# Check scripts loaded
r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'query',
    json.dumps({'tabId': 751759881, 'selector': 'script', 'mode': 'list'})
], capture_output=True)
print("Scripts:", r.stdout.decode()[:5000])

# Check playlist content
r2 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'query',
    json.dumps({'tabId': 751759881, 'selector': '#playlist', 'mode': 'html'})
], capture_output=True)
print("\nPlaylist HTML:", r2.stdout.decode()[:3000])

# Check if music-list.js is loaded
r3 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'query',
    json.dumps({'tabId': 751759881, 'mode': 'text', 'pattern': 'window.DEFAULT_PLAYLIST'})
], capture_output=True)
print("\nWindow check:", r3.stdout.decode()[:1000])
