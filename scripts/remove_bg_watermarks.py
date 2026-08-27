#!/usr/bin/env python3
"""
批量處理背景影片去浮水印工具

使用方法:
1. 使用 WatermarkRemover-AI (推薦):
   - 需先完成 WatermarkRemover-AI 的安裝
   - 執行: python remove_bg_watermarks.py --use-watermark-remover

2. 使用 FFmpeg (簡單裁剪):
   - 執行: python remove_bg_watermarks.py --use-ffmpeg --crop-top 60 --crop-bottom 60
"""

import os
import sys
import subprocess
import shutil
import argparse
from pathlib import Path

# 背景影片目錄
BG_VIDEO_DIR = Path("d:/project/frontend")
# 輸出目錄
OUTPUT_DIR = Path("d:/project/frontend/cleaned")
# WatermarkRemover-AI 路徑
WATERMARK_REMOVER = Path("d:/project/WatermarkRemover-AI/remwm.py")


def find_bg_videos():
    """找出所有背景影片"""
    bg_patterns = ["bg*.mp4"]
    videos = []
    
    for pattern in bg_patterns:
        videos.extend(BG_VIDEO_DIR.glob(pattern))
    
    # 也檢查 UUID 命名的影片
    uuid_patterns = ["*.mp4"]
    for pattern in uuid_patterns:
        for v in BG_VIDEO_DIR.glob(pattern):
            if v not in videos:
                videos.append(v)
    
    return sorted(set(videos))


def process_with_watermark_remover(video_path: Path, output_path: Path):
    """使用 WatermarkRemover-AI 處理影片"""
    cmd = [
        sys.executable,
        str(WATERMARK_REMOVER),
        str(video_path),
        str(output_path.parent),
        "--overwrite",
        "--force-format=MP4",
        "--detection-skip=3",  # 每3帧检测一次，加快处理速度
    ]
    
    print(f"處理: {video_path.name}")
    print(f"命令: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode == 0:
            print(f"✓ 完成: {output_path}")
        else:
            print(f"✗ 失敗: {result.stderr}")
    except subprocess.TimeoutExpired:
        print(f"✗ 超時: {video_path}")
    except Exception as e:
        print(f"✗ 錯誤: {e}")


def process_with_ffmpeg(video_path: Path, output_path: Path, 
                         crop_top: int = 0, crop_bottom: int = 0):
    """使用 FFmpeg 裁剪影片頂部和底部"""
    if not shutil.which("ffmpeg"):
        print("錯誤: FFmpeg 未安裝。請從 https://ffmpeg.org/download.html 安裝")
        return False
    
    # 獲取影片資訊
    probe_cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=p=0",
        str(video_path)
    ]
    
    try:
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        width, height = map(int, result.stdout.strip().split(','))
        
        # 計算新尺寸
        new_height = height - crop_top - crop_bottom
        new_y = crop_top
        
        # 構建 FFmpeg 命令
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vf", f"crop={width}:{new_height}:0:{new_y}",
            "-c:a", "copy",  # 保留音頻
            str(output_path)
        ]
        
        print(f"處理: {video_path.name}")
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✓ 完成: {output_path}")
            return True
        else:
            print(f"✗ 失敗: {result.stderr}")
            return False
    except Exception as e:
        print(f"✗ 錯誤: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="批次處理背景影片去浮水印")
    parser.add_argument("--use-watermark-remover", action="store_true",
                        help="使用 WatermarkRemover-AI (需先安裝)")
    parser.add_argument("--use-ffmpeg", action="store_true",
                        help="使用 FFmpeg 裁剪浮水印區域")
    parser.add_argument("--crop-top", type=int, default=60,
                        help="從頂部裁剪的像素數")
    parser.add_argument("--crop-bottom", type=int, default=60,
                        help="從底部裁剪的像素數")
    parser.add_argument("--dry-run", action="store_true",
                        help="只顯示要處理的檔案，不實際處理")
    
    args = parser.parse_args()
    
    # 確保輸出目錄存在
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 找出所有影片
    videos = find_bg_videos()
    
    print(f"找到 {len(videos)} 個背景影片:")
    for v in videos:
        print(f"  - {v.name}")
    print()
    
    if args.dry_run:
        print("預覽模式 - 不會實際處理")
        return
    
    for video in videos:
        output = OUTPUT_DIR / video.name
        
        if args.use_watermark_remover:
            process_with_watermark_remover(video, output)
        elif args.use_ffmpeg:
            process_with_ffmpeg(video, output, args.crop_top, args.crop_bottom)
        else:
            print("請指定處理方式: --use-watermark-remover 或 --use-ffmpeg")


if __name__ == "__main__":
    main()