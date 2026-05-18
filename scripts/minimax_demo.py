#!/usr/bin/env python3
"""
scripts/minimax_demo.py — MiniMax API 串聯展示腳本

這個腳本展示如何將 MiniMax 的多個功能串聯起來使用：
1. 歌詞生成 → 2. 音樂生成 → 3. TTS 語音朗讀

使用方法：
    python scripts/minimax_demo.py --theme "工程師的日常" --style "電子搖滾"

或使用 AI-Band 整合端點：
    curl -X POST http://localhost:8000/ai/ai-band \
      -H "Content-Type: application/json" \
      -d '{"theme": "工程師的日常", "style": "electronic", "duration": 30}'
"""

import argparse
import asyncio
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from site_api.minimax_client import (
    MiniMaxError,
    generate_lyrics,
    generate_music,
    text_to_speech,
    web_search,
    rag_search,
    image_understanding,
)


async def demo_lyrics_to_music(theme: str, style: str, duration: int = 30):
    """
    完整演示：歌詞生成 + 音樂生成
    
    流程：
    1. 根據主題和風格生成歌詞
    2. 將歌詞作為 Prompt 生成 AI 音樂
    """
    print(f"\n🎵 AI Band Demo: {theme} ({style})")
    print("=" * 50)
    
    try:
        # Step 1: Generate lyrics
        print("📝 Step 1: 生成歌詞...")
        lyrics_result = await generate_lyrics(theme=theme, style=style)
        
        choices = lyrics_result.get("choices", [{}])
        lyrics = choices[0].get("message", {}).get("content", "") if choices else ""
        
        print(f"\n✨ 歌詞完成！\n")
        print(lyrics[:500] + "..." if len(lyrics) > 500 else lyrics)
        
        # Step 2: Generate music with lyrics as prompt
        print("\n🎶 Step 2: 生成音樂...")
        music_prompt = f"{style} song with lyrics: {lyrics[:300]}"
        
        music_result = await generate_music(
            prompt=music_prompt,
            duration=duration,
            instrumental=False,
        )
        
        if music_result.get("audio_url"):
            print(f"✅ 音樂生成完成！")
            print(f"🔗 URL: {music_result['audio_url']}")
            return {"lyrics": lyrics, "audio_url": music_result["audio_url"]}
        elif music_result.get("task_id"):
            print(f"⏳ 音樂生成中 (task_id: {music_result['task_id']})")
            print(f"   請使用 GET /ai/music/{music_result['task_id']}/status 查看狀態")
            return {"lyrics": lyrics, "task_id": music_result["task_id"]}
        
    except MiniMaxError as e:
        print(f"❌ 錯誤: {e}")
        return None


async def demo_web_search(query: str, recency_days: int | None = None):
    """
    演示：網絡搜索 + RAG
    
    流程：
    1. 搜索網絡獲取最新資訊
    2. 結合上下文進行 RAG 回答
    """
    print(f"\n🔍 Web Search Demo: {query}")
    print("=" * 50)
    
    try:
        # Step 1: Basic web search
        print("📡 Step 1: 搜索網絡...")
        search_result = await web_search(query=query, num_results=5, recency_days=recency_days)
        
        results = search_result.get("data", [])
        print(f"\n📋 找到 {len(results)} 個結果：")
        
        for i, r in enumerate(results[:5], 1):
            title = r.get("title", "N/A")
            snippet = r.get("snippet", "N/A")[:100]
            print(f"  {i}. {title}")
            print(f"     {snippet}...")
        
        # Step 2: RAG with context
        print("\n🤖 Step 2: RAG 回答...")
        context = f"用戶問題涉及：{query}。請基於搜索結果給出準確回答。"
        
        rag_result = await rag_search(query=query, context=context)
        
        choices = rag_result.get("choices", [{}])
        answer = choices[0].get("message", {}).get("content", "") if choices else ""
        
        print(f"\n💡 AI 回答：\n{answer[:800]}")
        
        return {"search_results": results, "answer": answer}
        
    except MiniMaxError as e:
        print(f"❌ 錯誤: {e}")
        return None


async def demo_vision(image_url: str, prompt: str = "請詳細描述這張圖片"):
    """
    演示：圖片理解 (Vision)
    
    用途：
    - 分析截圖、圖表
    - 提取文件資訊
    - 程式碼/架構圖分析
    """
    print(f"\n👁️ Vision Demo: 分析圖片")
    print("=" * 50)
    
    try:
        print("🔍 分析中...")
        result = await image_understanding(
            image_url=image_url,
            prompt=prompt,
        )
        
        choices = result.get("choices", [{}])
        description = choices[0].get("message", {}).get("content", "") if choices else ""
        
        print(f"\n📝 圖片分析結果：\n{description}")
        
        return {"description": description}
        
    except MiniMaxError as e:
        print(f"❌ 錯誤: {e}")
        return None


async def demo_full_pipeline(theme: str, style: str):
    """
    完整演示：所有功能串聯
    
    流程：
    1. 網絡搜索相關資訊
    2. 生成歌詞
    3. 生成音樂
    4. TTS 朗讀歌詞
    """
    print(f"\n🚀 Full Pipeline Demo")
    print("=" * 60)
    print(f"主題: {theme} | 風格: {style}")
    print("=" * 60)
    
    # Step 1: Gather inspiration from web
    print("\n📡 步驟 1: 搜索相關資訊...")
    search_result = await web_search(query=f"{theme} {style} music inspiration", num_results=3)
    inspiration = "\n".join([r.get("snippet", "")[:100] for r in search_result.get("data", [])[:3]])
    print(f"   找到靈感素材")
    
    # Step 2: Generate lyrics with context
    print("\n📝 步驟 2: 生成歌詞...")
    lyrics_result = await generate_lyrics(theme=theme, style=style)
    choices = lyrics_result.get("choices", [{}])
    lyrics = choices[0].get("message", {}).get("content", "") if choices else ""
    print(f"   歌詞生成完成！")
    
    # Step 3: Generate music
    print("\n🎶 步驟 3: 生成音樂...")
    music_prompt = f"{style} music. {inspiration[:100]}. {lyrics[:200]}"
    music_result = await generate_music(prompt=music_prompt, duration=30)
    audio_url = music_result.get("audio_url")
    task_id = music_result.get("task_id")
    print(f"   {'音樂生成完成！' if audio_url else f'任務已建立: {task_id}'}")
    
    # Step 4: TTS narration
    print("\n🗣️ 步驟 4: 語音朗讀歌詞...")
    # First 200 chars for TTS
    tts_text = lyrics[:200] + "... (完整歌詞已生成)"
    try:
        audio = await text_to_speech(text=tts_text, speed=1.0)
        print(f"   語音合成完成！({len(audio)} bytes)")
    except Exception as e:
        print(f"   ⚠️ TTS 暫時不可用: {e}")
    
    print("\n" + "=" * 60)
    print("✅ 完整流程執行完畢！")
    print("=" * 60)
    
    return {
        "lyrics": lyrics,
        "music_url": audio_url,
        "music_task_id": task_id,
    }


def main():
    parser = argparse.ArgumentParser(description="MiniMax API 串聯展示")
    parser.add_argument("--theme", "-t", default="工程師的深夜告白", help="歌曲主題")
    parser.add_argument("--style", "-s", default="電子", help="音樂風格 (pop/rock/electronic/ballad)")
    parser.add_argument("--duration", "-d", type=int, default=30, help="音樂時長（秒）")
    parser.add_argument("--mode", "-m", choices=["lyrics-music", "web-search", "vision", "full"], 
                        default="lyrics-music", help="演示模式")
    parser.add_argument("--image-url", help="圖片 URL (vision 模式)")
    parser.add_argument("--query", "-q", help="搜索查詢 (web-search 模式)")
    parser.add_argument("--recency", type=int, help="限制為最近N天的結果")
    
    args = parser.parse_args()
    
    # Check API key
    if not os.getenv("MINIMAX_API_KEY"):
        print("❌ 錯誤: MINIMAX_API_KEY 未設定")
        print("   請設定環境變量：")
        print("   export MINIMAX_API_KEY=your_key_here")
        sys.exit(1)
    
    print(f"✅ MiniMax API Key 已設定")
    
    # Run demo based on mode
    if args.mode == "lyrics-music":
        asyncio.run(demo_lyrics_to_music(args.theme, args.style, args.duration))
    elif args.mode == "web-search":
        query = args.query or f"{args.theme} {args.style}"
        asyncio.run(demo_web_search(query, args.recency))
    elif args.mode == "vision":
        if not args.image_url:
            print("❌ 錯誤: vision 模式需要 --image-url 參數")
            sys.exit(1)
        asyncio.run(demo_vision(args.image_url))
    elif args.mode == "full":
        asyncio.run(demo_full_pipeline(args.theme, args.style))


if __name__ == "__main__":
    main()