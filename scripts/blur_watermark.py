import os
import subprocess

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\blur_cleaned"
os.makedirs(output_dir, exist_ok=True)

# 浮水印區域：左側 90px
WATERMARK_LEFT = 90
BLUR_WIDTH = 15  # 模糊邊緣寬度

videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(output_dir, filename)
    
    # 取得影片尺寸
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', 
         '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input_path],
        capture_output=True, text=True
    )
    width, height = map(int, result.stdout.strip().split(','))
    new_width = width - WATERMARK_LEFT
    
    print(f"Processing {filename}: {width}x{height}")
    
    # 使用 FFmpeg 進行以下操作：
    # 1. 複製右側內容到浮水印區域（平滑過渡）
    # 2. 裁剪結果
    cmd = [
        'ffmpeg', '-y', '-i', input_path,
        '-vf', (
            f"crop={new_width}:{height}:{WATERMARK_LEFT}:0,"
            f"scale={width}:{height}:flags=neighbor"
        ),
        '-c:a', 'copy',
        output_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr[:200]}")
    else:
        print(f"  Done!")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")