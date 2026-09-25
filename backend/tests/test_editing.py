"""Edición manual: mover, intercambiar, fijar, regenerar y deshacer."""
from tests.conftest import check_hard_rules
from tests.test_solver import small_school


def _entries(client, api):
    return client.get(api.url("/schedule")).json()["entries"]


def test_teacher_double_booking_detected(client, api):
    mat = api.subject("Matemáticas")
    g1, g2 = api.group("1A"), api.group("1B")
    t = api.teacher("M01", load=2, subjects=[mat])
    api.assign(t, mat, g1, 1)
    a2 = api.assign(t, mat, g2, 1)
    api.periods({1, 2})
    assert api.generate()["status"] == "complete"
    entries = _entries(client, api)
    e1 = next(e for e in entries if e["assignment_id"] != a2["id"])
    e2 = next(e for e in entries if e["assignment_id"] == a2["id"])
    body = {"entry_id": e2["id"], "day": e1["day"], "period_number": e1["period_number"]}
    prev = client.post(api.url("/schedule/preview"), json=body).json()
    assert prev["kind"] == "move" and prev["allowed"] is False
    assert {c["rule"] for c in prev["conflicts"]} == {"maestro_duplicado"}
    assert prev["teachers"] == ["Maestro M01"] and prev["groups"] == ["1B"]
    assert prev["original"]["slot"] and prev["target"]["slot"]
    r = client.post(api.url("/schedule/apply"), json=body)
    assert r.status_code == 409 and "no se guardó" in r.json()["detail"]
    # El horario guardado no cambió
    assert {e["id"]: (e["day"], e["period_number"]) for e in _entries(client, api)}[e2["id"]] == (e2["day"], e2["period_number"])


def test_group_double_booking_detected_by_checker(client, api):
    from app.services.context import load_context
    from app.services.validation import schedule_conflicts
    from app.repositories.sql import SqlRepository
    from app.db import get_session
    from app import schemas as s

    t1, t2, g1, g2 = small_school(api)
    asg = client.get(api.url("/assignments")).json()
    a_mat_1a = next(a for a in asg if a["teacher_id"] == t1["id"] and a["group_id"] == g1["id"])
    a_esp_1a = next(a for a in asg if a["teacher_id"] == t2["id"] and a["group_id"] == g1["id"])
    session = next(get_session())
    ctx = load_context(SqlRepository(session), api.pid)
    entries = [s.ScheduleEntryIO(id="x1", assignment_id=a_mat_1a["id"], day=0, period_number=1),
               s.ScheduleEntryIO(id="x2", assignment_id=a_esp_1a["id"], day=0, period_number=1)]
    rules = {c["rule"] for c in schedule_conflicts(ctx, entries)}
    assert "grupo_duplicado" in rules
    a_mat_1b = next(a for a in asg if a["teacher_id"] == t1["id"] and a["group_id"] == g2["id"])
    entries = [s.ScheduleEntryIO(id="x1", assignment_id=a_mat_1a["id"], day=0, period_number=1),
               s.ScheduleEntryIO(id="x3", assignment_id=a_mat_1b["id"], day=0, period_number=1)]
    rules = {c["rule"] for c in schedule_conflicts(ctx, entries)}
    assert "maestro_duplicado" in rules
    session.close()


def test_move_to_free_slot_and_undo(client, api):
    small_school(api)
    api.periods(set(range(1, 10)))
    api.generate()
    entries = _entries(client, api)
    asg = {a["id"]: a for a in client.get(api.url("/assignments")).json()}
    # Buscar un movimiento válido
    moved = None
    for e in entries:
        for d in range(5):
            for n in range(1, 10):
                body = {"entry_id": e["id"], "day": d, "period_number": n}
                p = client.post(api.url("/schedule/preview"), json=body).json()
                if p.get("allowed") and p["kind"] == "move":
                    moved = (e, body)
                    break
            if moved:
                break
        if moved:
            break
    assert moved
    r = client.post(api.url("/schedule/apply"), json=moved[1])
    assert r.status_code == 200
    after = {x["id"]: x for x in r.json()["schedule"]["entries"]}
    assert (after[moved[0]["id"]]["day"], after[moved[0]["id"]]["period_number"]) == (moved[1]["day"], moved[1]["period_number"])
    assert check_hard_rules(client, api.pid)[0] == []
    undo = client.post(api.url("/schedule/undo")).json()
    back = {x["id"]: x for x in undo["schedule"]["entries"]}
    assert (back[moved[0]["id"]]["day"], back[moved[0]["id"]]["period_number"]) == (moved[0]["day"], moved[0]["period_number"])


def test_swap_two_classes_of_same_group(client, api):
    t1, t2, g1, g2 = small_school(api)
    api.generate()
    entries = _entries(client, api)
    asg = {a["id"]: a for a in client.get(api.url("/assignments")).json()}
    g1_entries = [e for e in entries if asg[e["assignment_id"]]["group_id"] == g1["id"]]
    a = next(e for e in g1_entries if asg[e["assignment_id"]]["teacher_id"] == t1["id"])
    for b in g1_entries:
        if asg[b["assignment_id"]]["teacher_id"] == t2["id"]:
            body = {"entry_id": a["id"], "day": b["day"], "period_number": b["period_number"], "swap_with": b["id"]}
            p = client.post(api.url("/schedule/preview"), json=body).json()
            assert p["kind"] == "swap" and set(p["groups"]) == {"1A"}
            if p["allowed"]:
                r = client.post(api.url("/schedule/apply"), json=body)
                assert r.status_code == 200
                assert check_hard_rules(client, api.pid)[0] == []
                return
    raise AssertionError("no se encontró un intercambio válido")


def test_locked_classes_survive_partial_regeneration(client, api):
    small_school(api)
    api.generate()
    entries = _entries(client, api)
    lock = entries[0]
    r = client.patch(api.url(f"/schedule/entries/{lock['id']}"), json={"locked": True})
    assert r.status_code == 200
    res = api.generate(keep_locked=True)
    assert res["status"] == "complete" and res["report"]["stats"]["locked_kept"] == 1
    new = res["schedule"]["entries"]
    kept = [e for e in new if e["locked"]]
    assert len(kept) == 1
    assert (kept[0]["assignment_id"], kept[0]["day"], kept[0]["period_number"]) == (
        lock["assignment_id"], lock["day"], lock["period_number"])


def test_remove_and_place_pending(client, api):
    small_school(api)
    api.generate()
    entries = _entries(client, api)
    e = entries[0]
    st = client.delete(api.url(f"/schedule/entries/{e['id']}")).json()
    assert any(p["assignment_id"] == e["assignment_id"] and p["missing"] == 1 for p in st["pending"])
    body = {"assignment_id": e["assignment_id"], "day": e["day"], "period_number": e["period_number"]}
    p = client.post(api.url("/schedule/preview"), json=body).json()
    assert p["kind"] == "place" and p["allowed"]
    assert client.post(api.url("/schedule/apply"), json=body).status_code == 200
    assert client.get(api.url("/schedule")).json()["pending"] == []


def test_undo_without_history(client, api):
    r = client.post(api.url("/schedule/undo"))
    assert r.status_code == 409 and "deshacer" in r.json()["detail"]
