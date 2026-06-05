"""
site_api/routes_minimax.py — FastAPI routes for MiniMax AI services.

Provides endpoints for:
- Text-to-Speech (TTS)
- Music generation
- Chat completion via MiniMax M2
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from site_api.minimax_client import (
    MiniMaxError,
    MiniMaxTimeoutError,
    MiniMaxAuthError,
    MusicModel,
    SearchModel,
    TTSModel,
    chat_completion,
    stream_chat_completion,
    text_to_speech,
    generate_music,
    poll_music_task,
    generate_lyrics,
    image_understanding,
    web_search,
    rag_search,
    music_cover,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["MiniMax AI"])

# ── Request/Response Models ────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: system, user, or assistant")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str = "MiniMax-M2"
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    stream: bool = Field(default=False, description="Enable streaming response")


class ChatResponse(BaseModel):
    model: str
    content: str
    usage: dict[str, int] | None = None
    finish_reason: str | None = None


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Text to synthesize")
    model: str = Field(default=TTSModel.E2ALL_TURBO)
    voice: str = Field(default="default")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class MusicGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500, description="Music description")
    model: str = Field(default=MusicModel.MUSIC_2_6)
    duration: int = Field(default=30, ge=15, le=180, description="Duration in seconds")
    instrumental: bool = Field(default=False)


class MusicGenerationResponse(BaseModel):
    task_id: str | None = None
    audio_url: str | None = None
    status: str
    model: str


# ── Health Check ──────────────────────────────────────────────────────────────


@router.get("/status")
def minimax_status() -> dict[str, Any]:
    """Check MiniMax API connectivity and configuration."""
    api_key = os.getenv("MINIMAX_API_KEY", "")
    litellm_proxy = os.getenv("LITELLM_PROXY_URL", "")

    return {
        "service": "minimax",
        "api_key_configured": bool(api_key),
        "litellm_proxy_url": litellm_proxy or "not configured (using direct API)",
        "available_models": {
            "chat": "MiniMax-M2",
            "tts": TTSModel.E2ALL_TURBO,
            "music": MusicModel.MUSIC_2_6,
        },
    }


# ── Chat Completion ───────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a chat completion request to MiniMax M2.

    Supports both streaming and non-streaming responses.
    Useful for drug科普 content generation in your portfolio.
    """
    try:
        if request.stream:
            # Streaming handled separately
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use /ai/chat/stream for streaming responses",
            )

        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        result = await chat_completion(
            messages=messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        # Extract content from OpenAI-style response
        choices = result.get("choices", [{}])
        content = choices[0].get("message", {}).get("content", "") if choices else ""

        return ChatResponse(
            model=result.get("model", request.model),
            content=content,
            usage=result.get("usage"),
            finish_reason=choices[0].get("finish_reason") if choices else None,
        )

    except MiniMaxAuthError as e:
        logger.error("MiniMax auth failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MiniMax API authentication failed. Check your API key.",
        ) from e
    except MiniMaxTimeoutError as e:
        logger.warning("MiniMax request timed out: %s", e)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="MiniMax request timed out. Try a shorter prompt.",
        ) from e
    except MiniMaxError as e:
        logger.error("MiniMax error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"MiniMax API error: {e}",
        ) from e


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream a chat completion response from MiniMax M2.

    Returns Server-Sent Events (SSE) with text chunks.
    """
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        async def event_generator():
            async for chunk in stream_chat_completion(
                messages=messages,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )

    except MiniMaxAuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth failed") from e
    except MiniMaxError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e


# ── Text-to-Speech ─────────────────────────────────────────────────────────────


@router.post("/tts")
async def tts(request: TTSRequest):
    """
    Convert text to speech using MiniMax TTS.

    Returns audio data (MP3 by default).
    Useful for creating drug科普 voiceovers.
    """
    try:
        audio_bytes = await text_to_speech(
            text=request.text,
            model=request.model,
            voice=request.voice,
            speed=request.speed,
        )

        return StreamingResponse(
            iter([audio_bytes]),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=tts_output.mp3",
            },
        )

    except MiniMaxError as e:
        logger.error("TTS error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TTS generation failed: {e}",
        ) from e


# ── Music Generation ───────────────────────────────────────────────────────────


@router.post("/music", response_model=MusicGenerationResponse)
async def music(request: MusicGenerationRequest):
    """
    Generate music using MiniMax music-2.6 model.

    For durations ≤ 60s, returns audio directly.
    For longer durations, returns task_id for polling via /ai/music/{task_id}/status
    """
    try:
        result = await generate_music(
            prompt=request.prompt,
            model=request.model,
            duration=request.duration,
            instrumental=request.instrumental,
        )

        return MusicGenerationResponse(
            task_id=result.get("task_id"),
            audio_url=result.get("audio_url"),
            status=result.get("status", "completed"),
            model=request.model,
        )

    except MiniMaxError as e:
        logger.error("Music generation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Music generation failed: {e}",
        ) from e


@router.get("/music/{task_id}/status")
async def music_status(task_id: str):
    """Poll for music generation task status."""
    try:
        result = await poll_music_task(task_id)
        return result

    except MiniMaxError as e:
        logger.error("Music status poll error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to poll task status: {e}",
        ) from e


# ── Lyrics Generation ───────────────────────────────────────────────────────────


class LyricsRequest(BaseModel):
    theme: str = Field(..., min_length=1, max_length=500, description="Song theme or topic")
    style: str = Field(default="pop", description="Music style (pop, rock, ballad, hiphop, electronic, etc.)")
    model: str = Field(default="MiniMax-M2")


class LyricsResponse(BaseModel):
    model: str
    content: str
    theme: str
    style: str


@router.post("/lyrics", response_model=LyricsResponse)
async def lyrics(request: LyricsRequest):
    """
    Generate song lyrics based on a theme.

    Returns structured lyrics with verse, chorus, bridge sections.
    """
    try:
        result = await generate_lyrics(
            theme=request.theme,
            style=request.style,
            model=request.model,
        )

        choices = result.get("choices", [{}])
        content = choices[0].get("message", {}).get("content", "") if choices else ""

        return LyricsResponse(
            model=result.get("model", request.model),
            content=content,
            theme=request.theme,
            style=request.style,
        )

    except MiniMaxError as e:
        logger.error("Lyrics generation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Lyrics generation failed: {e}",
        ) from e


# ── Image Understanding (Vision) ───────────────────────────────────────────────


class ImageUnderstandingRequest(BaseModel):
    image_url: str | None = Field(default=None, description="URL of image to analyze")
    image_base64: str | None = Field(default=None, description="Base64 encoded image")
    prompt: str = Field(
        default="請詳細描述這張圖片的內容。",
        description="Question or instruction about the image",
    )
    model: str = Field(default="MiniMax-M2")


class ImageUnderstandingResponse(BaseModel):
    model: str
    content: str
    usage: dict[str, int] | None = None


@router.post("/vision", response_model=ImageUnderstandingResponse)
async def vision(request: ImageUnderstandingRequest):
    """
    Analyze images using MiniMax vision capabilities.

    Use cases:
    - Analyze screenshots, diagrams, charts
    - Extract information from documents
    - Code/architecture diagram analysis
    """
    try:
        result = await image_understanding(
            image_url=request.image_url,
            image_base64=request.image_base64,
            prompt=request.prompt,
            model=request.model,
        )

        choices = result.get("choices", [{}])
        content = choices[0].get("message", {}).get("content", "") if choices else ""

        return ImageUnderstandingResponse(
            model=result.get("model", request.model),
            content=content,
            usage=result.get("usage"),
        )

    except MiniMaxError as e:
        logger.error("Image understanding error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Image understanding failed: {e}",
        ) from e


# ── Web Search (RAG) ──────────────────────────────────────────────────────────────


class WebSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    model: str = Field(default=SearchModel.SEARCH_PRO)
    num_results: int = Field(default=5, ge=1, le=10)
    recency_days: int | None = Field(default=None, description="Limit to recent days")


class WebSearchResponse(BaseModel):
    query: str
    results: list[dict[str, Any]]
    model: str


@router.post("/search", response_model=WebSearchResponse)
async def search(request: WebSearchRequest):
    """
    Search the web for current information.

    Returns search results with titles, snippets, and URLs.
    """
    try:
        result = await web_search(
            query=request.query,
            model=request.model,
            num_results=request.num_results,
            recency_days=request.recency_days,
        )

        return WebSearchResponse(
            query=request.query,
            results=result.get("data", []),
            model=request.model,
        )

    except MiniMaxError as e:
        logger.error("Web search error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Web search failed: {e}",
        ) from e


class RagSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="User question")
    context: str = Field(..., min_length=1, description="Additional context to ground answer")
    model: str = Field(default="MiniMax-M2")


class RagSearchResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]]
    model: str


@router.post("/rag", response_model=RagSearchResponse)
async def rag(request: RagSearchRequest):
    """
    RAG-style search: web search + synthesis with context.

    First searches the web for information, then synthesizes
    an answer grounded in both search results and provided context.
    """
    try:
        result = await rag_search(
            query=request.query,
            context=request.context,
            model=request.model,
        )

        choices = result.get("choices", [{}])
        content = choices[0].get("message", {}).get("content", "") if choices else ""

        return RagSearchResponse(
            answer=content,
            sources=result.get("sources", []),
            model=request.model,
        )

    except MiniMaxError as e:
        logger.error("RAG search error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"RAG search failed: {e}",
        ) from e


# ── Music Cover ────────────────────────────────────────────────────────────────


class MusicCoverRequest(BaseModel):
    source_audio_url: str | None = Field(default=None, description="URL of source audio")
    source_audio_base64: str | None = Field(default=None, description="Base64 encoded audio")
    style: str = Field(default="pop", description="Target style (pop, rock, jazz, electronic, etc.)")
    vocals_style: str = Field(default="natural", description="Vocals processing style")


class MusicCoverResponse(BaseModel):
    task_id: str | None = None
    audio_url: str | None = None
    status: str
    model: str = "music-cover"


@router.post("/music/cover", response_model=MusicCoverResponse)
async def cover(request: MusicCoverRequest):
    """
    Create a cover version of existing music with different style.

    Provide either source_audio_url or source_audio_base64.
    For long audio, returns task_id for polling via /ai/music/{task_id}/status
    """
    try:
        if not request.source_audio_url and not request.source_audio_base64:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either source_audio_url or source_audio_base64 required",
            )

        result = await music_cover(
            source_audio_url=request.source_audio_url,
            source_audio_base64=request.source_audio_base64,
            style=request.style,
            vocals_style=request.vocals_style,
        )

        return MusicCoverResponse(
            task_id=result.get("task_id"),
            audio_url=result.get("audio_url"),
            status=result.get("status", "completed"),
        )

    except MiniMaxError as e:
        logger.error("Music cover error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Music cover failed: {e}",
        ) from e


# ── Full Pipeline: Lyrics + Music ────────────────────────────────────────────────


class AIBandRequest(BaseModel):
    theme: str = Field(..., min_length=1, max_length=500, description="Song theme")
    style: str = Field(default="pop", description="Music style")
    duration: int = Field(default=30, ge=15, le=180, description="Music duration in seconds")


class AIBandResponse(BaseModel):
    lyrics: str
    music_url: str | None = None
    task_id: str | None = None
    status: str


@router.post("/ai-band", response_model=AIBandResponse)
async def ai_band(request: AIBandRequest):
    """
    Complete AI songwriting pipeline: generate lyrics + music.

    1. Generate lyrics based on theme and style
    2. Generate music using the lyrics as prompt

    Returns both lyrics and music URL/task_id.
    """
    try:
        # Step 1: Generate lyrics
        lyrics_result = await generate_lyrics(
            theme=request.theme,
            style=request.style,
        )
        choices = lyrics_result.get("choices", [{}])
        lyrics_content = choices[0].get("message", {}).get("content", "") if choices else ""

        # Step 2: Generate music with lyrics as prompt
        music_prompt = f"{request.style} song. {lyrics_content}"
        music_result = await generate_music(
            prompt=music_prompt,
            duration=request.duration,
            instrumental=False,
        )

        return AIBandResponse(
            lyrics=lyrics_content,
            music_url=music_result.get("audio_url"),
            task_id=music_result.get("task_id"),
            status=music_result.get("status", "processing"),
        )

    except MiniMaxError as e:
        logger.error("AI Band pipeline error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI Band pipeline failed: {e}",
        ) from e
