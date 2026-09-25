"""Maestros, grupos, materias, horas y cargas."""


def test_teacher_create_edit_deactivate_reactivate(client, api):
    esp = api.subject("Español")
    t = api.teacher("M01", "Ana López", load=10, subjects=[esp])
    assert t["active"] and t["subject_ids"] == [esp["id"]]

    body = {**{k: t[k] for k in ("code", "weekly_load", "allows_consecutive", "max_consecutive", "subject_ids")},
            "name": "Ana López Pérez"}
    r = client.put(api.url(f"/teachers/{t['id']}"), json=body)
    assert r.status_code == 200 and r.json()["name"] == "Ana López Pérez"

    r = client.put(api.url(f"/teachers/{t['id']}"), json={**body, "active": False})
    assert r.json()["active"] is False
    # Conserva su información histórica
    stored = client.get(api.url("/teachers")).json()[0]
    assert stored["name"] == "Ana López Pérez" and stored["weekly_load"] == 10

    r = client.put(api.url(f"/teachers/{t['id']}"), json={**body, "active": True})
    assert r.json()["active"] is True
    assert r.json()["created_at"] <= r.json()["updated_at"]


def test_teacher_code_must_be_unique(client, api):
    api.teacher("M01")
    r = client.post(api.url("/teachers"), json={"code": "m01", "name": "Otro", "weekly_load": 0})
    assert r.status_code == 409
    assert "M01" in r.json()["detail"] or "m01" in r.json()["detail"]


def test_maximum_99_active_teachers(client, api):
    for i in range(1, 100):
        api.teacher(f"M{i:02d}")
    r = client.post(api.url("/teachers"), json={"code": "M100", "name": "Sobra", "weekly_load": 0})
    assert r.status_code == 409 and "99" in r.json()["detail"]
    # Se puede registrar inactivo y reactivarlo solo si hay lugar
    r = client.post(api.url("/teachers"), json={"code": "M100", "name": "Sobra", "weekly_load": 0, "active": False})
    assert r.status_code == 201
    extra = r.json()
    body = {k: extra[k] for k in ("code", "name", "weekly_load", "subject_ids")}
    assert client.put(api.url(f"/teachers/{extra['id']}"), json={**body, "active": True}).status_code == 409
    first = client.get(api.url("/teachers")).json()[0]
    fb = {k: first[k] for k in ("code", "name", "weekly_load", "subject_ids")}
    assert client.put(api.url(f"/teachers/{first['id']}"), json={**fb, "active": False}).status_code == 200
    assert client.put(api.url(f"/teachers/{extra['id']}"), json={**body, "active": True}).status_code == 200


def test_validation_messages_are_in_spanish(client, api):
    r = client.post(api.url("/teachers"), json={"code": "", "name": "X", "weekly_load": -1})
    assert r.status_code == 422
    assert "identificador" in r.json()["detail"] and "carga semanal" in r.json()["detail"]


def test_groups_and_subjects_are_configurable(client, api):
    g = api.group("1A", 1)
    api.group("3C", 3)
    assert client.post(api.url("/groups"), json={"name": "1a", "grade": 1}).status_code == 409
    r = client.put(api.url(f"/groups/{g['id']}"), json={"name": "1A Matutino", "grade": 1, "active": False})
    assert r.json()["name"] == "1A Matutino" and r.json()["active"] is False
    s = api.subject("Artes")
    r = client.put(api.url(f"/subjects/{s['id']}"), json={"name": "Artes Visuales", "short_name": "ART"})
    assert r.json()["name"] == "Artes Visuales"
    assert client.delete(api.url(f"/subjects/{s['id']}")).status_code == 204


def test_default_periods_and_toggle(client, api):
    periods = client.get(api.url("/periods")).json()
    assert [(p["start_time"], p["end_time"]) for p in periods][:2] == [("07:30", "08:20"), ("08:20", "09:10")]
    assert len(periods) == 9 and all(p["active"] for p in periods)
    updated = api.periods({1, 2, 3, 4, 5, 6, 7})
    assert [p["number"] for p in updated if not p["active"]] == [8, 9]


def test_periods_validation(client, api):
    bad = [{"number": 1, "start_time": "08:00", "end_time": "07:00", "active": True}]
    assert client.put(api.url("/periods"), json={"periods": bad}).status_code == 422
    none_active = [{"number": 1, "start_time": "07:00", "end_time": "08:00", "active": False}]
    r = client.put(api.url("/periods"), json={"periods": none_active})
    assert r.status_code == 422 and "activa" in r.json()["detail"]
    overlap = [{"number": 1, "start_time": "07:00", "end_time": "08:00", "active": True},
               {"number": 2, "start_time": "07:30", "end_time": "08:30", "active": True}]
    assert client.put(api.url("/periods"), json={"periods": overlap}).status_code == 422


def test_availability_three_states_and_default(client, api):
    t = api.teacher("M01")
    got = client.get(api.url(f"/teachers/{t['id']}/availability")).json()
    assert got["cells"] == []  # sin restricciones = todo DISPONIBLE
    api.availability(t, [(0, 1, "blocked"), (0, 2, "flexible"), (0, 3, "available")])
    cells = {(c["day"], c["period_number"]): c["state"]
             for c in client.get(api.url(f"/teachers/{t['id']}/availability")).json()["cells"]}
    assert cells == {(0, 1): "blocked", (0, 2): "flexible"}
    r = client.put(api.url(f"/teachers/{t['id']}/availability"),
                   json={"cells": [{"day": 0, "period_number": 1, "state": "tal vez"}]})
    assert r.status_code == 422


def test_weekly_load_calculation(client, api):
    mat, cie = api.subject("Matemáticas"), api.subject("Ciencias")
    g1, g2 = api.group("1A"), api.group("1B")
    t = api.teacher("M01", load=12, subjects=[mat, cie])
    api.assign(t, mat, g1, 5)
    api.assign(t, cie, g2, 4)
    load = client.get(api.url("/loads")).json()[0]
    assert (load["declared"], load["assigned"], load["difference"], load["status"]) == (12, 9, 3, "faltan")
    api.assign(t, mat, g2, 5)
    load = client.get(api.url("/loads")).json()[0]
    assert (load["assigned"], load["difference"], load["status"]) == (14, -2, "sobran")


def test_duplicate_assignment_rejected(client, api):
    mat, g = api.subject("Matemáticas"), api.group("1A")
    t = api.teacher("M01", subjects=[mat])
    api.assign(t, mat, g, 5)
    r = client.post(api.url("/assignments"), json={"teacher_id": t["id"], "subject_id": mat["id"],
                                                    "group_id": g["id"], "hours_per_week": 2})
    assert r.status_code == 409 and "Ya existe" in r.json()["detail"]


def test_assignment_requires_existing_references(client, api):
    r = client.post(api.url("/assignments"), json={"teacher_id": "nope", "subject_id": "x",
                                                    "group_id": "y", "hours_per_week": 2})
    assert r.status_code == 404
