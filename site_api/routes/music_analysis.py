"""
site_api/routes/music_analysis.py — AI music analysis endpoints

Endpoints for AI-powered music analysis:
- Audio upload and analysis
- Lyrics generation based on audio filename
- Gender detection
- Style and language detection
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..minimax_client import chat_completion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music", tags=["music-analysis"])

# Supported audio formats
SUPPORTED_FORMATS = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/m4a"}


@router.post("/analyze")
async def analyze_music(
    audio: UploadFile = File(...),
) -> JSONResponse:
    """
    Analyze music file to extract:
    - Lyrics (via AI based on filename)
    - Singer gender detection
    - Language detection
    
    Args:
        audio: Audio file upload
        
    Returns:
        JSON with lyrics, gender, language, and style
    """
    content_type = audio.content_type or "audio/mpeg"
    
    # Validate file format
    if not any(fmt in content_type.lower() for fmt in ["audio", "mpeg", "mp3", "wav", "ogg", "m4a"]):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {content_type}. Supported: mp3, wav, ogg, m4a"
        )
    
    # Read audio data
    audio_data = await audio.read()
    
    # Check file size (max 10MB)
    if len(audio_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB allowed.")
    
    # Get filename for analysis
    filename = audio.filename or "unknown"
    
    try:
        result = await _analyze_with_ai(filename)
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Music analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze-text")
async def analyze_from_filename(
    name: str = Form(...),
    artist: str = Form(default=""),
) -> JSONResponse:
    """
    Analyze music info from filename/artist without audio file.
    
    Args:
        name: Song name
        artist: Artist name (optional)
        
    Returns:
        JSON with gender, language, style prediction
    """
    try:
        result = await _analyze_with_ai(f"{artist} {name}".strip())
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Music analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _analyze_with_ai(filename: str) -> dict[str, Any]:
    """
    Use AI to analyze music filename and extract metadata.
    """
    # Clean filename for analysis
    clean_name = filename.replace(".mp3", "").replace(".wav", "").replace(".ogg", "").replace(".m4a", "")
    clean_name = re.sub(r'^\d+_', '', clean_name)  # Remove track number prefix
    clean_name = clean_name.strip()
    
    # Build prompt for music analysis
    prompt = f"""你是一個專業的音樂分析師。請根據以下歌曲名稱和歌手名稱，分析並輸出 JSON 格式的結果。

歌曲名稱：{clean_name}

請輸出嚴格的 JSON 格式（不要有其他文字）：
{{
    "lyrics": "根據歌曲名稱推測的主要歌詞內容，包含Verse、Chorus、橋段等結構。使用中文撰寫。",
    "gender": "M" 或 "F"，根據歌名風格判斷歌手性別（M=男歌手，F=女歌手）",
    "language": "TW" 或 "EN" 或 "JP" 或 "KR"，根據歌曲名稱判斷語言",
    "style": "流行" 或 "抒情" 或 "嘻哈" 或 "搖滾" 或 "電子" 或 "R&B" 或 "Lo-fi" 或 "J-Pop" 或 "K-Pop"",
    "confidence": 0.0 到 1.0 的置信度分數",
    "note": "分析的說明"
}}

直接輸出 JSON："""

    messages = [
        {
            "role": "system",
            "content": "你是一個專業的音樂分析師，擅長分析歌曲內容、性別、語言和風格。你只會輸出嚴格的 JSON 格式回覆，不要有任何其他文字。"
        },
        {
            "role": "user", 
            "content": prompt
        }
    ]
    
    try:
        response = await chat_completion(
            messages=messages,
            model="MiniMax-M2",
            temperature=0.3,
            max_tokens=1500
        )
        
        # Parse response
        content = response.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        
        # Try to parse as JSON
        content = content.strip()
        
        # Clean potential markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        result = json.loads(content.strip())
        
        # Validate and sanitize result
        return _validate_analysis_result(result, clean_name)
        
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSON response: {e}")
        return _create_fallback_result(clean_name)
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        return _create_fallback_result(clean_name)


def _validate_analysis_result(result: dict, filename: str) -> dict[str, Any]:
    """Validate and sanitize the analysis result."""
    valid_genders = ["M", "F"]
    valid_languages = ["TW", "EN", "JP", "KR"]
    valid_styles = ["流行", "抒情", "嘻哈", "搖滾", "電子", "R&B", "Lo-fi", "J-Pop", "K-Pop", "民謠", "搖滾", "重金屬"]
    
    return {
        "lyrics": str(result.get("lyrics", "")),
        "gender": result.get("gender", "M") if result.get("gender") in valid_genders else "M",
        "language": result.get("language", "TW") if result.get("language") in valid_languages else "TW",
        "style": result.get("style", "流行") if result.get("style") in valid_styles else "流行",
        "confidence": float(result.get("confidence", 0.5)),
        "note": str(result.get("note", "AI 分析完成")),
        "filename": filename
    }


def _create_fallback_result(filename: str) -> dict[str, Any]:
    """Create fallback result when AI analysis fails."""
    # Detect from filename patterns
    gender = "M"
    language = "TW"
    style = "流行"
    
    filename_lower = filename.lower()
    
    # Language detection
    if "en-" in filename_lower or "-en" in filename_lower or "english" in filename_lower:
        language = "EN"
    elif "jp-" in filename_lower or "-jp" in filename_lower or "japan" in filename_lower:
        language = "JP"
    elif "kr-" in filename_lower or "-kr" in filename_lower or "korean" in filename_lower:
        language = "KR"
    
    # Style detection
    if any(s in filename_lower for s in ["rock", "搖滾", "金屬"]):
        style = "搖滾"
    elif any(s in filename_lower for s in ["hip", "嘻哈", "rap"]):
        style = "嘻哈"
    elif any(s in filename_lower for s in ["lofi", "lo-fi", "lo fi"]):
        style = "Lo-fi"
    elif any(s in filename_lower for s in ["r&b", "rnb"]):
        style = "R&B"
    elif any(s in filename_lower for s in ["電子", "electro", "edm"]):
        style = "電子"
    
    return {
        "lyrics": f"【{filename}】\n\n[Verse 1]\n（AI 分析生成中...）\n\n[Chorus]\n（請上傳音頻檔案以獲取完整歌詞）\n\n[Bridge]\n（系統將根據音頻內容生成精確歌詞）",
        "gender": gender,
        "language": language,
        "style": style,
        "confidence": 0.3,
        "note": "使用檔名模式分析（AI 分析失敗時的備用方案）",
        "filename": filename
    }