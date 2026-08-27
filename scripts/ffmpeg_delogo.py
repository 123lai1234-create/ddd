import os
import subprocess

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\ffmpeg_delogo"
os.makedirs(output_dir, exist_ok=True)

# 浮水印區域：左側 90px，高度從頂部 50% 開始
# 使用 delogo 濾鏡進行模糊處理
WATERMARK_LEFT = 10
WATERMARK_TOP = 0
WATERMARK_WIDTH = 80
WATERMARK_HEIGHT = 1080  # 預設高度，可以根據影片調整

def process_video_delogo(input_path, output_path):
    """使用 FFmpeg delogo 濾鏡去除浮水印"""
    # 取得影片尺寸
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', 
         '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  Error getting video info: {result.stderr}")
        return None
    
    try:
        width, height = map(int, result.stdout.strip().split(','))
        # delogo 參數
        delogo_x = WATERMARK_LEFT
        delogo_y = WATERMARK_TOP
        delogo_w = WATERMARK_WIDTH
        delogo_h = height  # 從頂部到底部
        
        # 使用 delogo 濾鏡 + 模糊
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-vf', (
                f"delogo=x={delogo_x}:y={delogo_y}:w={delogo_w}:h={delogo_h},"
                f"boxblur=2:1"  # 添加輕微模糊
            ),
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'copy',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  Error: {result.stderr[:300]}")
            return None
        
        return 1
    except Exception as e:
        print(f"  Exception: {e}")
        return None

# 找出所有 mp4 影片
videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process with delogo")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(output_dir, filename)
    print(f"Processing {filename}...")
    result = process_video_delogo(input_path, output_path)
    if result:
        print(f"  Done")
    else:
        print(f"  Failed")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")