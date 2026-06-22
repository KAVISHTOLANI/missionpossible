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
      // support multiple categories (comma-separated) and multiple photos (comma-separated URLs)
      const categories = (c.sport_category || '').split(',').map(s => s.trim()).filter(Boolean);
      const photos = (c.winning_photo || '').split(',').map(s => s.trim()).filter(Boolean);
      if ((c.champion_type || "").toLowerCase() === "individual") {
        const topBadges = categories.length ? categories.map(cat => `<span class="badge badge--gold">${CARNIVAL.esc(cat)}</span>`).join(' ') : '';
        const photosHtml = (photos.length ? photos : [c.winning_photo || '']).map((p, idx) => p ? `<img class="champcard__photo" src="${CARNIVAL.esc(p)}" alt="${CARNIVAL.esc(c.event_name || 'Winning photo')}" loading="lazy">` : '').join('');
        const categoryRows = Array.isArray(c.categories) ? c.categories.slice(0, 5) : [];
        const categoryHtml = categoryRows.length ? `
          <div class="champcard__categories">
            ${categoryRows.map((cat) => `
              <div class="champcard__category">
                ${cat.photo ? `<img class="champcard__category-photo" src="${CARNIVAL.esc(cat.photo)}" alt="${CARNIVAL.esc(cat.name || 'Champion category')}" loading="lazy">` : ''}
                <div class="champcard__label">${CARNIVAL.esc(cat.name || 'Category')}</div>
                <div class="champcard__value">${CARNIVAL.esc(cat.first_player || '—')}</div>
                <div class="champcard__meta">${CARNIVAL.esc(teamDisplay(cat.first_team, cat.first_team_name))}</div>
                <div class="champcard__label" style="margin-top:8px">Second Place</div>
                <div class="champcard__value">${CARNIVAL.esc(cat.second_player || '—')}</div>
                <div class="champcard__meta">${CARNIVAL.esc(teamDisplay(cat.second_team, cat.second_team_name))}</div>
              </div>
            `).join('')}
          </div>` : '';
        return `<div class="card champcard">
          <div class="champcard__photowrap">${photosHtml}</div>
          <div class="champcard__top">${topBadges}</div>
          <div class="champcard__event">${CARNIVAL.esc(c.event_name || c.event_id)}</div>
          <div class="champcard__label">Individual Champion</div>
          <div class="champcard__value">${CARNIVAL.esc(c.player_name || "—")}</div>
          <div class="champcard__meta">${CARNIVAL.esc(teamName)}</div>
          <div class="champcard__label" style="margin-top:12px">Second Place</div>
          <div class="champcard__value">${CARNIVAL.esc(c.second_player_name || "—")}</div>
          <div class="champcard__meta">${CARNIVAL.esc(secondTeamName)}</div>
          ${categoryHtml}
        </div>`;
      }
      const players = (c.players || []).length
        ? `<ul class="champcard__players">${(c.players || []).map((p) => `<li>${CARNIVAL.esc(p)}</li>`).join("")}</ul>`
        : '<div class="muted">Players not added yet.</div>';
      return `<div class="card champcard">
        <div class="champcard__photo">${photos.length ? `<img src="${CARNIVAL.esc(photos[0])}">` : ''}</div>
        <div class="champcard__top">${CARNIVAL.esc(c.sport_category || '')}</div>
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
