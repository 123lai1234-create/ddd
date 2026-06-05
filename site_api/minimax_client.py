"""
site_api/minimax_client.py ??MiniMax API client for music generation and TTS.

This module provides a clean interface to MiniMax's endpoints via the LiteLLM proxy
or directly through the MiniMax API, keeping API keys secure on the server side.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ?? Configuration ????????????????????????????????????????????????????????????

MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_API_BASE = os.getenv("MINIMAX_API_BASE", "https://api.minimaxi.com/v1")

# If you have a LiteLLM proxy deployed via Cloudflare Tunnel, use that instead:
# LITELLM_PROXY_URL = os.getenv("LITELLM_PROXY_URL", "https://your-tunnel.public01.dev")
LITELLM_PROXY_URL = os.getenv("LITELLM_PROXY_URL", "")

# Determine which base URL to use
_use_litellm = bool(LITELLM_PROXY_URL and MINIMAX_API_KEY)
_base_url = LITELLM_PROXY_URL if _use_litellm else MINIMAX_API_BASE
_model_prefix = "minimax/" if _use_litellm else ""  # LiteLLM model naming

# ?? Exceptions ????????????????????????????????????????????????????????????????


class MiniMaxError(Exception):
    """Base exception for MiniMax client errors."""

    def __init__(self, message: str, status_code: int | None = None, response_body: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class MiniMaxTimeoutError(MiniMaxError):
    """Request timed out."""
    pass


class MiniMaxAuthError(MiniMaxError):
    """Authentication failed (invalid API key)."""
    pass


# ?? HTTP Client ???????????????????????????????????????????????????????????????


def _build_headers() -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
    }
    return headers


async def _post(
    endpoint: str,
    json_payload: dict[str, Any],
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Make a POST request to the MiniMax API."""
    url = f"{_base_url}{endpoint}"
    headers = _build_headers()

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(url, json=json_payload, headers=headers)
        except httpx.TimeoutException as e:
            raise MiniMaxTimeoutError(f"Request timed out after {timeout}s") from e

    if response.status_code == 401:
        raise MiniMaxAuthError("Invalid MiniMax API key", status_code=401, response_body=response.text)
    if response.status_code >= 400:
        raise MiniMaxError(
            f"MiniMax API error {response.status_code}",
            status_code=response.status_code,
            response_body=response.text,
        )

    return response.json()


# ?? Text-to-Speech (TTS) ??????????????????????????????????????????????????????


class TTSModel(str):
    """MiniMax TTS models."""

    E2ALL_TURBO = "e2all-turbo"  # Fast, good quality


async def text_to_speech(
    text: str,
    model: str = TTSModel.E2ALL_TURBO,
    voice: str = "default",
    response_format: str = "mp3",
    speed: float = 1.0,
) -> bytes:
    """
    Convert text to speech using MiniMax TTS.

    Args:
        text: The text to synthesize (max ~1000 chars for best quality).
        model: TTS model to use.
        voice: Voice name/ID.
        response_format: Output format (mp3, wav, etc.).
        speed: Speech speed (0.5 - 2.0).

    Returns:
        Raw audio bytes (MP3/WAV).
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    if not text.strip():
        raise MiniMaxError("Text cannot be empty")

    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": response_format,
        "speed": speed,
    }

    # Use chat completions endpoint for TTS
    result = await _post("/audio/speech", payload, timeout=30.0)
    return result.get("audio_data", b"")  # In practice, response is raw bytes


# ?? Music Generation ?????????????????????????????????????????????????????????


class MusicModel(str):
    """MiniMax music generation models."""

    MUSIC_2_6 = "music-2.6"


async def generate_music(
    prompt: str,
    model: str = MusicModel.MUSIC_2_6,
    duration: int = 30,
    instrumental: bool = False,
) -> dict[str, Any]:
    """
    Generate music using MiniMax music-2.6 model.

    Args:
        prompt: Text description of the music to generate.
        model: Music model (default: music-2.6).
        duration: Duration in seconds (15-180).
        instrumental: If True, generate instrumental only.

    Returns:
        Dict containing audio_url or task_id for polling.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    if not prompt.strip():
        raise MiniMaxError("Prompt cannot be empty")

    duration = max(15, min(180, duration))

    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "instrumental": instrumental,
    }

    # Sync request for short durations (< 60s)
    if duration <= 60:
        return await _post("/v1/audio/generations", payload, timeout=120.0)

    # For longer generation, return task_id for polling
    result = await _post("/v1/audio/generations", payload, timeout=30.0)
    return result


async def poll_music_task(task_id: str) -> dict[str, Any]:
    """Poll for music generation task status."""
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    url = f"{_base_url}/v1/audio/generations/{task_id}"
    headers = _build_headers()

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)

    if response.status_code >= 400:
        raise MiniMaxError(
            f"Failed to poll task: {response.status_code}",
            status_code=response.status_code,
            response_body=response.text,
        )

    return response.json()


# ?? Lyrics Generation ?????????????????????????????????????????????????????????


async def generate_lyrics(
    theme: str,
    style: str = "pop",
    model: str = "MiniMax-M2",
) -> dict[str, Any]:
    """
    Generate song lyrics based on a theme using MiniMax M2.

    Args:
        theme: The topic or story to write about.
        style: Music style (pop, rock, ballad, hiphop, electronic, etc.).
        model: Chat model to use for generation.

    Returns:
        Dict containing generated lyrics with structure (verse, chorus, bridge).
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    if not theme.strip():
        raise MiniMaxError("Theme cannot be empty")

    prompt = f"""雿銝雿?璆剔?甇??萎?鈭箝??寞?隞乩?銝駁??◢?潘??萎?銝擐??氬?蝯????脫?閰?

銝駁?嚗theme}
憸冽嚗style}

隢??找誑銝撘雿?
1. 銝餅? 1 (Verse 1)
2. ?舀? (Chorus)
3. 銝餅? 2 (Verse 2)
4. ?舀? (Chorus)
5. 璈挾 (Bridge)
6. ?蝯甇?(Final Chorus)

閬?嚗?
- 甇?閬????梢陷
- ?潮?芰
- ?拙?瞍
- 銝剜?????舀?◢?潸?矽??

隢?仿?憪雿?閰?"""

    messages = [
        {"role": "system", "content": "雿銝雿?璆剔?甇??萎?鈭綽???萎??箸?鈭箝??餃????脫?閰?},
        {"role": "user", "content": prompt},
    ]

    result = await chat_completion(messages=messages, model=model, temperature=0.8, max_tokens=1024)
    return result


# ?? Image Understanding (Vision) ??????????????????????????????????????????????


async def image_understanding(
    image_url: str | None = None,
    image_base64: str | None = None,
    prompt: str = "隢底蝝唳?餈圈撐???摰嫘?,
    model: str = "MiniMax-M2",
) -> dict[str, Any]:
    """
    Analyze images using MiniMax's vision capabilities.

    Args:
        image_url: URL of the image to analyze.
        image_base64: Base64 encoded image data.
        prompt: Question or instruction about the image.
        model: Vision model to use.

    Returns:
        Dict containing image analysis result.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    if not image_url and not image_base64:
        raise MiniMaxError("Either image_url or image_base64 must be provided")

    # Build image content
    if image_url:
        image_content = {"type": "image_url", "image_url": {"url": image_url}}
    else:
        image_content = {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": [image_content, {"type": "text", "text": prompt}]},
        ],
        "max_tokens": 2048,
    }

    return await _post("/v1/images/understand", payload, timeout=60.0)


# ?? Web Search (RAG) ???????????????????????????????????????????????????????????


class SearchModel(str):
    """MiniMax search models."""

    SEARCH_PRO = "search-pro"
    SEARCH_STANDARD = "search-standard"


async def web_search(
    query: str,
    model: str = SearchModel.SEARCH_PRO,
    num_results: int = 5,
    recency_days: int | None = None,
) -> dict[str, Any]:
    """
    Search the web for current information using MiniMax search API.

    Args:
        query: Search query string.
        model: Search model to use.
        num_results: Number of results to return (1-10).
        recency_days: Limit results to recent days (optional).

    Returns:
        Dict containing search results with sources and summaries.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    if not query.strip():
        raise MiniMaxError("Query cannot be empty")

    num_results = max(1, min(10, num_results))

    payload = {
        "model": model,
        "query": query,
        "num_results": num_results,
    }

    if recency_days:
        payload["recency_days"] = recency_days

    return await _post("/v1/search", payload, timeout=30.0)


async def rag_search(
    query: str,
    context: str,
    model: str = "MiniMax-M2",
) -> dict[str, Any]:
    """
    Perform RAG-style search: search web + synthesize answer with context.

    Args:
        query: User's question.
        context: Additional context to ground the answer.
        model: Chat model for synthesis.

    Returns:
        Dict containing synthesized answer with citations.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    # First search for relevant information
    search_results = await web_search(query=query, num_results=5)

    # Build context from search results
    sources = search_results.get("data", [])
    context_text = "\n\n".join([
        f"靘? {i+1}: {s.get('title', 'N/A')}\n??: {s.get('snippet', 'N/A')}"
        for i, s in enumerate(sources)
    ])

    # Synthesize answer
    prompt = f"""?寞?隞乩??揣蝯???憭?銝?嚗????冽????

?揣蝯?嚗?
{context_text}

憿?銝???
{context}

?冽??嚗query}

隢策?箸?蝣箝?靘???蝑?銝阡?嗅??其?皞?""

    messages = [
        {"role": "system", "content": "雿銝?移皞??鞈??拇????撖血?蝑?銝?蝺券?},
        {"role": "user", "content": prompt},
    ]

    result = await chat_completion(messages=messages, model=model, temperature=0.3, max_tokens=2048)
    result["sources"] = sources
    return result


# ?? Music Cover / Reprise ??????????????????????????????????????????????????????


async def music_cover(
    source_audio_url: str | None = None,
    source_audio_base64: str | None = None,
    style: str = "pop",
    vocals_style: str = "natural",
) -> dict[str, Any]:
    """
    Create a cover version of existing music with different style.

    Args:
        source_audio_url: URL of source audio.
        source_audio_base64: Base64 encoded audio.
        style: Target style (pop, rock, jazz, electronic, etc.).
        vocals_style: Vocals processing style.

    Returns:
        Dict containing task_id for polling or audio_url.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    if not source_audio_url and not source_audio_base64:
        raise MiniMaxError("Source audio URL or base64 required")

    payload = {
        "model": "music-cover",
        "style": style,
        "vocals_style": vocals_style,
    }

    if source_audio_url:
        payload["source_audio_url"] = source_audio_url
    else:
        payload["source_audio_base64"] = source_audio_base64

    return await _post("/v1/audio/covers", payload, timeout=30.0)


# ?? Text Completion (MiniMax M2) ?????????????????????????????????????????????


async def chat_completion(
    messages: list[dict[str, str]],
    model: str = "MiniMax-M2",
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> dict[str, Any]:
    """
    Send a chat completion request to MiniMax M2 via LiteLLM proxy.

    Args:
        messages: List of message dicts with 'role' and 'content'.
        model: Model name.
        temperature: Sampling temperature.
        max_tokens: Maximum tokens to generate.

    Returns:
        OpenAI-style response dict.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    # Map to LiteLLM model name if using proxy
    litellm_model = f"{_model_prefix}{model}" if _use_litellm else model

    payload = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    return await _post("/chat/completions", payload, timeout=60.0)


# ?? Streaming Chat Completion ????????????????????????????????????????????????


async def stream_chat_completion(
    messages: list[dict[str, str]],
    model: str = "MiniMax-M2",
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """
    Stream a chat completion response from MiniMax.

    Yields:
        Text chunks as they arrive.
    """
    if not MINIMAX_API_KEY:
        raise MiniMaxError("MINIMAX_API_KEY is not set")

    litellm_model = f"{_model_prefix}{model}" if _use_litellm else model

    url = f"{_base_url}/chat/completions"
    headers = _build_headers()

    payload = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    async with (
        httpx.AsyncClient(timeout=120.0) as client,
        client.stream("POST", url, json=payload, headers=headers) as response,
    ):
        if response.status_code >= 400:
            body = await response.aread()
            raise MiniMaxError(
                f"MiniMax API error {response.status_code}",
                status_code=response.status_code,
                response_body=body.decode(),
            )

        async for line in response.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            if data:
                yield data

