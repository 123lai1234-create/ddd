import subprocess
import json
import base64
import time

# Wait for page to settle
time.sleep(2)

# Take screenshot
r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'screenshot',
    json.dumps({'tabId': 751759855})
], capture_output=True)

data = json.loads(r.stdout.decode())
img_data = data['content']
if img_data.startswith('data:image/png;base64,'):
    img_data = img_data.replace('data:image/png;base64,', '')

img_bytes = base64.b64decode(img_data)
with open(r'D:\project\music_site2.png', 'wb') as f:
    f.write(img_bytes)

print("Screenshot saved to D:\\project\\music_site2.png")

# Get snapshot
r2 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'snapshot',
    json.dumps({'tabId': 751759855})
], capture_output=True)

data2 = json.loads(r2.stdout.decode())
content = json.loads(data2['content'])
nodes = content.get('nodes', [])

# Find music container
for node in nodes:
    if 'music-container' in node.get('selector', '').lower() or 'playlist' in node.get('selector', '').lower():
        print(f"\nSelector: {node.get('selector')}")
        print(f"Role: {node.get('role')}")
        print(f"Name: {node.get('name', '')[:200]}")
