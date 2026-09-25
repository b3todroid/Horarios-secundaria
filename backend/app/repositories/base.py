"""Interfaz de almacenamiento.

Toda la lógica de la aplicación (API, generador, exportaciones) habla con esta
interfaz y nunca con SQLAlchemy directamente. Para migrar a Firebase basta con
crear `FirestoreRepository(Repository)` que implemente estos métodos y
seleccionarlo con STORAGE_BACKEND=firebase (ver docs/ARQUITECTURA.md).
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from .. import schemas as s


class Repository(ABC):
    # ------------------------------------------------------------ proyectos
    @abstractmethod
    def list_projects(self) -> list[s.ProjectOut]: ...

    @abstractmethod
    def get_project(self, project_id: str) -> s.ProjectOut: ...

    @abstractmethod
    def create_project(
        self, name: str, *, is_demo: bool = False, demo_kind: str | None = None
    ) -> s.ProjectOut: ...

    @abstractmethod
    def rename_project(self, project_id: str, name: str) -> s.ProjectOut: ...

    @abstractmethod
    def delete_project(self, project_id: str) -> None: ...

    @abstractmethod
    def touch_project(self, project_id: str) -> None:
        """Actualiza la fecha de modificación del proyecto."""

    # ------------------------------------------------------------ periodos
    @abstractmethod
    def list_periods(self, project_id: str) -> list[s.PeriodOut]: ...

    @abstractmethod
    def replace_periods(self, project_id: str, periods: list[s.PeriodIn]) -> list[s.PeriodOut]: ...

    # ------------------------------------------------------------ materias
    @abstractmethod
    def list_subjects(self, project_id: str) -> list[s.SubjectOut]: ...

    @abstractmethod
    def create_subject(self, project_id: str, data: s.SubjectIn) -> s.SubjectOut: ...

    @abstractmethod
    def update_subject(self, project_id: str, subject_id: str, data: s.SubjectIn) -> s.SubjectOut: ...

    @abstractmethod
    def delete_subject(self, project_id: str, subject_id: str) -> None: ...

    # ------------------------------------------------------------ grupos
    @abstractmethod
    def list_groups(self, project_id: str) -> list[s.GroupOut]: ...

    @abstractmethod
    def create_group(self, project_id: str, data: s.GroupIn) -> s.GroupOut: ...

    @abstractmethod
    def update_group(self, project_id: str, group_id: str, data: s.GroupIn) -> s.GroupOut: ...

    @abstractmethod
    def delete_group(self, project_id: str, group_id: str) -> None: ...

    # ------------------------------------------------------------ maestros
    @abstractmethod
    def list_teachers(self, project_id: str) -> list[s.TeacherOut]: ...

    @abstractmethod
    def get_teacher(self, project_id: str, teacher_id: str) -> s.TeacherOut: ...

    @abstractmethod
    def create_teacher(self, project_id: str, data: s.TeacherIn) -> s.TeacherOut: ...

    @abstractmethod
    def update_teacher(self, project_id: str, teacher_id: str, data: s.TeacherIn) -> s.TeacherOut: ...

    @abstractmethod
    def delete_teacher(self, project_id: str, teacher_id: str) -> None: ...

    # ------------------------------------------------------------ asignaciones
    @abstractmethod
    def list_assignments(self, project_id: str) -> list[s.AssignmentOut]: ...

    @abstractmethod
    def create_assignment(self, project_id: str, data: s.AssignmentIn) -> s.AssignmentOut: ...

    @abstractmethod
    def update_assignment(
        self, project_id: str, assignment_id: str, data: s.AssignmentIn
    ) -> s.AssignmentOut: ...

    @abstractmethod
    def delete_assignment(self, project_id: str, assignment_id: str) -> None: ...

    # ------------------------------------------------------------ disponibilidad
    @abstractmethod
    def get_availability(self, project_id: str, teacher_id: str) -> s.AvailabilityOut: ...

    @abstractmethod
    def set_availability(
        self, project_id: str, teacher_id: str, cells: list[s.AvailabilityCellIO]
    ) -> s.AvailabilityOut: ...

    # ------------------------------------------------------------ horario
    @abstractmethod
    def list_schedule(self, project_id: str) -> list[s.ScheduleEntryIO]: ...

    @abstractmethod
    def replace_schedule(
        self, project_id: str, entries: list[s.ScheduleEntryIO], label: str
    ) -> list[s.ScheduleEntryIO]:
        """Reemplaza el horario guardando antes una instantánea para deshacer."""

    @abstractmethod
    def undo_schedule(self, project_id: str) -> tuple[str, list[s.ScheduleEntryIO]]:
        """Restaura la última instantánea. Devuelve (descripción, horario)."""

    @abstractmethod
    def history_labels(self, project_id: str, limit: int = 10) -> list[str]: ...

    @abstractmethod
    def save_run(self, project_id: str, status: str, report: dict) -> None: ...

    @abstractmethod
    def last_run(self, project_id: str) -> dict | None: ...

    # ------------------------------------------------------------ respaldo
    @abstractmethod
    def export_project(self, project_id: str) -> s.ProjectData: ...

    @abstractmethod
    def import_project(
        self, data: s.ProjectData, *, replace_project_id: str | None = None,
        is_demo: bool = False, demo_kind: str | None = None,
    ) -> s.ProjectOut: ...
