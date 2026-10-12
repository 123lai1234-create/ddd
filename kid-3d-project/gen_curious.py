"""Generate the missing curious expression by reusing character_front.jpg as the source.

Avoids the PowerShell heredoc JSON-escape bug by writing the args with json.dumps
and calling the matrix connector via mcode-tools.
"""
import json
import subprocess
import sys
from pathlib import Path

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")

# 1. upload character_front.jpg -> fresh signed URL
up = subprocess.run(
    [r"C:\Users\User\.minimax\bin\mcode-tools.cmd", "upload-temp-url", str(PROJ / "character_front.jpg")],
    capture_output=True, text=True, check=True,
)
up_info = json.loads(up.stdout)
temp_url = up_info["temp_url"]
print(f"[upload] bytes={up_info['bytes']} mime={up_info['mime_type']} expires_in={up_info['expires_in_seconds']}s")
print(f"[upload] temp_url={temp_url[:120]}...")

# 2. build generate_image args
prompt = (
    "cute chibi Asian baby boy looking up curiously with big wondering eyes, "
    "slightly tilted head, mouth slightly open, sitting with one finger on chin, "
    "blue polo shirt, white background, character portrait, kawaii style"
)
args = {"requests": [{
    "input_urls": [temp_url],
    "prompt": prompt,
    "aspect_ratio": "1:1",
    "resolution": "2K",
    "output_file": "character_curious.jpg",
}]}
args_json = json.dumps(args, ensure_ascii=False)
args_file = PROJ / "gen-curious-args.json"
args_file.write_text(args_json, encoding="utf-8")
print(f"[args] wrote {args_file} ({len(args_json)} chars)")

# 3. call the matrix connector
print("[gen] calling connector__matrix__generate_image ...")
call = subprocess.run(
    [r"C:\Users\User\.minimax\bin\mcode-tools.cmd", "connector", "call", "connector__matrix__generate_image",
     "--args-file", str(args_file)],
    capture_output=True, text=True,
)
if call.returncode != 0:
    print(f"[gen] STDERR: {call.stderr}", file=sys.stderr)
    print(f"[gen] STDOUT: {call.stdout}", file=sys.stderr)
    sys.exit(call.returncode)
print(f"[gen] {call.stdout[:2000]}")
result = json.loads(call.stdout)

# 4. find the success item
items = result.get("success_items") or result.get("data", {}).get("success_items") or []
if not items:
    print(f"[gen] no success_items; full result: {json.dumps(result, ensure_ascii=False)[:3000]}")
    sys.exit(1)

item = items[0]
node_id = item.get("node_id")
file_name = item.get("file_name") or "character_curious.jpg"
print(f"[gen] success node_id={node_id} file_name={file_name}")

# 5. get short-lived URL
gu = subprocess.run(
    [r"C:\Users\User\.minimax\bin\mcode-tools.cmd", "get-asset-url", str(node_id)],
    capture_output=True, text=True, check=True,
)
gu_info = json.loads(gu.stdout)
asset_url = gu_info.get("download_url") or gu_info.get("url") or gu_info.get("file_url") or gu_info.get("temp_url")
print(f"[download] url={asset_url[:120]}...")

# 6. download
out = PROJ / file_name
import urllib.request
req = urllib.request.Request(asset_url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=60) as r, open(out, "wb") as f:
    data = r.read()
    f.write(data)
print(f"[download] wrote {out} ({len(data)} bytes)")
