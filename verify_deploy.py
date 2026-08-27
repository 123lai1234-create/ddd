import subprocess
import json
import base64
import time

# Navigate to the music page
r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'navigate',
    json.dumps({'tabId': 751759855, 'url': 'https://donttalk.vercel.app/music'})
], capture_output=True)

print("Navigated:", r.stdout.decode())

# Wait for page to load
time.sleep(3)

# Take screenshot
r2 = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'screenshot',
    json.dumps({'tabId': 751759855})
], capture_output=True)

data = json.loads(r2.stdout.decode())
img_data = data['content']
if img_data.startswith('data:image/png;base64,'):
    img_data = img_data.replace('data:image/png;base64,', '')

img_bytes = base64.b64decode(img_data)
with open(r'D:\project\music_optimized.png', 'wb') as f:
    f.write(img_bytes)

print("Screenshot saved to D:\\project\\music_optimized.png")
