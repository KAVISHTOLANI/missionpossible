"""
Mission Possible 2026 — Admin blueprint.

Handles:
  - password login (session cookie)
  - all write endpoints (announcements, live scores, standings, awards, rules, logos)
  - SQLite audit log of every admin action

Public read APIs live in app.py. This module only mutates the JSON data files.
The admin password is read from the CARNIVAL_ADMIN_PASSWORD env var, falling
back to "carnival2026" for local development.
"""
import json
import os
import sqlite3
import uuid
from datetime import datetime
from functools import wraps

from flask import (
    Blueprint, render_template, request, redirect, url_for,
    session, jsonify, current_app,
)
from werkzeug.utils import secure_filename

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

ADMIN_PASSWORD = os.environ.get("CARNIVAL_ADMIN_PASSWORD", "carnival2026")
ALLOWED_ADMIN_USERS = {
    "kavish": "Kavish",
    "atharv": "Atharv",
    "arjun": "Arjun",
    "suman": "Suman",
    "suraj": "Suraj",
}
ALLOWED_LOGO_EXT = {"png"}
ALLOWED_GALLERY_EXT = {"png", "jpg", "jpeg", "webp"}
VALID_TEAM_IDS = {"creators", "dominators", "royals"}
VALID_STATUSES = {"upcoming", "live", "completed"}
VALID_TAGS = {"Urgent", "Info", "Result"}
VALID_BADGES = {"sports", "cultural", "indoor", "fun", "finale"}
VALID_BANNERS = {
    "banner-basketball", "banner-throwball", "banner-swimming", "banner-cycling",
    "banner-badminton", "banner-rangoli", "banner-cricket", "banner-kabaddi",
    "banner-tabletennis", "banner-carrom", "banner-cooking", "banner-annualday",
    "banner-singing", "banner-dancing", "banner-skit", "banner-drama", "banner-fancy",
}
LIVE_DISABLED_EVENTS = {"carrom", "chess", "cooking", "8ball-pool", "singing", "dancing", "skit", "fancy-dress"}

# Set by init_audit_db()
_BASE_DIR = None
_DB_PATH = None


# ---------------------------------------------------------------------------
# Data helpers (mirror app.py so admin.py is import-safe on its own)
# ---------------------------------------------------------------------------
def _data_path(name):
    return os.path.join(_BASE_DIR, "data", name)


def _load(name, default=None):
    try:
        with open(_data_path(name), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _save(name, payload):
    path = _data_path(name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Audit log (SQLite)
# ---------------------------------------------------------------------------
def init_audit_db(base_dir):
    """Called once at app start. Creates carnival.db + audit_log table."""
    global _BASE_DIR, _DB_PATH
    _BASE_DIR = base_dir
    _DB_PATH = os.path.join(base_dir, "carnival.db")
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS audit_log (
               id        INTEGER PRIMARY KEY AUTOINCREMENT,
               ts        TEXT NOT NULL,
               action    TEXT NOT NULL,
               detail    TEXT
           )"""
    )
    conn.commit()
    conn.close()


def audit(action, detail=""):
    try:
        conn = sqlite3.connect(_DB_PATH)
        conn.execute(
            "INSERT INTO audit_log (ts, action, detail) VALUES (?, ?, ?)",
            (datetime.now().isoformat(timespec="seconds"), action, detail),
        )
        conn.commit()
        conn.close()
    except sqlite3.Error:
        pass  # never let logging break a write


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin"):
            # API calls get JSON 401; page loads get redirected to login.
            if request.path.startswith("/admin/api/"):
                return jsonify({"ok": False, "error": "Not authenticated"}), 401
            return redirect(url_for("admin.login"))
        return view(*args, **kwargs)
    return wrapped


@admin_bp.route("/", methods=["GET", "POST"])
def login():
    if session.get("admin"):
        return redirect(url_for("admin.dashboard"))
    error = None
    if request.method == "POST":
        username_raw = (request.form.get("username") or "").strip()
        username_key = username_raw.lower()
        password = request.form.get("password")
        if username_key in ALLOWED_ADMIN_USERS and password == ADMIN_PASSWORD:
            session["admin"] = True
            session["admin_user"] = ALLOWED_ADMIN_USERS[username_key]
            audit("login", f"{session['admin_user']} logged in")
            return redirect(url_for("admin.dashboard"))
        error = "Invalid username or password."
    return render_template("admin/login.html", error=error)


@admin_bp.route("/logout")
def logout():
    session.pop("admin", None)
    session.pop("admin_user", None)
    return redirect(url_for("admin.login"))


@admin_bp.route("/dashboard")
@login_required
def dashboard():
    events = _load("events.json", [])
    teams = _load("teams.json", [])
    announcements = _load("announcements.json", [])
    awards = _load("awards.json", {})
    scores = _load("scores.json", {})
    gallery = _load("gallery.json", [])
    champions = _load("champions.json", [])
    match_formats = _load("match_formats.json", {})
    audit_rows = _recent_audit()
    return render_template(
        "admin/dashboard.html",
        events=events, teams=teams, announcements=announcements,
        awards=awards, scores=scores, gallery=gallery, champions=champions, match_formats=match_formats,
        audit_rows=audit_rows,
    )


def _recent_audit(limit=25):
    try:
        conn = sqlite3.connect(_DB_PATH)
        rows = conn.execute(
            "SELECT ts, action, detail FROM audit_log ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
        return [{"ts": r[0], "action": r[1], "detail": r[2]} for r in rows]
    except sqlite3.Error:
        return []


# ---------------------------------------------------------------------------
# Write API — Announcements
# ---------------------------------------------------------------------------
@admin_bp.route("/api/announcements/add", methods=["POST"])
@login_required
def add_announcement():
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    text = (body.get("body") or "").strip()
    tag = body.get("tag") if body.get("tag") in VALID_TAGS else "Info"
    if not title or not text:
        return jsonify({"ok": False, "error": "Title and body required"}), 400
    items = _load("announcements.json", [])
    item = {
        "id": "ann-" + uuid.uuid4().hex[:8],
        "title": title,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "body": text,
        "tag": tag,
    }
    items.insert(0, item)
    _save("announcements.json", items)
    audit("announcement_add", title)
    return jsonify({"ok": True, "item": item})


@admin_bp.route("/api/announcements/delete", methods=["POST"])
@login_required
def delete_announcement():
    ann_id = (request.get_json(silent=True) or {}).get("id")
    items = _load("announcements.json", [])
    new_items = [a for a in items if a.get("id") != ann_id]
    _save("announcements.json", new_items)
    audit("announcement_delete", ann_id or "")
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Write API — Live scores
# ---------------------------------------------------------------------------
@admin_bp.route("/api/live/update", methods=["POST"])
@login_required
def update_live():
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    status = body.get("status") if body.get("status") in VALID_STATUSES else "upcoming"

    events = {e["id"]: e for e in _load("events.json", [])}
    if event_id not in events:
        return jsonify({"ok": False, "error": "Unknown event"}), 400
    if event_id in LIVE_DISABLED_EVENTS:
        return jsonify({"ok": False, "error": "Live updates are disabled for this event"}), 400

    formats = _load("match_formats.json", {})
    sport_fmt = formats.get(event_id, {})
    allowed_rounds = sport_fmt.get("rounds") or []
    round_label = (body.get("round") or "").strip()
    if allowed_rounds and round_label and round_label not in allowed_rounds:
        return jsonify({"ok": False, "error": "Invalid round for this sport"}), 400
    if not round_label and allowed_rounds:
        round_label = allowed_rounds[0]

    team_a = body.get("team_a")
    team_b = body.get("team_b")
    if team_a and team_a not in VALID_TEAM_IDS:
        return jsonify({"ok": False, "error": "Invalid team A"}), 400
    if team_b and team_b not in VALID_TEAM_IDS:
        return jsonify({"ok": False, "error": "Invalid team B"}), 400
    if team_a and team_b and team_a == team_b:
        return jsonify({"ok": False, "error": "Teams must be different"}), 400

    try:
        score_a = int(body.get("score_a", 0) or 0)
        score_b = int(body.get("score_b", 0) or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Scores must be numbers"}), 400

    scores = _load("scores.json", {})
    matches = scores.setdefault("live_matches", [])
    if not isinstance(matches, list):
        matches = []
    live = next((m for m in matches if m.get("event_id") == event_id), None)
    if not live:
        live = {"event_id": event_id, "commentary": []}
        matches.append(live)

    live["event_id"] = event_id
    live["event_name"] = events[event_id]["name"]
    live["status"] = status
    live["round"] = round_label
    live["team_a"] = team_a or None
    live["team_b"] = team_b or None
    live["score_a"] = max(0, score_a)
    live["score_b"] = max(0, score_b)
    live["details"] = body.get("details") if isinstance(body.get("details"), dict) else {}
    raw_scores = body.get("scores") or {}
    live["scores"] = {
        "creators": int(raw_scores.get("creators", 0) or 0),
        "dominators": int(raw_scores.get("dominators", 0) or 0),
        "royals": int(raw_scores.get("royals", 0) or 0),
    }
    live.setdefault("commentary", live.get("commentary") or [])

    if status == "completed":
        completed = scores.setdefault("completed", [])
        completed = [c for c in completed if c.get("event_id") != event_id]
        snapshot = {
            "event_id": event_id,
            "event_name": events[event_id]["name"],
            "date": events[event_id].get("date", ""),
            "round": round_label,
            "team_a": team_a,
            "team_b": team_b,
            "score_a": live["score_a"],
            "score_b": live["score_b"],
            "scores": dict(live["scores"]),
            "details": dict(live.get("details") or {}),
        }
        completed.insert(0, snapshot)
        scores["completed"] = completed

        matches = [m for m in matches if m.get("event_id") != event_id]

    live_matches = []
    for m in matches:
        if not m.get("event_id"):
            continue
        m.setdefault("commentary", [])
        live_matches.append(m)
    scores["live_matches"] = live_matches
    first_live = next((m for m in live_matches if m.get("status") == "live"), live_matches[0] if live_matches else None)
    scores["active_event"] = first_live.get("event_id") if first_live and first_live.get("status") == "live" else None
    scores["live"] = dict(first_live) if first_live else {
        "event_id": None,
        "event_name": "",
        "status": "upcoming",
        "round": "",
        "team_a": None,
        "team_b": None,
        "score_a": 0,
        "score_b": 0,
        "scores": {"creators": 0, "dominators": 0, "royals": 0},
        "commentary": [],
        "details": {},
    }

    _save("scores.json", scores)
    audit(
        "live_update",
        f"{event_id} {status} {round_label} {team_a} vs {team_b} {score_a}-{score_b}",
    )
    return jsonify({"ok": True, "live_matches": scores.get("live_matches", []), "live": scores.get("live", {})})


@admin_bp.route("/api/live/commentary", methods=["POST"])
@login_required
def add_commentary():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    event_id = (body.get("event_id") or "").strip()
    if not text:
        return jsonify({"ok": False, "error": "Empty commentary"}), 400
    scores = _load("scores.json", {})
    matches = scores.setdefault("live_matches", [])
    if not isinstance(matches, list):
        matches = []
    live = None
    if event_id:
        live = next((m for m in matches if m.get("event_id") == event_id), None)
    if not live:
        live = next((m for m in matches if m.get("status") == "live"), None)
    if not live:
        return jsonify({"ok": False, "error": "No live scoreboard found for commentary"}), 400
    entry = {"time": datetime.now().strftime("%H:%M"), "text": text}
    live.setdefault("commentary", []).insert(0, entry)
    if not event_id:
        event_id = live.get("event_id") or ""
    scores["live"] = dict(live)
    scores["active_event"] = event_id if live.get("status") == "live" else scores.get("active_event")
    _save("scores.json", scores)
    audit("commentary_add", text[:60])
    return jsonify({"ok": True, "entry": entry, "event_id": event_id})


@admin_bp.route("/api/live/clear", methods=["POST"])
@login_required
def clear_live_record():
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    scores = _load("scores.json", {})
    if event_id:
        scores["completed"] = [
            row for row in (scores.get("completed") or [])
            if row.get("event_id") != event_id
        ]
    matches = scores.setdefault("live_matches", [])
    if not isinstance(matches, list):
        matches = []
    if event_id:
        matches = [m for m in matches if m.get("event_id") != event_id]
    else:
        matches = []
    scores["live_matches"] = matches
    first_live = next((m for m in matches if m.get("status") == "live"), matches[0] if matches else None)
    scores["active_event"] = first_live.get("event_id") if first_live and first_live.get("status") == "live" else None
    scores["live"] = dict(first_live) if first_live else {
        "event_id": None,
        "event_name": "",
        "status": "upcoming",
        "round": "",
        "team_a": None,
        "team_b": None,
        "score_a": 0,
        "score_b": 0,
        "scores": {"creators": 0, "dominators": 0, "royals": 0},
        "commentary": [],
        "details": {},
    }

    _save("scores.json", scores)
    audit("live_clear", event_id or "all")
    return jsonify({"ok": True, "live_matches": scores.get("live_matches", []), "completed": scores.get("completed", [])})


# ---------------------------------------------------------------------------
# Write API — Standings
# ---------------------------------------------------------------------------
@admin_bp.route("/api/standings/update", methods=["POST"])
@login_required
def update_standings():
    body = request.get_json(silent=True) or {}
    team_id = body.get("team")
    entry_id = (body.get("entry_id") or "").strip()
    event_name = (body.get("event") or "").strip()
    try:
        points = int(body.get("points", 0) or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Points must be a number"}), 400
    penalty = bool(body.get("penalty"))
    note = (body.get("note") or "").strip()

    if team_id not in VALID_TEAM_IDS:
        return jsonify({"ok": False, "error": "Unknown team"}), 400

    standings = _load("standings.json", {"teams": {}})
    teams = standings.get("teams", {})
    if team_id not in teams:
        return jsonify({"ok": False, "error": "Team not in standings"}), 400

    _ensure_standings_entry_ids(standings)

    row = {
        "id": entry_id or ("st-" + uuid.uuid4().hex[:10]),
        "event": event_name,
        "points": -points if penalty else points,
        "type": "penalty" if penalty else "points",
        "note": note,
    }

    if entry_id:
        found = False
        for tid, t in teams.items():
            rows = t.setdefault("event_breakdown", [])
            for idx, existing in enumerate(rows):
                if existing.get("id") == entry_id:
                    found = True
                    if tid == team_id:
                        rows[idx] = row
                    else:
                        rows.pop(idx)
                        teams[team_id].setdefault("event_breakdown", []).append(row)
                    break
            if found:
                break
        if not found:
            teams[team_id].setdefault("event_breakdown", []).append(row)
    else:
        teams[team_id].setdefault("event_breakdown", []).append(row)

    for t in teams.values():
        _recompute_standings_team_totals(t)

    _save("standings.json", standings)
    audit("standings_update", f"{team_id} {'-' if penalty else '+'}{points} ({event_name})")
    return jsonify({"ok": True, "team": standings["teams"].get(team_id)})


@admin_bp.route("/api/standings/delete-entry", methods=["POST"])
@login_required
def delete_standings_entry():
    body = request.get_json(silent=True) or {}
    entry_id = (body.get("entry_id") or "").strip()
    if not entry_id:
        return jsonify({"ok": False, "error": "entry_id required"}), 400

    standings = _load("standings.json", {"teams": {}})
    teams = standings.get("teams", {})
    _ensure_standings_entry_ids(standings)
    removed = False
    for t in teams.values():
        rows = t.setdefault("event_breakdown", [])
        new_rows = [r for r in rows if r.get("id") != entry_id]
        if len(new_rows) != len(rows):
            t["event_breakdown"] = new_rows
            removed = True
    if not removed:
        return jsonify({"ok": False, "error": "Entry not found"}), 404

    for t in teams.values():
        _recompute_standings_team_totals(t)
    _save("standings.json", standings)
    audit("standings_delete", entry_id)
    return jsonify({"ok": True})


@admin_bp.route("/api/standings/entries", methods=["GET"])
@login_required
def standings_entries():
    standings = _load("standings.json", {"teams": {}})
    _ensure_standings_entry_ids(standings)
    rows = []
    for team_id, team in (standings.get("teams") or {}).items():
        for row in (team.get("event_breakdown") or []):
            rows.append({
                "id": row.get("id"),
                "team_id": team_id,
                "team_name": team.get("name", team_id),
                "event": row.get("event", ""),
                "points": int(row.get("points", 0) or 0),
                "type": row.get("type", "points"),
                "note": row.get("note", ""),
            })
    return jsonify({"ok": True, "rows": rows})


def _ensure_standings_entry_ids(standings):
    changed = False
    for t in (standings.get("teams") or {}).values():
        rows = t.setdefault("event_breakdown", [])
        for row in rows:
            if not row.get("id"):
                row["id"] = "st-" + uuid.uuid4().hex[:10]
                changed = True
    if changed:
        _save("standings.json", standings)


def _recompute_standings_team_totals(team):
    rows = team.get("event_breakdown") or []
    points_earned = 0
    penalty_deductions = 0
    events_played = 0
    wins = 0
    for r in rows:
        pts = int(r.get("points", 0) or 0)
        kind = (r.get("type") or "").lower()
        is_penalty = (kind == "penalty") or pts < 0
        if is_penalty:
            penalty_deductions += abs(pts)
        else:
            points_earned += pts
            events_played += 1
            if pts >= 300:
                wins += 1
    team["points_earned"] = points_earned
    team["penalty_deductions"] = penalty_deductions
    team["events_played"] = events_played
    team["wins"] = wins
    team["net_points"] = points_earned - penalty_deductions


# ---------------------------------------------------------------------------
# Write API — Standings medals (gold / silver / bronze)
# ---------------------------------------------------------------------------
@admin_bp.route("/api/standings/medals", methods=["POST"])
@login_required
def update_medals():
    body = request.get_json(silent=True) or {}
    team_id = body.get("team")
    if team_id not in VALID_TEAM_IDS:
        return jsonify({"ok": False, "error": "Unknown team"}), 400
    try:
        gold = int(body.get("gold", 0) or 0)
        silver = int(body.get("silver", 0) or 0)
        bronze = int(body.get("bronze", 0) or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Medal counts must be numbers"}), 400
    if min(gold, silver, bronze) < 0:
        return jsonify({"ok": False, "error": "Medal counts cannot be negative"}), 400

    standings = _load("standings.json", {"teams": {}})
    team = standings["teams"].get(team_id)
    if not team:
        return jsonify({"ok": False, "error": "Team not in standings"}), 400

    team["gold"] = gold
    team["silver"] = silver
    team["bronze"] = bronze
    _save("standings.json", standings)
    audit("medals_update", f"{team_id} g{gold} s{silver} b{bronze}")
    return jsonify({"ok": True, "team": team})


# ---------------------------------------------------------------------------
# Write API — Award leaderboards (Overall MVP + Fair Play)
# ---------------------------------------------------------------------------
@admin_bp.route("/api/award-leaderboards/upsert", methods=["POST"])
@login_required
def upsert_award_leaderboard():
    body = request.get_json(silent=True) or {}
    board = (body.get("board") or "").strip().lower()
    if board not in {"overall_mvp", "fair_play"}:
        return jsonify({"ok": False, "error": "Unknown board"}), 400

    leaderboards = _load("award_leaderboards.json", {"overall_mvp": [], "fair_play": []})
    rows = leaderboards.setdefault(board, [])
    row_id = (body.get("id") or "").strip()

    if board == "overall_mvp":
        player_name = (body.get("player_name") or "").strip()
        team_name = (body.get("team_name") or "").strip()
        if not player_name or not team_name:
            return jsonify({"ok": False, "error": "Player and team are required"}), 400
        try:
            gold = int(body.get("gold", 0) or 0)
            silver = int(body.get("silver", 0) or 0)
            points = int(body.get("points", 0) or 0)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Gold, silver and points must be numbers"}), 400
        if min(gold, silver, points) < 0:
            return jsonify({"ok": False, "error": "Values cannot be negative"}), 400

        payload = {
            "id": row_id or ("mvp-" + uuid.uuid4().hex[:10]),
            "player_name": player_name,
            "team_name": team_name,
            "gold": gold,
            "silver": silver,
            "points": points,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
    else:
        team_name = (body.get("team_name") or "").strip()
        if not team_name:
            return jsonify({"ok": False, "error": "Team name is required"}), 400
        try:
            fair_play_points = int(body.get("fair_play_points", 0) or 0)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Fair play points must be a number"}), 400
        if fair_play_points < 0:
            return jsonify({"ok": False, "error": "Points cannot be negative"}), 400

        payload = {
            "id": row_id or ("fp-" + uuid.uuid4().hex[:10]),
            "team_name": team_name,
            "fair_play_points": fair_play_points,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }

    replaced = False
    for idx, row in enumerate(rows):
        if row.get("id") == payload["id"]:
            rows[idx] = payload
            replaced = True
            break
    if not replaced:
        rows.append(payload)

    _save("award_leaderboards.json", leaderboards)
    audit("award_board_upsert", f"{board} {payload['id']}")
    return jsonify({"ok": True, "leaderboards": leaderboards, "row": payload})


@admin_bp.route("/api/award-leaderboards/delete", methods=["POST"])
@login_required
def delete_award_leaderboard():
    body = request.get_json(silent=True) or {}
    board = (body.get("board") or "").strip().lower()
    row_id = (body.get("id") or "").strip()
    if board not in {"overall_mvp", "fair_play"}:
        return jsonify({"ok": False, "error": "Unknown board"}), 400
    if not row_id:
        return jsonify({"ok": False, "error": "id required"}), 400

    leaderboards = _load("award_leaderboards.json", {"overall_mvp": [], "fair_play": []})
    rows = leaderboards.setdefault(board, [])
    leaderboards[board] = [row for row in rows if row.get("id") != row_id]
    _save("award_leaderboards.json", leaderboards)
    audit("award_board_delete", f"{board} {row_id}")
    return jsonify({"ok": True, "leaderboards": leaderboards})


# ---------------------------------------------------------------------------
# Write API — Site settings (YouTube live link)
# ---------------------------------------------------------------------------
@admin_bp.route("/api/settings/youtube", methods=["POST"])
@login_required
def update_youtube_live():
    body = request.get_json(silent=True) or {}
    url = (body.get("youtube_live_url") or "").strip()
    settings = _load("settings.json", {"youtube_live_url": ""})
    settings["youtube_live_url"] = url
    _save("settings.json", settings)
    audit("youtube_live_update", url[:80])
    return jsonify({"ok": True, "settings": settings})


# ---------------------------------------------------------------------------
# Write API — Awards
# ---------------------------------------------------------------------------
@admin_bp.route("/api/awards/update", methods=["POST"])
@login_required
def update_awards():
    body = request.get_json(silent=True) or {}
    awards = _load("awards.json", {"event_mvps": {}, "overall_best_player": None, "best_team": None, "fair_play_award": None})

    kind = body.get("kind")
    if kind == "event_mvp":
        event_id = body.get("event_id")
        if not event_id:
            return jsonify({"ok": False, "error": "event_id required"}), 400
        events = {e.get("id"): e for e in _load("events.json", [])}
        event = events.get(event_id)
        if not event:
            return jsonify({"ok": False, "error": "Unknown event"}), 400
        if (event.get("badge") or "").lower() in {"cultural", "finale"}:
            return jsonify({"ok": False, "error": "MVP is disabled for cultural events"}), 400
        awards.setdefault("event_mvps", {})[event_id] = {
            "player": (body.get("player") or "").strip(),
            "team": body.get("team") if body.get("team") in VALID_TEAM_IDS else None,
            "image": (body.get("image") or "").strip(),
        }
    elif kind == "best_player":
        awards["overall_best_player"] = {
            "player": (body.get("player") or "").strip(),
            "team": body.get("team") if body.get("team") in VALID_TEAM_IDS else None,
            "image": (body.get("image") or "").strip(),
        }
    elif kind == "best_team":
        awards["best_team"] = body.get("team") if body.get("team") in VALID_TEAM_IDS else None
    elif kind == "fair_play":
        awards["fair_play_award"] = body.get("team") if body.get("team") in VALID_TEAM_IDS else None
    elif kind == "clear_all":
        awards = {"event_mvps": {}, "overall_best_player": None, "best_team": None, "fair_play_award": None}
    else:
        return jsonify({"ok": False, "error": "Unknown award kind"}), 400

    _save("awards.json", awards)
    audit("awards_update", kind)
    return jsonify({"ok": True, "awards": awards})


# ---------------------------------------------------------------------------
# Write API — Champions
# ---------------------------------------------------------------------------
@admin_bp.route("/api/champions/save", methods=["POST"])
@login_required
def save_champion():
    body = request.get_json(silent=True) or {}
    event_id = (body.get("event_id") or "").strip()
    champion_type = (body.get("champion_type") or "team").strip().lower()
    sport_category = (body.get("sport_category") or "").strip()
    team_id = body.get("team")
    player_name = (body.get("player_name") or "").strip()
    team_name = (body.get("team_name") or "").strip()
    players = body.get("players") if isinstance(body.get("players"), list) else []
    players = [str(p).strip() for p in players if str(p).strip()]

    events = {e.get("id"): e for e in _load("events.json", [])}
    if event_id not in events:
        return jsonify({"ok": False, "error": "Unknown event"}), 400
    if champion_type not in {"team", "individual"}:
        return jsonify({"ok": False, "error": "Invalid champion type"}), 400

    teams = {t.get("id"): t for t in _load("teams.json", [])}
    champions = _load("champions.json", [])
    row = next((x for x in champions if x.get("event_id") == event_id), None)
    if not row:
        row = {"event_id": event_id}
        champions.append(row)

    row["event_id"] = event_id
    row["event_name"] = events[event_id].get("name", event_id)
    row["sport_category"] = sport_category
    row["champion_type"] = champion_type
    row["team"] = team_id if team_id in teams else None
    row["team_name"] = team_name or (teams[team_id]["name"] if team_id in teams else "")
    second_team_id = body.get("second_team")
    second_team_name = (body.get("second_team_name") or "").strip()
    row["second_team"] = second_team_id if second_team_id in teams else None
    row["second_team_name"] = second_team_name or (teams[second_team_id]["name"] if second_team_id in teams else "")
    row["player_name"] = player_name
    row["second_player_name"] = (body.get("second_player_name") or "").strip()
    row["players"] = players
    row["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    _save("champions.json", champions)
    audit("champion_save", f"{event_id} {champion_type}")
    return jsonify({"ok": True, "champion": row})


@admin_bp.route("/api/champions/delete", methods=["POST"])
@login_required
def delete_champion():
    event_id = ((request.get_json(silent=True) or {}).get("event_id") or "").strip()
    if not event_id:
        return jsonify({"ok": False, "error": "event_id required"}), 400
    champions = _load("champions.json", [])
    champions = [x for x in champions if x.get("event_id") != event_id]
    _save("champions.json", champions)
    audit("champion_delete", event_id)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Write API — Event details (sports page cards + sport detail header info)
# ---------------------------------------------------------------------------
@admin_bp.route("/api/events/update", methods=["POST"])
@login_required
def update_event_details():
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    events = _load("events.json", [])
    event = next((e for e in events if e.get("id") == event_id), None)
    if not event:
        return jsonify({"ok": False, "error": "Unknown event"}), 400

    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Event name is required"}), 400

    badge = body.get("badge") if body.get("badge") in VALID_BADGES else event.get("badge", "sports")
    status = body.get("status") if body.get("status") in VALID_STATUSES else event.get("status", "upcoming")
    banner = body.get("banner") if body.get("banner") in VALID_BANNERS else event.get("banner", "")

    try:
        winner_pts = int(body.get("winner_points", event.get("points", {}).get("winner", 300)))
        runner_pts = int(body.get("runner_up_points", event.get("points", {}).get("runner_up", 150)))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Points must be numbers"}), 400

    iso_date = (body.get("iso_date") or "").strip()
    if iso_date:
        try:
            datetime.strptime(iso_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({"ok": False, "error": "iso_date must be YYYY-MM-DD"}), 400

    event["name"] = name
    event["num"] = (body.get("num") or "").strip() or event.get("num", "")
    event["emoji"] = (body.get("emoji") or "").strip() or event.get("emoji", "🏆")
    event["date"] = (body.get("date") or "").strip()
    event["day"] = (body.get("day") or "").strip()
    event["iso_date"] = iso_date or event.get("iso_date", "")
    event["category"] = (body.get("category") or "").strip()
    event["venue"] = (body.get("venue") or "").strip()
    event["location"] = (body.get("location") or "").strip()
    event["venue_maps_link"] = (body.get("venue_maps_link") or "").strip()
    event["weather"] = (body.get("weather") or "").strip()
    event["weather_icon"] = (body.get("weather_icon") or "").strip()
    event["weather_note"] = (body.get("weather_note") or "").strip()
    event["event_time"] = (body.get("event_time") or "").strip()
    event["tournament_format"] = (body.get("tournament_format") or "").strip()
    event["badge"] = badge
    event["status"] = status
    event["banner"] = banner
    event["points"] = {"winner": max(0, winner_pts), "runner_up": max(0, runner_pts)}

    _save("events.json", events)

    scores = _load("scores.json", {})
    live = scores.get("live") or {}
    if live.get("event_id") == event_id:
        live["event_name"] = name
        _save("scores.json", scores)

    audit("event_update", f"{event_id}: {name}")
    return jsonify({"ok": True, "event": event})


# ---------------------------------------------------------------------------
# Write API — Event rules
# ---------------------------------------------------------------------------
@admin_bp.route("/api/events/rules", methods=["POST"])
@login_required
def update_rules():
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    rules = body.get("rules")
    if not isinstance(rules, list):
        return jsonify({"ok": False, "error": "rules must be a list"}), 400
    rules = [str(r).strip() for r in rules if str(r).strip()]

    events = _load("events.json", [])
    found = False
    for e in events:
        if e["id"] == event_id:
            e["rules"] = rules
            found = True
            break
    if not found:
        return jsonify({"ok": False, "error": "Unknown event"}), 400
    _save("events.json", events)
    audit("rules_update", f"{event_id} ({len(rules)} rules)")
    return jsonify({"ok": True, "rules": rules})


# ---------------------------------------------------------------------------
# Write API — Logo upload
# ---------------------------------------------------------------------------
@admin_bp.route("/api/logos/upload", methods=["POST"])
@login_required
def upload_logo():
    team_id = request.form.get("team")
    if team_id not in VALID_TEAM_IDS:
        return jsonify({"ok": False, "error": "Unknown team"}), 400
    file = request.files.get("logo")
    if not file or file.filename == "":
        return jsonify({"ok": False, "error": "No file uploaded"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_LOGO_EXT:
        return jsonify({"ok": False, "error": "PNG files only"}), 400

    dest_dir = os.path.join(_BASE_DIR, "static", "images", "logos")
    os.makedirs(dest_dir, exist_ok=True)
    filename = secure_filename(f"{team_id}.png")
    file.save(os.path.join(dest_dir, filename))
    audit("logo_upload", team_id)
    return jsonify({"ok": True, "path": f"/static/images/logos/{filename}"})


# ---------------------------------------------------------------------------
# Write API — Gallery upload/delete
# ---------------------------------------------------------------------------
@admin_bp.route("/api/gallery/upload", methods=["POST"])
@login_required
def upload_gallery():
    files = request.files.getlist("images")
    caption = (request.form.get("caption") or "").strip()
    if not files:
        return jsonify({"ok": False, "error": "No files uploaded"}), 400

    dest_dir = os.path.join(_BASE_DIR, "static", "images", "gallery")
    os.makedirs(dest_dir, exist_ok=True)
    gallery = _load("gallery.json", [])
    added = []

    for file in files:
        if not file or not file.filename:
            continue
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_GALLERY_EXT:
            continue
        gid = "gal-" + uuid.uuid4().hex[:10]
        filename = secure_filename(f"{gid}.{ext}")
        file.save(os.path.join(dest_dir, filename))
        item = {
            "id": gid,
            "path": f"/static/images/gallery/{filename}",
            "caption": caption,
            "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        gallery.insert(0, item)
        added.append(item)

    if not added:
        return jsonify({"ok": False, "error": "No valid images (png/jpg/jpeg/webp)"}), 400

    _save("gallery.json", gallery)
    audit("gallery_upload", f"{len(added)} image(s)")
    return jsonify({"ok": True, "items": added})


@admin_bp.route("/api/gallery/delete", methods=["POST"])
@login_required
def delete_gallery():
    gid = (request.get_json(silent=True) or {}).get("id")
    if not gid:
        return jsonify({"ok": False, "error": "id required"}), 400
    gallery = _load("gallery.json", [])
    item = next((x for x in gallery if x.get("id") == gid), None)
    if not item:
        return jsonify({"ok": False, "error": "Not found"}), 404
    gallery = [x for x in gallery if x.get("id") != gid]
    _save("gallery.json", gallery)

    rel = (item.get("path") or "").replace("/static/", "").replace("/", os.sep)
    abs_path = os.path.join(_BASE_DIR, "static", rel) if rel else ""
    if abs_path and os.path.isfile(abs_path):
        try:
            os.remove(abs_path)
        except OSError:
            pass

    audit("gallery_delete", gid)
    return jsonify({"ok": True})
