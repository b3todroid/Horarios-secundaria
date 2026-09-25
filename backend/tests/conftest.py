import os

os.environ.setdefault("SOLVER_TIME_LIMIT_SECONDS", "20")
os.environ["OPENAI_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app

get_settings.cache_clear()


@pytest.fixture
def client(tmp_path):
    app = create_app(f"sqlite:///{tmp_path / 'test.db'}")
    with TestClient(app) as c:
        yield c


@pytest.fixture
def project(client):
    return client.post("/api/projects", json={"name": "Escuela de prueba"}).json()


class Api:
    """Atajos para construir escenarios en las pruebas."""

    def __init__(self, client, pid):
        self.c, self.pid = client, pid

    def url(self, path):
        return f"/api/projects/{self.pid}{path}"

    def subject(self, name):
        r = self.c.post(self.url("/subjects"), json={"name": name})
        assert r.status_code == 201, r.text
        return r.json()

    def group(self, name, grade=1):
        r = self.c.post(self.url("/groups"), json={"name": name, "grade": grade})
        assert r.status_code == 201, r.text
        return r.json()

    def teacher(self, code, name=None, load=0, subjects=(), **kw):
        body = {"code": code, "name": name or f"Maestro {code}", "weekly_load": load,
                "subject_ids": [s["id"] for s in subjects], **kw}
        r = self.c.post(self.url("/teachers"), json=body)
        assert r.status_code == 201, r.text
        return r.json()

    def assign(self, t, s, g, hours):
        r = self.c.post(self.url("/assignments"), json={"teacher_id": t["id"], "subject_id": s["id"],
                                                         "group_id": g["id"], "hours_per_week": hours})
        assert r.status_code == 201, r.text
        return r.json()

    def availability(self, t, cells):
        r = self.c.put(self.url(f"/teachers/{t['id']}/availability"),
                       json={"cells": [{"day": d, "period_number": n, "state": st} for d, n, st in cells]})
        assert r.status_code == 200, r.text
        return r.json()

    def periods(self, active_numbers):
        cur = self.c.get(self.url("/periods")).json()
        body = [{**{k: p[k] for k in ("number", "start_time", "end_time")}, "active": p["number"] in active_numbers}
                for p in cur]
        r = self.c.put(self.url("/periods"), json={"periods": body})
        assert r.status_code == 200, r.text
        return r.json()

    def generate(self, keep_locked=True):
        r = self.c.post(self.url("/generate"), json={"keep_locked": keep_locked})
        assert r.status_code == 200, r.text
        return r.json()


@pytest.fixture
def api(client, project):
    return Api(client, project["id"])


def check_hard_rules(client, pid):
    """Verificación independiente del generador: devuelve la lista de violaciones."""
    base = f"/api/projects/{pid}"
    entries = client.get(f"{base}/schedule").json()["entries"]
    asg = {a["id"]: a for a in client.get(f"{base}/assignments").json()}
    teachers = {t["id"]: t for t in client.get(f"{base}/teachers").json()}
    periods = {p["number"]: p for p in client.get(f"{base}/periods").json()}
    problems = []
    seen_t, seen_g = set(), set()
    per_asg = {}
    by_teacher_day = {}
    for e in entries:
        a = asg[e["assignment_id"]]
        t = teachers[a["teacher_id"]]
        key_t = (a["teacher_id"], e["day"], e["period_number"])
        key_g = (a["group_id"], e["day"], e["period_number"])
        if key_t in seen_t:
            problems.append(("maestro_doble", key_t))
        if key_g in seen_g:
            problems.append(("grupo_doble", key_g))
        seen_t.add(key_t)
        seen_g.add(key_g)
        if not periods[e["period_number"]]["active"]:
            problems.append(("hora_inactiva", e))
        if not t["active"]:
            problems.append(("maestro_inactivo", e))
        cells = client.get(f"{base}/teachers/{t['id']}/availability").json()["cells"]
        if any(c["day"] == e["day"] and c["period_number"] == e["period_number"] and c["state"] == "blocked" for c in cells):
            problems.append(("bloqueada", e))
        per_asg[a["id"]] = per_asg.get(a["id"], 0) + 1
        by_teacher_day.setdefault((t["id"], e["day"]), set()).add(e["period_number"])
    # Consecutivas: horas contiguas en el tiempo
    active = sorted((p for p in periods.values() if p["active"]), key=lambda p: p["number"])
    for (tid, day), nums in by_teacher_day.items():
        t = teachers[tid]
        limit = t["max_consecutive"] if t["allows_consecutive"] else 1
        streak, prev = 0, None
        for p in active:
            contiguous = prev is not None and p["start_time"] <= prev["end_time"]
            if p["number"] in nums:
                streak = streak + 1 if (contiguous and prev["number"] in nums) else 1
                if streak > limit:
                    problems.append(("consecutivas", tid, day))
            else:
                streak = 0
            prev = p
    return problems, per_asg, asg
