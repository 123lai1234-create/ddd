import subprocess
import json

r = subprocess.run([
    r'C:\Users\User\.mavis\bin\mavis.cmd',
    'browser', 'tool', 'network_requests',
    json.dumps({'tabId': 751759855, 'clear': True})
], capture_output=True)

data = json.loads(r.stdout.decode())
requests = data.get('content', [])
print(f"Total requests: {len(requests)}")
print(f"Type of requests: {type(requests)}")

if requests and isinstance(requests[0], dict):
    print("\nSample requests:")
    for x in requests[:10]:
        url = x.get('url', '')
        print(f"  {x.get('method')} {url[:80]} - {x.get('statusCode')}")
elif requests and isinstance(requests[0], str):
    print("\nFirst few requests (as strings):")
    for x in requests[:5]:
        print(f"  {x[:100]}")
