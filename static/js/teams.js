/* ===================== TEAMS PAGE ===================== */
(function () {
  "use strict";
  function observeReveals(scope) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.1 });
    (scope || document).querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  CARNIVAL.get("/api/teams").then((teams) => {
    const grid = document.getElementById("teamsGrid");
    if (!grid) return;
    grid.innerHTML = teams.map((t, i) => `
      <a class="bigteam card reveal tc-top" data-delay="${i}" href="/team-detail?team=${t.id}" style="--tc:${t.color}">
        <div class="bigteam__stripe"></div>
        <div class="bigteam__media"><img src="${t.logo}" alt="${CARNIVAL.esc(t.name)}" loading="lazy"></div>
        <div class="bigteam__body">
          <div class="bigteam__name">${CARNIVAL.esc(t.name)}</div>
          <div class="bigteam__color">${CARNIVAL.esc(t.color_name)}</div>
          <div class="inforow"><span class="k">Company</span><span class="v">${CARNIVAL.esc(t.company)}</span></div>
          <div class="inforow"><span class="k">Company Head</span><span class="v">${CARNIVAL.esc(t.company_head)}</span></div>
          <div class="inforow"><span class="k">Overall Coordinator</span><span class="v">${CARNIVAL.esc(t.overall_coordinator)}</span></div>
          <div class="inforow"><span class="k">Team Coordinators</span><span class="v">${t.coordinators.map(CARNIVAL.esc).join(" · ")}</span></div>
          <div class="bigteam__go">View full profile →</div>
        </div>
      </a>`).join("");
    observeReveals(grid);
  }).catch((e) => {
    const grid = document.getElementById("teamsGrid");
    if (grid) grid.innerHTML = '<div class="empty">Could not load teams.</div>';
  });
})();
