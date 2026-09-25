"""Generador de horarios con Google OR-Tools CP-SAT.

Reglas obligatorias (restricciones duras):
  1. Un maestro no puede estar en dos grupos a la misma hora.
  2. Un grupo no puede recibir dos clases a la misma hora (esto también impide
     que un grupo tenga dos maestros al mismo tiempo).
  3. Solo se usan horas activas.
  4. Nunca se usan celdas BLOQUEADAS.
  5. Cada asignación recibe exactamente sus horas semanales.
  6-7. Se respeta el máximo de horas consecutivas (1 si no acepta consecutivas).
  9-10. Solo se programan asignaciones con maestro, grupo y materia existentes y activos.

Preferencias (función objetivo, en este orden de peso):
  1-2. Usar celdas FLEXIBLES solo cuando sea necesario.
  3-4. Repartir las horas de cada asignación en la semana y evitar muchas horas
       de la misma materia en un día.
Las preferencias nunca impiden encontrar una solución: solo ordenan las soluciones válidas.

Cuando no existe solución completa se resuelve un modelo relajado que coloca el
máximo de horas posible y se diagnostica qué regla impide colocar el resto.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .. import schemas as s
from ..services.context import Ctx, slot_label
from ..services.validation import issue, pending_assignments, prevalidate, schedule_conflicts

W_SHORTAGE = 1_000_000
W_FLEXIBLE = 1_000
W_OVER_TARGET = 40
W_OVER_TARGET_2 = 200

BLOCKING_RULES = {"sin_horas", "sin_asignaciones", "referencia_inexistente", "duplicado"}


@dataclass
class SolveOutcome:
    status: str  # optimal | feasible | infeasible | unknown
    entries: list[tuple[str, int, int]]
    shortage: dict[str, int]
    wall_time: float


def _solve(
    ctx: Ctx,
    asgs: list[s.AssignmentOut],
    locked: list[s.ScheduleEntryIO],
    *,
    relax: bool,
    use_blocks: bool = True,
    use_consecutive: bool = True,
    use_locks: bool = True,
    time_limit: float = 30.0,
    workers: int = 8,
) -> SolveOutcome:
    model = cp_model.CpModel()
    days = range(s.NUM_DAYS)
    nums = ctx.active_numbers
    x: dict[tuple[str, int, int], cp_model.IntVar] = {}
    by_teacher: dict[tuple[str, int, int], list] = defaultdict(list)
    by_group: dict[tuple[str, int, int], list] = defaultdict(list)
    by_asg: dict[str, list] = defaultdict(list)
    flexible_terms = []

    for a in asgs:
        for d in days:
            for n in nums:
                st = ctx.state(a.teacher_id, d, n)
                if use_blocks and st == s.CellState.blocked:
                    continue
                v = model.new_bool_var(f"x_{a.id}_{d}_{n}")
                x[(a.id, d, n)] = v
                by_asg[a.id].append(v)
                by_teacher[(a.teacher_id, d, n)].append(v)
                by_group[(a.group_id, d, n)].append(v)
                if st == s.CellState.flexible:
                    flexible_terms.append(v)

    shortage_vars: dict[str, cp_model.IntVar] = {}
    for a in asgs:
        vars_a = by_asg[a.id]
        if relax:
            sh = model.new_int_var(0, a.hours_per_week, f"short_{a.id}")
            shortage_vars[a.id] = sh
            model.add(sum(vars_a) + sh == a.hours_per_week)
        else:
            model.add(sum(vars_a) == a.hours_per_week)

    for vs in by_teacher.values():
        if len(vs) > 1:
            model.add_at_most_one(vs)
    for vs in by_group.values():
        if len(vs) > 1:
            model.add_at_most_one(vs)

    if use_consecutive:
        teacher_ids = {a.teacher_id for a in asgs}
        for tid in teacher_ids:
            t = ctx.teachers[tid]
            limit = t.max_consecutive if t.allows_consecutive else 1
            for d in days:
                for run in ctx.consecutive_runs():
                    if len(run) <= limit:
                        continue
                    for i in range(len(run) - limit):
                        window = []
                        for n in run[i : i + limit + 1]:
                            window.extend(by_teacher.get((tid, d, n), []))
                        if len(window) > limit:
                            model.add(sum(window) <= limit)

    if use_locks:
        for e in locked:
            v = x.get((e.assignment_id, e.day, e.period_number))
            if v is not None:
                model.add(v == 1)

    # Preferencias de distribución
    objective = []
    for a in asgs:
        target = max(1, math.ceil(a.hours_per_week / s.NUM_DAYS))
        for d in days:
            vs = [x[(a.id, d, n)] for n in nums if (a.id, d, n) in x]
            if len(vs) <= target:
                continue
            over = model.new_int_var(0, len(vs), f"over_{a.id}_{d}")
            model.add(over >= sum(vs) - target)
            objective.append(W_OVER_TARGET * over)
            if len(vs) > target + 1:
                over2 = model.new_int_var(0, len(vs), f"over2_{a.id}_{d}")
                model.add(over2 >= sum(vs) - target - 1)
                objective.append(W_OVER_TARGET_2 * over2)
    objective.extend(W_FLEXIBLE * v for v in flexible_terms)
    objective.extend(W_SHORTAGE * v for v in shortage_vars.values())
    if objective:
        model.minimize(sum(objective))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = 7
    t0 = time.perf_counter()
    status = solver.solve(model)
    elapsed = time.perf_counter() - t0

    names = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.MODEL_INVALID: "invalid",
    }
    st_name = names.get(status, "unknown")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveOutcome(st_name, [], {}, elapsed)
    entries = [(aid, d, n) for (aid, d, n), v in x.items() if solver.value(v)]
    shortage = {aid: solver.value(v) for aid, v in shortage_vars.items() if solver.value(v) > 0}
    return SolveOutcome(st_name, entries, shortage, elapsed)


def _usable_locks(ctx: Ctx, asgs: list[s.AssignmentOut]) -> tuple[list[s.ScheduleEntryIO], list[dict]]:
    """Filtra las clases bloqueadas que siguen siendo válidas."""
    valid_ids = {a.id for a in asgs}
    locked = [e for e in ctx.schedule if e.locked]
    kept: list[s.ScheduleEntryIO] = []
    problems: list[dict] = []
    per_asg: dict[str, int] = defaultdict(int)
    for e in locked:
        d = ctx.describe(e.assignment_id)
        where = slot_label(ctx, e.day, e.period_number)
        a = ctx.assignments.get(e.assignment_id)
        reason = None
        if e.assignment_id not in valid_ids or a is None:
            reason = "su asignación ya no existe o está inactiva"
        elif e.period_number not in ctx.active_numbers:
            reason = "la hora está desactivada"
        elif ctx.state(a.teacher_id, e.day, e.period_number) == s.CellState.blocked:
            reason = "el maestro tiene esa hora BLOQUEADA"
        elif per_asg[e.assignment_id] >= a.hours_per_week:
            reason = "la asignación ya tiene todas sus horas fijadas"
        if reason:
            problems.append(issue("warning", "fijacion_invalida",
                                  f"Se ignoró la clase fijada de {d['subject']} ({d['group']}) en {where}: {reason}.",
                                  teacher=d.get("teacher"), group=d.get("group"), subject=d.get("subject"),
                                  actions=["Revisa las clases fijadas en Resultados."]))
            continue
        per_asg[e.assignment_id] += 1
        kept.append(e)
    conflicts = schedule_conflicts(ctx, kept)
    if conflicts:
        bad = {eid for c in conflicts for eid in (c.get("entry_ids") or []) if eid}
        for c in conflicts:
            problems.append({**c, "severity": "warning", "rule": "fijacion_invalida",
                             "message": "Clase fijada ignorada: " + c["message"],
                             "actions": ["Quita la fijación de una de las clases en conflicto."]})
        kept = [e for e in kept if e.id not in bad]
    return kept, problems


def _diagnose(ctx: Ctx, asgs, locked, base: SolveOutcome, time_limit: float, workers: int) -> list[dict]:
    """Atribuye cada faltante a la regla que lo provoca probando versiones relajadas del modelo."""
    variants = {
        "horas_bloqueadas": dict(use_blocks=False),
        "consecutivas": dict(use_consecutive=False),
    }
    if locked:
        variants["clases_fijadas"] = dict(use_locks=False)
    improvements: dict[str, dict[str, int]] = {}
    for name, kw in variants.items():
        out = _solve(ctx, asgs, locked, relax=True, time_limit=time_limit, workers=workers, **kw)
        improvements[name] = out.shortage if out.status in ("optimal", "feasible") else base.shortage

    report = []
    for aid, missing in sorted(base.shortage.items(), key=lambda kv: -kv[1]):
        d = ctx.describe(aid)
        a = ctx.assignments[aid]
        t = ctx.teachers[a.teacher_id]
        def teacher_short(sh: dict[str, int]) -> int:
            return sum(v for k, v in sh.items() if ctx.assignments[k].teacher_id == a.teacher_id)

        def group_short(sh: dict[str, int]) -> int:
            return sum(v for k, v in sh.items() if ctx.assignments[k].group_id == a.group_id)

        causes = [
            name for name, sh in improvements.items()
            if sh.get(aid, 0) < missing
            or teacher_short(sh) < teacher_short(base.shortage)
            or group_short(sh) < group_short(base.shortage)
        ]
        actions: list[str] = []
        messages: list[str] = []
        if "horas_bloqueadas" in causes:
            blocked = sum(1 for dd in range(s.NUM_DAYS) for n in ctx.active_numbers
                          if ctx.state(t.id, dd, n) == s.CellState.blocked)
            messages.append(f"{t.name} tiene {blocked} horas BLOQUEADAS y no le quedan suficientes espacios libres que coincidan con el grupo {d['group']}.")
            actions += [f"Cambia algunas celdas BLOQUEADAS de {t.name} a FLEXIBLE.",
                        f"Asigna {d['subject']} de {d['group']} a otro maestro con más disponibilidad."]
        if "consecutivas" in causes:
            rule = ("no acepta horas consecutivas" if not t.allows_consecutive
                    else f"admite máximo {t.max_consecutive} horas seguidas")
            messages.append(f"{t.name} {rule} y eso impide colocar todas sus clases.")
            actions += [f"Aumenta el máximo de horas consecutivas de {t.name}.",
                        "Libera horas en días donde el maestro tenga menos clases."]
        if "clases_fijadas" in causes:
            messages.append("Las clases fijadas ocupan los espacios que se necesitan.")
            actions += ["Quita la fijación de algunas clases y vuelve a generar."]
        rule = causes[0] if causes else "choque_maestro_grupo"
        if not causes:
            messages.append(
                f"No hay suficientes horas en las que {t.name} y el grupo {d['group']} estén libres al mismo tiempo."
            )
            actions += [f"Revisa la carga del grupo {d['group']} y del maestro {t.name}.",
                        "Activa más horas por día en Configuración escolar.",
                        "Reparte la materia con otro maestro o reduce horas."]
        report.append(issue("error", rule, " ".join(messages), teacher=d["teacher"], group=d["group"],
                            subject=d["subject"], missing_hours=missing, actions=list(dict.fromkeys(actions)),
                            assignment_id=aid, causes=causes or ["choque_maestro_grupo"]))
    return report


def generate(ctx: Ctx, *, keep_locked: bool = True, time_limit: float = 30.0, workers: int = 8) -> dict:
    """Genera un horario. Devuelve estado, clases y reporte (no escribe en la base de datos)."""
    pre = prevalidate(ctx)
    blocking = [i for i in pre if i["severity"] == "error" and i["rule"] in BLOCKING_RULES]
    required = sum(a.hours_per_week for a in ctx.schedulable_assignments())
    base_report = {"prevalidation": pre, "conflicts": [], "shortages": [], "lock_warnings": []}
    if blocking:
        return {"status": "invalid", "entries": None,
                "report": {**base_report, "summary": "Corrige los errores de los datos antes de generar.",
                           "stats": {"required": required, "placed": 0}}}

    asgs = ctx.schedulable_assignments()
    locked, lock_problems = _usable_locks(ctx, asgs) if keep_locked else ([], [])
    base_report["lock_warnings"] = lock_problems
    capacity_errors = any(i["severity"] == "error" for i in pre)

    out = None
    if not capacity_errors:
        out = _solve(ctx, asgs, locked, relax=False, time_limit=time_limit, workers=workers)
    status = "complete"
    shortages: list[dict] = []
    if out is None or out.status not in ("optimal", "feasible"):
        relaxed = _solve(ctx, asgs, locked, relax=True, time_limit=time_limit, workers=workers)
        if relaxed.status not in ("optimal", "feasible"):
            return {"status": "error", "entries": None,
                    "report": {**base_report, "summary": "El generador no encontró ninguna asignación en el tiempo límite. "
                               "Aumenta SOLVER_TIME_LIMIT_SECONDS o simplifica los datos.",
                               "stats": {"required": required, "placed": 0}}}
        out = relaxed
        status = "partial" if relaxed.shortage else "complete"
        if relaxed.shortage:
            shortages = _diagnose(ctx, asgs, locked, relaxed, min(10.0, time_limit), workers)

    locked_keys = {(e.assignment_id, e.day, e.period_number): e for e in locked}
    entries = []
    for aid, d, n in out.entries:
        prev = locked_keys.get((aid, d, n))
        entries.append(s.ScheduleEntryIO(id=prev.id if prev else None, assignment_id=aid, day=d,
                                         period_number=n, locked=bool(prev)))
    entries.sort(key=lambda e: (e.day, e.period_number))

    conflicts = schedule_conflicts(ctx, entries)  # debe estar vacío; se incluye como verificación
    placed = len(entries)
    flex = sum(1 for e in entries
               if ctx.state(ctx.assignments[e.assignment_id].teacher_id, e.day, e.period_number) == s.CellState.flexible)
    missing = required - placed
    summary = (
        f"Horario completo: {placed} clases colocadas."
        if status == "complete"
        else f"No existe una solución completa: se colocaron {placed} de {required} horas; faltan {missing}."
    )
    return {
        "status": status,
        "entries": entries,
        "report": {
            **base_report,
            "summary": summary,
            "conflicts": conflicts,
            "shortages": shortages,
            "pending": pending_assignments(ctx, entries),
            "stats": {"required": required, "placed": placed, "missing": missing,
                      "flexible_used": flex, "locked_kept": len(locked),
                      "solver_status": out.status, "seconds": round(out.wall_time, 2)},
        },
    }
