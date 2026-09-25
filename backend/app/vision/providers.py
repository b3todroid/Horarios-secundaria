"""Proveedores concretos de reconocimiento."""
from __future__ import annotations

import hashlib

from ..config import get_settings
from ..errors import DomainError, Invalid
from .base import PROMPT, ImagePage, VisionProvider, parse_json_text


class DemoProvider(VisionProvider):
    """No usa IA: devuelve un ejemplo fijo para practicar la pantalla de revisión."""

    id = "demo"
    label = "Demostración local (sin IA)"
    needs_key = False

    def is_configured(self) -> bool:
        return True

    def recognize_raw(self, pages: list[ImagePage]) -> dict:
        digest = hashlib.sha1(b"".join(p.data[:2048] for p in pages)).hexdigest()
        n = int(digest[:2], 16) % 3
        names = ["María Fernanda Salas Ríos", "Luis Alberto Cano Pérez", "Rosa Isela Núñez Vega"]
        return {
            "teachers": [
                {
                    "code": f"M{90 + n}",
                    "name": names[n],
                    "subjects": ["Geografía", "Formación Cívica y Ética"],
                    "assignments": [
                        {"subject": "Geografía", "group": "1A", "hours": 4},
                        {"subject": "Geografía", "group": "1B", "hours": 4},
                        {"subject": "Formación Cívica y Ética", "group": "2A", "hours": 4},
                    ],
                    "weekly_load": 14,
                    "allows_consecutive": True,
                    "max_consecutive": 2,
                    "availability": [
                        {"day": 0, "period_number": 1, "state": "blocked"},
                        {"day": 0, "period_number": 2, "state": "blocked"},
                        {"day": 2, "period_number": 7, "state": "flexible"},
                        {"day": 4, "period_number": 6, "state": "flexible"},
                        {"day": 4, "period_number": 7, "state": "blocked"},
                    ],
                    "confidence": {"name": 0.93, "subjects": 0.88, "assignments": 0.64, "weekly_load": 0.58,
                                   "max_consecutive": 0.81, "availability": 0.72},
                    "warnings": ["Ejemplo de demostración: los datos no provienen de la imagen."],
                }
            ]
        }


class OpenAIProvider(VisionProvider):
    id = "openai"
    label = "OpenAI Vision"

    def is_configured(self) -> bool:
        return bool(get_settings().openai_api_key)

    def recognize_raw(self, pages: list[ImagePage]) -> dict:
        import openai

        settings = get_settings()
        client = openai.OpenAI(api_key=settings.openai_api_key, timeout=120)
        content: list[dict] = [{"type": "text", "text": PROMPT}]
        for p in pages:
            content.append({"type": "image_url", "image_url": {"url": f"data:{p.media_type};base64,{p.b64}"}})
        try:
            resp = client.chat.completions.create(
                model=settings.openai_vision_model,
                messages=[{"role": "user", "content": content}],
                response_format={"type": "json_object"},
            )
        except openai.AuthenticationError as exc:
            raise Invalid("La clave de OpenAI no es válida.") from exc
        except openai.RateLimitError as exc:
            raise DomainError("OpenAI rechazó la solicitud por límite de uso; intenta más tarde.") from exc
        except openai.APIError as exc:
            raise DomainError(f"Error al consultar OpenAI: {exc}") from exc
        return parse_json_text(resp.choices[0].message.content or "")


class AnthropicProvider(VisionProvider):
    id = "anthropic"
    label = "Anthropic Claude Vision"

    def is_configured(self) -> bool:
        return bool(get_settings().anthropic_api_key)

    def recognize_raw(self, pages: list[ImagePage]) -> dict:
        import anthropic

        settings = get_settings()
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=180)
        content: list[dict] = [
            {"type": "image", "source": {"type": "base64", "media_type": p.media_type, "data": p.b64}}
            for p in pages
        ]
        content.append({"type": "text", "text": PROMPT})
        try:
            resp = client.messages.create(
                model=settings.anthropic_vision_model,
                max_tokens=16000,
                messages=[{"role": "user", "content": content}],
            )
        except anthropic.AuthenticationError as exc:
            raise Invalid("La clave de Anthropic no es válida.") from exc
        except anthropic.RateLimitError as exc:
            raise DomainError("Anthropic rechazó la solicitud por límite de uso; intenta más tarde.") from exc
        except anthropic.APIStatusError as exc:
            raise DomainError(f"Error al consultar Anthropic ({exc.status_code}).") from exc
        except anthropic.APIConnectionError as exc:
            raise DomainError("No se pudo conectar con Anthropic.") from exc
        if resp.stop_reason == "refusal":
            raise DomainError("El proveedor se negó a procesar la imagen. Usa la captura manual.")
        text = "".join(b.text for b in resp.content if b.type == "text")
        return parse_json_text(text)
