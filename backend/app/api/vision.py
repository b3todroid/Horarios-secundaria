"""Importación de carga horaria desde fotografías."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..config import get_settings
from ..errors import Invalid
from ..repositories.base import Repository
from ..services.importer import ConfirmImport, confirm_import
from ..vision.base import prepare_image
from ..vision.registry import get_provider, list_providers
from .deps import get_repo

router = APIRouter(tags=["importación"])

MAX_PAGES = 10


@router.get("/vision/providers")
def providers():
    return list_providers()


@router.post("/vision/recognize")
async def recognize(provider: str = Form("demo"), files: list[UploadFile] = File(...)):
    """Reconoce las imágenes. El resultado NO se guarda: se devuelve para revisión."""
    if not files:
        raise Invalid("Agrega al menos una imagen.")
    if len(files) > MAX_PAGES:
        raise Invalid(f"Se pueden procesar hasta {MAX_PAGES} páginas a la vez.")
    limit = get_settings().max_upload_mb * 1024 * 1024
    pages = []
    for f in files:
        raw = await f.read()
        if len(raw) > limit:
            raise Invalid(f"La imagen «{f.filename}» supera {get_settings().max_upload_mb} MB.")
        pages.append(prepare_image(raw))
    return get_provider(provider).recognize(pages)


@router.post("/projects/{pid}/import/confirm")
def confirm(pid: str, body: ConfirmImport, repo: Repository = Depends(get_repo)):
    return confirm_import(repo, pid, body)
