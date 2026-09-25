"""Datos de demostración.

Se crean siempre en proyectos separados marcados como demostración
(`is_demo=True`), por lo que nunca se mezclan con los datos reales.
"""
from __future__ import annotations

from .. import schemas as s

SUBJECTS = [
    ("sub-esp", "Español", "ESP", "#2f6fdf"),
    ("sub-mat", "Matemáticas", "MAT", "#d9480f"),
    ("sub-ing", "Inglés", "ING", "#2b8a3e"),
    ("sub-cie", "Ciencias", "CIE", "#7048e8"),
    ("sub-his", "Historia", "HIS", "#c2255c"),
    ("sub-edf", "Educación Física", "EF", "#0c8599"),
]
GROUPS = [("g-1a", 1, "1A"), ("g-1b", 1, "1B"), ("g-2a", 2, "2A"), ("g-2b", 2, "2B"), ("g-3a", 3, "3A")]
HOURS = {"sub-esp": 5, "sub-mat": 5, "sub-ing": 3, "sub-cie": 4, "sub-his": 3, "sub-edf": 2}
ALL_GROUPS = [g[0] for g in GROUPS]


def _teachers(conflict: bool) -> list[dict]:
    return [
        dict(id="t1", code="M01", name="Ana López Hernández", subjects=["sub-esp"], load=25, cons=True, max=3,
             teaches=[("sub-esp", ALL_GROUPS)]),
        dict(id="t2", code="M02", name="Carlos Ruiz Martínez", subjects=["sub-mat"], load=22 if conflict else 20,
             cons=True, max=3, teaches=[("sub-mat", ["g-1a", "g-1b", "g-2a", "g-2b"])]),
        dict(id="t3", code="M03", name="Elena Torres Gómez", subjects=["sub-mat", "sub-cie"], load=17,
             cons=not conflict, max=2, teaches=[("sub-mat", ["g-3a"]), ("sub-cie", ["g-1a", "g-1b", "g-2a"])]),
        dict(id="t4", code="M04", name="Jorge Méndez Ortiz", subjects=["sub-ing", "sub-cie"], load=23, cons=True,
             max=4, teaches=[("sub-ing", ALL_GROUPS), ("sub-cie", ["g-2b", "g-3a"])]),
        dict(id="t5", code="M05", name="Sofía Ramírez Castro", subjects=["sub-his", "sub-edf"], load=25, cons=True,
             max=3, teaches=[("sub-his", ALL_GROUPS), ("sub-edf", ALL_GROUPS)]),
    ]


def _availability(conflict: bool) -> dict[str, list[tuple[int, int, str]]]:
    av: dict[str, list[tuple[int, int, str]]] = {
        "t1": [(4, 6, "blocked"), (4, 7, "blocked"), (0, 1, "flexible"), (2, 1, "flexible")],
        "t2": [(2, 1, "blocked"), (2, 2, "blocked"), (3, 7, "flexible"), (1, 7, "flexible")],
        "t3": [(0, n, "blocked") for n in range(1, 8)] + [(1, 1, "flexible"), (3, 1, "flexible")],
        "t4": [(1, 5, "flexible"), (1, 6, "flexible"), (1, 7, "flexible")],
        "t5": [(4, n, "flexible") for n in range(1, 8)],
    }
    if conflict:
        # Elena no acepta consecutivas y además bloquea lunes y martes.
        av["t3"] = [(d, n, "blocked") for d in (0, 1) for n in range(1, 8)]
        # Jorge solo puede lunes y martes: 14 espacios para 23 horas.
        av["t4"] = [(d, n, "blocked") for d in (2, 3, 4) for n in range(1, 8)]
    return av


def build_demo(kind: str) -> s.ProjectData:
    if kind not in ("solvable", "conflict"):
        raise ValueError("Tipo de demostración desconocido.")
    conflict = kind == "conflict"
    periods = [
        s.PeriodIn(number=i, start_time=a, end_time=b, active=i <= 7)
        for i, (a, b) in enumerate(s.DEFAULT_PERIODS, start=1)
    ]
    teachers = _teachers(conflict)
    assignments = []
    for t in teachers:
        for sub, groups in t["teaches"]:
            for g in groups:
                assignments.append(s.BackupAssignment(
                    id=f"a-{t['id']}-{sub}-{g}", teacher_id=t["id"], subject_id=sub, group_id=g,
                    hours_per_week=HOURS[sub],
                ))
    av = _availability(conflict)
    return s.ProjectData(
        project=s.ProjectIn(name="Demostración: con conflicto" if conflict else "Demostración: con solución"),
        periods=periods,
        subjects=[s.BackupSubject(id=i, name=n, short_name=sh, color=c) for i, n, sh, c in SUBJECTS],
        groups=[s.BackupGroup(id=i, grade=gr, name=n) for i, gr, n in GROUPS],
        teachers=[
            s.BackupTeacher(id=t["id"], code=t["code"], name=t["name"], subject_ids=t["subjects"],
                            weekly_load=t["load"], allows_consecutive=t["cons"], max_consecutive=t["max"])
            for t in teachers
        ],
        assignments=assignments,
        availability=[
            s.BackupAvailability(
                teacher_id=tid,
                cells=[s.AvailabilityCellIO(day=d, period_number=n, state=st) for d, n, st in cells],
            )
            for tid, cells in av.items()
        ],
    )
