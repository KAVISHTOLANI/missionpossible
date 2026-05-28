/* ===================== GALLERY ===================== */
(function () {
  "use strict";

  CARNIVAL.get("/api/gallery").then((items) => {
    const grid = document.getElementById("galleryGrid");
    if (!grid) return;
    if (!items || !items.length) {
      grid.innerHTML = '<div class="empty">No gallery photos uploaded yet.</div>';
      return;
    }
    grid.innerHTML = items.map((g, i) => `
      <article class="card gcard reveal" data-delay="${i % 4}">
        <a href="${g.path}" target="_blank" rel="noopener">
          <div class="gcard__media"><img src="${g.path}" alt="${CARNIVAL.esc(g.caption || "Gallery image")}" loading="lazy"></div>
        </a>
        <div class="gcard__body">
          <div class="gcard__caption">${CARNIVAL.esc(g.caption || "Mission Possible 2026")}</div>
          ${g.uploaded_at ? `<div class="gcard__meta">${CARNIVAL.esc(g.uploaded_at)}</div>` : ""}
        </div>
      </article>
    `).join("");
    const io = new IntersectionObserver((es) => es.forEach((x) => {
      if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); }
    }), { threshold: 0.1 });
    grid.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }).catch(() => {
    const grid = document.getElementById("galleryGrid");
    if (grid) grid.innerHTML = '<div class="empty">Could not load gallery.</div>';
  });
})();
