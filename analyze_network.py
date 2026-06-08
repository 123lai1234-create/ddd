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
sizes = [x.get('responseHeadersSize', 0) + x.get('requestHeadersSize', 0) for x in requests]
print(f"Total header size (approx): {sum(sizes)/1024:.1f} KB")
print("\nSample requests:")
for x in requests[:10]:
    print(f"  {x.get('method')} {x.get('url', '')[:80]} - {x.get('statusCode')}")
