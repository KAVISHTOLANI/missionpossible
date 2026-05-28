/* ===================== LIVE SCORES ===================== */
(function () {
  "use strict";
  const TEAM_META = {
    creators: { name: "Team Creators", short: "Creators", color: "#D4A017", logo: "/static/images/logos/creators.png" },
    dominators: { name: "Team Dominators", short: "Dominators", color: "#800000", logo: "/static/images/logos/dominators.png" },
    royals: { name: "Team Royals", short: "Royals", color: "#4169E1", logo: "/static/images/logos/royals.png" },
  };
  const ORDER = ["creators", "dominators", "royals"];
  function teamNameFromId(id) {
    return TEAM_META[id] ? TEAM_META[id].short : (id || "—");
  }

  function headToHead(live) {
    const a = live.team_a;
    const b = live.team_b;
    if (!a || !b || !TEAM_META[a] || !TEAM_META[b]) return null;
    const ma = TEAM_META[a];
    const mb = TEAM_META[b];
    return `
      <div class="live-round">${CARNIVAL.esc(live.round || "Live Match")}</div>
      <div class="scoreboard scoreboard--h2h">
        <div class="sbox" style="--tc:${ma.color}">
          <img class="sbox__logo" src="${ma.logo}" alt="" onerror="this.style.display='none'">
          <div class="sbox__name">${ma.name}</div>
          <div class="sbox__score">${live.score_a != null ? live.score_a : 0}</div>
        </div>
        <div class="sbox__vs">vs</div>
        <div class="sbox" style="--tc:${mb.color}">
          <img class="sbox__logo" src="${mb.logo}" alt="" onerror="this.style.display='none'">
          <div class="sbox__name">${mb.name}</div>
          <div class="sbox__score">${live.score_b != null ? live.score_b : 0}</div>
        </div>
      </div>`;
  }

  function scoreBoxes(scores) {
    return ORDER.map((id) => {
      const m = TEAM_META[id];
      return `
        <div class="sbox" style="--tc:${m.color}">
          <img class="sbox__logo" src="${m.logo}" alt="" onerror="this.style.display='none'">
          <div class="sbox__name">${m.name}</div>
          <div class="sbox__score">${scores[id] != null ? scores[id] : 0}</div>
        </div>`;
    }).join('<div class="sbox__vs">vs</div>');
  }

  function renderMatchCard(live) {
    const hasMatch = !!(live.event_id && live.team_a && live.team_b);
    const isLive = live.status === "live" && live.event_id;

    if (isLive || hasMatch) {
      const statusBadge = isLive
        ? '<span class="badge badge--live">Live Now</span>'
        : '<span class="badge badge--gold">Upcoming Match</span>';
      let board = headToHead(live) || `<div class="scoreboard">${scoreBoxes(live.scores || {})}</div>`;
      const details = live.details || {};
      if (details.mode === "race" && Array.isArray(details.participants)) {
        board = `
          <div class="card" style="padding:20px">
            ${details.participants.map((p) => `
              <div class="inforow">
                <span class="k">${CARNIVAL.esc(p.name || "Participant")}</span>
                <span class="v">${CARNIVAL.esc(teamNameFromId(p.team))} · Score ${Number(p.score || 0)} · ${CARNIVAL.esc(p.status || "level")}</span>
              </div>
            `).join("")}
          </div>`;
      } else if (details.mode === "cricket") {
        board = `
          <div class="card" style="padding:20px">
            <div class="inforow"><span class="k">Batting Team</span><span class="v">${CARNIVAL.esc(details.batting_team || "—")}</span></div>
            <div class="inforow"><span class="k">Score</span><span class="v">${CARNIVAL.esc(details.score || "—")}</span></div>
            <div class="inforow"><span class="k">Wickets / Overs</span><span class="v">${Number(details.wickets || 0)} / ${CARNIVAL.esc(details.overs || "0.0")}</span></div>
            <div class="inforow"><span class="k">Striker</span><span class="v">${CARNIVAL.esc(details.striker || "—")}</span></div>
            <div class="inforow"><span class="k">Non-Striker</span><span class="v">${CARNIVAL.esc(details.non_striker || "—")}</span></div>
            <div class="inforow"><span class="k">Bowler</span><span class="v">${CARNIVAL.esc(details.bowler || "—")}</span></div>
            ${details.target ? `<div class="inforow"><span class="k">Target</span><span class="v">${CARNIVAL.esc(details.target)}</span></div>` : ""}
          </div>`;
      }
      return `
        <div class="card" style="padding:20px">
          <div class="livehead" style="margin-bottom:20px">
            ${statusBadge}
            <h2 class="livehead__name">${CARNIVAL.esc(live.event_name || "Live Event")}</h2>
          </div>
          ${board}
          <div class="commentary">
            <div class="commentary__h">Commentary</div>
            ${(live.commentary && live.commentary.length)
              ? live.commentary.map((c) => `<div class="cmt"><span class="cmt__t">${CARNIVAL.esc(c.time)}</span><span class="cmt__x">${CARNIVAL.esc(c.text)}</span></div>`).join("")
              : '<div class="muted">No commentary yet — stay tuned.</div>'}
          </div>
        </div>`;
    }
    return "";
  }

  function render(data) {
    const zone = document.getElementById("liveZone");
    const matches = (data.live_matches && data.live_matches.length)
      ? data.live_matches
      : ((data.live && data.live.event_id) ? [data.live] : []);
    const visible = matches.filter((m) => m && m.event_id && (m.status === "live" || (m.team_a && m.team_b)));

    if (visible.length) {
      zone.innerHTML = `
        <div class="sec-label"><span class="num">●</span><span class="txt">Live Scoreboards</span></div>
        <div class="grid cols-2">${visible.map((m) => renderMatchCard(m)).join("")}</div>`;
    } else {
      const nx = data.next_event;
      zone.innerHTML = `
        <div class="nolive card">
          <div class="nolive__pulse"></div>
          <h2>Live Scores Coming Soon</h2>
          ${nx
            ? `<p class="muted">Next up: <a class="accent" href="/sport-detail?sport=${nx.id}">${CARNIVAL.esc(nx.name)}</a> · ${CARNIVAL.esc(nx.date)} · ${CARNIVAL.esc(nx.venue)}</p>`
            : '<p class="muted">The schedule will resume shortly.</p>'}
          <a class="btn btn--ghost" href="/calendar" style="margin-top:8px">View Calendar →</a>
        </div>`;
    }

    const cz = document.getElementById("completedZone");
    const done = data.completed || [];
    if (done.length) {
      cz.innerHTML = `
        <div class="sec-label"><span class="num">★</span><span class="txt">Completed Results</span></div>
        <div class="grid cols-2">
          ${done.map((c) => {
            const h2h = c.team_a && c.team_b && TEAM_META[c.team_a] && TEAM_META[c.team_b];
            const scoreLine = h2h
              ? `<span style="color:${TEAM_META[c.team_a].color}">${TEAM_META[c.team_a].short} ${c.score_a || 0}</span>
                 <span class="sep">–</span>
                 <span style="color:${TEAM_META[c.team_b].color}">${c.score_b || 0} ${TEAM_META[c.team_b].short}</span>`
              : ORDER.map((id) => `<span style="color:${TEAM_META[id].color}">${TEAM_META[id].short} ${c.scores ? (c.scores[id] || 0) : 0}</span>`).join('<span class="sep">·</span>');
            return `
            <div class="card donecard">
              <div class="donecard__name">${CARNIVAL.esc(c.event_name)}</div>
              <div class="donecard__date">${CARNIVAL.esc(c.date || "")}${c.round ? " · " + CARNIVAL.esc(c.round) : ""}</div>
              <div class="donecard__scores">${scoreLine}</div>
            </div>`;
          }).join("")}
        </div>`;
    } else {
      cz.innerHTML = "";
    }
  }

  function toEmbedUrl(url) {
    const u = (url || "").trim();
    if (!u) return "";
    if (u.includes("/embed/")) return u;
    try {
      const parsed = new URL(u);
      if (parsed.hostname.includes("youtu.be")) {
        const id = parsed.pathname.replace("/", "");
        return id ? `https://www.youtube.com/embed/${id}` : u;
      }
      if (parsed.hostname.includes("youtube.com")) {
        const id = parsed.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      return u;
    } catch (_) {
      return u;
    }
  }

  function renderYouTube(url) {
    const host = document.getElementById("ytZone");
    if (!host) return;
    const embed = toEmbedUrl(url);
    if (!embed) { host.innerHTML = ""; return; }
    host.innerHTML = `
      <div class="card" style="padding:18px 18px 16px;margin-bottom:22px">
        <div class="detailcard__label" style="margin-bottom:12px">Watch Live</div>
        <div class="vmap"><iframe src="${embed}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
      </div>`;
  }

  function poll() {
    Promise.all([
      CARNIVAL.get("/api/live"),
      CARNIVAL.get("/api/settings").catch(() => ({ youtube_live_url: "" })),
    ]).then(([live, settings]) => {
      renderYouTube(settings.youtube_live_url || "");
      render(live);
    }).catch(() => {
      const zone = document.getElementById("liveZone");
      if (zone) zone.innerHTML = '<div class="empty">Could not reach the scoreboard.</div>';
    });
  }
  poll();
  setInterval(poll, 15000);
})();
