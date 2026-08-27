import os
import subprocess

frontend_dir = r"d:\project\frontend"

for filename in os.listdir(frontend_dir):
    if filename.endswith('.mp4'):
        filepath = os.path.join(frontend_dir, filename)
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0', 
             '-show_entries', 'stream=width,height', '-of', 'csv=p=0', filepath],
            capture_output=True, text=True
        )
        print(f"{filename}: {result.stdout.strip()}")