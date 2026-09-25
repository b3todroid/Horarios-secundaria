"""Arquitectura de proveedores de reconocimiento de imágenes.

Para agregar un proveedor nuevo:
  1. Crea una clase que herede de `VisionProvider` e implemente `recognize_raw`.
  2. Regístrala con `register_provider(MiProveedor())` en `vision/registry.py`.
Las claves de API se leen solo en el backend (variables de entorno).
"""
from __future__ import annotations

import base64
import io
import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError, field_validator

from .. import schemas as s
from ..errors import Invalid

LOW_CONFIDENCE = 0.7


@dataclass
class ImagePage:
    data: bytes  # JPEG normalizado
    media_type: str = "image/jpeg"

    @property
    def b64(self) -> str:
        return base64.standard_b64encode(self.data).decode("ascii")


class RecognizedAssignment(BaseModel):
    subject: str = ""
    group: str = ""
    hours: int = Field(default=0, ge=0, le=45)


class RecognizedTeacher(BaseModel):
    code: str = ""
    name: str = ""
    subjects: list[str] = []
    assignments: list[RecognizedAssignment] = []
    weekly_load: int = Field(default=0, ge=0, le=45)
    allows_consecutive: bool = True
    max_consecutive: int = Field(default=3, ge=1, le=9)
    availability: list[s.AvailabilityCellIO] = []
    confidence: dict[str, float] = {}
    warnings: list[str] = []

    @field_validator("confidence")
    @classmethod
    def _clamp(cls, v: dict[str, float]) -> dict[str, float]:
        return {k: max(0.0, min(1.0, float(x))) for k, x in v.items()}


class RecognitionResult(BaseModel):
    provider: str
    provider_label: str
    pages: int
    teachers: list[RecognizedTeacher]
    overall_confidence: float
    warnings: list[str] = []


PROMPT = """Eres un asistente que transcribe formatos escolares de carga horaria de secundaria (México).
La imagen muestra el formato de uno o varios maestros. Extrae SOLO lo que se ve; no inventes datos.

Devuelve únicamente un objeto JSON (sin texto adicional ni bloques de código) con esta forma:
{
  "teachers": [
    {
      "code": "identificador si aparece, si no cadena vacía",
      "name": "nombre completo",
      "subjects": ["materias que imparte"],
      "assignments": [{"subject": "materia", "group": "grupo como 1A", "hours": 5}],
      "weekly_load": 0,
      "allows_consecutive": true,
      "max_consecutive": 3,
      "availability": [{"day": 0, "period_number": 1, "state": "blocked"}],
      "confidence": {"name": 0.0, "subjects": 0.0, "assignments": 0.0, "weekly_load": 0.0,
                     "max_consecutive": 0.0, "availability": 0.0},
      "warnings": ["dudas concretas, por ejemplo: 'la hora del martes no se lee bien'"]
    }
  ]
}
Reglas: day 0=lunes … 4=viernes; period_number 1 a 9; state es "available", "flexible" o "blocked"
(solo incluye celdas flexibles o bloqueadas; marcas en rojo, X o "no" suelen ser bloqueadas;
amarillo o "preferible no" suelen ser flexibles). confidence va de 0 a 1 por campo.
Si un dato no aparece, deja el valor por defecto y baja la confianza de ese campo."""


class VisionProvider(ABC):
    id: str
    label: str
    needs_key: bool = True

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def recognize_raw(self, pages: list[ImagePage]) -> dict:
        """Devuelve un diccionario con la clave `teachers` (ver PROMPT)."""

    def recognize(self, pages: list[ImagePage]) -> RecognitionResult:
        if not self.is_configured():
            raise Invalid(f"El proveedor «{self.label}» no tiene clave configurada en el servidor. "
                          "Usa la captura manual o el proveedor de demostración.")
        raw = self.recognize_raw(pages)
        return normalize(raw, self, len(pages))


def prepare_image(data: bytes, max_side: int = 1800) -> ImagePage:
    """Valida que el archivo sea una imagen, corrige su orientación y la convierte a JPEG."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise Invalid("El archivo no es una imagen válida (usa JPG, PNG o WEBP).") from exc
    img = img.convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88)
    return ImagePage(out.getvalue())


def parse_json_text(text: str) -> dict:
    """Extrae el primer objeto JSON de una respuesta de texto."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise Invalid("El proveedor de visión no devolvió datos legibles. Intenta con otra foto o captura manual.")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise Invalid("El proveedor de visión devolvió datos incompletos. Intenta de nuevo.") from exc


def normalize(raw: dict, provider: VisionProvider, pages: int) -> RecognitionResult:
    teachers: list[RecognizedTeacher] = []
    warnings: list[str] = []
    for i, item in enumerate(raw.get("teachers") or [], start=1):
        try:
            t = RecognizedTeacher.model_validate(item)
        except ValidationError:
            warnings.append(f"No se pudo interpretar el registro {i}; captúralo manualmente.")
            continue
        extra = list(t.warnings)
        for field in ("name", "subjects", "assignments", "weekly_load", "max_consecutive", "availability"):
            t.confidence.setdefault(field, 0.5)
        if not t.name.strip():
            extra.append("No se reconoció el nombre del maestro.")
            t.confidence["name"] = 0.0
        total = sum(a.hours for a in t.assignments)
        if t.weekly_load and total and total != t.weekly_load:
            extra.append(f"La suma de horas por grupo ({total}) no coincide con la carga semanal ({t.weekly_load}).")
        for a in t.assignments:
            if not a.subject or not a.group or a.hours == 0:
                extra.append("Hay una fila de materia/grupo incompleta.")
                break
        low = [k for k, v in t.confidence.items() if v < LOW_CONFIDENCE]
        if low:
            extra.append("Revisa con cuidado: " + ", ".join(FIELD_LABELS.get(k, k) for k in low) + ".")
        t.warnings = list(dict.fromkeys(extra))
        teachers.append(t)
    if not teachers:
        warnings.append("No se reconoció ningún maestro. Puedes capturar los datos manualmente.")
    confs = [v for t in teachers for v in t.confidence.values()]
    return RecognitionResult(
        provider=provider.id, provider_label=provider.label, pages=pages, teachers=teachers,
        overall_confidence=round(sum(confs) / len(confs), 2) if confs else 0.0, warnings=warnings,
    )


FIELD_LABELS = {
    "name": "nombre",
    "subjects": "materias",
    "assignments": "grupos y horas",
    "weekly_load": "horas semanales",
    "max_consecutive": "máximo de horas consecutivas",
    "availability": "disponibilidad",
}
