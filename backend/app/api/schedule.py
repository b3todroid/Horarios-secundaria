"""Generación, consulta, edición manual y exportación del horario."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel

from .. import schemas as s
from ..config import get_settings
from ..errors import Conflict, NotFound
from ..exporters.common import tables_for
from ..exporters.excel import render_excel
from ..exporters.pdf import render_pdf
from ..repositories.base import Repository
from ..services.context import load_context
from ..services.editing import MoveRequest, describe_move, plan_move
from ..services.validation import flexible_usage, load_summary, pending_assignments, schedule_conflicts
from ..solver.cpsat import generate
from .deps import get_repo

router = APIRouter(prefix="/projects/{pid}", tags=["horario"])


class GenerateIn(BaseModel):
    keep_locked: bool = True


def _state(repo: Repository, pid: str) -> dict:
    ctx = load_context(repo, pid)
    return {
        "entries": [e.model_dump() for e in ctx.schedule],
        "conflicts": schedule_conflicts(ctx, ctx.schedule),
        "pending": pending_assignments(ctx, ctx.schedule),
        "flexible_used": flexible_usage(ctx, ctx.schedule),
        "loads": [x.model_dump() for x in load_summary(ctx)],
        "history": repo.history_labels(pid),
        "last_run": repo.last_run(pid),
    }


@router.get("/schedule")
def get_schedule(pid: str, repo: Repository = Depends(get_repo)):
    return _state(repo, pid)


@router.post("/generate")
def run_generate(pid: str, body: GenerateIn = GenerateIn(), repo: Repository = Depends(get_repo)):
    settings = get_settings()
    ctx = load_context(repo, pid)
    result = generate(ctx, keep_locked=body.keep_locked, time_limit=settings.solver_time_limit_seconds,
                      workers=settings.solver_workers)
    if result["entries"] is not None:
        has_locks = body.keep_locked and any(e.locked for e in ctx.schedule)
        label = "Regeneración de clases no fijadas" if has_locks else "Generación automática"
        repo.replace_schedule(pid, result["entries"], label)
    report = {"status": result["status"], **result["report"]}
    repo.save_run(pid, result["status"], report)
    return {"status": result["status"], "report": report, "schedule": _state(repo, pid)}


@router.post("/schedule/preview")
def preview_move(pid: str, body: MoveRequest, repo: Repository = Depends(get_repo)):
    preview, _ = plan_move(load_context(repo, pid), body)
    return preview


@router.post("/schedule/apply")
def apply_move(pid: str, body: MoveRequest, repo: Repository = Depends(get_repo)):
    preview, entries = plan_move(load_context(repo, pid), body)
    if not preview["allowed"]:
        raise Conflict("El cambio produce conflictos y no se guardó.", details=preview["conflicts"])
    repo.replace_schedule(pid, entries, describe_move(preview))
    return {"preview": preview, "schedule": _state(repo, pid)}


class LockIn(BaseModel):
    locked: bool


@router.patch("/schedule/entries/{eid}")
def set_lock(pid: str, eid: str, body: LockIn, repo: Repository = Depends(get_repo)):
    entries = repo.list_schedule(pid)
    target = next((e for e in entries if e.id == eid), None)
    if target is None:
        raise NotFound("La clase no existe.")
    target.locked = body.locked
    ctx = load_context(repo, pid)
    d = ctx.describe(target.assignment_id)
    label = f"{'Fijar' if body.locked else 'Liberar'} {d['subject']} ({d['group']})"
    repo.replace_schedule(pid, entries, label)
    return _state(repo, pid)


@router.delete("/schedule/entries/{eid}")
def remove_entry(pid: str, eid: str, repo: Repository = Depends(get_repo)):
    entries = repo.list_schedule(pid)
    target = next((e for e in entries if e.id == eid), None)
    if target is None:
        raise NotFound("La clase no existe.")
    d = load_context(repo, pid).describe(target.assignment_id)
    repo.replace_schedule(pid, [e for e in entries if e.id != eid],
                          f"Quitar {d['subject']} ({d['group']}) del horario")
    return _state(repo, pid)


@router.post("/schedule/undo")
def undo(pid: str, repo: Repository = Depends(get_repo)):
    label, _ = repo.undo_schedule(pid)
    return {"undone": label, "schedule": _state(repo, pid)}


@router.delete("/schedule")
def clear_schedule(pid: str, repo: Repository = Depends(get_repo)):
    repo.replace_schedule(pid, [], "Borrar horario")
    return _state(repo, pid)


# ------------------------------------------------------------ exportación
@router.get("/export/pdf")
def export_pdf(
    pid: str,
    scope: str = Query("group", pattern="^(group|teacher|general)$"),
    item_id: str | None = None,
    orientation: str = Query("landscape", pattern="^(landscape|portrait)$"),
    repo: Repository = Depends(get_repo),
):
    ctx = load_context(repo, pid)
    pdf = render_pdf(tables_for(ctx, scope, item_id), orientation)
    names = {"group": "grupos", "teacher": "maestros", "general": "general"}
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="horario-{names[scope]}.pdf"'})


@router.get("/export/xlsx")
def export_xlsx(pid: str, repo: Repository = Depends(get_repo)):
    data = render_excel(load_context(repo, pid))
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="horarios.xlsx"'})


@router.get("/export/json")
def export_json(pid: str, repo: Repository = Depends(get_repo)):
    data: s.ProjectData = repo.export_project(pid)
    return Response(data.model_dump_json(indent=2), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="horarios.json"'})
