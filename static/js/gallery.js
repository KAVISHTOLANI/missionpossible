/* ===================== GALLERY ===================== */
(function () {
  "use strict";

  function galleryCard(g, i) {
    return `
      <article class="card gcard reveal" data-delay="${i % 4}">
        <a href="${g.path || '#'}" target="_blank" rel="noopener">
          <div class="gcard__media${!g.path ? ' gcard__media--missing' : ''}">
            <img src="${g.path || ''}" alt="${CARNIVAL.esc(g.caption || "Gallery image")}" loading="lazy"
              onerror="this.style.display='none'; this.closest('.gcard').classList.add('gcard--broken')">
          </div>
        </a>
        <div class="gcard__body">
          <div class="gcard__caption">${CARNIVAL.esc(g.caption || "Mission Possible")}</div>
          ${g.uploaded_at ? `<div class="gcard__meta">${CARNIVAL.esc(g.uploaded_at)}</div>` : ""}
          ${!g.path ? '<div class="gcard__broken">Image path missing.</div>' : ""}
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

  function renderSeasonBlock(season) {
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
      </section>`;
  }

  function renderGalleryCollection(wrap, photos, title = "Mission Possible", year = "2026") {
    wrap.innerHTML = `
      <section class="gallery-block gallery-season" id="mission-possible">
        <div class="gallery-block__head">
          <div>
            <div class="eyebrow">Season</div>
            <h2>${CARNIVAL.esc(title)} <span class="accent">${CARNIVAL.esc(year)}</span></h2>
          </div>
          <div class="gallery-season__count">${photos.length} photos</div>
        </div>
        ${photos.length
          ? `<div class="grid cols-3">${photos.map(galleryCard).join("")}</div>`
          : '<div class="empty gallery-season__empty">Photos for this season can be added here.</div>'}
      </section>`;
    observeReveals(wrap);
  }

  function renderFallback(wrap, message) {
    if (!wrap) return;
    wrap.innerHTML = `<div class="empty gallery-season__empty">${CARNIVAL.esc(message)}</div>`;
  }

  async function loadGallery() {
    const wrap = document.getElementById("gallerySeasons");
    if (!wrap) return;

    try {
      const seasons = await CARNIVAL.get("/api/gallery-seasons");
      if (seasons && Array.isArray(seasons) && seasons.length) {
        wrap.innerHTML = seasons.map(renderSeasonBlock).join("");
        observeReveals(wrap);
        return;
      }
    } catch (error) {
      // continue to fallback route
    }

    try {
      const gallery = await CARNIVAL.get("/api/gallery");
      if (gallery) {
        const photos = Array.isArray(gallery) ? gallery : (gallery.photos || []);
        const title = gallery && gallery.title ? gallery.title : "Mission Possible";
        const year = gallery && gallery.year ? gallery.year : "2026";
        renderGalleryCollection(wrap, photos, title, year);
        return;
      }
    } catch (error) {
      // ignore
    }

    renderFallback(wrap, "Could not load gallery. Photos can be added here as the event progresses.");
  }

  loadGallery();
})();
