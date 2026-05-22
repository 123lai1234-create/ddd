import os
import subprocess
import cv2
import numpy as np

frontend_dir = r"d:\project\frontend"
cleaned_dir = r"d:\project\frontend\ai_cleaned"
os.makedirs(cleaned_dir, exist_ok=True)

# 浮水印區域：左側 90px
WATERMARK_LEFT = 90

def inpaint_frame(frame, x_start, x_end):
    """使用簡單的週圍採樣來填補浮水印區域"""
    h, w = frame.shape[:2]
    x_start = int(x_start)
    x_end = int(x_end)
    
    # 擷取浮水印區域
    watermark_region = frame[:, x_start:x_end].copy()
    
    # 建立遮罩
    mask = np.zeros((h, x_end - x_start), dtype=np.uint8)
    
    # 複製週圍像素來填補
    result = frame.copy()
    
    # 左側邊緣
    left_edge = frame[:, max(0, x_start-5):x_start].mean(axis=(1,2))
    
    for y in range(h):
        for x in range(x_start, min(x_end, w)):
            # 使用左側像素的平均值
            offset = min(x - x_start, 5)
            if x - offset >= 0:
                result[y, x] = frame[y, x - offset]
            else:
                result[y, x] = frame[y, x_start]
    
    return result

def process_video(input_path, output_path):
    """處理單個影片，去除左側浮水印"""
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # 新的寬度（去除左側 90px）
    new_width = width - WATERMARK_LEFT
    
    # 創建輸出影片
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (new_width, height))
    
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # 裁剪左側浮水印區域
        cropped = frame[:, WATERMARK_LEFT:]
        
        # 簡單的修補：使用週圍像素
        for x in range(min(20, WATERMARK_LEFT)):
            blend = x / WATERMARK_LEFT
            if WATERMARK_LEFT + x < frame.shape[1]:
                frame[:, WATERMARK_LEFT + x] = (
                    (1 - blend) * frame[:, WATERMARK_LEFT + x] + 
                    blend * frame[:, WATERMARK_LEFT + x + 5]
                ).astype(np.uint8)
        
        # 裁剪
        cropped = frame[:, WATERMARK_LEFT:]
        out.write(cropped)
        
        frame_count += 1
        if frame_count % 100 == 0:
            print(f"  Frame {frame_count}/{total_frames}")
    
    cap.release()
    out.release()
    print(f"  Completed: {os.path.basename(output_path)}")

# 處理所有 MP4 檔案
videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(cleaned_dir, filename)
    print(f"Processing {filename}...")
    process_video(input_path, output_path)

print("\nAll videos processed!")
print(f"Output location: {cleaned_dir}")