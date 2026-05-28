/* ===================== ANNOUNCEMENTS ===================== */
(function () {
  "use strict";
  function fmtDate(s) {
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }
  CARNIVAL.get("/api/announcements").then((items) => {
    const list = document.getElementById("annList");
    if (!list) return;
    if (!items.length) { list.innerHTML = '<div class="empty">No announcements yet.</div>'; return; }
    list.innerHTML = items.map((a, i) => `
      <article class="annitem card reveal ${CARNIVAL.tagClass(a.tag)}" data-delay="${i % 4}">
        <div class="annitem__top">
          <span class="annitem__tag">${CARNIVAL.esc(a.tag)}</span>
          <time class="annitem__date">${fmtDate(a.date)}</time>
        </div>
        <h3 class="annitem__title">${CARNIVAL.esc(a.title)}</h3>
        <p class="annitem__body">${CARNIVAL.esc(a.body)}</p>
      </article>`).join("");
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.1 });
    list.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }).catch(() => {
    const list = document.getElementById("annList");
    if (list) list.innerHTML = '<div class="empty">Could not load announcements.</div>';
  });
})();
