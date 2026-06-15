@echo off
cd /d D:\project\astro
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
python scripts\align_lyrics.py > D:\project\astro\scripts\_align_log.txt 2>&1
echo exit=%errorlevel% %date% %time% > D:\project\astro\scripts\_align_done.txt
