/* ===================== HOME PAGE ===================== */
(function () {
  "use strict";

  /* ---- Countdown to next event (auto-rotates) ---- */
  const cd = document.getElementById("countdown");
  const cdCaption = document.querySelector(".countdown__caption");
  let homeEvents = [];

  function setCountdownValues(d, h, m, s) {
    const set = (u, v) => {
      const el = cd && cd.querySelector(`[data-u="${u}"]`);
      if (el) el.textContent = String(Math.max(0, v)).padStart(2, "0");
    };
    set("d", d);
    set("h", h);
    set("m", m);
    set("s", s);
  }

  function istYmd(now) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now || new Date());
      const yPart = parts.find(function (p) { return p.type === "year"; });
      const mPart = parts.find(function (p) { return p.type === "month"; });
      const dPart = parts.find(function (p) { return p.type === "day"; });
      const y = yPart && yPart.value ? yPart.value : "0000";
      const mo = mPart && mPart.value ? mPart.value : "00";
      const d = dPart && dPart.value ? dPart.value : "00";
      return `${y}-${mo}-${d}`;
    } catch (err) {
      const fallback = now || new Date();
      const y = fallback.getFullYear();
      const mo = String(fallback.getMonth() + 1).padStart(2, "0");
      const d = String(fallback.getDate()).padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
  }

  function nextEvent(events, todayYmd) {
    return (events || [])
      .filter((e) => e && e.iso_date)
      .sort((a, b) => String(a.iso_date).localeCompare(String(b.iso_date)))
      .find((e) => String(e.iso_date) >= todayYmd) || null;
  }

  function formatCaption(event) {
    if (!event) return "Season is live. New event schedule coming soon.";
    return `${event.name} \u00b7 ${event.venue || "Venue TBA"} \u00b7 ${event.date || event.iso_date}`;
  }

  function tickHomeCountdown() {
    const now = new Date();
    const todayYmd = istYmd(now);
    const event = nextEvent(homeEvents, todayYmd);
    if (!event) {
      setCountdownValues(0, 0, 0, 0);
      if (cdCaption) cdCaption.textContent = formatCaption(null);
      return;
    }

    const eventStartMs = new Date(`${event.iso_date}T09:00:00+05:30`).getTime();
    const diff = eventStartMs - Date.now();
    const isEventDay = String(event.iso_date) === todayYmd;

    if (isEventDay && diff <= 0) {
      setCountdownValues(0, 0, 0, 0);
      if (cdCaption) cdCaption.textContent = `It's Game Time \u00b7 ${formatCaption(event)}`;
      return;
    }

    const safeDiff = Math.max(0, diff);
    const d = Math.floor(safeDiff / 86400000);
    const h = Math.floor((safeDiff % 86400000) / 3600000);
    const m = Math.floor((safeDiff % 3600000) / 60000);
    const s = Math.floor((safeDiff % 60000) / 1000);
    setCountdownValues(d, h, m, s);
    if (cdCaption) cdCaption.textContent = `Next Event \u00b7 ${formatCaption(event)}`;
  }

  CARNIVAL.get("/api/events")
    .then((events) => {
      homeEvents = Array.isArray(events) ? events : [];
      tickHomeCountdown();
      setInterval(tickHomeCountdown, 1000);
    })
    .catch(() => {
      setCountdownValues(0, 0, 0, 0);
      if (cdCaption) cdCaption.textContent = "Unable to load schedule right now.";
    });

  // Re-observe dynamically-added .reveal nodes
  function observeReveals(scope) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    (scope || document).querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  /* ---- Announcements ticker ---- */
  CARNIVAL.get("/api/announcements").then((items) => {
    const track = document.getElementById("tickerTrack");
    if (!track) return;
    const msgs = items.length
      ? items.map((a) => CARNIVAL.esc(a.title + " — " + a.body))
      : ["Mission Possible 2026 — season begins 4 June at YMCA with Basketball."];
    // duplicate for seamless loop
    const html = msgs.concat(msgs).map((m) => `<span class="ticker__item">${m}</span>`).join("");
    track.innerHTML = html;
  }).catch(() => {});

  /* ---- Team showcase ---- */
  CARNIVAL.get("/api/teams").then((teams) => {
    const wrap = document.getElementById("homeTeams");
    if (!wrap) return;
    wrap.innerHTML = teams.map((t, i) => `
      <a class="tcard card reveal" data-delay="${i}" href="/team-detail?team=${t.id}" style="--tc:${t.color}">
        <div class="tcard__media"><img src="${t.logo}" alt="${CARNIVAL.esc(t.name)}" loading="lazy"></div>
        <div class="tcard__body">
          <div class="tcard__name">${CARNIVAL.esc(t.name)}</div>
          <div class="tcard__company">${CARNIVAL.esc(t.company)}</div>
          <div class="tcard__meta">Head · ${CARNIVAL.esc(t.company_head)}</div>
          <div class="tcard__meta">Coordinator · ${CARNIVAL.esc(t.overall_coordinator)}</div>
          <div class="tcard__foot"><span class="go">View team →</span></div>
        </div>
      </a>`).join("");
    observeReveals(wrap);
  }).catch(() => {});

  /* ---- Next up events ---- */
  const MONTHS = { Jan:"Jan",Feb:"Feb",Mar:"Mar",Apr:"Apr",May:"May",Jun:"Jun",Jul:"Jul",Aug:"Aug",Sep:"Sep",Oct:"Oct",Nov:"Nov",Dec:"Dec" };
  function splitDate(s) {
    // "4th June 2026" -> {d:"4", m:"Jun"}
    const m = (s || "").match(/(\d+)\w*\s+(\w+)/);
    if (!m) return { d: "·", m: "" };
    return { d: m[1], m: (m[2] || "").slice(0, 3) };
  }
  CARNIVAL.get("/api/events").then((events) => {
    const wrap = document.getElementById("homeNext");
    if (!wrap) return;
    const upcoming = events.filter((e) => e.status === "upcoming").slice(0, 3);
    if (!upcoming.length) { wrap.innerHTML = '<div class="empty">No upcoming events right now.</div>'; return; }
    wrap.innerHTML = upcoming.map((e, i) => {
      const dt = splitDate(e.date);
      return `
        <a class="nextrow reveal" data-delay="${i}" href="/sport-detail?sport=${e.id}">
          <div class="nextrow__date"><div class="d">${dt.d}</div><div class="m">${dt.m}</div></div>
          <div class="nextrow__main">
            <h3>${CARNIVAL.esc(e.name)}</h3>
            <div class="sub">${CARNIVAL.esc(e.day)} · ${CARNIVAL.esc(e.venue)} · <span style="color:var(--gold)">${CARNIVAL.esc(e.category)}</span></div>
          </div>
          <div class="nextrow__arrow">→</div>
        </a>`;
    }).join("");
    observeReveals(wrap);
  }).catch(() => {});
})();
