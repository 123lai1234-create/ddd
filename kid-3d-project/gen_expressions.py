"""Generate 6 expression variants of the kid character for mascot use."""
import json
from pathlib import Path

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")
SRC = "https://matrix-internal-cn.oss-cn-shanghai.aliyuncs.com/user_file_upload_tmp%2F2026-10-12%2Ff4414c99-bb6b-4959-af6a-c3e8ab7e5ca8.jpg?x-oss-credential=LTAI5tKjcNxbSxktvpFqdYgH%2F20261012%2Fcn-shanghai%2Foss%2Faliyun_v4_request&x-oss-date=20261012T070837Z&x-oss-expires=3600&x-oss-signature=1b199d495eabcf04181e0649c397fbd98100df95a080329ee4eba4aa4cc7cf45&x-oss-signature-version=OSS4-HMAC-SHA256"

expressions = [
    ("happy",       "cute chibi Asian baby boy smiling brightly, big eyes squinting with joy, mouth open in laugh, hands on cheeks in cute pose, blue polo shirt, white background, character portrait, kawaii style"),
    ("sad",         "cute chibi Asian baby boy looking sad and teary-eyed, big eyes with tears, pouting mouth, sitting with knees to chest, blue polo shirt, white background, character portrait, kawaii style"),
    ("surprised",   "cute chibi Asian baby boy with wide open mouth in shock, big round eyes, eyebrows raised high, both hands on cheeks in surprise, blue polo shirt, white background, character portrait, kawaii style"),
    ("angry",       "cute chibi Asian baby boy pouting angrily, big eyes with angry eyebrows, small frown, hands on hips, blue polo shirt, white background, character portrait, kawaii style"),
    ("sleepy",      "cute chibi Asian baby boy yawning, big eyes half-closed, small open mouth, droopy eyelids, sitting with one hand near face, blue polo shirt, white background, character portrait, kawaii style"),
    ("curious",     "cute chibi Asian baby boy looking up curiously with big wondering eyes, slightly tilted head, mouth slightly open, sitting with one finger on chin, blue polo shirt, white background, character portrait, kawaii style"),
]

requests = [
    {
        "input_urls": [SRC],
        "prompt": p,
        "aspect_ratio": "1:1",
        "resolution": "2K",
        "output_file": f"character_{name}.jpg",
    }
    for name, p in expressions
]

args_file = PROJ / "gen-expressions-args.json"
args_file.write_text(json.dumps({"requests": requests}, ensure_ascii=False), encoding="utf-8")
print(f"wrote {args_file} ({len(requests)} requests)")