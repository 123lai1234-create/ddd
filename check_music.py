import subprocess
import json

# Get active tab
r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'get_active_tab',
    json.dumps({})
], capture_output=True)
print("Active tab:", r.stdout.decode())

# Take screenshot
r2 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'screenshot',
    json.dumps({})
], capture_output=True)

data = json.loads(r2.stdout.decode())
img_data = data['content']
if img_data.startswith('data:image/png;base64,'):
    img_data = img_data.replace('data:image/png;base64,', '')

import base64
img_bytes = base64.b64decode(img_data)
with open(r'D:\project\music_check.png', 'wb') as f:
    f.write(img_bytes)
print("Screenshot saved")

# Check for console errors
r3 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'errors',
    json.dumps({'clear': False})
], capture_output=True)
print("Console errors:", r3.stdout.decode()[:2000])
