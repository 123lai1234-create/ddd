import subprocess
import json
import sys

mavis_path = r'C:\Users\User\.mavis\bin\mavis.cmd'
args = ['browser', 'tool', 'navigate']
data = {'url': 'https://donttalk.vercel.app/music'}

proc = subprocess.Popen(
    [mavis_path] + args,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

result = proc.communicate(input=json.dumps(data).encode('utf-8'))
print(result[0].decode('utf-8') if result[0] else '')
print(result[1].decode('utf-8') if result[1] else '', file=sys.stderr)
