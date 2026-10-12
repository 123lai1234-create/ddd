"""Generate 3-view character reference sheet via matrix connector."""
import json
import subprocess
import sys
from pathlib import Path

SRC_URL = "https://matrix-internal-cn.oss-cn-shanghai.aliyuncs.com/user_file_upload_tmp%2F2026-10-08%2Fc9410d34-ee91-42c3-8115-ce63c57fcf79.png?x-oss-credential=LTAI5tKjcNxbSxktvpFqdYgH%2F20261008%2Fcn-shanghai%2Foss%2Faliyun_v4_request&x-oss-date=20261008T063455Z&x-oss-expires=3600&x-oss-signature=844b8e0d46a198ff3fa93f2a20ca03b46c7fe0269913fb5f997645dc4bb10dbc&x-oss-signature-version=OSS4-HMAC-SHA256"

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")

requests = [
    {
        "input_urls": [SRC_URL],
        "prompt": "character design reference front orthographic view, chibi cute Asian toddler boy, round chubby face, big dark eyes, short black hair, wearing blue polo shirt, sitting pose with hands on cheeks, plain light gray background, full body visible, even soft lighting, model turnaround sheet, clean lineart, 3d modeling concept art",
        "aspect_ratio": "1:1",
        "resolution": "2K",
        "output_file": "character_front.png",
    },
    {
        "input_urls": [SRC_URL],
        "prompt": "character design reference side profile view, left side of face facing right, chibi cute Asian toddler boy, round chubby face in profile, one big eye visible, short black hair, wearing blue polo shirt, sitting pose, plain light gray background, full body visible, even soft lighting, character turnaround sheet, clean lineart, 3d modeling concept art",
        "aspect_ratio": "1:1",
        "resolution": "2K",
        "output_file": "character_side.png",
    },
    {
        "input_urls": [SRC_URL],
        "prompt": "character design reference back view, rear of head visible, chibi cute Asian toddler boy, back of round head with short black hair, wearing blue polo shirt from behind, sitting pose, plain light gray background, full body visible, even soft lighting, character turnaround sheet, clean lineart, 3d modeling concept art",
        "aspect_ratio": "1:1",
        "resolution": "2K",
        "output_file": "character_back.png",
    },
]

args_file = PROJ / "gen-3views-args.json"
args_file.write_text(json.dumps({"requests": requests}, ensure_ascii=False), encoding="utf-8")
print(f"wrote {args_file}")

# Validate JSON
with open(args_file, "r", encoding="utf-8") as f:
    parsed = json.load(f)
print(f"validated: {len(parsed['requests'])} requests")