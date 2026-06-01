/* ===================== CHAMPIONS ===================== */
(function () {
  "use strict";

  const TEAM_META = {
    creators: { name: "Team Creators", color: "#D4A017", logo: "/static/images/logos/creators.png" },
    dominators: { name: "Team Dominators", color: "#800000", logo: "/static/images/logos/dominators.png" },
    royals: { name: "Team Royals", color: "#4169E1", logo: "/static/images/logos/royals.png" },
  };

  function teamDisplay(id, fallback) {
    return TEAM_META[id] ? TEAM_META[id].name : (fallback || "—");
  }

  function render(rows) {
    const grid = document.getElementById("championsGrid");
    if (!grid) return;
    if (!rows || !rows.length) {
      grid.innerHTML = '<div class="empty">No champions announced yet.</div>';
      return;
    }
    grid.innerHTML = rows.map((c) => {
      const teamName = teamDisplay(c.team, c.team_name);
      const secondTeamName = teamDisplay(c.second_team, c.second_team_name);
      const category = c.sport_category ? `<span class="badge badge--gold">${CARNIVAL.esc(c.sport_category)}</span>` : "";
      const photo = c.winning_photo ? `<img class="champcard__photo" src="${CARNIVAL.esc(c.winning_photo)}" alt="${CARNIVAL.esc(c.event_name || "Winning photo")}" loading="lazy">` : "";
      if ((c.champion_type || "").toLowerCase() === "individual") {
        return `<div class="card champcard">
          ${photo}
          <div class="champcard__top">${category}</div>
          <div class="champcard__event">${CARNIVAL.esc(c.event_name || c.event_id)}</div>
          <div class="champcard__label">Individual Champion</div>
          <div class="champcard__value">${CARNIVAL.esc(c.player_name || "—")}</div>
          <div class="champcard__meta">${CARNIVAL.esc(teamName)}</div>
          <div class="champcard__label" style="margin-top:12px">Second Place</div>
          <div class="champcard__value">${CARNIVAL.esc(c.second_player_name || "—")}</div>
          <div class="champcard__meta">${CARNIVAL.esc(secondTeamName)}</div>
        </div>`;
      }
      const players = (c.players || []).length
        ? `<ul class="champcard__players">${(c.players || []).map((p) => `<li>${CARNIVAL.esc(p)}</li>`).join("")}</ul>`
        : '<div class="muted">Players not added yet.</div>';
      return `<div class="card champcard">
        ${photo}
        <div class="champcard__top">${category}</div>
        <div class="champcard__event">${CARNIVAL.esc(c.event_name || c.event_id)}</div>
        <div class="champcard__label">Team Champion</div>
        <div class="champcard__value">${CARNIVAL.esc(teamName)}</div>
        ${players}
        <div class="champcard__label" style="margin-top:12px">Second Place Team</div>
        <div class="champcard__value">${CARNIVAL.esc(secondTeamName)}</div>
      </div>`;
    }).join("");
  }

  fetch("/api/champions?ts=" + Date.now(), { cache: "no-store" })
    .then((r) => r.json())
    .then((rows) => render(rows || []))
    .catch(() => {
      const grid = document.getElementById("championsGrid");
      if (grid) grid.innerHTML = '<div class="empty">Could not load champions.</div>';
    });
})();
