"""
site_api/llm_stack/__routes_llm.py — FastAPI routes for the LLM stack.

Path prefix: `/llm`
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from site_api.llm_stack.providers.factory import (
    get_configured_provider,
    get_provider,
    list_providers,
)
from site_api.llm_stack.unified_client import llm
from site_api.llm_stack.types import LLMMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm", tags=["LLM Stack"])


# ── Models ────────────────────────────────────────────────────────────────────


class ChatMessageModel(BaseModel):
    role: str = Field(..., description="One of: system, user, assistant, tool")
    content: str = Field(default="", description="Message content")
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None


class ChatRequestModel(BaseModel):
    messages: list[ChatMessageModel] | str = Field(..., description="List of messages or a single user prompt")
    provider: str | None = Field(default=None, description="openai / anthropic / gemini / minimax")
    model: str | None = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    stream: bool = False


class ChatResponseModel(BaseModel):
    provider: str
    model: str
    content: str
    finish_reason: str | None = None
    usage: dict[str, Any] | None = None
    tool_calls: list[dict[str, Any]] | None = None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/providers")
def list_llm_providers() -> dict[str, Any]:
    """Return a summary of all LLM providers and their configuration status."""
    return {"providers": list_providers()}


@router.get("/status")
def llm_status() -> dict[str, Any]:
    """Health-check the LLM stack."""
    chosen = get_configured_provider()
    return {
        "ok": True,
        "active_provider": chosen.name if chosen else None,
        "providers": list_providers(),
    }


@router.post("/chat", response_model=ChatResponseModel)
async def chat_endpoint(request: ChatRequestModel) -> ChatResponseModel:
    """Send a chat completion to the chosen provider (or auto-detected)."""
    try:
        if request.stream:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use /llm/chat/stream for streaming responses.",
            )
        messages: list[LLMMessage] = []
        if isinstance(request.messages, str):
            messages = [LLMMessage.user(request.messages)]
        else:
            for m in request.messages:
                messages.append(
                    LLMMessage(
                        role=m.role,
                        content=m.content,
                        name=m.name,
                        tool_call_id=m.tool_call_id,
                        tool_calls=m.tool_calls,
                    )
                )
        resp = await llm.chat(
            messages,
            provider=request.provider,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        return ChatResponseModel(
            provider=resp.provider,
            model=resp.model,
            content=resp.content,
            finish_reason=resp.finish_reason,
            usage=resp.usage,
            tool_calls=resp.tool_calls,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("Chat failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM error: {e}") from e


@router.post("/chat/stream")
async def chat_stream_endpoint(request: ChatRequestModel):
    """Stream a chat completion response as Server-Sent Events."""
    if isinstance(request.messages, str):
        messages = [LLMMessage.user(request.messages)]
    else:
        messages = [
            LLMMessage(
                role=m.role,
                content=m.content,
                name=m.name,
                tool_call_id=m.tool_call_id,
                tool_calls=m.tool_calls,
            )
            for m in request.messages
        ]

    async def event_generator():
        try:
            async for chunk in llm.stream_chat(
                messages,
                provider=request.provider,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Stream failed")
            yield f"data: [ERROR] {e}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/provider/{name}")
def provider_info(name: str) -> dict[str, Any]:
    """Return detailed info about a single provider."""
    try:
        p = get_provider(name)
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return {
        "name": p.name,
        "default_model": p.default_model,
        "configured": p.is_configured(),
        "api_key_set": bool(p.api_key),
        "api_base": p.api_base,
    }
