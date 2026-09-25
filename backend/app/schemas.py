"""Esquemas Pydantic: contrato de la API y formato de respaldo.

Estos esquemas son independientes del almacenamiento: el repositorio SQLite los
produce y un futuro repositorio de Firebase deberá producir los mismos.
"""
from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
NUM_DAYS = 5
MAX_PERIODS = 9
MAX_ACTIVE_TEACHERS = 99
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CellState(str, Enum):
    available = "available"
    flexible = "flexible"
    blocked = "blocked"


# ---------------------------------------------------------------- proyectos
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProjectOut(Orm):
    id: str
    name: str
    is_demo: bool
    demo_kind: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- periodos
class PeriodIn(BaseModel):
    number: int = Field(ge=1, le=MAX_PERIODS)
    start_time: str
    end_time: str
    active: bool = True

    @field_validator("start_time", "end_time")
    @classmethod
    def _time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError("La hora debe tener el formato HH:MM (por ejemplo 07:30).")
        return v

    @model_validator(mode="after")
    def _order(self) -> PeriodIn:
        if self.end_time <= self.start_time:
            raise ValueError(
                f"En la hora {self.number}, la hora de término debe ser posterior a la de inicio."
            )
        return self


class PeriodOut(PeriodIn, Orm):
    id: str


class PeriodsIn(BaseModel):
    periods: list[PeriodIn] = Field(min_length=1, max_length=MAX_PERIODS)

    @model_validator(mode="after")
    def _check(self) -> PeriodsIn:
        nums = [p.number for p in self.periods]
        if len(set(nums)) != len(nums):
            raise ValueError("Hay números de hora repetidos.")
        ordered = sorted(self.periods, key=lambda p: p.number)
        if not any(p.active for p in ordered):
            raise ValueError("Debe haber al menos una hora activa.")
        for a, b in zip(ordered, ordered[1:]):
            if b.start_time < a.end_time:
                raise ValueError(
                    f"La hora {b.number} empieza antes de que termine la hora {a.number}."
                )
        return self


DEFAULT_PERIODS = [
    ("07:30", "08:20"),
    ("08:20", "09:10"),
    ("09:10", "10:00"),
    ("10:00", "10:50"),
    ("11:10", "12:00"),
    ("12:00", "12:50"),
    ("12:50", "13:40"),
    ("14:00", "14:45"),
    ("14:45", "15:30"),
]


# ---------------------------------------------------------------- materias
class SubjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    short_name: str = Field(default="", max_length=20)
    color: str = Field(default="#4f6bed", pattern=r"^#[0-9a-fA-F]{6}$")
    active: bool = True

    @field_validator("name", "short_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class SubjectOut(SubjectIn, Orm):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- grupos
class GroupIn(BaseModel):
    grade: int = Field(ge=1, le=12)
    name: str = Field(min_length=1, max_length=40)
    active: bool = True

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre del grupo no puede estar vacío.")
        return v


class GroupOut(GroupIn, Orm):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- maestros
class TeacherIn(BaseModel):
    code: str = Field(min_length=1, max_length=20, description="Identificador visible, p. ej. M01")
    name: str = Field(min_length=1, max_length=160)
    subject_ids: list[str] = Field(default_factory=list)
    weekly_load: int = Field(ge=0, le=NUM_DAYS * MAX_PERIODS)
    allows_consecutive: bool = True
    max_consecutive: int = Field(default=3, ge=1, le=MAX_PERIODS)
    active: bool = True

    @field_validator("code", "name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Este campo no puede estar vacío.")
        return v


class TeacherOut(Orm):
    id: str
    code: str
    name: str
    subject_ids: list[str]
    weekly_load: int
    allows_consecutive: bool
    max_consecutive: int
    active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- asignaciones
class AssignmentIn(BaseModel):
    teacher_id: str = Field(min_length=1)
    subject_id: str = Field(min_length=1)
    group_id: str = Field(min_length=1)
    hours_per_week: int = Field(ge=1, le=NUM_DAYS * MAX_PERIODS)


class AssignmentOut(AssignmentIn, Orm):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- disponibilidad
class AvailabilityCellIO(BaseModel):
    day: int = Field(ge=0, lt=NUM_DAYS)
    period_number: int = Field(ge=1, le=MAX_PERIODS)
    state: CellState


class AvailabilityOut(BaseModel):
    teacher_id: str
    cells: list[AvailabilityCellIO]


class AvailabilityIn(BaseModel):
    cells: list[AvailabilityCellIO]


# ---------------------------------------------------------------- horario
class ScheduleEntryIO(BaseModel):
    id: str | None = None
    assignment_id: str
    day: int = Field(ge=0, lt=NUM_DAYS)
    period_number: int = Field(ge=1, le=MAX_PERIODS)
    locked: bool = False


class LoadSummary(BaseModel):
    teacher_id: str
    teacher_name: str
    teacher_code: str
    active: bool
    declared: int
    assigned: int
    difference: int
    scheduled: int
    status: Literal["ok", "faltan", "sobran"]
    message: str


# ---------------------------------------------------------------- respaldo
class BackupTeacher(TeacherIn):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BackupEntity(BaseModel):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BackupSubject(SubjectIn, BackupEntity):
    pass


class BackupGroup(GroupIn, BackupEntity):
    pass


class BackupAssignment(AssignmentIn, BackupEntity):
    pass


class BackupAvailability(BaseModel):
    teacher_id: str
    cells: list[AvailabilityCellIO]


class ProjectData(BaseModel):
    """Contenido completo de un proyecto. Es a la vez el formato de respaldo JSON."""

    format: Literal["horarios-secundaria"] = "horarios-secundaria"
    version: int = 1
    exported_at: datetime | None = None
    project: ProjectIn
    periods: list[PeriodIn]
    subjects: list[BackupSubject] = []
    groups: list[BackupGroup] = []
    teachers: list[BackupTeacher] = []
    assignments: list[BackupAssignment] = []
    availability: list[BackupAvailability] = []
    schedule: list[ScheduleEntryIO] = []

    @model_validator(mode="after")
    def _refs(self) -> ProjectData:
        sub = {s.id for s in self.subjects}
        grp = {g.id for g in self.groups}
        tea = {t.id for t in self.teachers}
        asg = {a.id for a in self.assignments}
        for t in self.teachers:
            for sid in t.subject_ids:
                if sid not in sub:
                    raise ValueError(f"El maestro {t.name} hace referencia a una materia inexistente.")
        for a in self.assignments:
            if a.teacher_id not in tea or a.subject_id not in sub or a.group_id not in grp:
                raise ValueError(f"La asignación {a.id} hace referencia a datos inexistentes.")
        for av in self.availability:
            if av.teacher_id not in tea:
                raise ValueError("Hay disponibilidad de un maestro inexistente.")
        for e in self.schedule:
            if e.assignment_id not in asg:
                raise ValueError("El horario contiene una clase de una asignación inexistente.")
        return self
