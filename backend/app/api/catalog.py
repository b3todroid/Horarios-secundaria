"""Maestros, grupos, materias, asignaciones, disponibilidad y cargas."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import schemas as s
from ..repositories.base import Repository
from ..services.context import load_context
from ..services.validation import load_summary, prevalidate
from .deps import get_repo

router = APIRouter(prefix="/projects/{pid}", tags=["catálogos"])


# ------------------------------------------------------------ materias
@router.get("/subjects", response_model=list[s.SubjectOut])
def list_subjects(pid: str, repo: Repository = Depends(get_repo)):
    return repo.list_subjects(pid)


@router.post("/subjects", response_model=s.SubjectOut, status_code=201)
def create_subject(pid: str, body: s.SubjectIn, repo: Repository = Depends(get_repo)):
    return repo.create_subject(pid, body)


@router.put("/subjects/{sid}", response_model=s.SubjectOut)
def update_subject(pid: str, sid: str, body: s.SubjectIn, repo: Repository = Depends(get_repo)):
    return repo.update_subject(pid, sid, body)


@router.delete("/subjects/{sid}", status_code=204)
def delete_subject(pid: str, sid: str, repo: Repository = Depends(get_repo)):
    repo.delete_subject(pid, sid)


# ------------------------------------------------------------ grupos
@router.get("/groups", response_model=list[s.GroupOut])
def list_groups(pid: str, repo: Repository = Depends(get_repo)):
    return repo.list_groups(pid)


@router.post("/groups", response_model=s.GroupOut, status_code=201)
def create_group(pid: str, body: s.GroupIn, repo: Repository = Depends(get_repo)):
    return repo.create_group(pid, body)


@router.put("/groups/{gid}", response_model=s.GroupOut)
def update_group(pid: str, gid: str, body: s.GroupIn, repo: Repository = Depends(get_repo)):
    return repo.update_group(pid, gid, body)


@router.delete("/groups/{gid}", status_code=204)
def delete_group(pid: str, gid: str, repo: Repository = Depends(get_repo)):
    repo.delete_group(pid, gid)


# ------------------------------------------------------------ maestros
@router.get("/teachers", response_model=list[s.TeacherOut])
def list_teachers(pid: str, repo: Repository = Depends(get_repo)):
    return repo.list_teachers(pid)


@router.post("/teachers", response_model=s.TeacherOut, status_code=201)
def create_teacher(pid: str, body: s.TeacherIn, repo: Repository = Depends(get_repo)):
    return repo.create_teacher(pid, body)


@router.put("/teachers/{tid}", response_model=s.TeacherOut)
def update_teacher(pid: str, tid: str, body: s.TeacherIn, repo: Repository = Depends(get_repo)):
    return repo.update_teacher(pid, tid, body)


@router.delete("/teachers/{tid}", status_code=204)
def delete_teacher(pid: str, tid: str, repo: Repository = Depends(get_repo)):
    repo.delete_teacher(pid, tid)


@router.get("/teachers/{tid}/availability", response_model=s.AvailabilityOut)
def get_availability(pid: str, tid: str, repo: Repository = Depends(get_repo)):
    return repo.get_availability(pid, tid)


@router.put("/teachers/{tid}/availability", response_model=s.AvailabilityOut)
def set_availability(pid: str, tid: str, body: s.AvailabilityIn, repo: Repository = Depends(get_repo)):
    return repo.set_availability(pid, tid, body.cells)


# ------------------------------------------------------------ asignaciones
@router.get("/assignments", response_model=list[s.AssignmentOut])
def list_assignments(pid: str, repo: Repository = Depends(get_repo)):
    return repo.list_assignments(pid)


@router.post("/assignments", response_model=s.AssignmentOut, status_code=201)
def create_assignment(pid: str, body: s.AssignmentIn, repo: Repository = Depends(get_repo)):
    return repo.create_assignment(pid, body)


@router.put("/assignments/{aid}", response_model=s.AssignmentOut)
def update_assignment(pid: str, aid: str, body: s.AssignmentIn, repo: Repository = Depends(get_repo)):
    return repo.update_assignment(pid, aid, body)


@router.delete("/assignments/{aid}", status_code=204)
def delete_assignment(pid: str, aid: str, repo: Repository = Depends(get_repo)):
    repo.delete_assignment(pid, aid)


# ------------------------------------------------------------ cargas y validación
@router.get("/loads", response_model=list[s.LoadSummary])
def loads(pid: str, repo: Repository = Depends(get_repo)):
    return load_summary(load_context(repo, pid))


@router.get("/validate")
def validate(pid: str, repo: Repository = Depends(get_repo)):
    ctx = load_context(repo, pid)
    issues = prevalidate(ctx)
    return {
        "issues": issues,
        "errors": sum(1 for i in issues if i["severity"] == "error"),
        "warnings": sum(1 for i in issues if i["severity"] == "warning"),
        "loads": [x.model_dump() for x in load_summary(ctx)],
    }
