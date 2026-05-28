# Mission Possible 2026 — Deenadayal Group of Companies

A premium, editorial-styled website for the Deenadayal Group's **Mission Possible 2026** — a
sports & cultural tournament across three teams and eleven events, June–August 2026, in
Maredpally, Hyderabad. Built with Flask + Jinja2, vanilla JavaScript, and flat JSON data
files. No build step, no frameworks, no database setup required.

---

## 1. Quick start

You need **Python 3.9+** installed. From inside the `carnival2026/` folder:

```bash
# 1. (Optional but recommended) create a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install the two dependencies
pip install -r requirements.txt

# 3. Run the site
python app.py
```

Then open **http://localhost:5000** in your browser. That's it.

> The first run creates a small `carnival.db` SQLite file automatically — it only stores the
> admin audit log. You never have to set anything up.

---

## 2. The admin panel

Go to **http://localhost:5000/admin**

- **Default password:** `carnival2026`
- From the dashboard you can: post/delete announcements, update live scores & commentary,
  record points and penalties for the standings, set MVP / Best Player / Best Team awards,
  edit each event's rules, and upload team logos.
- Every action is recorded in the **Audit Log** tab.

### Changing the password and secret key (recommended before going live)

The password and the cookie-signing secret are read from environment variables. Set them
before starting the app:

```bash
# macOS / Linux
export CARNIVAL_ADMIN_PASSWORD="your-strong-password"
export CARNIVAL_SECRET="some-long-random-string"
python app.py
```

```powershell
# Windows PowerShell
$env:CARNIVAL_ADMIN_PASSWORD="your-strong-password"
$env:CARNIVAL_SECRET="some-long-random-string"
python app.py
```

If you don't set them, the app falls back to the defaults above (fine for local testing,
**not** for a public deployment).

---

## 3. Where the content lives

All site content is plain JSON in the **`data/`** folder. You can edit these by hand (keep
them valid JSON) or — for most things — through the admin panel.

| File | What it holds |
|------|---------------|
| `teams.json` | The three teams: name, colour, company, heads, coordinators, logo path |
| `events.json` | All 11 events: dates, venue, category, weather outlook, status, rules |
| `standings.json` | Points table — events played, wins, points, penalties, net |
| `scores.json` | The live scoreboard, commentary, and completed results |
| `awards.json` | Event MVPs, Overall Best Player, Best Team |
| `announcements.json` | The announcements feed |

### A few content rules baked into the site

- **Organisers/attendees are never shown publicly.** Even if you add an `attendees` field to an
  event, the public API strips it out. This is intentional and enforced in code.
- **Sport pages are auto-generated** from `events.json`. Through the admin panel the only event
  field you can edit is the **rules** list — everything else (date, venue, weather, category)
  is read straight from the JSON.
- **Awards** cover a per-event MVP (one per event), one Overall Best Player, and one Best Team.
- The **countdown** on the home page targets the opening event: Basketball at YMCA, 4 June 2026.

---

## 4. Project structure

```
carnival2026/
├── app.py                  # Flask app: public pages + read-only JSON APIs
├── admin.py                # Admin blueprint: login, write endpoints, audit log
├── requirements.txt        # Flask + Werkzeug
├── carnival.db             # (auto-created) SQLite audit log
├── data/                   # All site content as JSON (see table above)
├── templates/              # Jinja2 HTML
│   ├── base.html           # Shared shell: navbar, footer, fonts
│   ├── index.html          # Home (hero, countdown, teams, next-up)
│   ├── teams.html / team-detail.html
│   ├── sports.html / sport-detail.html
│   ├── live.html / standings.html / awards.html / announcements.html
│   └── admin/
│       ├── login.html
│       └── dashboard.html
└── static/
    ├── css/                # styles.css (design system), home.css, pages.css, admin.css
    ├── js/                 # one file per page + main.js (shared)
    └── images/logos/       # creators.png, dominators.png, royals.png, deenadayal-logo.png
```

---

## 5. Pages at a glance

| URL | Page |
|-----|------|
| `/` | Home — hero, live countdown, stats, announcements ticker, teams, next-up events |
| `/teams` | The three teams |
| `/team-detail?team=<id>` | A single team's profile + live stats (`id` = `creators` / `dominators` / `royals`) |
| `/sports` | All events with category filter (Outdoor / Indoor / Cultural) |
| `/sport-detail?sport=<id>` | A single event: venue, weather, rules, result |
| `/live` | Live scoreboard (auto-refreshes every 30s) + completed results |
| `/standings` | Points table with expandable per-team breakdown |
| `/awards` | Top honours + all event MVPs |
| `/announcements` | The full announcements feed |
| `/admin` | Organiser control panel |

---

## 6. Updating team logos

Logos live in `static/images/logos/` as `creators.png`, `dominators.png`, `royals.png`. Replace
them directly, or use the **Logos** tab in the admin panel to upload a new PNG per team. The
group emblem is `deenadayal-logo.png` — swap it with your official logo (the layout hides the
image gracefully if a file is ever missing).

---

## 7. Deploying for real

The built-in server (`python app.py`) is for development. For a public deployment, run it
behind a production WSGI server, e.g.:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

Remember to set `CARNIVAL_ADMIN_PASSWORD` and `CARNIVAL_SECRET` in that environment.

---

*Mission Possible 2026 · Where Sport Meets Spirit · Deenadayal Group of Companies, Maredpally, Hyderabad.*
