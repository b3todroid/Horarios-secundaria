"""Implementación de `Repository` sobre SQLAlchemy/SQLite."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import models as m
from .. import schemas as s
from ..errors import Conflict, Invalid, NotFound
from .base import Repository

HISTORY_LIMIT = 30


def _teacher_out(t: m.Teacher) -> s.TeacherOut:
    return s.TeacherOut(
        id=t.id,
        code=t.code,
        name=t.name,
        subject_ids=sorted(sub.id for sub in t.subjects),
        weekly_load=t.weekly_load,
        allows_consecutive=t.allows_consecutive,
        max_consecutive=t.max_consecutive,
        active=t.active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


class SqlRepository(Repository):
    def __init__(self, session: Session):
        self.db = session

    # ------------------------------------------------------------ utilidades
    def _project(self, project_id: str) -> m.Project:
        p = self.db.get(m.Project, project_id)
        if p is None:
            raise NotFound("El proyecto no existe.")
        return p

    def _owned(self, model, project_id: str, obj_id: str, label: str):
        obj = self.db.get(model, obj_id)
        if obj is None or obj.project_id != project_id:
            raise NotFound(f"{label} no existe.")
        return obj

    def _commit(self, project_id: str | None = None) -> None:
        if project_id:
            p = self.db.get(m.Project, project_id)
            if p is not None:
                p.updated_at = datetime.now(timezone.utc)
        self.db.commit()

    # ------------------------------------------------------------ proyectos
    def list_projects(self) -> list[s.ProjectOut]:
        rows = self.db.scalars(select(m.Project).order_by(m.Project.is_demo, m.Project.created_at))
        return [s.ProjectOut.model_validate(p) for p in rows]

    def get_project(self, project_id: str) -> s.ProjectOut:
        return s.ProjectOut.model_validate(self._project(project_id))

    def create_project(self, name, *, is_demo=False, demo_kind=None) -> s.ProjectOut:
        p = m.Project(name=name.strip(), is_demo=is_demo, demo_kind=demo_kind)
        self.db.add(p)
        self.db.flush()
        for i, (start, end) in enumerate(s.DEFAULT_PERIODS, start=1):
            self.db.add(m.Period(project_id=p.id, number=i, start_time=start, end_time=end, active=True))
        self.db.commit()
        return s.ProjectOut.model_validate(p)

    def rename_project(self, project_id, name) -> s.ProjectOut:
        p = self._project(project_id)
        p.name = name.strip()
        self.db.commit()
        return s.ProjectOut.model_validate(p)

    def delete_project(self, project_id) -> None:
        self.db.delete(self._project(project_id))
        self.db.commit()

    def touch_project(self, project_id) -> None:
        self._project(project_id)
        self._commit(project_id)

    # ------------------------------------------------------------ periodos
    def list_periods(self, project_id) -> list[s.PeriodOut]:
        self._project(project_id)
        rows = self.db.scalars(
            select(m.Period).where(m.Period.project_id == project_id).order_by(m.Period.number)
        )
        return [s.PeriodOut.model_validate(p) for p in rows]

    def replace_periods(self, project_id, periods) -> list[s.PeriodOut]:
        self._project(project_id)
        existing = {
            p.number: p
            for p in self.db.scalars(select(m.Period).where(m.Period.project_id == project_id))
        }
        wanted = {p.number for p in periods}
        for num, row in existing.items():
            if num not in wanted:
                self.db.delete(row)
        for p in periods:
            row = existing.get(p.number)
            if row is None:
                row = m.Period(project_id=project_id, number=p.number)
                self.db.add(row)
            row.start_time, row.end_time, row.active = p.start_time, p.end_time, p.active
        self._commit(project_id)
        return self.list_periods(project_id)

    # ------------------------------------------------------------ materias
    def list_subjects(self, project_id) -> list[s.SubjectOut]:
        self._project(project_id)
        rows = self.db.scalars(
            select(m.Subject).where(m.Subject.project_id == project_id).order_by(m.Subject.name)
        )
        return [s.SubjectOut.model_validate(x) for x in rows]

    def _check_subject_name(self, project_id, name, exclude_id=None):
        q = select(m.Subject).where(
            m.Subject.project_id == project_id, func.lower(m.Subject.name) == name.lower()
        )
        found = self.db.scalars(q).first()
        if found and found.id != exclude_id:
            raise Conflict(f"Ya existe una materia llamada «{name}».")

    def create_subject(self, project_id, data) -> s.SubjectOut:
        self._project(project_id)
        self._check_subject_name(project_id, data.name)
        row = m.Subject(project_id=project_id, **data.model_dump())
        self.db.add(row)
        self._commit(project_id)
        return s.SubjectOut.model_validate(row)

    def update_subject(self, project_id, subject_id, data) -> s.SubjectOut:
        row = self._owned(m.Subject, project_id, subject_id, "La materia")
        self._check_subject_name(project_id, data.name, subject_id)
        for k, v in data.model_dump().items():
            setattr(row, k, v)
        self._commit(project_id)
        return s.SubjectOut.model_validate(row)

    def delete_subject(self, project_id, subject_id) -> None:
        self.db.delete(self._owned(m.Subject, project_id, subject_id, "La materia"))
        self._commit(project_id)

    # ------------------------------------------------------------ grupos
    def list_groups(self, project_id) -> list[s.GroupOut]:
        self._project(project_id)
        rows = self.db.scalars(
            select(m.SchoolGroup)
            .where(m.SchoolGroup.project_id == project_id)
            .order_by(m.SchoolGroup.grade, m.SchoolGroup.name)
        )
        return [s.GroupOut.model_validate(x) for x in rows]

    def _check_group_name(self, project_id, name, exclude_id=None):
        q = select(m.SchoolGroup).where(
            m.SchoolGroup.project_id == project_id, func.lower(m.SchoolGroup.name) == name.lower()
        )
        found = self.db.scalars(q).first()
        if found and found.id != exclude_id:
            raise Conflict(f"Ya existe un grupo llamado «{name}».")

    def create_group(self, project_id, data) -> s.GroupOut:
        self._project(project_id)
        self._check_group_name(project_id, data.name)
        row = m.SchoolGroup(project_id=project_id, **data.model_dump())
        self.db.add(row)
        self._commit(project_id)
        return s.GroupOut.model_validate(row)

    def update_group(self, project_id, group_id, data) -> s.GroupOut:
        row = self._owned(m.SchoolGroup, project_id, group_id, "El grupo")
        self._check_group_name(project_id, data.name, group_id)
        for k, v in data.model_dump().items():
            setattr(row, k, v)
        self._commit(project_id)
        return s.GroupOut.model_validate(row)

    def delete_group(self, project_id, group_id) -> None:
        self.db.delete(self._owned(m.SchoolGroup, project_id, group_id, "El grupo"))
        self._commit(project_id)

    # ------------------------------------------------------------ maestros
    def list_teachers(self, project_id) -> list[s.TeacherOut]:
        self._project(project_id)
        rows = self.db.scalars(
            select(m.Teacher).where(m.Teacher.project_id == project_id).order_by(m.Teacher.code)
        )
        return [_teacher_out(t) for t in rows]

    def get_teacher(self, project_id, teacher_id) -> s.TeacherOut:
        return _teacher_out(self._owned(m.Teacher, project_id, teacher_id, "El maestro"))

    def _active_teacher_count(self, project_id, exclude_id=None) -> int:
        q = select(func.count()).select_from(m.Teacher).where(
            m.Teacher.project_id == project_id, m.Teacher.active.is_(True)
        )
        if exclude_id:
            q = q.where(m.Teacher.id != exclude_id)
        return self.db.scalar(q) or 0

    def _apply_teacher(self, project_id, row: m.Teacher, data: s.TeacherIn):
        dup = self.db.scalars(
            select(m.Teacher).where(
                m.Teacher.project_id == project_id,
                func.lower(m.Teacher.code) == data.code.lower(),
            )
        ).first()
        if dup and dup.id != row.id:
            raise Conflict(f"El identificador «{data.code}» ya lo usa {dup.name}.")
        if data.active and self._active_teacher_count(project_id, row.id) >= s.MAX_ACTIVE_TEACHERS:
            raise Conflict(
                f"Se alcanzó el máximo de {s.MAX_ACTIVE_TEACHERS} maestros activos. "
                "Desactiva a un maestro antes de agregar o reactivar otro."
            )
        subjects = []
        for sid in dict.fromkeys(data.subject_ids):
            subjects.append(self._owned(m.Subject, project_id, sid, "Una de las materias seleccionadas"))
        row.code, row.name = data.code, data.name
        row.weekly_load = data.weekly_load
        row.allows_consecutive = data.allows_consecutive
        row.max_consecutive = data.max_consecutive
        row.active = data.active
        row.subjects = subjects

    def create_teacher(self, project_id, data) -> s.TeacherOut:
        self._project(project_id)
        row = m.Teacher(project_id=project_id)
        self._apply_teacher(project_id, row, data)
        self.db.add(row)
        self._commit(project_id)
        return _teacher_out(row)

    def update_teacher(self, project_id, teacher_id, data) -> s.TeacherOut:
        row = self._owned(m.Teacher, project_id, teacher_id, "El maestro")
        self._apply_teacher(project_id, row, data)
        self._commit(project_id)
        return _teacher_out(row)

    def delete_teacher(self, project_id, teacher_id) -> None:
        self.db.delete(self._owned(m.Teacher, project_id, teacher_id, "El maestro"))
        self._commit(project_id)

    # ------------------------------------------------------------ asignaciones
    def list_assignments(self, project_id) -> list[s.AssignmentOut]:
        self._project(project_id)
        rows = self.db.scalars(
            select(m.Assignment).where(m.Assignment.project_id == project_id).order_by(m.Assignment.created_at)
        )
        return [s.AssignmentOut.model_validate(x) for x in rows]

    def _validate_assignment(self, project_id, data: s.AssignmentIn, exclude_id=None):
        t = self._owned(m.Teacher, project_id, data.teacher_id, "El maestro")
        sub = self._owned(m.Subject, project_id, data.subject_id, "La materia")
        g = self._owned(m.SchoolGroup, project_id, data.group_id, "El grupo")
        dup = self.db.scalars(
            select(m.Assignment).where(
                m.Assignment.project_id == project_id,
                m.Assignment.teacher_id == data.teacher_id,
                m.Assignment.subject_id == data.subject_id,
                m.Assignment.group_id == data.group_id,
            )
        ).first()
        if dup and dup.id != exclude_id:
            raise Conflict(
                f"Ya existe la asignación {t.name} – {sub.name} – {g.name}. "
                "Modifica sus horas en lugar de duplicarla."
            )

    def create_assignment(self, project_id, data) -> s.AssignmentOut:
        self._validate_assignment(project_id, data)
        row = m.Assignment(project_id=project_id, **data.model_dump())
        self.db.add(row)
        self._commit(project_id)
        return s.AssignmentOut.model_validate(row)

    def update_assignment(self, project_id, assignment_id, data) -> s.AssignmentOut:
        row = self._owned(m.Assignment, project_id, assignment_id, "La asignación")
        self._validate_assignment(project_id, data, assignment_id)
        for k, v in data.model_dump().items():
            setattr(row, k, v)
        self._commit(project_id)
        return s.AssignmentOut.model_validate(row)

    def delete_assignment(self, project_id, assignment_id) -> None:
        self.db.delete(self._owned(m.Assignment, project_id, assignment_id, "La asignación"))
        self._commit(project_id)

    # ------------------------------------------------------------ disponibilidad
    def get_availability(self, project_id, teacher_id) -> s.AvailabilityOut:
        self._owned(m.Teacher, project_id, teacher_id, "El maestro")
        rows = self.db.scalars(
            select(m.AvailabilityCell).where(m.AvailabilityCell.teacher_id == teacher_id)
        )
        cells = [
            s.AvailabilityCellIO(day=r.day, period_number=r.period_number, state=r.state)
            for r in sorted(rows, key=lambda r: (r.day, r.period_number))
        ]
        return s.AvailabilityOut(teacher_id=teacher_id, cells=cells)

    def set_availability(self, project_id, teacher_id, cells) -> s.AvailabilityOut:
        self._owned(m.Teacher, project_id, teacher_id, "El maestro")
        self.db.execute(delete(m.AvailabilityCell).where(m.AvailabilityCell.teacher_id == teacher_id))
        seen: dict[tuple[int, int], s.CellState] = {}
        for c in cells:
            seen[(c.day, c.period_number)] = c.state
        for (day, num), state in seen.items():
            if state != s.CellState.available:
                self.db.add(
                    m.AvailabilityCell(teacher_id=teacher_id, day=day, period_number=num, state=state.value)
                )
        t = self.db.get(m.Teacher, teacher_id)
        t.updated_at = datetime.now(timezone.utc)
        self._commit(project_id)
        return self.get_availability(project_id, teacher_id)

    # ------------------------------------------------------------ horario
    def list_schedule(self, project_id) -> list[s.ScheduleEntryIO]:
        self._project(project_id)
        rows = self.db.scalars(
            select(m.ScheduleEntry)
            .where(m.ScheduleEntry.project_id == project_id)
            .order_by(m.ScheduleEntry.day, m.ScheduleEntry.period_number)
        )
        return [
            s.ScheduleEntryIO(
                id=r.id, assignment_id=r.assignment_id, day=r.day, period_number=r.period_number, locked=r.locked
            )
            for r in rows
        ]

    def _write_schedule(self, project_id, entries: list[s.ScheduleEntryIO]) -> None:
        valid = set(
            self.db.scalars(select(m.Assignment.id).where(m.Assignment.project_id == project_id))
        )
        self.db.execute(delete(m.ScheduleEntry).where(m.ScheduleEntry.project_id == project_id))
        self.db.flush()
        for e in entries:
            if e.assignment_id not in valid:
                raise Invalid("El horario contiene una asignación inexistente.")
            kwargs = dict(
                project_id=project_id, assignment_id=e.assignment_id, day=e.day,
                period_number=e.period_number, locked=e.locked,
            )
            if e.id:
                kwargs["id"] = e.id
            self.db.add(m.ScheduleEntry(**kwargs))

    def replace_schedule(self, project_id, entries, label) -> list[s.ScheduleEntryIO]:
        current = self.list_schedule(project_id)
        snap = json.dumps([e.model_dump() for e in current])
        self.db.add(m.ScheduleHistory(project_id=project_id, label=label, snapshot=snap))
        self._write_schedule(project_id, entries)
        self.db.flush()
        old = self.db.scalars(
            select(m.ScheduleHistory)
            .where(m.ScheduleHistory.project_id == project_id)
            .order_by(m.ScheduleHistory.created_at.desc())
            .offset(HISTORY_LIMIT)
        ).all()
        for o in old:
            self.db.delete(o)
        self._commit(project_id)
        return self.list_schedule(project_id)

    def undo_schedule(self, project_id) -> tuple[str, list[s.ScheduleEntryIO]]:
        self._project(project_id)
        last = self.db.scalars(
            select(m.ScheduleHistory)
            .where(m.ScheduleHistory.project_id == project_id)
            .order_by(m.ScheduleHistory.created_at.desc())
        ).first()
        if last is None:
            raise Conflict("No hay cambios que deshacer.")
        entries = [s.ScheduleEntryIO(**e) for e in json.loads(last.snapshot)]
        valid = set(
            self.db.scalars(select(m.Assignment.id).where(m.Assignment.project_id == project_id))
        )
        entries = [e for e in entries if e.assignment_id in valid]
        label = last.label
        self.db.delete(last)
        self._write_schedule(project_id, entries)
        self._commit(project_id)
        return label, self.list_schedule(project_id)

    def history_labels(self, project_id, limit=10) -> list[str]:
        rows = self.db.scalars(
            select(m.ScheduleHistory.label)
            .where(m.ScheduleHistory.project_id == project_id)
            .order_by(m.ScheduleHistory.created_at.desc())
            .limit(limit)
        )
        return list(rows)

    def save_run(self, project_id, status, report) -> None:
        self.db.add(m.GenerationRun(project_id=project_id, status=status, report=json.dumps(report)))
        self.db.commit()

    def last_run(self, project_id) -> dict | None:
        row = self.db.scalars(
            select(m.GenerationRun)
            .where(m.GenerationRun.project_id == project_id)
            .order_by(m.GenerationRun.created_at.desc())
        ).first()
        if row is None:
            return None
        data = json.loads(row.report)
        data["created_at"] = row.created_at.isoformat()
        return data

    # ------------------------------------------------------------ respaldo
    def export_project(self, project_id) -> s.ProjectData:
        p = self._project(project_id)
        teachers = self.db.scalars(select(m.Teacher).where(m.Teacher.project_id == project_id)).all()
        return s.ProjectData(
            exported_at=datetime.now(timezone.utc),
            project=s.ProjectIn(name=p.name),
            periods=[s.PeriodIn(**x.model_dump(exclude={"id"})) for x in self.list_periods(project_id)],
            subjects=[s.BackupSubject(**x.model_dump()) for x in self.list_subjects(project_id)],
            groups=[s.BackupGroup(**x.model_dump()) for x in self.list_groups(project_id)],
            teachers=[s.BackupTeacher(**_teacher_out(t).model_dump()) for t in teachers],
            assignments=[s.BackupAssignment(**x.model_dump()) for x in self.list_assignments(project_id)],
            availability=[
                s.BackupAvailability(teacher_id=t.id, cells=self.get_availability(project_id, t.id).cells)
                for t in teachers
            ],
            schedule=self.list_schedule(project_id),
        )

    def import_project(self, data, *, replace_project_id=None, is_demo=False, demo_kind=None) -> s.ProjectOut:
        active = sum(1 for t in data.teachers if t.active)
        if active > s.MAX_ACTIVE_TEACHERS:
            raise Invalid(f"El respaldo tiene {active} maestros activos; el máximo es {s.MAX_ACTIVE_TEACHERS}.")
        try:
            if replace_project_id:
                p = self._project(replace_project_id)
                pid = p.id
                for model in (m.ScheduleHistory, m.GenerationRun, m.ScheduleEntry, m.Assignment,
                              m.Teacher, m.Subject, m.SchoolGroup, m.Period):
                    self.db.execute(delete(model).where(model.project_id == pid))
                p.name = data.project.name
            else:
                p = m.Project(name=data.project.name, is_demo=is_demo, demo_kind=demo_kind)
                self.db.add(p)
                self.db.flush()
                pid = p.id
            # Se generan identificadores nuevos para no chocar con otros proyectos.
            ids: dict[str, str] = {}

            def nid(old: str) -> str:
                if old not in ids:
                    ids[old] = m.new_id()
                return ids[old]

            for per in data.periods:
                self.db.add(m.Period(project_id=pid, **per.model_dump()))
            subj_rows = {}
            for x in data.subjects:
                row = m.Subject(project_id=pid, id=nid(x.id), **x.model_dump(exclude={"id", "created_at", "updated_at"}))
                if x.created_at:
                    row.created_at = x.created_at
                subj_rows[x.id] = row
                self.db.add(row)
            for x in data.groups:
                row = m.SchoolGroup(project_id=pid, id=nid(x.id), **x.model_dump(exclude={"id", "created_at", "updated_at"}))
                if x.created_at:
                    row.created_at = x.created_at
                self.db.add(row)
            for x in data.teachers:
                row = m.Teacher(
                    project_id=pid, id=nid(x.id),
                    **x.model_dump(exclude={"id", "created_at", "updated_at", "subject_ids"}),
                )
                row.subjects = [subj_rows[sid] for sid in dict.fromkeys(x.subject_ids)]
                if x.created_at:
                    row.created_at = x.created_at
                self.db.add(row)
            self.db.flush()
            for x in data.assignments:
                self.db.add(m.Assignment(
                    project_id=pid, id=nid(x.id), teacher_id=ids[x.teacher_id],
                    subject_id=ids[x.subject_id], group_id=ids[x.group_id], hours_per_week=x.hours_per_week,
                ))
            for av in data.availability:
                seen = {}
                for c in av.cells:
                    seen[(c.day, c.period_number)] = c.state
                for (day, num), state in seen.items():
                    if state != s.CellState.available:
                        self.db.add(m.AvailabilityCell(
                            teacher_id=ids[av.teacher_id], day=day, period_number=num, state=state.value
                        ))
            self.db.flush()
            for e in data.schedule:
                self.db.add(m.ScheduleEntry(
                    project_id=pid, assignment_id=ids[e.assignment_id], day=e.day,
                    period_number=e.period_number, locked=e.locked,
                ))
            p.updated_at = datetime.now(timezone.utc)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return s.ProjectOut.model_validate(p)
