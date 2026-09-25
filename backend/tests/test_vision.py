"""Importación desde fotografía: proveedores, revisión y confirmación."""
import io

from PIL import Image


def _png(color=(240, 240, 240)):
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), color).save(buf, format="PNG")
    return buf.getvalue()


def test_providers_listed_without_keys(client):
    provs = {p["id"]: p for p in client.get("/api/vision/providers").json()}
    assert provs["demo"]["configured"] is True
    assert provs["openai"]["configured"] is False and provs["anthropic"]["configured"] is False


def test_demo_recognition_returns_review_data_without_saving(client, api):
    files = [("files", ("p1.png", _png(), "image/png")), ("files", ("p2.png", _png((200, 200, 200)), "image/png"))]
    r = client.post("/api/vision/recognize", data={"provider": "demo"}, files=files)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["pages"] == 2 and res["teachers"]
    t = res["teachers"][0]
    assert t["name"] and t["assignments"] and t["availability"]
    assert 0 <= res["overall_confidence"] <= 1
    assert any("Revisa" in w for w in t["warnings"])  # campos con confianza baja
    # No se guardó nada
    assert client.get(api.url("/teachers")).json() == []


def test_unconfigured_provider_explains(client):
    r = client.post("/api/vision/recognize", data={"provider": "openai"},
                    files=[("files", ("p.png", _png(), "image/png"))])
    assert r.status_code == 422 and "manual" in r.json()["detail"]


def test_invalid_image_rejected(client):
    r = client.post("/api/vision/recognize", data={"provider": "demo"},
                    files=[("files", ("p.png", b"no soy imagen", "image/png"))])
    assert r.status_code == 422 and "imagen" in r.json()["detail"]


def test_confirm_import_creates_corrected_data(client, api):
    api.subject("Geografía")
    body = {"teachers": [{
        "code": "M90", "name": "María Corregida", "subjects": ["Geografía"],
        "assignments": [{"subject": "Geografía", "group": "1a", "hours": 4},
                        {"subject": "Historia", "group": "2B", "hours": 3}],
        "weekly_load": 7, "allows_consecutive": False, "max_consecutive": 1,
        "availability": [{"day": 0, "period_number": 1, "state": "blocked"}],
    }]}
    r = client.post(api.url("/import/confirm"), json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["teachers"] == ["María Corregida"] and out["assignments"] == 2
    assert out["subjects"] == ["Historia"] and sorted(out["groups"]) == ["1A", "2B"]
    groups = {g["name"]: g["grade"] for g in client.get(api.url("/groups")).json()}
    assert groups == {"1A": 1, "2B": 2}
    t = client.get(api.url("/teachers")).json()[0]
    assert t["allows_consecutive"] is False
    cells = client.get(api.url(f"/teachers/{t['id']}/availability")).json()["cells"]
    assert cells == [{"day": 0, "period_number": 1, "state": "blocked"}]
    # Reimportar el mismo maestro actualiza en lugar de duplicar
    r = client.post(api.url("/import/confirm"), json=body)
    assert r.json()["updated_teachers"] == ["María Corregida"]
    assert len(client.get(api.url("/assignments")).json()) == 2
