"""Batch-generate 3D versions for all reference views.

Consumes:
    character_front.jpg
    character_side.jpg
    character_back.jpg
    (plus any extra image path passed in)

Outputs:
    character_front_3d.glb / character_side_3d.glb / character_back_3d.glb
    in --out-dir (default: ./3d-models)

Usage:
    python tripo_batch.py [--out-dir ./3d-models] [--format glb] [--quad]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import urllib.error
import urllib.request
import json
import os

PROJ = Path(r"C:\Users\User\.minimax\sessions\mvs_4523b3f8d78e4a098b3512a12e688cec\workspace\kid-3d-project")

# Import from sibling module
sys.path.insert(0, str(Path(__file__).parent))
from tripo_generate import upload_image, submit_image_to_3d, poll_task, download_model  # noqa: E402


DEFAULT_VIEWS = [
    "character_front.jpg",
    "character_side.jpg",
    "character_back.jpg",
]


def main() -> None:
    p = argparse.ArgumentParser(description="Batch Tripo image-to-3D for all reference views")
    p.add_argument("--in-dir", type=Path, default=PROJ)
    p.add_argument("--out-dir", type=Path, default=PROJ / "3d-models")
    p.add_argument("--format", choices=["glb", "obj", "fbx", "stl"], default="glb")
    p.add_argument("--quad", action="store_true")
    p.add_argument("--no-texture", dest="texture", action="store_false", default=True)
    p.add_argument("--model", default="v3.1-20250821")
    p.add_argument("--extra", type=Path, action="append", default=[], help="extra image paths to include")
    args = p.parse_args()

    if "TRIPO_API_KEY" not in os.environ:
        sys.exit("missing TRIPO_API_KEY env var")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    files: list[Path] = []
    for name in DEFAULT_VIEWS:
        path = args.in_dir / name
        if path.exists():
            files.append(path)
        else:
            print(f"  skip (not found): {path}")
    for x in args.extra:
        if x.exists():
            files.append(x)
    if not files:
        sys.exit("no input images found")

    results: list[dict] = []
    for src in files:
        out_path = args.out_dir / f"{src.stem}_3d.{args.format}"
        if out_path.exists() and out_path.stat().st_size > 1024:
            print(f"  skip (exists): {out_path}")
            results.append({"src": str(src), "out": str(out_path), "status": "exists"})
            continue

        print(f"\n=== {src.name} -> {out_path.name} ===")
        try:
            image_token = upload_image(src)
            task_id = submit_image_to_3d(image_token, quad=args.quad, texture=args.texture, model_version=args.model)
            result = poll_task(task_id)
            url_key = "pbr_model" if args.format == "glb" else "model"
            url = result.get(url_key) or result.get("model")
            if not url:
                print(f"  WARN: no model URL in result: {json.dumps(result)[:200]}")
                results.append({"src": str(src), "status": "no_url"})
                continue
            download_model(url, out_path, args.format)
            results.append({"src": str(src), "out": str(out_path), "task_id": task_id, "status": "ok"})
        except (urllib.error.URLError, urllib.error.HTTPError, KeyError, SystemExit) as e:
            print(f"  FAIL: {e}")
            results.append({"src": str(src), "status": "fail", "error": str(e)})
            # continue to next image
            time.sleep(2)

    print("\n--- batch summary ---")
    for r in results:
        print(f"  {r.get('status'):>8} {r.get('src')} -> {r.get('out', '-')}")
    fails = [r for r in results if r.get("status") not in ("ok", "exists")]
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()