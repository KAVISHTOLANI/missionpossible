/* ===================== TEAM DETAIL ===================== */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const teamId = params.get("team");
  const root = document.getElementById("teamDetail");

  if (!teamId) { root.innerHTML = errBlock("No team selected."); return; }

  function errBlock(msg) {
    return `<section class="phero"><div class="wrap"><div class="empty">${msg} <a class="accent" href="/teams">Back to teams →</a></div></div></section>`;
  }

  Promise.all([
    CARNIVAL.get("/api/teams/" + teamId).catch(() => null),
    CARNIVAL.get("/api/standings").catch(() => ({ teams: {} })),
  ]).then(([team, standings]) => {
    function cleanName(v) {
      return String(v || "")
        .replace(/\((?:\s*DMO\s*|\s*MOD\s*)\)/gi, "")
        .replace(/\b(?:DMO|MOD)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    const coordinators = (team.coordinators || []).map(cleanName).filter(Boolean);

    if (!team) { root.innerHTML = errBlock("Team not found."); return; }
    const s = (standings.teams && standings.teams[teamId]) || {
      events_played: 0, wins: 0, points_earned: 0, penalty_deductions: 0, net_points: 0, event_breakdown: [],
    };

    const history = (s.event_breakdown || []).slice().reverse();
    const historyHtml = history.length
      ? `<div class="card infocard team-history-card">
          <div class="detailcard__label">Event History</div>
          <div class="team-history">
            ${history.map((row) => `
              <div class="team-history__row">
                <div class="team-history__event">${CARNIVAL.esc(row.event || "Event")}</div>
                <div class="team-history__meta">
                  <span class="${(row.points || 0) >= 0 ? "pos" : "neg"}">${(row.points || 0) >= 0 ? "+" : ""}${row.points || 0} pts</span>
                  ${row.note ? `<span>${CARNIVAL.esc(row.note)}</span>` : ""}
                </div>
              </div>`).join("")}
          </div>
        </div>`
      : `<div class="card infocard team-history-card"><div class="detailcard__label">Event History</div><p class="muted">No results recorded for this team yet.</p></div>`;

    root.innerHTML = `
      <header class="tbanner" style="--tc:${team.color}">
        <div class="tbanner__bg"></div>
        <div class="wrap tbanner__inner">
          <img class="tbanner__logo reveal in" src="${team.logo}" alt="${CARNIVAL.esc(team.name)}">
          <div>
            <div class="eyebrow" style="color:#fff">${CARNIVAL.esc(team.color_name)}</div>
            <h1 class="tbanner__name">${CARNIVAL.esc(team.name)}</h1>
            <p class="tbanner__company">${CARNIVAL.esc(team.company)}</p>
          </div>
        </div>
      </header>

      <section class="section--tight">
        <div class="wrap">
          <div class="grid cols-2 reveal in">
            <div class="card infocard">
              <div class="inforow"><span class="k">Company Head</span><span class="v v--stack"><span class="role-name">${CARNIVAL.esc(cleanName(team.company_head))}</span></span></div>
              <div class="inforow"><span class="k">Overall Coordinator</span><span class="v v--stack"><span class="role-name">${CARNIVAL.esc(cleanName(team.overall_coordinator))}</span></span></div>
              <div class="inforow"><span class="k">Team Coordinators</span><span class="v v--stack">${coordinators.map((name) => `<span class="role-name">${CARNIVAL.esc(name)}</span>`).join("")}</span></div>
              <div class="inforow"><span class="k">Team Colour</span><span class="v"><span class="swatch" style="background:${team.color}"></span>${CARNIVAL.esc(team.color_name)}</span></div>
            </div>
            <div class="card infocard infocard--center">
              <div class="netbig" style="color:${team.color}"><span class="cup" data-n="${s.net_points}">0</span></div>
              <div class="netlbl">Net Points</div>
            </div>
          </div>
        </div>
      </section>

      <section class="section--tight" style="padding-top:0">
        <div class="wrap">
          <div class="stats reveal in">
            <div class="stats__cell"><div class="stats__n cup" data-n="${s.events_played}">0</div><div class="stats__l">Events Played</div></div>
            <div class="stats__cell"><div class="stats__n cup" data-n="${s.wins}">0</div><div class="stats__l">Wins</div></div>
            <div class="stats__cell"><div class="stats__n cup" data-n="${s.points_earned}">0</div><div class="stats__l">Points Earned</div></div>
            <div class="stats__cell"><div class="stats__n cup" data-n="${s.penalty_deductions}">0</div><div class="stats__l">Penalties</div></div>
          </div>
          <div style="margin-top:22px">${historyHtml}</div>
          <div class="team-actions"><a class="btn btn--ghost" href="/teams">← All Teams</a> <a class="btn btn--ghost" href="/player-tracker?team=${encodeURIComponent(teamId)}">Player Tracker</a> <a class="btn btn--ghost" href="/standings">Full Standings →</a></div>
        </div>
      </section>`;

    // animate counters
    root.querySelectorAll(".cup").forEach((el) => CARNIVAL.countUp(el, parseInt(el.dataset.n || "0", 10)));
    document.title = team.name + " · Mission Possible 2026";
  });
})();
