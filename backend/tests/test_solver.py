"""Generador CP-SAT: reglas obligatorias, preferencias y reportes."""
from tests.conftest import check_hard_rules


def small_school(api):
    mat, esp = api.subject("Matemáticas"), api.subject("Español")
    g1, g2 = api.group("1A"), api.group("1B")
    t1 = api.teacher("M01", load=10, subjects=[mat])
    t2 = api.teacher("M02", load=10, subjects=[esp])
    api.assign(t1, mat, g1, 5)
    api.assign(t1, mat, g2, 5)
    api.assign(t2, esp, g1, 5)
    api.assign(t2, esp, g2, 5)
    return t1, t2, g1, g2


def test_generates_valid_schedule(client, api):
    small_school(api)
    res = api.generate()
    assert res["status"] == "complete"
    problems, per_asg, asg = check_hard_rules(client, api.pid)
    assert problems == []
    assert all(per_asg[a] == asg[a]["hours_per_week"] for a in asg)
    assert res["schedule"]["conflicts"] == [] and res["schedule"]["pending"] == []


def test_demo_solvable_respects_every_rule(client):
    pid = client.post("/api/demo/solvable").json()["id"]
    res = client.post(f"/api/projects/{pid}/generate", json={}).json()
    assert res["status"] == "complete"
    problems, per_asg, asg = check_hard_rules(client, pid)
    assert problems == []
    assert sum(per_asg.values()) == sum(a["hours_per_week"] for a in asg.values()) == 110


def test_blocked_hours_are_never_used(client, api):
    t1, t2, *_ = small_school(api)
    blocked = [(d, n, "blocked") for d in range(5) for n in (1, 2, 3)]
    api.availability(t1, blocked)
    assert api.generate()["status"] == "complete"
    entries = client.get(api.url("/schedule")).json()["entries"]
    asg = {a["id"]: a for a in client.get(api.url("/assignments")).json()}
    for e in entries:
        if asg[e["assignment_id"]]["teacher_id"] == t1["id"]:
            assert e["period_number"] not in (1, 2, 3)


def test_inactive_periods_are_never_used(client, api):
    small_school(api)
    api.periods({1, 2, 3, 4, 5})
    assert api.generate()["status"] == "complete"
    entries = client.get(api.url("/schedule")).json()["entries"]
    assert entries and all(e["period_number"] <= 5 for e in entries)


def test_flexible_used_only_when_needed(client, api):
    t1, *_ = small_school(api)
    # Todo flexible excepto lo suficiente: 10 horas disponibles, el resto flexible.
    cells = [(d, n, "flexible") for d in range(5) for n in range(1, 10) if n > 2]
    api.availability(t1, cells)
    res = api.generate()
    assert res["status"] == "complete" and res["report"]["stats"]["flexible_used"] == 0
    # Con solo 8 disponibles, necesita exactamente 2 flexibles.
    cells = [(d, n, "flexible") for d in range(5) for n in range(1, 10) if n > 2] + [(4, 1, "flexible"), (4, 2, "flexible")]
    api.availability(t1, cells)
    res = api.generate()
    assert res["status"] == "complete" and res["report"]["stats"]["flexible_used"] == 2


def test_max_consecutive_and_no_consecutive(client, api):
    mat = api.subject("Matemáticas")
    groups = [api.group(n) for n in ("1A", "1B", "1C")]
    t = api.teacher("M01", load=15, subjects=[mat], allows_consecutive=True, max_consecutive=2)
    for g in groups:
        api.assign(t, mat, g, 5)
    api.periods({1, 2, 3, 4})  # 1-4 contiguas: con máximo 2 caben 3 por día
    assert api.generate()["status"] == "complete"
    problems, *_ = check_hard_rules(client, api.pid)
    assert problems == []

    t2 = api.teacher("M02", load=5, subjects=[mat], allows_consecutive=False, max_consecutive=1)
    g = api.group("2A", 2)
    api.assign(t2, mat, g, 5)
    assert api.generate()["status"] == "complete"
    problems, *_ = check_hard_rules(client, api.pid)
    assert problems == []


def test_recess_breaks_consecutive_hours(client, api):
    """La hora 4 (10:00-10:50) y la 5 (11:10-12:00) no son consecutivas por el receso."""
    mat = api.subject("Matemáticas")
    groups = [api.group(n) for n in ("1A", "1B")]
    t = api.teacher("M01", load=10, subjects=[mat], allows_consecutive=False)
    for g in groups:
        api.assign(t, mat, g, 5)
    api.periods({4, 5})
    assert api.generate()["status"] == "complete"


def test_inactive_teacher_not_scheduled(client, api):
    t1, t2, *_ = small_school(api)
    body = {k: t2[k] for k in ("code", "name", "weekly_load", "subject_ids")}
    client.put(api.url(f"/teachers/{t2['id']}"), json={**body, "active": False})
    res = api.generate()
    entries = client.get(api.url("/schedule")).json()["entries"]
    asg = {a["id"]: a for a in client.get(api.url("/assignments")).json()}
    assert all(asg[e["assignment_id"]]["teacher_id"] != t2["id"] for e in entries)
    assert any(i["rule"] == "inactivo" for i in res["report"]["prevalidation"])


def test_infeasible_produces_detailed_report(client, api):
    mat = api.subject("Matemáticas")
    g = api.group("1A")
    t = api.teacher("M01", "Pedro Infante", load=10, subjects=[mat])
    api.assign(t, mat, g, 10)
    api.periods({1, 2})
    api.availability(t, [(d, 2, "blocked") for d in range(5)] + [(0, 1, "blocked")])
    res = api.generate()
    assert res["status"] == "partial"
    rep = res["report"]
    assert rep["stats"]["missing"] == 6
    sh = rep["shortages"][0]
    assert sh["teacher"] == "Pedro Infante" and sh["group"] == "1A" and sh["subject"] == "Matemáticas"
    assert sh["missing_hours"] == 6 and sh["actions"] and sh["rule"]
    pre = {i["rule"] for i in rep["prevalidation"]}
    assert "disponibilidad_insuficiente" in pre


def test_demo_conflict_explains_problems(client):
    pid = client.post("/api/demo/conflict").json()["id"]
    res = client.post(f"/api/projects/{pid}/generate", json={}).json()
    assert res["status"] == "partial"
    teachers = {s["teacher"] for s in res["report"]["shortages"]}
    assert {"Elena Torres Gómez", "Jorge Méndez Ortiz"} <= teachers
    causes = {c for s in res["report"]["shortages"] for c in s["causes"]}
    assert "consecutivas" in causes and "horas_bloqueadas" in causes
    problems, *_ = check_hard_rules(client, pid)
    assert problems == []


def test_group_capacity_prevalidation(client, api):
    mat = api.subject("Matemáticas")
    g = api.group("1A")
    teachers = [api.teacher(f"M{i}", load=5, subjects=[mat]) for i in range(3)]
    api.periods({1, 2})
    for t in teachers:
        api.assign(t, mat, g, 5)
    issues = client.get(api.url("/validate")).json()["issues"]
    assert any(i["rule"] == "grupo_sin_espacio" and i["missing_hours"] == 5 for i in issues)


def test_nothing_to_generate_is_reported(client, api):
    res = api.generate()
    assert res["status"] == "invalid"
    assert res["report"]["prevalidation"][0]["rule"] == "sin_asignaciones"
