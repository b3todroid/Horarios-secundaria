"""Registro de proveedores de visión disponibles."""
from __future__ import annotations

from ..errors import NotFound
from .base import VisionProvider
from .providers import AnthropicProvider, DemoProvider, OpenAIProvider

_PROVIDERS: dict[str, VisionProvider] = {}


def register_provider(provider: VisionProvider) -> None:
    _PROVIDERS[provider.id] = provider


def get_provider(provider_id: str) -> VisionProvider:
    try:
        return _PROVIDERS[provider_id]
    except KeyError as exc:
        raise NotFound(f"Proveedor de reconocimiento desconocido: {provider_id}") from exc


def list_providers() -> list[dict]:
    return [
        {"id": p.id, "label": p.label, "configured": p.is_configured(), "needs_key": p.needs_key}
        for p in _PROVIDERS.values()
    ]


register_provider(DemoProvider())
register_provider(OpenAIProvider())
register_provider(AnthropicProvider())
