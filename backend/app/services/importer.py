"""Guardado de los datos revisados por el usuario tras la importación de fotografías.

Nada se guarda automáticamente: este código solo se ejecuta cuando el usuario
pulsa «Confirmar e importar» con los datos ya corregidos.
"""
from __future__ import annotations

import re

from pydantic import BaseModel, Field

from .. import schemas as s
from ..errors import Invalid
from ..repositories.base import Repository


class ConfirmAssignment(BaseModel):
    subject: str = Field(min_length=1)
    group: str = Field(min_length=1)
    hours: int = Field(ge=1, le=45)


class ConfirmTeacher(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=160)
    subjects: list[str] = []
    assignments: list[ConfirmAssignment] = []
    weekly_load: int = Field(ge=0, le=45)
    allows_consecutive: bool = True
    max_consecutive: int = Field(default=3, ge=1, le=9)
    availability: list[s.AvailabilityCellIO] = []


class ConfirmImport(BaseModel):
    teachers: list[ConfirmTeacher] = Field(min_length=1)


def _grade_from(name: str) -> int:
    m = re.match(r"\s*(\d+)", name)
    return int(m.group(1)) if m else 1


def confirm_import(repo: Repository, project_id: str, data: ConfirmImport) -> dict:
    subjects = {x.name.lower(): x for x in repo.list_subjects(project_id)}
    groups = {x.name.lower(): x for x in repo.list_groups(project_id)}
    teachers = {x.code.lower(): x for x in repo.list_teachers(project_id)}
    created = {"subjects": [], "groups": [], "teachers": [], "updated_teachers": [], "assignments": 0}

    def subject(name: str) -> s.SubjectOut:
        key = name.strip().lower()
        if key not in subjects:
            subjects[key] = repo.create_subject(project_id, s.SubjectIn(name=name.strip()))
            created["subjects"].append(subjects[key].name)
        return subjects[key]

    def group(name: str) -> s.GroupOut:
        key = name.strip().lower()
        if key not in groups:
            groups[key] = repo.create_group(project_id, s.GroupIn(grade=_grade_from(name), name=name.strip().upper()))
            created["groups"].append(groups[key].name)
        return groups[key]

    codes = [t.code.strip().lower() for t in data.teachers]
    if len(set(codes)) != len(codes):
        raise Invalid("Hay identificadores de maestro repetidos en la importación.")

    for t in data.teachers:
        subj_names = list(dict.fromkeys([*t.subjects, *(a.subject for a in t.assignments)]))
        subj_ids = [subject(n).id for n in subj_names if n.strip()]
        payload = s.TeacherIn(code=t.code, name=t.name, subject_ids=subj_ids, weekly_load=t.weekly_load,
                              allows_consecutive=t.allows_consecutive, max_consecutive=t.max_consecutive)
        existing = teachers.get(t.code.strip().lower())
        if existing:
            payload.subject_ids = list(dict.fromkeys([*existing.subject_ids, *subj_ids]))
            teacher = repo.update_teacher(project_id, existing.id, payload)
            created["updated_teachers"].append(teacher.name)
        else:
            teacher = repo.create_teacher(project_id, payload)
            created["teachers"].append(teacher.name)
        repo.set_availability(project_id, teacher.id, t.availability)

        current = {(a.teacher_id, a.subject_id, a.group_id): a for a in repo.list_assignments(project_id)}
        for a in t.assignments:
            data_in = s.AssignmentIn(teacher_id=teacher.id, subject_id=subject(a.subject).id,
                                     group_id=group(a.group).id, hours_per_week=a.hours)
            prev = current.get((data_in.teacher_id, data_in.subject_id, data_in.group_id))
            if prev:
                repo.update_assignment(project_id, prev.id, data_in)
            else:
                repo.create_assignment(project_id, data_in)
            created["assignments"] += 1
    return created
