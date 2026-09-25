"""Construcción de tablas de horario independientes del formato de salida."""
from __future__ import annotations

from dataclasses import dataclass

from .. import schemas as s
from ..errors import Invalid, NotFound
from ..services.context import Ctx


@dataclass
class Table:
    title: str
    subtitle: str
    header: list[str]
    rows: list[list[str]]  # celdas vacías = "" (nunca "Libre")


def _period_label(p: s.PeriodOut) -> str:
    return f"{p.number}ª\n{p.start_time}–{p.end_time}"


def _short_teacher(name: str) -> str:
    parts = name.split()
    return " ".join(parts[:2]) if len(parts) > 2 else name


def group_table(ctx: Ctx, group_id: str) -> Table:
    g = ctx.groups.get(group_id)
    if g is None:
        raise NotFound("El grupo no existe.")
    cells: dict[tuple[int, int], str] = {}
    for e in ctx.schedule:
        a = ctx.assignments.get(e.assignment_id)
        if a and a.group_id == group_id:
            d = ctx.describe(a.id)
            cells[(e.day, e.period_number)] = f"{d['subject']}\n{_short_teacher(d['teacher'])}"
    rows = [[_period_label(p)] + [cells.get((d, p.number), "") for d in range(s.NUM_DAYS)] for p in ctx.active_periods]
    return Table(f"Grupo {g.name}", f"{g.grade}.º grado · {ctx.project.name}", ["Hora", *s.DAYS], rows)


def teacher_table(ctx: Ctx, teacher_id: str) -> Table:
    t = ctx.teachers.get(teacher_id)
    if t is None:
        raise NotFound("El maestro no existe.")
    cells: dict[tuple[int, int], str] = {}
    count = 0
    for e in ctx.schedule:
        a = ctx.assignments.get(e.assignment_id)
        if a and a.teacher_id == teacher_id:
            d = ctx.describe(a.id)
            cells[(e.day, e.period_number)] = f"{d['group']}\n{d['subject']}"
            count += 1
    rows = [[_period_label(p)] + [cells.get((d, p.number), "") for d in range(s.NUM_DAYS)] for p in ctx.active_periods]
    return Table(f"{t.name} ({t.code})", f"{count} horas a la semana · {ctx.project.name}", ["Hora", *s.DAYS], rows)


def general_tables(ctx: Ctx) -> list[Table]:
    """Una tabla por día: filas = horas, columnas = grupos activos."""
    groups = sorted((g for g in ctx.groups.values() if g.active), key=lambda g: (g.grade, g.name))
    idx: dict[tuple[str, int, int], str] = {}
    for e in ctx.schedule:
        a = ctx.assignments.get(e.assignment_id)
        if a:
            d = ctx.describe(a.id)
            sub = ctx.subjects.get(a.subject_id)
            short = (sub.short_name or sub.name) if sub else d["subject"]
            idx[(a.group_id, e.day, e.period_number)] = f"{short}\n{_short_teacher(d['teacher'])}"
    out = []
    for day in range(s.NUM_DAYS):
        rows = [[_period_label(p)] + [idx.get((g.id, day, p.number), "") for g in groups] for p in ctx.active_periods]
        out.append(Table(f"Horario general – {s.DAYS[day]}", ctx.project.name, ["Hora", *[g.name for g in groups]], rows))
    return out


def tables_for(ctx: Ctx, scope: str, item_id: str | None) -> list[Table]:
    if scope == "group":
        ids = [item_id] if item_id else [g.id for g in sorted(ctx.groups.values(), key=lambda g: (g.grade, g.name)) if g.active]
        return [group_table(ctx, i) for i in ids]
    if scope == "teacher":
        ids = [item_id] if item_id else [t.id for t in sorted(ctx.teachers.values(), key=lambda t: t.code) if t.active]
        return [teacher_table(ctx, i) for i in ids]
    if scope == "general":
        return general_tables(ctx)
    raise Invalid("Tipo de reporte desconocido. Usa group, teacher o general.")
