"""Validaciones previas a la generación, resumen de cargas y detección de conflictos."""
from __future__ import annotations

from collections import Counter, defaultdict

from .. import schemas as s
from .context import Ctx, slot_label


def issue(
    severity: str,
    rule: str,
    message: str,
    *,
    teacher: str | None = None,
    group: str | None = None,
    subject: str | None = None,
    missing_hours: int | None = None,
    actions: list[str] | None = None,
    **extra,
) -> dict:
    return {
        "severity": severity,
        "rule": rule,
        "message": message,
        "teacher": teacher,
        "group": group,
        "subject": subject,
        "missing_hours": missing_hours,
        "actions": actions or [],
        **extra,
    }


# ------------------------------------------------------------ cargas
def load_summary(ctx: Ctx) -> list[s.LoadSummary]:
    assigned: Counter[str] = Counter()
    for a in ctx.assignments.values():
        assigned[a.teacher_id] += a.hours_per_week
    scheduled: Counter[str] = Counter()
    for e in ctx.schedule:
        a = ctx.assignments.get(e.assignment_id)
        if a:
            scheduled[a.teacher_id] += 1
    out = []
    for t in sorted(ctx.teachers.values(), key=lambda t: t.code):
        diff = t.weekly_load - assigned[t.id]
        if diff == 0:
            status, msg = "ok", "La carga declarada coincide con las asignaciones."
        elif diff > 0:
            status, msg = "faltan", f"Faltan {diff} h por asignar para cubrir la carga declarada."
        else:
            status, msg = "sobran", f"Las asignaciones superan la carga declarada por {-diff} h."
        out.append(
            s.LoadSummary(
                teacher_id=t.id, teacher_name=t.name, teacher_code=t.code, active=t.active,
                declared=t.weekly_load, assigned=assigned[t.id], difference=diff,
                scheduled=scheduled[t.id], status=status, message=msg,
            )
        )
    return out


# ------------------------------------------------------------ validación previa
def prevalidate(ctx: Ctx) -> list[dict]:
    """Revisa los datos antes de generar. Los errores impiden generar; las advertencias no."""
    issues: list[dict] = []
    slots_per_week = len(ctx.active_numbers) * s.NUM_DAYS

    if not ctx.active_numbers:
        issues.append(issue("error", "sin_horas", "No hay horas activas en la configuración escolar.",
                            actions=["Activa al menos una hora en Configuración escolar."]))
        return issues
    if not ctx.assignments:
        issues.append(issue("error", "sin_asignaciones", "No hay asignaciones en la carga horaria.",
                            actions=["Registra maestro, materia, grupo y horas en Carga horaria."]))
        return issues

    # Referencias y elementos inactivos
    for a in ctx.assignments.values():
        d = ctx.describe(a.id)
        t, g, sub = ctx.teachers.get(a.teacher_id), ctx.groups.get(a.group_id), ctx.subjects.get(a.subject_id)
        if not (t and g and sub):
            issues.append(issue("error", "referencia_inexistente",
                                "La asignación no tiene maestro, grupo o materia válidos.",
                                **{k: d[k] for k in ("teacher", "group", "subject")},
                                actions=["Corrige o elimina la asignación en Carga horaria."]))
            continue
        inactive = [lbl for lbl, obj in (("el maestro", t), ("el grupo", g), ("la materia", sub)) if not obj.active]
        if inactive:
            issues.append(issue("warning", "inactivo",
                                f"La asignación no se programará porque {', '.join(inactive)} está inactivo.",
                                teacher=t.name, group=g.name, subject=sub.name, missing_hours=a.hours_per_week,
                                actions=["Reactiva el elemento o elimina la asignación."]))
        if sub.id not in t.subject_ids:
            issues.append(issue("warning", "materia_no_registrada",
                                f"{t.name} no tiene registrada la materia {sub.name}.",
                                teacher=t.name, group=g.name, subject=sub.name,
                                actions=[f"Agrega {sub.name} a las materias de {t.name}."]))
        if a.hours_per_week > slots_per_week:
            issues.append(issue("error", "excede_semana",
                                f"La asignación pide {a.hours_per_week} h y la semana solo tiene {slots_per_week} horas activas.",
                                teacher=t.name, group=g.name, subject=sub.name,
                                missing_hours=a.hours_per_week - slots_per_week,
                                actions=["Reduce las horas de la asignación o activa más horas."]))

    # Duplicados (por si llegan de un respaldo o importación)
    seen: dict[tuple[str, str, str], str] = {}
    for a in ctx.assignments.values():
        key = (a.teacher_id, a.subject_id, a.group_id)
        if key in seen:
            d = ctx.describe(a.id)
            issues.append(issue("error", "duplicado", "La asignación está duplicada.",
                                teacher=d["teacher"], group=d["group"], subject=d["subject"],
                                actions=["Elimina una de las dos asignaciones y suma sus horas en la otra."]))
        seen[key] = a.id

    # Carga del maestro
    active_asg = ctx.schedulable_assignments()
    by_teacher: dict[str, list[s.AssignmentOut]] = defaultdict(list)
    by_group: dict[str, list[s.AssignmentOut]] = defaultdict(list)
    for a in active_asg:
        by_teacher[a.teacher_id].append(a)
        by_group[a.group_id].append(a)

    for summary in load_summary(ctx):
        t = ctx.teachers[summary.teacher_id]
        if t.active and summary.difference != 0:
            issues.append(issue("warning", "carga_no_coincide",
                                f"{t.name}: carga declarada {summary.declared} h, asignada {summary.assigned} h. {summary.message}",
                                teacher=t.name,
                                actions=["Ajusta la carga semanal del maestro o sus asignaciones."]))

    for tid, asgs in by_teacher.items():
        t = ctx.teachers[tid]
        need = sum(a.hours_per_week for a in asgs)
        usable = ctx.usable_slots(tid)
        if need > len(usable):
            issues.append(issue("error", "disponibilidad_insuficiente",
                                f"{t.name} necesita {need} h pero solo tiene {len(usable)} espacios no bloqueados.",
                                teacher=t.name, missing_hours=need - len(usable),
                                actions=["Cambia celdas BLOQUEADAS a FLEXIBLE o DISPONIBLE.",
                                         "Reduce horas o reparte asignaciones con otro maestro."]))
        # Límite de horas seguidas: capacidad máxima por día
        limit = t.max_consecutive if t.allows_consecutive else 1
        cap = 0
        for d in range(s.NUM_DAYS):
            for run in ctx.consecutive_runs():
                free = [n for n in run if ctx.state(tid, d, n) != s.CellState.blocked]
                cap += _max_with_limit(run, set(free), limit)
        if need <= len(usable) and need > cap:
            rule_txt = "no acepta horas consecutivas" if not t.allows_consecutive else f"admite máximo {limit} horas seguidas"
            issues.append(issue("error", "consecutivas_insuficientes",
                                f"{t.name} {rule_txt}; con esa regla solo caben {cap} de sus {need} h.",
                                teacher=t.name, missing_hours=need - cap,
                                actions=["Aumenta el máximo de horas consecutivas.",
                                         "Libera más horas en su disponibilidad."]))

    for gid, asgs in by_group.items():
        g = ctx.groups[gid]
        need = sum(a.hours_per_week for a in asgs)
        if need > slots_per_week:
            issues.append(issue("error", "grupo_sin_espacio",
                                f"El grupo {g.name} tiene {need} h asignadas y solo hay {slots_per_week} espacios en la semana.",
                                group=g.name, missing_hours=need - slots_per_week,
                                actions=["Activa más horas por día.", "Reduce horas de alguna materia del grupo."]))
    return issues


def _max_with_limit(run: list[int], free: set[int], limit: int) -> int:
    """Máximo de clases colocables en un bloque contiguo sin exceder `limit` seguidas."""
    total, streak = 0, 0
    for n in run:
        if n in free and streak < limit:
            total += 1
            streak += 1
        else:
            streak = 0
    return total


# ------------------------------------------------------------ conflictos en un horario
def schedule_conflicts(ctx: Ctx, entries: list[s.ScheduleEntryIO]) -> list[dict]:
    """Revisa un horario completo y devuelve todas las violaciones de reglas obligatorias."""
    out: list[dict] = []
    by_teacher: dict[tuple[str, int, int], list[s.ScheduleEntryIO]] = defaultdict(list)
    by_group: dict[tuple[str, int, int], list[s.ScheduleEntryIO]] = defaultdict(list)
    teacher_days: dict[tuple[str, int], set[int]] = defaultdict(set)
    active = set(ctx.active_numbers)

    for e in entries:
        a = ctx.assignments.get(e.assignment_id)
        if a is None:
            out.append(issue("error", "referencia_inexistente", "Hay una clase de una asignación inexistente.",
                             entry_ids=[e.id]))
            continue
        d = ctx.describe(a.id)
        where = slot_label(ctx, e.day, e.period_number)
        base = dict(teacher=d["teacher"], group=d["group"], subject=d["subject"], day=e.day,
                    period_number=e.period_number, entry_ids=[e.id])
        if not ctx.is_schedulable(a):
            out.append(issue("error", "inactivo", f"{where}: la clase usa un maestro, grupo o materia inactivo.", **base))
        if e.period_number not in active:
            out.append(issue("error", "hora_desactivada", f"{where}: la hora está desactivada.", **base))
        if ctx.state(a.teacher_id, e.day, e.period_number) == s.CellState.blocked:
            out.append(issue("error", "hora_bloqueada", f"{where}: {d['teacher']} tiene esta hora BLOQUEADA.", **base))
        by_teacher[(a.teacher_id, e.day, e.period_number)].append(e)
        by_group[(a.group_id, e.day, e.period_number)].append(e)
        teacher_days[(a.teacher_id, e.day)].add(e.period_number)

    for (tid, day, num), es in by_teacher.items():
        if len(es) > 1:
            groups = ", ".join(ctx.describe(e.assignment_id)["group"] for e in es)
            out.append(issue("error", "maestro_duplicado",
                             f"{slot_label(ctx, day, num)}: {ctx.teachers[tid].name} está en dos grupos a la vez ({groups}).",
                             teacher=ctx.teachers[tid].name, day=day, period_number=num,
                             entry_ids=[e.id for e in es]))
    for (gid, day, num), es in by_group.items():
        if len(es) > 1:
            who = ", ".join(f"{ctx.describe(e.assignment_id)['subject']} ({ctx.describe(e.assignment_id)['teacher']})" for e in es)
            out.append(issue("error", "grupo_duplicado",
                             f"{slot_label(ctx, day, num)}: el grupo {ctx.groups[gid].name} tiene dos clases a la vez: {who}.",
                             group=ctx.groups[gid].name, day=day, period_number=num,
                             entry_ids=[e.id for e in es]))

    runs = ctx.consecutive_runs()
    for (tid, day), nums in teacher_days.items():
        t = ctx.teachers.get(tid)
        if t is None:
            continue
        limit = t.max_consecutive if t.allows_consecutive else 1
        for run in runs:
            streak: list[int] = []
            for n in run + [None]:
                if n is not None and n in nums:
                    streak.append(n)
                    continue
                if len(streak) > limit:
                    rule = ("no acepta horas consecutivas" if not t.allows_consecutive
                            else f"admite máximo {limit} horas seguidas")
                    out.append(issue("error", "consecutivas",
                                     f"{s.DAYS[day]}: {t.name} tiene {len(streak)} horas seguidas "
                                     f"(horas {streak[0]} a {streak[-1]}) y {rule}.",
                                     teacher=t.name, day=day, period_number=streak[0]))
                streak = []
    return out


def pending_assignments(ctx: Ctx, entries: list[s.ScheduleEntryIO]) -> list[dict]:
    placed: Counter[str] = Counter(e.assignment_id for e in entries)
    out = []
    for a in ctx.assignments.values():
        missing = a.hours_per_week - placed[a.id]
        if missing != 0 or not ctx.is_schedulable(a):
            d = ctx.describe(a.id)
            out.append({
                **d,
                "hours_per_week": a.hours_per_week,
                "scheduled": placed[a.id],
                "missing": missing,
                "reason": ("Maestro, grupo o materia inactivos" if not ctx.is_schedulable(a)
                           else "Faltan horas por colocar" if missing > 0 else "Hay horas de más"),
            })
    return out


def flexible_usage(ctx: Ctx, entries: list[s.ScheduleEntryIO]) -> int:
    n = 0
    for e in entries:
        a = ctx.assignments.get(e.assignment_id)
        if a and ctx.state(a.teacher_id, e.day, e.period_number) == s.CellState.flexible:
            n += 1
    return n
