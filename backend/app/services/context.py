"""Vista en memoria de un proyecto, usada por el generador, las validaciones y las exportaciones."""
from __future__ import annotations

from dataclasses import dataclass, field

from .. import schemas as s
from ..repositories.base import Repository


@dataclass
class Ctx:
    project: s.ProjectOut
    periods: list[s.PeriodOut]  # todas, ordenadas por número
    subjects: dict[str, s.SubjectOut]
    groups: dict[str, s.GroupOut]
    teachers: dict[str, s.TeacherOut]
    assignments: dict[str, s.AssignmentOut]
    availability: dict[str, dict[tuple[int, int], s.CellState]]  # teacher -> (día, hora) -> estado
    schedule: list[s.ScheduleEntryIO] = field(default_factory=list)

    # ------------------------------------------------------------ periodos
    @property
    def active_periods(self) -> list[s.PeriodOut]:
        return [p for p in self.periods if p.active]

    @property
    def active_numbers(self) -> list[int]:
        return [p.number for p in self.active_periods]

    def period(self, number: int) -> s.PeriodOut | None:
        return next((p for p in self.periods if p.number == number), None)

    def consecutive_runs(self) -> list[list[int]]:
        """Bloques de horas activas contiguas en el tiempo.

        Dos horas son consecutivas cuando una empieza justo cuando termina la
        anterior. Un receso (p. ej. 10:50–11:10) o una hora desactivada rompen
        la continuidad.
        """
        runs: list[list[int]] = []
        prev: s.PeriodOut | None = None
        for p in self.active_periods:
            if prev is not None and p.start_time <= prev.end_time:
                runs[-1].append(p.number)
            else:
                runs.append([p.number])
            prev = p
        return runs

    def are_consecutive(self, a: int, b: int) -> bool:
        for run in self.consecutive_runs():
            if a in run and b in run and abs(run.index(a) - run.index(b)) == 1:
                return True
        return False

    # ------------------------------------------------------------ disponibilidad
    def state(self, teacher_id: str, day: int, number: int) -> s.CellState:
        return self.availability.get(teacher_id, {}).get((day, number), s.CellState.available)

    def usable_slots(self, teacher_id: str) -> list[tuple[int, int]]:
        return [
            (d, n)
            for d in range(s.NUM_DAYS)
            for n in self.active_numbers
            if self.state(teacher_id, d, n) != s.CellState.blocked
        ]

    # ------------------------------------------------------------ asignaciones
    def is_schedulable(self, a: s.AssignmentOut) -> bool:
        t = self.teachers.get(a.teacher_id)
        g = self.groups.get(a.group_id)
        sub = self.subjects.get(a.subject_id)
        return bool(t and g and sub and t.active and g.active and sub.active)

    def schedulable_assignments(self) -> list[s.AssignmentOut]:
        return [a for a in self.assignments.values() if self.is_schedulable(a)]

    def describe(self, assignment_id: str) -> dict:
        a = self.assignments.get(assignment_id)
        if a is None:
            return {"teacher": "?", "subject": "?", "group": "?"}
        t = self.teachers.get(a.teacher_id)
        sub = self.subjects.get(a.subject_id)
        g = self.groups.get(a.group_id)
        return {
            "assignment_id": a.id,
            "teacher_id": a.teacher_id,
            "teacher": t.name if t else "?",
            "subject_id": a.subject_id,
            "subject": sub.name if sub else "?",
            "group_id": a.group_id,
            "group": g.name if g else "?",
        }


def load_context(repo: Repository, project_id: str) -> Ctx:
    teachers = repo.list_teachers(project_id)
    return Ctx(
        project=repo.get_project(project_id),
        periods=repo.list_periods(project_id),
        subjects={x.id: x for x in repo.list_subjects(project_id)},
        groups={x.id: x for x in repo.list_groups(project_id)},
        teachers={x.id: x for x in teachers},
        assignments={x.id: x for x in repo.list_assignments(project_id)},
        availability={
            t.id: {(c.day, c.period_number): c.state for c in repo.get_availability(project_id, t.id).cells}
            for t in teachers
        },
        schedule=repo.list_schedule(project_id),
    )


def slot_label(ctx: Ctx, day: int, number: int) -> str:
    p = ctx.period(number)
    hours = f" ({p.start_time}–{p.end_time})" if p else ""
    return f"{s.DAYS[day]}, hora {number}{hours}"
