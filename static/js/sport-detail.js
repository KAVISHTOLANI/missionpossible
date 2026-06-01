/* ===================== SPORT DETAIL ===================== */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const id = params.get("sport");
  const root = document.getElementById("sportDetail");

  const BADGE_LABELS = {
    sports: "Sports",
    cultural: "Cultural",
    indoor: "Indoor",
    fun: "Sports & Fun",
    finale: "Grand Finale",
  };

  function mapEmbedSrc(raw) {
    const link = (raw || "").trim();
    if (!link) return "";
    if (link.includes("/maps/embed") || link.includes("google.com/maps/embed")) return link;
    try {
      const u = new URL(link);
      const host = u.hostname.toLowerCase();
      if (!host.includes("google")) return link;
      if (u.pathname.includes("/maps/place/")) {
        const place = decodeURIComponent(u.pathname.split("/maps/place/")[1] || "").split("/")[0];
        if (place) return `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;
      }
      const q = u.searchParams.get("q") || u.searchParams.get("query");
      if (q) return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
      if (u.searchParams.get("mid")) return `${link}${link.includes("?") ? "&" : "?"}output=embed`;
      return `${link}${link.includes("?") ? "&" : "?"}output=embed`;
    } catch (_) {
      return link;
    }
  }

  function errBlock(msg) {
    return `<section class="phero"><div class="wrap"><div class="empty">${msg} <a class="accent" href="/sports">Back to sports →</a></div></div></section>`;
  }
  function placeLine(row, place) {
    const team = row[`${place}_team`] || "";
    const player = row[`${place}_player`] || "";
    const value = [team, player].filter(Boolean).join(" · ");
    return value ? CARNIVAL.esc(value) : "—";
  }

  function resultsBlock(results) {
    if (!Array.isArray(results) || !results.length) return "";
    return `<div class="card detailcard detailcard--wide reveal in">
      <div class="detailcard__label">Result</div>
      <div class="event-results">
        ${results.map((row) => `
          <div class="event-result">
            <div class="event-result__cat">${CARNIVAL.esc(row.category || "Result")}</div>
            <div class="event-result__places">
              <div><span>1st</span><strong>${placeLine(row, "first")}</strong></div>
              <div><span>2nd</span><strong>${placeLine(row, "second")}</strong></div>
              <div><span>3rd</span><strong>${placeLine(row, "third")}</strong></div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>`;
  }

  if (!id) { root.innerHTML = errBlock("No event selected."); return; }

  CARNIVAL.get("/api/events/" + id).then((e) => {
    const banner = e.banner || "banner-default";
    const emoji = e.emoji || "🏆";
    const badgeKey = e.badge || "sports";
    const badgeLabel = BADGE_LABELS[badgeKey] || e.category;

    let venueBlock;
    if (e.venue_maps_link) {
      const embedUrl = mapEmbedSrc(e.venue_maps_link);
      venueBlock = `<div class="vmap"><iframe src="${embedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>`;
    } else if (e.venue && e.venue !== "TBD") {
      venueBlock = `<div class="vplace"><span class="vplace__pin">📍</span><span class="vplace__name">${CARNIVAL.esc(e.venue)}</span><span class="vplace__hint">${CARNIVAL.esc(e.location || "Marredpally, Hyderabad")}</span></div>`;
    } else {
      venueBlock = `<div class="vplace vplace--tba"><span class="vplace__name">Venue To Be Announced</span><span class="vplace__hint">Check back closer to the date</span></div>`;
    }

    let rulesBlock;
    if (e.rules && e.rules.length) {
      rulesBlock = `<ul class="rules">${e.rules.map((r) => `<li>${CARNIVAL.esc(r)}</li>`).join("")}</ul>`;
    } else {
      rulesBlock = `<div class="rules-soon"><span class="rules-soon__icon">🔜</span><span class="rules-soon__t">Rules Coming Soon</span><span class="rules-soon__s">The event rulebook will be published here before match day.</span></div>`;
    }

    const resultBadge = e.status === "completed"
      ? `<span class="badge badge--done">Completed</span>`
      : e.status === "live"
        ? `<span class="badge badge--live">Live Now</span>`
        : `<span class="badge badge--gold">Upcoming</span>`;

    const pointsHtml = e.points
      ? `<div class="detailcard reveal in">
          <div class="detailcard__label">Points</div>
          <div class="inforow"><span class="k">Winner</span><span class="v">${e.points.winner || 300} pts</span></div>
          <div class="inforow"><span class="k">Runner-up</span><span class="v">${e.points.runner_up || 150} pts</span></div>
        </div>`
      : "";

    const formatHtml = e.tournament_format
      ? `<div class="detailcard reveal in">
          <div class="detailcard__label">Tournament Format</div>
          <p class="format-summary">${CARNIVAL.esc(e.tournament_format)}</p>
        </div>`
      : "";

    const specialHtml = e.special_note
      ? `<div class="special-note reveal in">✨ ${CARNIVAL.esc(e.special_note)}</div>`
      : "";

    root.innerHTML = `
      <section class="event-hero ${banner}">
        <div class="event-hero__bg" aria-hidden="true">${emoji}</div>
        <div class="event-hero__overlay"></div>
        <div class="wrap event-hero__content">
          <a class="backlink" href="/sports">← All Events</a>
          <div class="event-hero__num eyebrow">${CARNIVAL.esc(e.num || "")} · ${CARNIVAL.esc(badgeLabel)}</div>
          <h1 class="reveal in">${CARNIVAL.esc(e.name)}</h1>
          <div class="event-hero__date reveal in">📅 ${CARNIVAL.esc(e.date)} · ${CARNIVAL.esc(e.day)} · ${resultBadge}</div>
        </div>
      </section>

      <section class="section--tight detail-section">
        <div class="wrap">
          <div class="detail-grid">
            <div class="card detailcard reveal in">
              <div class="detailcard__label">Venue</div>
              ${venueBlock}
            </div>
            <div class="card detailcard reveal in">
              <div class="detailcard__label">Date &amp; Day</div>
              <div class="info-card-value">${CARNIVAL.esc(e.date)}</div>
              <p class="info-card-sub">${CARNIVAL.esc(e.day)} · ${CARNIVAL.esc(e.event_time || "Time to be announced")} · Season: June – August 2026</p>
            </div>
            <div class="card detailcard reveal in">
              <div class="detailcard__label">Weather</div>
              <div class="weather-row">
                <span class="weather-row__icon">${e.weather_icon || "🌡"}</span>
                <div>
                  <div class="weather__temp">${CARNIVAL.esc(e.weather)}</div>
                  <p class="weather__note">${CARNIVAL.esc(e.weather_note)}</p>
                </div>
              </div>
            </div>
            <div class="card detailcard reveal in">
              <div class="detailcard__label">Category</div>
              <div class="info-card-value">${CARNIVAL.esc(e.category)}</div>
              <p class="info-card-sub">${CARNIVAL.esc(e.location || "Marredpally, Hyderabad, Telangana")}</p>
            </div>
            ${pointsHtml}
            ${formatHtml}
            ${resultsBlock(e.results)}
          </div>
          ${specialHtml}
          <div class="card detailcard detailcard--wide reveal in">
            <div class="detailcard__label">Rules &amp; Regulations</div>
            ${rulesBlock}
          </div>
          <div class="card detailcard reveal in">
            <div class="detailcard__label">Live &amp; Results</div>
            ${e.status === "live"
              ? `<p class="muted">This event is <strong class="accent">live now</strong> — follow the match on <a class="accent" href="/live">Live Scores</a>.</p>`
              : e.status === "completed"
                ? `<p class="muted">Final results are on <a class="accent" href="/live">Live &amp; Results</a> and <a class="accent" href="/standings">Standings</a>.</p>`
                : `<div class="result-soon">${resultBadge}<span>Results will appear once the event concludes.</span></div>`}
          </div>
        </div>
      </section>`;

    document.title = e.name + " · Mission Possible 2026";
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
      requestAnimationFrame(() => el.classList.add("in"));
    });
  }).catch(() => { root.innerHTML = errBlock("Event not found."); });
})();
