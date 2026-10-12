"""Tripo3D image-to-3D client.

Reference: https://platform.tripo3d.ai/docs

Usage:
    python tripo_generate.py <input_image> [output.glb] [--format glb|obj|fbx|stl] [--quad] [--texture]

Requires env: TRIPO_API_KEY
Get key at: https://platform.tripo3d.ai → dashboard → API keys
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import urllib.error
import urllib.request

API_BASE = "https://api.tripo3d.ai/v2/openapi"


def _req(method: str, path: str, body: dict | None = None, *, timeout: int = 60) -> dict:
    api_key = os.environ.get("TRIPO_API_KEY")
    if not api_key:
        sys.exit("missing TRIPO_API_KEY env var. Get one at https://platform.tripo3d.ai → dashboard → API keys")
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode("utf-8", errors="replace")
        sys.exit(f"HTTP {e.code} {e.reason}: {body_txt}")


def upload_image(path: Path) -> str:
    """Upload local image and return image_token used by image-to-3D."""
    api_key = os.environ.get("TRIPO_API_KEY")
    if not api_key:
        sys.exit("missing TRIPO_API_KEY env var")
    boundary = "----tripo" + os.urandom(8).hex()
    with open(path, "rb") as f:
        file_bytes = f.read()
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"

    parts: list[bytes] = []
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: {mime}\r\n\r\n".encode())
    parts.append(file_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        f"{API_BASE}/upload/sts",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.loads(r.read().decode("utf-8"))
    return out["data"]["image_token"]


def submit_image_to_3d(image_token: str, *, quad: bool, texture: bool, model_version: str = "v3.1-20260211", face_limit: int | None = None) -> str:
    """Kick off image-to-3D, return task_id."""
    body = {
        "model_version": model_version,
        "type": "image_to_model",
        "file": {
            "type": "png",
            "file_token": image_token,
        },
        "texture": texture,
        "pbr": texture,
        "quad": quad,
        "texture_alignment": "original_image",
    }
    if face_limit is not None:
        body["face_limit"] = face_limit
    out = _req("POST", "/task", body)
    return out["data"]["task_id"]


def poll_task(task_id: str, *, interval: float = 4.0, max_wait: float = 180.0) -> dict:
    """Poll until success/fail. Returns final task object."""
    start = time.time()
    while time.time() - start < max_wait:
        out = _req("GET", f"/task/{task_id}")
        data = out["data"]
        status = data.get("status")
        progress = data.get("progress", 0)
        print(f"  status={status} progress={progress}%", flush=True)
        if status in ("success", "failed", "cancelled"):
            if status != "success":
                sys.exit(f"task {status}: {json.dumps(data, ensure_ascii=False)}")
            return data
        time.sleep(interval)
    sys.exit(f"timeout waiting for task {task_id}")


def download_model(pbr_model_url: str, out_path: Path, fmt: str) -> None:
    """Download model file. fmt = glb|obj|fbx|stl|usdz|ply."""
    api_key = os.environ.get("TRIPO_API_KEY")
    url = pbr_model_url
    if "?" in url:
        url = url + f"&token={api_key}"
    else:
        url = url + f"?token={api_key}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=120) as r:
        out_path.write_bytes(r.read())
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")


def check_credits() -> dict:
    """Return remaining credit balance via /user/balance."""
    out = _req("GET", "/user/balance", timeout=15)
    return out.get("data", out)


def main() -> None:
    p = argparse.ArgumentParser(description="Tripo image-to-3D")
    p.add_argument("input", type=Path, help="input image (png/jpg)")
    p.add_argument("output", type=Path, nargs="?", default=None, help="output file (default: <stem>_3d.glb)")
    p.add_argument("--format", choices=["glb", "obj", "fbx", "stl", "usdz", "ply"], default="glb")
    p.add_argument("--quad", action="store_true", help="request quad topology (+5 credits)")
    p.add_argument("--texture", action="store_true", default=True, help="generate textures (default on)")
    p.add_argument("--no-texture", dest="texture", action="store_false")
    p.add_argument("--model", default="v3.1-20260211", help="model version (default v3.1)")
    p.add_argument("--face-limit", type=int, default=None, help="cap face count (500-10000 with quad, <=500000 otherwise)")
    args = p.parse_args()

    out = args.output or args.input.with_name(f"{args.input.stem}_3d.{args.format}")
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] uploading {args.input} ...")
    image_token = upload_image(args.input)
    print(f"  image_token={image_token}")

    print(f"[2/4] submitting image_to_model (texture={args.texture}, quad={args.quad}) ...")
    task_id = submit_image_to_3d(
        image_token,
        quad=args.quad,
        texture=args.texture,
        model_version=args.model,
        face_limit=args.face_limit,
    )
    print(f"  task_id={task_id}")

    print(f"[3/4] polling ...")
    result = poll_task(task_id)

    # Pick best available URL based on format
    key_by_format = {
        "glb": "pbr_model",  # Tripo v3.x returns pbr_model as GLB
        "obj": "model",
        "fbx": "model",
        "stl": "model",
        "usdz": "model",
        "ply": "model",
    }
    url_key = key_by_format[args.format]
    model_url = result.get(url_key) or result.get("model")
    if not model_url:
        sys.exit(f"no model URL in response: {json.dumps(result, ensure_ascii=False)}")

    print(f"[4/4] downloading {args.format.upper()} ...")
    download_model(model_url, out, args.format)

    print("\nDone.")
    print(f"  task_id     = {task_id}")
    print(f"  output      = {out}")
    if result.get("base_model"):
        print(f"  base_model  = {result['base_model']}")


if __name__ == "__main__":
    main()