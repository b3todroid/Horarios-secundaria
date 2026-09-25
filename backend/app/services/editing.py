"""Edición manual del horario: mover, intercambiar, colocar pendientes y quitar clases."""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from .. import schemas as s
from ..errors import Invalid, NotFound
from .context import Ctx, slot_label
from .validation import schedule_conflicts


class MoveRequest(BaseModel):
    entry_id: str | None = Field(default=None, description="Clase existente que se mueve")
    assignment_id: str | None = Field(default=None, description="Asignación pendiente que se coloca")
    day: int = Field(ge=0, lt=s.NUM_DAYS)
    period_number: int = Field(ge=1, le=s.MAX_PERIODS)
    swap_with: str | None = Field(default=None, description="Clase con la que se intercambia")

    @model_validator(mode="after")
    def _one(self) -> MoveRequest:
        if bool(self.entry_id) == bool(self.assignment_id):
            raise ValueError("Indica una clase (entry_id) o una asignación pendiente (assignment_id).")
        return self


def _key(c: dict) -> tuple:
    return (c["rule"], c["message"])


def _entry_view(ctx: Ctx, e: s.ScheduleEntryIO) -> dict:
    return {**ctx.describe(e.assignment_id), "entry_id": e.id, "day": e.day,
            "period_number": e.period_number, "slot": slot_label(ctx, e.day, e.period_number),
            "locked": e.locked}


def plan_move(ctx: Ctx, req: MoveRequest) -> tuple[dict, list[s.ScheduleEntryIO]]:
    """Calcula el resultado de un movimiento sin guardarlo."""
    entries = [e.model_copy() for e in ctx.schedule]
    by_id = {e.id: e for e in entries}
    active = set(ctx.active_numbers)
    if req.period_number not in active:
        raise Invalid(f"La hora {req.period_number} está desactivada.")

    if req.entry_id:
        moving = by_id.get(req.entry_id)
        if moving is None:
            raise NotFound("La clase ya no existe; recarga el horario.")
        original = _entry_view(ctx, moving)
    else:
        a = ctx.assignments.get(req.assignment_id or "")
        if a is None:
            raise NotFound("La asignación no existe.")
        moving = s.ScheduleEntryIO(id=None, assignment_id=a.id, day=req.day, period_number=req.period_number)
        original = {**ctx.describe(a.id), "entry_id": None, "slot": "Pendiente (sin colocar)",
                    "day": None, "period_number": None, "locked": False}
        entries.append(moving)

    a = ctx.assignments[moving.assignment_id]
    other: s.ScheduleEntryIO | None = None
    if req.swap_with:
        other = by_id.get(req.swap_with)
        if other is None:
            raise NotFound("La clase para intercambiar ya no existe.")
    else:
        # Si en el destino el mismo grupo ya tiene clase, se propone intercambio.
        for e in entries:
            if e is moving:
                continue
            oa = ctx.assignments.get(e.assignment_id)
            if oa and oa.group_id == a.group_id and e.day == req.day and e.period_number == req.period_number:
                other = e
                break

    from_day, from_num = (moving.day, moving.period_number) if req.entry_id else (None, None)
    if other is not None:
        if req.swap_with:
            tgt_day, tgt_num = other.day, other.period_number
        else:
            tgt_day, tgt_num = req.day, req.period_number
        if from_day is None:
            raise Invalid("Una clase pendiente no puede intercambiarse; elige un espacio libre del grupo.")
        moving.day, moving.period_number = tgt_day, tgt_num
        other.day, other.period_number = from_day, from_num
    else:
        moving.day, moving.period_number = req.day, req.period_number

    before = {_key(c) for c in schedule_conflicts(ctx, ctx.schedule)}
    after = schedule_conflicts(ctx, entries)
    new_conflicts = [c for c in after if _key(c) not in before]

    warnings = []
    involved = [moving] + ([other] if other else [])
    for e in involved:
        ea = ctx.assignments[e.assignment_id]
        if ctx.state(ea.teacher_id, e.day, e.period_number) == s.CellState.flexible:
            warnings.append(f"{ctx.teachers[ea.teacher_id].name} tiene {slot_label(ctx, e.day, e.period_number)} como FLEXIBLE.")

    teachers = sorted({ctx.describe(e.assignment_id)["teacher"] for e in involved})
    groups = sorted({ctx.describe(e.assignment_id)["group"] for e in involved})
    preview = {
        "kind": "swap" if other else ("place" if not req.entry_id else "move"),
        "original": original,
        "target": {"day": moving.day, "period_number": moving.period_number,
                   "slot": slot_label(ctx, moving.day, moving.period_number)},
        "swapped": _entry_view(ctx, other) | {"new_slot": slot_label(ctx, other.day, other.period_number)} if other else None,
        "teachers": teachers,
        "groups": groups,
        "conflicts": new_conflicts,
        "warnings": warnings,
        "allowed": not new_conflicts,
    }
    return preview, entries


def describe_move(preview: dict) -> str:
    o = preview["original"]
    t = preview["target"]["slot"]
    if preview["kind"] == "swap":
        return f"Intercambio {o['subject']} ({o['group']}) ↔ {preview['swapped']['subject']}"
    if preview["kind"] == "place":
        return f"Colocar {o['subject']} ({o['group']}) en {t}"
    return f"Mover {o['subject']} ({o['group']}) a {t}"
