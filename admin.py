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
EMPTY_LIVE = {
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


def _empty_live():
    return json.loads(json.dumps(EMPTY_LIVE))


def _match_key(row):
    return row.get("match_id") or row.get("id") or row.get("event_id")


def _new_match_id(event_id):
    return f"{event_id}-{uuid.uuid4().hex[:8]}"


def _normal_scores(raw_scores):
    raw_scores = raw_scores if isinstance(raw_scores, dict) else {}
    return {
        "creators": int(raw_scores.get("creators", 0) or 0),
        "dominators": int(raw_scores.get("dominators", 0) or 0),
        "royals": int(raw_scores.get("royals", 0) or 0),
    }


def _sync_live_index(scores):
    matches = scores.get("live_matches") if isinstance(scores.get("live_matches"), list) else []
    completed = scores.get("completed") if isinstance(scores.get("completed"), list) else []

    clean_matches = []
    for m in matches:
        if not isinstance(m, dict) or not m.get("event_id"):
            continue
        m.setdefault("status", "upcoming")
        m.setdefault("match_id", f"{m['event_id']}-{m.get('status', 'upcoming')}")
        m.setdefault("commentary", [])
        m.setdefault("details", {})
        m.setdefault("scores", {"creators": 0, "dominators": 0, "royals": 0})
        if m.get("status") != "completed":
            clean_matches.append(m)

    clean_completed = []
    for c in completed:
        if not isinstance(c, dict) or not c.get("event_id"):
            continue
        c["status"] = "completed"
        c.setdefault("match_id", f"{c['event_id']}-completed")
        c.setdefault("details", {})
        c.setdefault("scores", {"creators": 0, "dominators": 0, "royals": 0})
        clean_completed.append(c)

    scores["live_matches"] = clean_matches
    scores["completed"] = clean_completed
    first_live = next((m for m in clean_matches if m.get("status") == "live"), clean_matches[0] if clean_matches else None)
    scores["active_event"] = first_live.get("event_id") if first_live and first_live.get("status") == "live" else None
    scores["live"] = dict(first_live) if first_live else _empty_live()
    return scores


def _find_match(scores, match_id=None, event_id=None, status=None):
    rows = []
    rows.extend(scores.get("live_matches") or [])
    rows.extend(scores.get("completed") or [])
    for row in rows:
        if match_id and _match_key(row) == match_id:
            return dict(row)
        if not match_id and event_id and row.get("event_id") == event_id and (not status or row.get("status") == status):
            return dict(row)
    return None


def _build_match(body, existing=None, partial=False):
    existing = dict(existing or {})
    events = {e["id"]: e for e in _load("events.json", [])}
    formats = _load("match_formats.json", {})

    event_id = (body.get("event_id") or existing.get("event_id") or "").strip()
    if not event_id:
        return None, "event_id required"
    if event_id not in events:
        return None, "Unknown event"
    if event_id in LIVE_DISABLED_EVENTS:
        return None, "Live updates are disabled for this event"

    status = body.get("status", existing.get("status", "upcoming"))
    if status not in VALID_STATUSES:
        return None, "Invalid status"

    allowed_rounds = (formats.get(event_id, {}) or {}).get("rounds") or []
    round_label = (body.get("round", existing.get("round", "")) or "").strip()
    if allowed_rounds and round_label and round_label not in allowed_rounds:
        return None, "Invalid round for this sport"
    if not round_label and allowed_rounds and not partial:
        round_label = allowed_rounds[0]

    team_a = body.get("team_a", existing.get("team_a"))
    team_b = body.get("team_b", existing.get("team_b"))
    if team_a and team_a not in VALID_TEAM_IDS:
        return None, "Invalid team A"
    if team_b and team_b not in VALID_TEAM_IDS:
        return None, "Invalid team B"
    if team_a and team_b and team_a == team_b:
        return None, "Teams must be different"

    try:
        score_a = int(body.get("score_a", existing.get("score_a", 0)) or 0)
        score_b = int(body.get("score_b", existing.get("score_b", 0)) or 0)
    except (TypeError, ValueError):
        return None, "Scores must be numbers"

    match = dict(existing)
    now = datetime.now().isoformat(timespec="seconds")
    match.update({
        "match_id": existing.get("match_id") or body.get("match_id") or _new_match_id(event_id),
        "event_id": event_id,
        "event_name": events[event_id]["name"],
        "date": events[event_id].get("date", ""),
        "status": status,
        "round": round_label,
        "team_a": team_a or None,
        "team_b": team_b or None,
        "score_a": max(0, score_a),
        "score_b": max(0, score_b),
        "scores": _normal_scores(body.get("scores", existing.get("scores", {}))),
        "details": body.get("details") if isinstance(body.get("details"), dict) else (existing.get("details") or {}),
        "commentary": existing.get("commentary") or [],
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    })
    return match, None


def _save_match(match):
    scores = _sync_live_index(_load("scores.json", {}))
    match_id = _match_key(match)
    scores["live_matches"] = [m for m in scores.get("live_matches", []) if _match_key(m) != match_id]
    scores["completed"] = [m for m in scores.get("completed", []) if _match_key(m) != match_id]

    if match.get("status") == "completed":
        scores["completed"].insert(0, dict(match))
    else:
        scores["live_matches"].append(dict(match))

    scores = _sync_live_index(scores)
    _save("scores.json", scores)
    return scores


def _delete_match(match_id=None, event_id=None, status=None):
    scores = _sync_live_index(_load("scores.json", {}))

    def keep(row):
        if match_id:
            return _match_key(row) != match_id
        if event_id and row.get("event_id") == event_id and (not status or row.get("status") == status):
            return False
        return True

    scores["live_matches"] = [m for m in scores.get("live_matches", []) if keep(m)]
    scores["completed"] = [m for m in scores.get("completed", []) if keep(m)]
    scores = _sync_live_index(scores)
    _save("scores.json", scores)
    return scores


def _enrich_match(row, teams):
    out = dict(row)
    out["match_id"] = _match_key(out)
    if out.get("team_a") in teams:
        out["team_a_name"] = teams[out["team_a"]]["name"]
    if out.get("team_b") in teams:
        out["team_b_name"] = teams[out["team_b"]]["name"]
    return out


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
    gallery_seasons = _load("gallery_seasons.json", [])
    season4 = next((s for s in gallery_seasons if s.get("id") == "season-4"), None)
    gallery = (season4 or {}).get("photos") or _load("gallery.json", [])
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
    lookup = _sync_live_index(_load("scores.json", {}))
    existing = None
    if body.get("match_id"):
        existing = _find_match(lookup, match_id=body.get("match_id"))
    elif not body.get("append_to_live_matches"):
        existing = _find_match(lookup, event_id=body.get("event_id"))

    match, error = _build_match(body, existing=existing)
    if error:
        return jsonify({"ok": False, "error": error}), 400

    scores = _save_match(match)
    audit(
        "live_update",
        f"{match['event_id']} {match['status']} {match['round']} {match.get('team_a')} vs {match.get('team_b')} {match['score_a']}-{match['score_b']}",
    )
    return jsonify({"ok": True, "match": match, "live_matches": scores.get("live_matches", []), "live": scores.get("live", {})})


@admin_bp.route("/api/live/commentary", methods=["POST"])
@login_required
def add_commentary():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()
    match_id = (body.get("match_id") or "").strip()
    event_id = (body.get("event_id") or "").strip()
    if not text:
        return jsonify({"ok": False, "error": "Empty commentary"}), 400
    scores = _sync_live_index(_load("scores.json", {}))
    matches = scores.setdefault("live_matches", [])
    if not isinstance(matches, list):
        matches = []
    live = None
    if match_id:
        live = next((m for m in matches if _match_key(m) == match_id), None)
    if not live and event_id:
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
# Comprehensive Live Matches Management API
# ---------------------------------------------------------------------------

@admin_bp.route("/api/live/list", methods=["GET"])
@login_required
def list_live_matches():
    """Get all live, upcoming, and archived matches with optional status filter."""
    status_filter = request.args.get("status", "").lower()
    scores = _sync_live_index(_load("scores.json", {}))
    teams = {t["id"]: t for t in _load("teams.json", [])}
    all_matches = [_enrich_match(m, teams) for m in (scores.get("live_matches") or [])]
    all_matches.extend(_enrich_match(m, teams) for m in (scores.get("completed") or []))

    if status_filter:
        all_matches = [m for m in all_matches if m.get("status") == status_filter]

    status_order = {"live": 0, "upcoming": 1, "completed": 2}
    all_matches.sort(key=lambda m: (status_order.get(m.get("status"), 3), m.get("event_name", ""), m.get("round", "")))
    return jsonify({"ok": True, "matches": all_matches, "total": len(all_matches)})


@admin_bp.route("/api/live/matches", methods=["GET"])
@login_required
def api_live_matches_get():
    return list_live_matches()


@admin_bp.route("/api/live/matches", methods=["POST"])
@login_required
def api_live_matches_create():
    body = request.get_json(silent=True) or {}
    match, error = _build_match(body)
    if error:
        return jsonify({"ok": False, "error": error}), 400
    scores = _save_match(match)
    audit("live_match_create", f"{match['match_id']} {match['event_id']} {match['status']}")
    return jsonify({"ok": True, "match": match, "live": scores.get("live", {})}), 201


@admin_bp.route("/api/live/matches/<match_id>", methods=["PUT", "PATCH"])
@login_required
def api_live_matches_update(match_id):
    body = request.get_json(silent=True) or {}
    scores = _sync_live_index(_load("scores.json", {}))
    existing = _find_match(scores, match_id=match_id)
    if not existing:
        return jsonify({"ok": False, "error": "Match not found"}), 404
    body["match_id"] = match_id
    match, error = _build_match(body, existing=existing, partial=request.method == "PATCH")
    if error:
        return jsonify({"ok": False, "error": error}), 400
    scores = _save_match(match)
    audit("live_match_update", f"{match_id} {match['status']}")
    return jsonify({"ok": True, "match": match, "live": scores.get("live", {})})


@admin_bp.route("/api/live/matches/<match_id>", methods=["DELETE"])
@login_required
def api_live_matches_delete(match_id):
    scores = _sync_live_index(_load("scores.json", {}))
    if not _find_match(scores, match_id=match_id):
        return jsonify({"ok": False, "error": "Match not found"}), 404
    _delete_match(match_id=match_id)
    audit("live_match_delete", match_id)
    return jsonify({"ok": True, "message": "Match deleted"})


@admin_bp.route("/api/live/matches/<match_id>/status", methods=["POST", "PATCH"])
@login_required
def api_live_matches_status(match_id):
    body = request.get_json(silent=True) or {}
    new_status = body.get("new_status") or body.get("status")
    if new_status not in VALID_STATUSES:
        return jsonify({"ok": False, "error": "Invalid status"}), 400
    scores = _sync_live_index(_load("scores.json", {}))
    existing = _find_match(scores, match_id=match_id)
    if not existing:
        return jsonify({"ok": False, "error": "Match not found"}), 404
    existing["status"] = new_status
    match, error = _build_match(existing, existing=existing, partial=True)
    if error:
        return jsonify({"ok": False, "error": error}), 400
    scores = _save_match(match)
    audit("live_match_status", f"{match_id} -> {new_status}")
    return jsonify({"ok": True, "match": match, "live": scores.get("live", {})})


@admin_bp.route("/api/live/delete", methods=["POST"])
@login_required
def delete_live_match():
    """Delete a match from live_matches or completed list."""
    body = request.get_json(silent=True) or {}
    match_id = body.get("match_id")
    event_id = body.get("event_id")
    status = body.get("status", "upcoming")

    if not match_id and not event_id:
        return jsonify({"ok": False, "error": "match_id or event_id required"}), 400

    _delete_match(match_id=match_id, event_id=event_id, status=status if not match_id else None)
    audit("live_delete", match_id or f"{event_id} ({status})")
    return jsonify({"ok": True, "message": "Match deleted"})


@admin_bp.route("/api/live/move-status", methods=["POST"])
@login_required
def move_match_status():
    """Move a match from one status to another (upcoming <-> live <-> completed)."""
    body = request.get_json(silent=True) or {}
    match_id = body.get("match_id")
    event_id = body.get("event_id")
    new_status = body.get("new_status", "upcoming")

    if not match_id and not event_id:
        return jsonify({"ok": False, "error": "match_id or event_id required"}), 400
    if new_status not in VALID_STATUSES:
        return jsonify({"ok": False, "error": "Invalid status"}), 400

    scores = _sync_live_index(_load("scores.json", {}))
    match = _find_match(scores, match_id=match_id, event_id=event_id)
    if not match:
        return jsonify({"ok": False, "error": "Match not found"}), 400

    match["status"] = new_status
    match, error = _build_match(match, existing=match, partial=True)
    if error:
        return jsonify({"ok": False, "error": error}), 400
    _save_match(match)
    audit("live_move_status", f"{_match_key(match)} -> {new_status}")
    return jsonify({"ok": True, "match": match, "message": f"Match moved to {new_status}"})


@admin_bp.route("/api/live/quick-update", methods=["POST"])
@login_required
def quick_update_scores():
    """Quick update scores for a match without modifying other fields."""
    body = request.get_json(silent=True) or {}
    match_id = body.get("match_id")
    event_id = body.get("event_id")

    if not match_id and not event_id:
        return jsonify({"ok": False, "error": "match_id or event_id required"}), 400
    
    try:
        score_a = int(body.get("score_a", 0) or 0)
        score_b = int(body.get("score_b", 0) or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Scores must be numbers"}), 400
    
    scores = _sync_live_index(_load("scores.json", {}))
    match = _find_match(scores, match_id=match_id, event_id=event_id)
    if not match:
        return jsonify({"ok": False, "error": "Match not found"}), 404

    match["score_a"] = max(0, score_a)
    match["score_b"] = max(0, score_b)
    match, error = _build_match(match, existing=match, partial=True)
    if error:
        return jsonify({"ok": False, "error": error}), 400
    _save_match(match)
    audit("live_quick_update", f"{_match_key(match)} {score_a}-{score_b}")
    return jsonify({"ok": True, "message": "Scores updated"})


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

    dest_dir = os.path.join(_BASE_DIR, "static", "images", "gallery", "season-4")
    os.makedirs(dest_dir, exist_ok=True)
    seasons = _load("gallery_seasons.json", [])
    season4 = next((s for s in seasons if s.get("id") == "season-4"), None)
    if not season4:
        season4 = {
            "id": "season-4",
            "season": "Season 4",
            "name": "Mission Possible",
            "year": "2026",
            "tagline": "Beyond Impossible",
            "photos": [],
        }
        seasons.insert(0, season4)
    season4.setdefault("photos", [])
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
            "path": f"/static/images/gallery/season-4/{filename}",
            "caption": caption or "Mission Possible 2026",
            "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        season4["photos"].insert(0, item)
        added.append(item)

    if not added:
        return jsonify({"ok": False, "error": "No valid images (png/jpg/jpeg/webp)"}), 400

    _save("gallery_seasons.json", seasons)
    audit("gallery_upload", f"{len(added)} image(s)")
    return jsonify({"ok": True, "items": added})


@admin_bp.route("/api/gallery/delete", methods=["POST"])
@login_required
def delete_gallery():
    gid = (request.get_json(silent=True) or {}).get("id")
    if not gid:
        return jsonify({"ok": False, "error": "id required"}), 400
    seasons = _load("gallery_seasons.json", [])
    item = None
    for season in seasons:
        photos = season.get("photos") or []
        found = next((x for x in photos if x.get("id") == gid), None)
        if found:
            item = found
            season["photos"] = [x for x in photos if x.get("id") != gid]
            break

    if item:
        _save("gallery_seasons.json", seasons)
    else:
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
