import subprocess
import json
import sys

mavis_path = r'C:\Users\User\.mavis\bin\mavis.cmd'
args = ['browser', 'tool', 'navigate', '{"url":"https://donttalk.vercel.app/music"}']

proc = subprocess.Popen(
    [mavis_path] + args,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

result = proc.communicate()
print("STDOUT:", result[0].decode('utf-8') if result[0] else '')
print("STDERR:", result[1].decode('utf-8') if result[1] else '', file=sys.stderr)
