/* ===================== PLAYER TRACKER PAGE ===================== */
(function () {
  "use strict";

  const root = document.getElementById("playerTrackerRoot");
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const selectedTeamId = params.get("team");
  const TEAM_ORDER = ["creators", "dominators", "royals"];
  const MAX_GAMES = 5;

  function playedSlots(player) {
    const raw = Array.isArray(player.played) ? player.played : [];
    return Array.from({ length: MAX_GAMES }, (_, idx) => Boolean(raw[idx]));
  }

  function gameLabel(player, idx) {
    const games = Array.isArray(player.games) ? player.games : [];
    const named = games[idx];
    if (typeof named === "string" && named.trim()) return named.trim();
    if (named && typeof named === "object" && named.name) return named.name;
    return "Game " + (idx + 1);
  }

  function normalTracker(data) {
    if (data && data.tracker && data.tracker.teams) return data.tracker;
    if (data && data.teams) return data;
    return { teams: {} };
  }

  function teamStats(players) {
    const totalSlots = players.length * MAX_GAMES;
    const used = players.reduce((sum, player) => sum + playedSlots(player).filter(Boolean).length, 0);
    const complete = players.filter((player) => playedSlots(player).filter(Boolean).length >= MAX_GAMES).length;
    return { totalSlots, used, complete };
  }

  function renderGames(player) {
    const slots = playedSlots(player);
    return slots.map((checked, idx) => `
      <div class="tracker-game ${checked ? "tracker-game--played" : ""}">
        <span class="tracker-game__dot"></span>
        <span>${CARNIVAL.esc(gameLabel(player, idx))}</span>
        <strong>${checked ? "Played" : "Open"}</strong>
      </div>
    `).join("");
  }

  function renderPlayer(player) {
    const slots = playedSlots(player);
    const playedCount = slots.filter(Boolean).length;
    const isComplete = playedCount >= MAX_GAMES;

    return `
      <article class="tracker-row ${isComplete ? "tracker-row--complete" : ""}" tabindex="0" role="button" aria-expanded="false">
        <div class="tracker-row__summary">
          <div class="tracker-row__main">
            <div class="tracker-row__name">${CARNIVAL.esc(player.name || "Unnamed player")}</div>
            <div class="tracker-row__meta">
              <span>${CARNIVAL.esc(player.employee_id || "No employee ID")}</span>
              <span>${CARNIVAL.esc(player.department || "Department TBA")}</span>
            </div>
          </div>
          <div class="tracker-row__played">
            <span class="tracker-badge">${playedCount}/${MAX_GAMES}</span>
            <span class="tracker-row__chev">v</span>
          </div>
        </div>
        <div class="tracker-row__detail">
          <div class="tracker-row__detail-inner">
            <div class="tracker-games">${renderGames(player)}</div>
          </div>
        </div>
      </article>
    `;
  }

  function renderTeam(team, players) {
    const sortedPlayers = players.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    const stats = teamStats(sortedPlayers);
    const progress = stats.totalSlots ? Math.round((stats.used / stats.totalSlots) * 100) : 0;
    const rows = sortedPlayers.length
      ? sortedPlayers.map(renderPlayer).join("")
      : '<div class="tracker-empty">No players added yet for this team.</div>';

    return `
      <section class="tracker-team reveal in" style="--tc:${team.color || "var(--gold)"}">
        <div class="tracker-team__header">
          <div class="tracker-team__identity">
            <img class="tracker-team__logo" src="${CARNIVAL.esc(team.logo || "")}" alt="${CARNIVAL.esc(team.name || "Team")}">
            <div>
              <h2>${CARNIVAL.esc(team.name || "Team")}</h2>
              <p>${CARNIVAL.esc(team.company || "")}</p>
            </div>
          </div>
          <div class="tracker-team__numbers">
            <span><strong>${sortedPlayers.length}</strong> Players</span>
            <span><strong>${stats.complete}</strong> Completed</span>
          </div>
        </div>
        <div class="tracker-progress" aria-label="${progress}% of player slots used">
          <span style="width:${progress}%"></span>
        </div>
        <div class="tracker-list">${rows}</div>
      </section>
    `;
  }

  function bindRows() {
    root.querySelectorAll(".tracker-row").forEach((row) => {
      const toggle = () => {
        const open = row.classList.toggle("open");
        row.setAttribute("aria-expanded", open ? "true" : "false");
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          toggle();
        }
      });
    });
  }

  Promise.all([
    CARNIVAL.get("/api/teams"),
    CARNIVAL.get("/api/player-tracker").catch(() => ({ teams: {} })),
  ]).then(([teams, trackerPayload]) => {
    const tracker = normalTracker(trackerPayload);
    const teamMap = {};
    (teams || []).forEach((team) => { teamMap[team.id] = team; });

    const ids = selectedTeamId ? [selectedTeamId] : TEAM_ORDER;
    const html = ids
      .map((teamId) => {
        const team = teamMap[teamId];
        if (!team) return "";
        const players = (tracker.teams && tracker.teams[teamId]) || [];
        return renderTeam(team, Array.isArray(players) ? players : []);
      })
      .join("");

    root.innerHTML = html || '<div class="empty">No tracker data is available yet.</div>';
    bindRows();
    if (selectedTeamId && teamMap[selectedTeamId]) {
      document.title = teamMap[selectedTeamId].name + " Player Tracker - Mission Possible 2026";
    }
  }).catch(() => {
    root.innerHTML = '<div class="empty">Could not load player tracker right now.</div>';
  });
})();
