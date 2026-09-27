import pytest
from fastapi.testclient import TestClient

from interview_prep.graph import nodes
from interview_prep.main import app
from test_graph import ev, fake_structured


@pytest.fixture
def client(monkeypatch):
    # Q1 weak -> follow-up (strong) ; Q2 strong ; one more strong spare
    monkeypatch.setattr(nodes, "structured", fake_structured(iter([ev(False), ev(True), ev(True), ev(True)])))
    with TestClient(app) as c:
        yield c


def signup(client, email):
    r = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def create(client, headers, **extra):
    return client.post(
        "/interviews", headers=headers,
        files={"resume": ("cv.txt", b"python developer with 2 years experience", "text/plain")},
        data={"focus_prompt": "backend", "num_questions": "2", "jd_text": "- REST APIs", **extra},
    )


def test_auth_required_and_login(client):
    assert client.get("/interviews").status_code == 401
    signup(client, "a@example.com")
    assert client.post("/auth/register", json={"email": "A@example.com", "password": "password123"}).status_code == 409
    assert client.post("/auth/login", json={"email": "a@example.com", "password": "wrongpass1"}).status_code == 401
    assert client.post("/auth/login", json={"email": "a@example.com", "password": "password123"}).status_code == 200
    assert client.post("/auth/register", json={"email": "b@example.com", "password": "short"}).status_code == 422


def test_full_interview_flow(client):
    h = signup(client, "flow@example.com")
    r = create(client, h)
    assert r.status_code == 201, r.text
    iv = r.json()
    assert iv["question"]["kind"] == "question" and "rationale" not in iv["question"]
    assert iv["progress"] == {"answered_main": 0, "total": 2}

    r = client.post(f"/interviews/{iv['id']}/answer", headers=h, json={"answer": "vague"})
    body = r.json()
    assert body["question"]["kind"] == "followup"
    assert body["feedback"]["satisfied"] is False

    r = client.post(f"/interviews/{iv['id']}/answer", headers=h, json={"answer": "detailed"})
    assert r.json()["question"]["kind"] == "question"          # follow-up satisfied -> next main question
    assert r.json()["progress"]["answered_main"] == 1

    r = client.post(f"/interviews/{iv['id']}/answer", headers=h, json={"answer": "great"})
    body = r.json()
    assert body["status"] == "completed" and body["question"] is None
    assert body["report"]["overall_score"] == pytest.approx(3.33, abs=0.01)  # scores 2,4,4

    assert client.post(f"/interviews/{iv['id']}/answer", headers=h, json={"answer": "x"}).status_code == 409
    detail = client.get(f"/interviews/{iv['id']}", headers=h).json()
    assert len(detail["turns"]) == 3
    # The report explains each question, so every answered turn must carry its reasoning
    # and the signal-by-signal analysis — not just the score.
    first = detail["turns"][0]
    assert first["rationale"] and first["expected_signals"]
    assert "signals_met" in first and "signals_missed" in first
    # …while the pending question must never leak what it is looking for.
    # answer_mode + canvas_hint are safe to expose (the client needs them to render a
    # canvas), but the rationale and expected signals must stay hidden.
    assert set(iv["question"]) == {"kind", "topic", "question", "answer_mode", "canvas_hint"}
    assert "rationale" not in iv["question"] and "expected_signals" not in iv["question"]
    listing = client.get("/interviews", headers=h).json()
    assert listing[0]["status"] == "completed" and listing[0]["overall_score"] == pytest.approx(3.33, abs=0.01)


def test_finish_early(client):
    h = signup(client, "early@example.com")
    iv = create(client, h).json()
    assert client.post(f"/interviews/{iv['id']}/finish", headers=h).status_code == 409  # nothing answered
    client.post(f"/interviews/{iv['id']}/answer", headers=h, json={"answer": "vague"})
    r = client.post(f"/interviews/{iv['id']}/finish", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "completed"


def test_interviews_are_private(client):
    owner, other = signup(client, "o@example.com"), signup(client, "x@example.com")
    iv = create(client, owner).json()
    for method, path in [("get", ""), ("post", "/answer"), ("post", "/finish")]:
        r = getattr(client, method)(f"/interviews/{iv['id']}{path}", headers=other, **({"json": {"answer": "x"}} if path == "/answer" else {}))
        assert r.status_code == 404
    assert client.get("/interviews", headers=other).json() == []


def test_upload_validation(client):
    h = signup(client, "up@example.com")
    bad = client.post("/interviews", headers=h, files={"resume": ("cv.exe", b"x", "application/octet-stream")})
    assert bad.status_code == 422
    empty = client.post("/interviews", headers=h, files={"resume": ("cv.txt", b"", "text/plain")})
    assert empty.status_code == 422
    blank = client.post(
        "/interviews", headers=h, files={"resume": ("cv.txt", b"x", "text/plain")}, data={"num_questions": "99"}
    )
    assert blank.status_code == 422
    assert client.post("/interviews/x/answer", headers=h, json={"answer": ""}).status_code in (404, 422)


@pytest.mark.parametrize(
    "origin, allowed",
    [
        ("http://localhost:3000", True),
        ("http://127.0.0.1:3000", True),   # same app, different host name
        ("http://localhost:3001", True),   # Next.js picks another port when 3000 is taken
        ("https://127.0.0.1:8080", True),
        ("http://evil.example.com", False),
    ],
)
def test_cors_preflight_allows_any_local_origin(client, origin, allowed):
    """A rejected preflight breaks every API call from the browser, so pin the allowed set."""
    r = client.options(
        "/auth/register",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert (r.status_code == 200) is allowed, f"{origin} -> {r.status_code}"
    if allowed:
        assert r.headers["access-control-allow-origin"] == origin


def test_weak_jwt_secret_is_reported(monkeypatch):
    """A short signing key only produced a library warning before; make it loud and testable."""
    from interview_prep.config import check_secrets, settings

    monkeypatch.setattr(settings, "jwt_secret", "dev-only-change-me")
    assert any("placeholder" in p for p in check_secrets())
    monkeypatch.setattr(settings, "jwt_secret", "tooshort")
    assert any("at least 32" in p for p in check_secrets())
    monkeypatch.setattr(settings, "jwt_secret", "x" * 48)
    assert not any("JWT_SECRET" in p for p in check_secrets())
