import json
import os
from datetime import date

from flask import Flask, render_template, jsonify, request, redirect, url_for, session

app = Flask(__name__)
app.secret_key = os.environ.get("CARNIVAL_SECRET", "carnival2026-dev-secret")

DATA = os.path.join(os.path.dirname(__file__), "data")


def load(name):
    with open(os.path.join(DATA, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


def _public_event(e, scores_data):
    """Strip private fields and expose status with live/completed fallback."""
    out = dict(e)
    out.pop("attendees", None)
    eid = e.get("id")
    live = scores_data.get("live") or {}
    completed_ids = {c.get("event_id") for c in scores_data.get("completed") or []}
    stored_status = e.get("status")
    if stored_status in {"upcoming", "live", "completed"}:
        out["status"] = stored_status
    elif live.get("event_id") == eid and live.get("status") == "live":
        out["status"] = "live"
    elif eid in completed_ids:
        out["status"] = "completed"
    else:
        out["status"] = "upcoming"
    return out


def _next_upcoming_event(events, scores_data):
    today = date.today()
    completed_ids = {c.get("event_id") for c in scores_data.get("completed") or []}
    live_matches = scores_data.get("live_matches") or []
    if any((m.get("status") == "live" and m.get("event_id")) for m in live_matches):
        return None
    live = scores_data.get("live") or {}
    if not live_matches and live.get("status") == "live" and live.get("event_id"):
        return None
    upcoming = []
    for e in events:
        if e.get("id") in completed_ids:
            continue
        iso = e.get("iso_date")
        try:
            d = date.fromisoformat(iso) if iso else None
        except ValueError:
            d = None
        upcoming.append((d or date.max, e))
    upcoming.sort(key=lambda x: x[0])
    if not upcoming:
        return None
    e = upcoming[0][1]
    return {
        "id": e["id"],
        "name": e["name"],
        "date": e.get("date", ""),
        "day": e.get("day", ""),
        "venue": e.get("venue", ""),
        "iso_date": e.get("iso_date", ""),
    }


NAV = [
    ("Sports", "/sports", "Sports"),
    ("Calendar", "/calendar", "Calendar"),
    ("Gallery", "/gallery", "Gallery"),
    ("Teams", "/teams", "Teams"),
    ("Champions", "/champions", "Champions"),
    ("Live", "/live", "Live Scores"),
    ("Awards", "/awards", "Awards"),
    ("Standings", "/standings", "Standings"),
    ("Announcements", "/announcements", "Announcements"),
]


# ── Public pages ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", nav_links=NAV)


@app.route("/teams")
def teams():
    return render_template("teams.html", nav_links=NAV)


@app.route("/team-detail")
def team_detail():
    return render_template("team-detail.html", nav_links=NAV)


@app.route("/sports")
def sports():
    return render_template("sports.html", nav_links=NAV)


@app.route("/sport-detail")
def sport_detail():
    return render_template("sport-detail.html", nav_links=NAV)


@app.route("/calendar")
def calendar_page():
    return render_template("calendar.html", nav_links=NAV)


@app.route("/gallery")
def gallery_page():
    return render_template("gallery.html", nav_links=NAV)


@app.route("/live")
def live():
    return render_template("live.html", nav_links=NAV)


@app.route("/standings")
def standings():
    return render_template("standings.html", nav_links=NAV)


@app.route("/awards")
def awards():
    resp = app.make_response(render_template("awards.html", nav_links=NAV))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


@app.route("/awards/unlock", methods=["POST"])
def unlock_awards():
    return redirect(url_for("awards"))


@app.route("/awards/logout")
def awards_logout():
    return redirect(url_for("awards"))


@app.route("/champions")
def champions():
    return render_template("champions.html", nav_links=NAV)


@app.route("/announcements")
def announcements():
    return render_template("announcements.html", nav_links=NAV)


# ── JSON APIs (read-only) ──────────────────────────────────────────────────────

@app.route("/api/teams")
def api_teams():
    return jsonify(load("teams"))


@app.route("/api/teams/<team_id>")
def api_team_detail(team_id):
    for t in load("teams"):
        if t.get("id") == team_id:
            return jsonify(t)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/events")
def api_events():
    scores_data = load("scores")
    data = [_public_event(e, scores_data) for e in load("events")]
    return jsonify(data)


@app.route("/api/events/<event_id>")
def api_event_detail(event_id):
    scores_data = load("scores")
    for e in load("events"):
        if e.get("id") == event_id:
            out = _public_event(e, scores_data)
            return jsonify(out)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/match-formats")
def api_match_formats():
    return jsonify(load("match_formats"))


@app.route("/api/calendar")
def api_calendar():
    scores_data = load("scores")
    events = [_public_event(e, scores_data) for e in load("events")]
    return jsonify({"events": events, "season": "June – August 2026"})


@app.route("/api/scores")
def api_scores():
    return jsonify(load("scores"))


@app.route("/api/live")
def api_live():
    scores_data = load("scores")
    events = load("events")
    payload = dict(scores_data)
    payload["next_event"] = _next_upcoming_event(events, scores_data)
    teams = {t["id"]: t for t in load("teams")}
    live_matches = payload.get("live_matches") or []
    if not live_matches:
        legacy_live = payload.get("live") or {}
        if legacy_live.get("event_id"):
            live_matches = [legacy_live]
    enriched = []
    for live in live_matches:
        row = dict(live)
        if row.get("team_a") in teams:
            row["team_a_name"] = teams[row["team_a"]]["name"]
            row["team_a_color"] = teams[row["team_a"]]["color"]
            row["team_a_logo"] = teams[row["team_a"]].get("logo", "")
        if row.get("team_b") in teams:
            row["team_b_name"] = teams[row["team_b"]]["name"]
            row["team_b_color"] = teams[row["team_b"]]["color"]
            row["team_b_logo"] = teams[row["team_b"]].get("logo", "")
        enriched.append(row)
    payload["live_matches"] = enriched
    payload["live"] = enriched[0] if enriched else (payload.get("live") or {})
    return jsonify(payload)


@app.route("/api/standings")
def api_standings():
    return jsonify(load("standings"))


@app.route("/api/awards")
def api_awards():
    return jsonify(load("awards"))


@app.route("/api/award-leaderboards")
def api_award_leaderboards():
    try:
        return jsonify(load("award_leaderboards"))
    except Exception:
        return jsonify({"overall_mvp": [], "fair_play": []})


@app.route("/api/champions")
def api_champions():
    try:
        return jsonify(load("champions"))
    except Exception:
        return jsonify([])


@app.route("/api/announcements")
def api_announcements():
    return jsonify(load("announcements"))


@app.route("/api/gallery")
def api_gallery():
    try:
        return jsonify(load("gallery"))
    except Exception:
        return jsonify([])


@app.route("/api/gallery-seasons")
def api_gallery_seasons():
    try:
        return jsonify(load("gallery_seasons"))
    except Exception:
        return jsonify([])


@app.route("/api/settings")
def api_settings():
    try:
        return jsonify(load("settings"))
    except Exception:
        return jsonify({"youtube_live_url": ""})


# ── Admin blueprint ────────────────────────────────────────────────────────────

from admin import admin_bp, init_audit_db

app.register_blueprint(admin_bp)
init_audit_db(os.path.dirname(os.path.abspath(__file__)))


@app.after_request
def add_no_cache_headers(resp):
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


if __name__ == "__main__":
    app.run(debug=True, port=5000)
