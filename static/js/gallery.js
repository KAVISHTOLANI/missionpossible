/* ===================== GALLERY ===================== */
(function () {
  "use strict";

  function galleryCard(g, i) {
    return `
      <article class="card gcard reveal" data-delay="${i % 4}">
        <a href="${g.path}" target="_blank" rel="noopener">
          <div class="gcard__media"><img src="${g.path}" alt="${CARNIVAL.esc(g.caption || "Gallery image")}" loading="lazy"></div>
        </a>
        <div class="gcard__body">
          <div class="gcard__caption">${CARNIVAL.esc(g.caption || "Mission Possible")}</div>
          ${g.uploaded_at ? `<div class="gcard__meta">${CARNIVAL.esc(g.uploaded_at)}</div>` : ""}
        </div>
      </article>
    `;
  }

  function observeReveals(root) {
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    }), { threshold: 0.1 });
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  CARNIVAL.get("/api/gallery-seasons").then((seasons) => {
    const wrap = document.getElementById("gallerySeasons");
    if (!wrap) return;
    if (!seasons || !seasons.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = seasons.map((season) => {
      const photos = season.photos || [];
      return `
        <section class="gallery-block gallery-season" id="${CARNIVAL.esc(season.id || "")}">
          <div class="gallery-block__head">
            <div>
              <div class="eyebrow">${CARNIVAL.esc(season.season || "Season")}</div>
              <h2>${CARNIVAL.esc(season.name || "Mission Possible")} <span class="accent">${CARNIVAL.esc(season.year || "")}</span></h2>
              ${season.tagline ? `<p class="gallery-season__tagline">${CARNIVAL.esc(season.tagline)}</p>` : ""}
            </div>
            <div class="gallery-season__count">${photos.length} photos</div>
          </div>
          ${photos.length
            ? `<div class="grid cols-3">${photos.map(galleryCard).join("")}</div>`
            : '<div class="empty gallery-season__empty">Photos for this season can be added here.</div>'}
        </section>
      `;
    }).join("");
    observeReveals(wrap);
  }).catch(() => {
    const wrap = document.getElementById("gallerySeasons");
    if (wrap) wrap.innerHTML = "";
  });
})();
