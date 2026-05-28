/* ===================== AWARDS ===================== */
(function () {
  "use strict";
  const META = {
    creators: { name: "Team Creators", color: "#D4A017", logo: "/static/images/logos/creators.png" },
    dominators: { name: "Team Dominators", color: "#800000", logo: "/static/images/logos/dominators.png" },
    royals: { name: "Team Royals", color: "#4169E1", logo: "/static/images/logos/royals.png" },
  };

  function tba(title, sub) {
    return `
      <div class="award award--tba">
        <div class="award__shimmer"></div>
        <div class="award__title">${title}</div>
        ${sub ? `<div class="award__event">${CARNIVAL.esc(sub)}</div>` : ""}
        <div class="award__tba">To Be Announced</div>
      </div>`;
  }
  function filled(title, sub, name, teamId, image) {
    const m = META[teamId];
    return `
      <div class="award award--filled" ${m ? `style="--tc:${m.color}"` : ""}>
        ${image ? `<img class="award__photo" src="${CARNIVAL.esc(image)}" alt="${CARNIVAL.esc(name)}" onerror="this.style.display='none'">` : ""}
        ${m ? `<img class="award__logo" src="${m.logo}" alt="">` : ""}
        <div class="award__title">${title}</div>
        ${sub ? `<div class="award__event">${CARNIVAL.esc(sub)}</div>` : ""}
        <div class="award__winner">${CARNIVAL.esc(name)}</div>
        ${m ? `<div class="award__team" style="color:${m.color}">${m.name}</div>` : ""}
      </div>`;
  }
  function featuredOverall(name, teamId, image) {
    const m = META[teamId];
    return `
      <div class="award award--filled award--overall" ${m ? `style="--tc:${m.color}"` : ""}>
        ${image ? `<img class="award__photo award__photo--overall" src="${CARNIVAL.esc(image)}" alt="${CARNIVAL.esc(name)}" onerror="this.style.display='none'">` : ""}
        ${m ? `<img class="award__logo award__logo--overall" src="${m.logo}" alt="">` : ""}
        <div class="award__title">Overall MVP</div>
        <div class="award__winner award__winner--overall">${CARNIVAL.esc(name)}</div>
        ${m ? `<div class="award__team" style="color:${m.color}">${m.name}</div>` : ""}
      </div>`;
  }

  async function loadAwards() {
    const awardsResp = await fetch("/api/awards", { credentials: "same-origin" });
    if (!awardsResp.ok) throw new Error("Awards unavailable");
    const awards = await awardsResp.json();
    const events = await CARNIVAL.get("/api/events");
    const mvpEvents = (events || []).filter((e) => {
      const b = (e.badge || "").toLowerCase();
      return b !== "cultural" && b !== "finale";
    });

    const top = document.getElementById("topAwards");
    const featured = document.getElementById("overallMvpFeatured");
    const bp = awards.overall_best_player;
    const bt = awards.best_team;
    const fp = awards.fair_play_award;
    if (featured) {
      featured.innerHTML = (bp && bp.player) ? featuredOverall(bp.player, bp.team, bp.image) : tba("Overall MVP", null);
    }
    let topHtml = "";
    topHtml += bt && META[bt] ? filled("Overall Best Team", null, META[bt].name, bt) : tba("Overall Best Team", null);
    topHtml += fp && META[fp] ? filled("Fair Play Award", null, META[fp].name, fp) : tba("Fair Play Award", null);
    top.innerHTML = topHtml;

    const grid = document.getElementById("eventMvps");
    const mvps = awards.event_mvps || {};
    grid.innerHTML = mvpEvents.map((e) => {
      const m = mvps[e.id];
      return `<div class="reveal">${(m && m.player) ? filled("MVP", e.name, m.player, m.team, m.image) : tba("MVP", e.name)}</div>`;
    }).join("");
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.08 });
    grid.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  loadAwards().catch(() => {});
})();
