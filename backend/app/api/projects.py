"""Proyectos, configuración de horas, respaldos y demostraciones."""
from __future__ import annotations

import json
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError

from .. import schemas as s
from ..errors import Invalid
from ..repositories.base import Repository
from ..services.demo import build_demo
from .deps import get_repo

router = APIRouter(tags=["proyectos"])


@router.get("/projects", response_model=list[s.ProjectOut])
def list_projects(repo: Repository = Depends(get_repo)):
    return repo.list_projects()


@router.post("/projects", response_model=s.ProjectOut, status_code=201)
def create_project(body: s.ProjectIn, repo: Repository = Depends(get_repo)):
    return repo.create_project(body.name)


@router.get("/projects/{pid}", response_model=s.ProjectOut)
def get_project(pid: str, repo: Repository = Depends(get_repo)):
    return repo.get_project(pid)


@router.put("/projects/{pid}", response_model=s.ProjectOut)
def rename_project(pid: str, body: s.ProjectIn, repo: Repository = Depends(get_repo)):
    return repo.rename_project(pid, body.name)


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: str, repo: Repository = Depends(get_repo)):
    repo.delete_project(pid)


# ------------------------------------------------------------ periodos
@router.get("/projects/{pid}/periods", response_model=list[s.PeriodOut])
def list_periods(pid: str, repo: Repository = Depends(get_repo)):
    return repo.list_periods(pid)


@router.put("/projects/{pid}/periods", response_model=list[s.PeriodOut])
def replace_periods(pid: str, body: s.PeriodsIn, repo: Repository = Depends(get_repo)):
    return repo.replace_periods(pid, body.periods)


# ------------------------------------------------------------ demostración
@router.post("/demo/{kind}", response_model=s.ProjectOut, status_code=201)
def create_demo(kind: str, repo: Repository = Depends(get_repo)):
    """Crea (o recrea) un proyecto de demostración aislado de los datos reales."""
    if kind not in ("solvable", "conflict"):
        raise Invalid("Usa 'solvable' (con solución) o 'conflict' (con conflicto).")
    for p in repo.list_projects():
        if p.is_demo and p.demo_kind == kind:
            repo.delete_project(p.id)
    return repo.import_project(build_demo(kind), is_demo=True, demo_kind=kind)


# ------------------------------------------------------------ respaldos
@router.get("/projects/{pid}/backup")
def export_backup(pid: str, repo: Repository = Depends(get_repo)):
    data = repo.export_project(pid)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    plain = unicodedata.normalize("NFKD", data.project.name).encode("ascii", "ignore").decode()
    safe = "".join(c if c.isalnum() else "-" for c in plain)[:40] or "proyecto"
    return Response(
        content=data.model_dump_json(indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="respaldo-{safe}-{stamp}.json"'},
    )


def _parse_backup(raw: bytes) -> s.ProjectData:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Invalid("El archivo no es un JSON válido.") from exc
    if not isinstance(payload, dict) or payload.get("format") != "horarios-secundaria":
        raise Invalid("El archivo no es un respaldo de Horarios de Secundaria.")
    try:
        return s.ProjectData.model_validate(payload)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = " → ".join(str(x) for x in first.get("loc", []))
        raise Invalid(f"El respaldo tiene datos inválidos ({where}): {first.get('msg')}") from exc


@router.post("/backup/inspect")
async def inspect_backup(file: UploadFile = File(...)):
    """Lee un respaldo y devuelve un resumen para pedir confirmación antes de restaurar."""
    data = _parse_backup(await file.read())
    return {
        "name": data.project.name,
        "exported_at": data.exported_at,
        "teachers": len(data.teachers),
        "groups": len(data.groups),
        "subjects": len(data.subjects),
        "assignments": len(data.assignments),
        "schedule_entries": len(data.schedule),
    }


@router.post("/backup/restore", response_model=s.ProjectOut)
async def restore_backup(
    file: UploadFile = File(...),
    mode: str = Query("new", pattern="^(new|replace)$"),
    project_id: str | None = None,
    confirm: bool = False,
    repo: Repository = Depends(get_repo),
):
    data = _parse_backup(await file.read())
    if mode == "replace":
        if not project_id:
            raise Invalid("Indica qué proyecto se reemplaza.")
        if not confirm:
            raise Invalid("Reemplazar un proyecto borra su información actual. Confirma la operación.")
        return repo.import_project(data, replace_project_id=project_id)
    return repo.import_project(data)
