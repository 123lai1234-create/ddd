import os
import cv2
import numpy as np

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\cv_inpaint"
os.makedirs(output_dir, exist_ok=True)

# 浮水印區域：左側 90px
WATERMARK_LEFT = 90

def inpaint_video(input_path, output_path):
    """使用 OpenCV 的 INPAINT_TELEA 方法去除浮水印"""
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # 創建輸出影片
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # 建立浮水印遮罩 (左側區域)
        mask = np.zeros((height, width), dtype=np.uint8)
        mask[:, :WATERMARK_LEFT] = 255
        
        # 使用 OpenCV 的 Telea 方法進行 inpainting
        result = cv2.inpaint(frame, mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA)
        
        out.write(result)
        frame_count += 1
        if frame_count % 100 == 0:
            print(f"  Frame {frame_count}")
    
    cap.release()
    out.release()
    return frame_count

# 處理所有 MP4 檔案
videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(output_dir, filename)
    print(f"Processing {filename}...")
    count = inpaint_video(input_path, output_path)
    print(f"  Done: {count} frames")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")