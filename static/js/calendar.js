/* ===================== CALENDAR ===================== */
(function () {
  "use strict";

  const SEASON_START = new Date(2026, 5, 1);
  const SEASON_END = new Date(2026, 7, 31);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let events = [];
  let viewYear = 2026;
  let viewMonth = 5;

  const byDate = {};

  function parseEvents(list) {
    list.forEach((e) => {
      if (!e.iso_date) return;
      if (!byDate[e.iso_date]) byDate[e.iso_date] = [];
      byDate[e.iso_date].push(e);
    });
  }

  function eventCompleted(e, dayKey) {
    const todayKey = new Date().toISOString().slice(0, 10);
    return e.status === "completed" || (e.iso_date && e.iso_date < todayKey);
  }

  function renderMonth() {
    const grid = document.getElementById("calGrid");
    const label = document.getElementById("calMonthLabel");
    if (!grid || !label) return;

    label.textContent = MONTHS[viewMonth] + " " + viewYear;

    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    let html = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < startPad; i++) html += `<div class="cal-day cal-day--empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const evs = byDate[key] || [];
      const isToday = key === todayKey;
      const dayIsCompleted = evs.some((e) => eventCompleted(e, key));
      const evHtml = evs.map((e) =>
        `<a class="cal-day__ev${eventCompleted(e, key) ? " cal-day__ev--completed" : ""}" href="/sport-detail?sport=${e.id}" title="${CARNIVAL.esc(e.name)}">${e.emoji || ""} ${CARNIVAL.esc(e.name)}</a>`
      ).join("");
      html += `<div class="cal-day${isToday ? " cal-day--today" : ""}${evs.length ? " cal-day--has-event" : ""}${dayIsCompleted ? " cal-day--completed" : ""}">
        <span class="cal-day__num">${d}</span>${evHtml}</div>`;
    }

    grid.innerHTML = html;
    renderList();
  }

  function renderList() {
    const list = document.getElementById("calList");
    if (!list) return;
    const monthEvents = events
      .filter((e) => {
        if (!e.iso_date) return false;
        const [y, m] = e.iso_date.split("-").map(Number);
        return y === viewYear && m === viewMonth + 1;
      })
      .sort((a, b) => a.iso_date.localeCompare(b.iso_date));

    if (!monthEvents.length) {
      list.innerHTML = `<p class="muted center">No events scheduled this month.</p>`;
      return;
    }

    list.innerHTML = `<div class="ornament-line"><span>${MONTHS[viewMonth]} Events</span></div>` +
      monthEvents.map((e) => {
        const dayNum = e.iso_date.split("-")[2];
        const completed = eventCompleted(e, e.iso_date);
        return `<a class="cal-list__item${completed ? " cal-list__item--completed" : ""}" href="/sport-detail?sport=${e.id}">
          <div class="cal-list__date">${dayNum}</div>
          <div class="cal-list__body">
            <div class="cal-list__name">${e.emoji || ""} ${CARNIVAL.esc(e.name)}${completed ? " <span class=\"badge badge--done\">Completed</span>" : ""}</div>
            <div class="cal-list__meta">${CARNIVAL.esc(e.day)} · ${CARNIVAL.esc(e.venue)} · ${CARNIVAL.esc(e.category)}</div>
          </div>
          <span class="ecard__go">Details →</span>
        </a>`;
      }).join("");
  }

  document.getElementById("calPrev")?.addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    if (new Date(viewYear, viewMonth, 1) < SEASON_START) {
      viewMonth = SEASON_START.getMonth();
      viewYear = SEASON_START.getFullYear();
    }
    renderMonth();
  });

  document.getElementById("calNext")?.addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    if (new Date(viewYear, viewMonth + 1, 0) > SEASON_END) {
      viewMonth = SEASON_END.getMonth();
      viewYear = SEASON_END.getFullYear();
    }
    renderMonth();
  });

  CARNIVAL.get("/api/calendar").then((data) => {
    events = data.events || [];
    parseEvents(events);
    renderMonth();
  }).catch(() => {
    const grid = document.getElementById("calGrid");
    if (grid) grid.innerHTML = '<div class="empty">Could not load calendar.</div>';
  });
})();
