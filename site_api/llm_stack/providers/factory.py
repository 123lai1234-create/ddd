"""
site_api/llm_stack/providers/factory.py — Provider registry and factory.

Use `get_provider(name)` to lazily construct a provider. The first call
performs class instantiation; subsequent calls return the cached instance.

Use `register_provider(name, cls)` to register a custom provider alias.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Type

from site_api.llm_stack.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)


# ── Registry ──────────────────────────────────────────────────────────────────

_REGISTRY: dict[str, Type[BaseLLMProvider]] = {}
_INSTANCES: dict[str, BaseLLMProvider] = {}


def register_provider(name: str, cls: Type[BaseLLMProvider]) -> None:
    """Register a provider class under the given name (lowercase)."""
    _REGISTRY[name.lower()] = cls


def list_providers() -> list[dict[str, Any]]:
    """Return a list of `{"name", "configured", "default_model"}` for every registered provider."""
    out: list[dict[str, Any]] = []
    for name, cls in _REGISTRY.items():
        try:
            inst = cls()
            configured = inst.is_configured()
            default_model = getattr(inst, "default_model", None)
        except Exception as e:  # pragma: no cover
            logger.warning("Failed to introspect provider %s: %s", name, e)
            configured, default_model = False, None
        out.append({"name": name, "configured": configured, "default_model": default_model})
    return out


def get_provider(name: str, *, use_cache: bool = True, **kwargs: Any) -> BaseLLMProvider:
    """Construct (or return cached) provider by name.

    Raises:
        KeyError: if the provider is not registered.
    """
    name = name.lower()
    if name not in _REGISTRY:
        raise KeyError(
            f"Provider '{name}' is not registered. Known providers: {sorted(_REGISTRY.keys())}"
        )
    if use_cache and name in _INSTANCES and not kwargs:
        return _INSTANCES[name]
    cls = _REGISTRY[name]
    inst = cls(**kwargs)
    if use_cache and not kwargs:
        _INSTANCES[name] = inst
    return inst


def get_configured_provider(prefer: list[str] | None = None) -> BaseLLMProvider | None:
    """Return the first provider from `prefer` (or provider priority order) that is configured.

    Default priority: minimax (existing), openai, anthropic, gemini.
    """
    order = prefer or ["minimax", "openai", "anthropic", "gemini"]
    for name in order:
        try:
            inst = get_provider(name)
        except KeyError:
            continue
        if inst.is_configured():
            return inst
    return None


# ── Built-in registration ─────────────────────────────────────────────────────


def _register_builtins() -> None:
    # Imported here so we don't introduce a circular import.
    from site_api.llm_stack.providers.anthropic_provider import AnthropicProvider
    from site_api.llm_stack.providers.gemini_provider import GeminiProvider
    from site_api.llm_stack.providers.minimax_provider import MiniMaxProvider
    from site_api.llm_stack.providers.openai_provider import OpenAIProvider

    register_provider("openai", OpenAIProvider)
    register_provider("anthropic", AnthropicProvider)
    register_provider("claude", AnthropicProvider)  # alias
    register_provider("gemini", GeminiProvider)
    register_provider("google", GeminiProvider)  # alias
    register_provider("minimax", MiniMaxProvider)


_register_builtins()
