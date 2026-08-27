import os
import subprocess

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\extended_cleaned"
os.makedirs(output_dir, exist_ok=True)

# 浮水印區域：左側 90px
WATERMARK_LEFT = 90

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
    
    print(f"Processing {filename}: {width}x{height} -> {new_width}x{height}")
    
    # 使用 overlay 將右側內容移到左側填補
    # 然後裁剪到原始尺寸（浮水印已被內容填補）
    cmd = [
        'ffmpeg', '-y', '-i', input_path,
        '-vf', (
            f"crop={new_width}:{height}:{WATERMARK_LEFT}:0,"  # 擷取右側部分（去除浮水印）
            f"scale={new_width}:{height}"  # 保持裁剪後的尺寸
        ),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'copy',
        output_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr[:300]}")
    else:
        print(f"  Done: {output_path}")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")