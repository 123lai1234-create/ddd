import os
import subprocess

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\ffmpeg_clone"
os.makedirs(output_dir, exist_ok=True)

def process_video_clone(input_path, output_path):
    """使用 FFmpeg overlay 從右側取內容填充左側浮水印區域"""
    # 將左側 90px 區域替換為右側內容
    cmd = [
        'ffmpeg', '-y', '-i', input_path,
        '-vf', (
            "split=2[s1][s2];"
            "[s2]crop=iw-90:ih:90:0[right];"
            "[s1][right]overlay=0:0"
        ),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-c:a', 'copy',
        output_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error: {result.stderr[:200]}")
        return None
    
    return 1

# 找出所有 mp4 影片
videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process with clone")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(output_dir, filename)
    print(f"Processing {filename}...")
    result = process_video_clone(input_path, output_path)
    if result:
        print(f"  Done")
    else:
        print(f"  Failed")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")