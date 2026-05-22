import os
import cv2
import numpy as np
import subprocess

frontend_dir = r"d:\project\frontend"
output_dir = r"d:\project\frontend\flexible_inpaint"
os.makedirs(output_dir, exist_ok=True)

def process_video_flexible(input_path, output_path):
    """使用更温和的方式处理浮水印 - 使用边缘检测引导的混合"""
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # 只处理左侧 90px 浮水印区域
    wm_left = 90
    
    # 创建输出影片
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # 方案：使用更保守的混合
        # 从浮水印区域右侧取内容，逐渐混合到左侧
        result = frame.copy()
        
        # 创建一个柔和的过渡区域
        for x in range(wm_left):
            # 权重：越靠近左边权重越低（取原始内容越少）
            weight = x / wm_left
            
            # 从右侧对应位置取内容
            src_x = wm_left + (wm_left - x)
            if src_x < width:
                # 混合：右侧内容 + 原始内容的加权平均
                result[:, x] = frame[:, src_x] * (1 - weight * 0.3) + frame[:, x] * (weight * 0.3 + 0.7)
        
        out.write(result)
        frame_count += 1
        if frame_count % 100 == 0:
            print(f"  Frame {frame_count}")
    
    cap.release()
    out.release()
    return frame_count

# 找出所有 mp4 影片
videos = [f for f in os.listdir(frontend_dir) if f.endswith('.mp4') and not f.startswith('cute')]
print(f"Found {len(videos)} videos to process")

for filename in videos:
    input_path = os.path.join(frontend_dir, filename)
    output_path = os.path.join(output_dir, filename)
    print(f"Processing {filename}...")
    count = process_video_flexible(input_path, output_path)
    print(f"  Done: {count} frames")

print("\nAll videos processed!")
print(f"Output location: {output_dir}")