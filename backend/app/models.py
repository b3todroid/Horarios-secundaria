"""Modelos SQLAlchemy (almacenamiento SQLite).

Los identificadores son cadenas UUID para que el mismo esquema de la API
sirva cuando se cambie a Firebase/Firestore.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    demo_kind: Mapped[str | None] = mapped_column(String(30), nullable=True)


class Period(Base):
    __tablename__ = "periods"
    __table_args__ = (UniqueConstraint("project_id", "number"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


teacher_subjects = Table(
    "teacher_subjects",
    Base.metadata,
    Column("teacher_id", ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
)


class Teacher(TimestampMixin, Base):
    __tablename__ = "teachers"
    __table_args__ = (UniqueConstraint("project_id", "code"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(160))
    weekly_load: Mapped[int] = mapped_column(Integer, default=0)
    allows_consecutive: Mapped[bool] = mapped_column(Boolean, default=True)
    max_consecutive: Mapped[int] = mapped_column(Integer, default=3)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    subjects: Mapped[list[Subject]] = relationship(secondary=teacher_subjects, lazy="selectin")


class Subject(TimestampMixin, Base):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("project_id", "name"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    short_name: Mapped[str] = mapped_column(String(20), default="")
    color: Mapped[str] = mapped_column(String(9), default="#4f6bed")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class SchoolGroup(TimestampMixin, Base):
    __tablename__ = "school_groups"
    __table_args__ = (UniqueConstraint("project_id", "name"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    grade: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(40))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Assignment(TimestampMixin, Base):
    __tablename__ = "assignments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[str] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("school_groups.id", ondelete="CASCADE"), index=True)
    hours_per_week: Mapped[int] = mapped_column(Integer)


class AvailabilityCell(Base):
    """Solo se guardan las celdas FLEXIBLE o BLOQUEADA; la ausencia significa DISPONIBLE."""

    __tablename__ = "availability"
    __table_args__ = (UniqueConstraint("teacher_id", "day", "period_number"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teachers.id", ondelete="CASCADE"), index=True)
    day: Mapped[int] = mapped_column(Integer)
    period_number: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(10))


class ScheduleEntry(TimestampMixin, Base):
    __tablename__ = "schedule_entries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"), index=True)
    day: Mapped[int] = mapped_column(Integer)
    period_number: Mapped[int] = mapped_column(Integer)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)


class ScheduleHistory(Base):
    """Instantáneas del horario para poder deshacer cambios."""

    __tablename__ = "schedule_history"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    label: Mapped[str] = mapped_column(String(200))
    snapshot: Mapped[str] = mapped_column(Text)


class GenerationRun(Base):
    __tablename__ = "generation_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(String(20))
    report: Mapped[str] = mapped_column(Text)
