import urllib.request, time

urls = [
    'https://donttalk.vercel.app/music/03_%E4%B8%8D%E6%9C%8D%E8%BC%B8.lrc',
    'https://donttalk.vercel.app/music/03_%E4%B8%8D%E6%9C%8D%E8%BC%B8(%E5%84%AA%E5%8C%96%E7%89%88).mp3',
    'https://donttalk.vercel.app/music/tracks.json',
]

for u in urls:
    t = time.time()
    try:
        r = urllib.request.urlopen(u, timeout=10)
        body = r.read()
        ct = r.headers.get('content-type')
        ce = r.headers.get('content-encoding')
        print(f'{time.time()-t:.2f}s  {r.status}  {len(body):>8d}  ct={ct}  ce={ce}  {u}')
    except Exception as e:
        print(f'{time.time()-t:.2f}s  ERR {e}  {u}')
