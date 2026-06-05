/* ===================== SPORTS HUB ===================== */
(function () {
  "use strict";
  let allEvents = [];

  function catGroup(category) {
    const c = (category || "").toLowerCase();
    if (c.includes("cultural") || c.includes("finale")) return "cultural";
    if (c.includes("indoor")) return "indoor";
    return "outdoor";
  }

  function render(filter) {
    const grid = document.getElementById("sportsGrid");
    if (!grid) return;
    const list = filter === "all" ? allEvents : allEvents.filter((ev) => catGroup(ev.category) === filter);
    if (!list.length) { grid.innerHTML = '<div class="empty">No events in this category.</div>'; return; }
    grid.innerHTML = list.map((e, i) => `
      <a class="ecard card ecard--rich reveal" data-delay="${i % 4}" href="/sport-detail?sport=${e.id}">
        <div class="ecard__banner ${e.banner || ""}">
          <span class="ecard__num">${CARNIVAL.esc(e.num || "")}</span>
          <span class="ecard__emoji">${e.emoji || "🏆"}</span>
          <span class="ecard__badge badge badge--${CARNIVAL.esc(e.badge || "gold")}">${CARNIVAL.esc(e.category)}</span>
        </div>
        <div class="ecard__body">
          <h3 class="ecard__name">${CARNIVAL.esc(e.name)}</h3>
          <div class="ecard__date">${CARNIVAL.esc(e.date)} · ${CARNIVAL.esc(e.day)}</div>
          <div class="ecard__meta">
            <span>📍 ${CARNIVAL.esc(e.venue)}</span>
            <span>${e.weather_icon || "🌡"} ${CARNIVAL.esc((e.weather || "").split("—")[0].trim())}</span>
          </div>
          <div class="ecard__foot">
            ${CARNIVAL.statusBadge(e.status)}
            <span class="ecard__go">View Details →</span>
          </div>
        </div>
      </a>`).join("");
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.08 });
    grid.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  CARNIVAL.get("/api/events").then((events) => {
    allEvents = (events || []).slice().sort((a, b) => {
      // Push completed events to the bottom while keeping normal date/name ordering
      const ka = a.status === "completed" ? 1 : 0;
      const kb = b.status === "completed" ? 1 : 0;
      if (ka !== kb) return ka - kb; // non-completed (0) come first
      const da = String(a.iso_date || "9999-12-31");
      const db = String(b.iso_date || "9999-12-31");
      if (da !== db) return da.localeCompare(db);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    render("all");
  }).catch(() => {
    const grid = document.getElementById("sportsGrid");
    if (grid) grid.innerHTML = '<div class="empty">Could not load events.</div>';
  });

  const bar = document.getElementById("filterBar");
  if (bar) bar.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".filt");
    if (!btn) return;
    bar.querySelectorAll(".filt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render(btn.dataset.cat);
  });
})();
