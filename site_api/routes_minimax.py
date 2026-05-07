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
    TTSModel,
    chat_completion,
    stream_chat_completion,
    text_to_speech,
    generate_music,
    poll_music_task,
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
        )
    except MiniMaxTimeoutError as e:
        logger.warning("MiniMax request timed out: %s", e)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail="MiniMax request timed out. Try a shorter prompt.",
        )
    except MiniMaxError as e:
        logger.error("MiniMax error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"MiniMax API error: {e}",
        )


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

    except MiniMaxAuthError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth failed")
    except MiniMaxError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


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
        )


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
        )


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
        )