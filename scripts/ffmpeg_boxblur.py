import os
import subprocess

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\ffmpeg_blur"
os.makedirs(output_dir, exist_ok=True)

def process_video_boxblur(input_path, output_path):
    """使用 FFmpeg boxblur 濾鏡模糊浮水印區域"""
    # 取得影片尺寸
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', 
         '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  Error getting video info")
        return None
    
    try:
        width, height = map(int, result.stdout.strip().split(','))
        # 左側 90px 區域進行輕微模糊
        # 使用 crop + blur + overlay 的方式
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-vf', (
                f"split=2[s1][s2];[s1]crop=90:ih:0:0,boxblur=1:1[blur];[s2][blur]overlay=0:0"
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
    except Exception as e:
        print(f"  Exception: {e}")
        return None

# 找出所有 mp4 影片
videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process with boxblur")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(output_dir, filename)
    print(f"Processing {filename}...")
    result = process_video_boxblur(input_path, output_path)
    if result:
        print(f"  Done")
    else:
        print(f"  Failed")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")