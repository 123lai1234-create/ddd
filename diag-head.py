"""Check response headers for LRC to spot CORS / service worker issues"""
import urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')

req = urllib.request.Request('https://donttalk.vercel.app/music/13_%E6%99%82%E5%85%89%E8%86%A0%E5%9B%8A.lrc', method='GET')
r = urllib.request.urlopen(req, timeout=10)
print('--- Response headers ---')
for k, v in r.headers.items():
    print(f'  {k}: {v}')
print(f'\nBody first 200: {r.read()[:200].decode("utf-8", errors="replace")!r}')
