import os
import subprocess

frontend_dir = r"d:\project\frontend"
cleaned_dir = r"d:\project\frontend\cleaned"

os.makedirs(cleaned_dir, exist_ok=True)

# 裁剪左側 90px 浮水印區域
crop_left = 90

videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(cleaned_dir, filename)
    
    # 取得原始影片尺寸
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', 
         '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input_path],
        capture_output=True, text=True
    )
    width, height = map(int, result.stdout.strip().split(','))
    new_width = width - crop_left
    
    print(f"Processing {filename}: {width}x{height} -> {new_width}x{height}")
    
    # 裁剪左側 90px
    subprocess.run([
        'ffmpeg', '-y', '-i', input_path,
        '-vf', f'crop={new_width}:{height}:{crop_left}:0',
        '-c:a', 'copy', output_path
    ], capture_output=True)

print("Done! Cropped videos saved to cleaned folder")