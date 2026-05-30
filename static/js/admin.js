/* ===================== ADMIN DASHBOARD ===================== */
(function () {
  "use strict";

  const MATCH_FORMATS = window.CARNIVAL_MATCH_FORMATS || {};
  const LIVE_INIT = window.CARNIVAL_LIVE_INIT || {};
  const RACE_EVENTS = new Set(["swimming", "sand-volleyball", "cycling", "lemon-spoon", "sack-race", "rangoli"]);
  const CRICKET_EVENTS = new Set(["cricket"]);
  let liveMatchesCache = [];

  const menu = document.getElementById("amenu");
  const sidebar = document.getElementById("asidebar");
  if (menu && sidebar) {
    menu.addEventListener("click", () => sidebar.classList.toggle("open"));
  }

  const navs = document.querySelectorAll(".anav");
  const panels = document.querySelectorAll(".apanel");
  navs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.panel;
      navs.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
      if (sidebar) sidebar.classList.remove("open");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  let toastTimer;
  window.toast = function (msg, isErr) {
    const t = document.getElementById("atoast");
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("err", !!isErr);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  };

  async function requestJSON(url, payload, method = "POST") {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || "Request failed");
    return data;
  }
  const postJSON = (url, payload) => requestJSON(url, payload, "POST");
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const numVal = (id) => { const el = document.getElementById(id); return el ? parseInt(el.value || "0", 10) : 0; };

  function fillRoundOptions(eventId, selected) {
    const sel = document.getElementById("liveRound");
    if (!sel) return;
    const rounds = (MATCH_FORMATS[eventId] && MATCH_FORMATS[eventId].rounds) || ["Match"];
    sel.innerHTML = rounds.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    if (selected && rounds.includes(selected)) sel.value = selected;
  }

  window.onLiveEventChange = function () {
    fillRoundOptions(val("liveEvent"));
    toggleLiveCustomFields();
  };

  function toggleLiveCustomFields() {
    const eventId = val("liveEvent");
    const race = document.getElementById("liveCustomRace");
    const cricket = document.getElementById("liveCustomCricket");
    if (!race || !cricket) return;
    race.classList.toggle("hide", !RACE_EVENTS.has(eventId));
    cricket.classList.toggle("hide", !CRICKET_EVENTS.has(eventId));
  }

  function liveDetailsPayload() {
    const eventId = val("liveEvent");
    if (RACE_EVENTS.has(eventId)) {
      return {
        mode: "race",
        participants: [
          {
            name: val("raceP1Name"),
            team: val("raceP1Team"),
            score: numVal("raceP1Score"),
            status: val("raceP1Status"),
          },
          {
            name: val("raceP2Name"),
            team: val("raceP2Team"),
            score: numVal("raceP2Score"),
            status: val("raceP2Status"),
          },
        ],
      };
    }
    if (CRICKET_EVENTS.has(eventId)) {
      return {
        mode: "cricket",
        batting_team: val("crBattingTeam"),
        score: val("crScore"),
        wickets: numVal("crWickets"),
        overs: val("crOvers"),
        striker: val("crStriker"),
        non_striker: val("crNonStriker"),
        bowler: val("crBowler"),
        target: val("crTarget"),
      };
    }
    return {};
  }

  function initLiveForm() {
    if (!document.getElementById("liveEvent")) return;
    if (LIVE_INIT.event_id) {
      const ev = document.getElementById("liveEvent");
      if (ev) ev.value = LIVE_INIT.event_id;
    }
    fillRoundOptions(val("liveEvent"), LIVE_INIT.round);
    if (LIVE_INIT.team_a) {
      const a = document.getElementById("liveTeamA");
      if (a) a.value = LIVE_INIT.team_a;
    }
    if (LIVE_INIT.team_b) {
      const b = document.getElementById("liveTeamB");
      if (b) b.value = LIVE_INIT.team_b;
    }
    const sa = document.getElementById("liveScoreA");
    const sb = document.getElementById("liveScoreB");
    if (sa) sa.value = LIVE_INIT.score_a != null ? LIVE_INIT.score_a : 0;
    if (sb) sb.value = LIVE_INIT.score_b != null ? LIVE_INIT.score_b : 0;
    const st = document.getElementById("liveStatus");
    if (st && LIVE_INIT.status) st.value = LIVE_INIT.status;
    toggleLiveCustomFields();
  }

  window.addAnnouncement = function () {
    const title = val("annTitle"), body = val("annBody"), tag = val("annTag");
    if (!title || !body) return toast("Title and body are required", true);
    postJSON("/admin/api/announcements/add", { title, body, tag })
      .then((d) => {
        toast("Announcement published");
        const list = document.getElementById("annExisting");
        const empty = list.querySelector(".muted"); if (empty) empty.remove();
        const row = document.createElement("div");
        row.className = "arow"; row.dataset.id = d.item.id;
        row.innerHTML = `<div><strong>${esc(d.item.title)}</strong><span class="arow__meta">${esc(d.item.tag)} · ${esc(d.item.date)}</span></div><button class="abtn-del">Delete</button>`;
        row.querySelector(".abtn-del").addEventListener("click", function () { delAnnouncement(d.item.id, this); });
        list.prepend(row);
        ["annTitle", "annBody"].forEach((id) => { const e = document.getElementById(id); if (e) e.value = ""; });
      })
      .catch((e) => toast(e.message, true));
  };

  window.delAnnouncement = function (id, btn) {
    postJSON("/admin/api/announcements/delete", { id })
      .then(() => { toast("Deleted"); const row = btn.closest(".arow"); if (row) row.remove(); })
      .catch((e) => toast(e.message, true));
  };

  window.uploadGallery = function () {
    const input = document.getElementById("galImages");
    if (!input || !input.files || !input.files.length) return toast("Select at least one image", true);
    const fd = new FormData();
    Array.from(input.files).forEach((f) => fd.append("images", f));
    fd.append("caption", val("galCaption"));
    fetch("/admin/api/gallery/upload", { method: "POST", body: fd })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || d.ok === false) throw new Error(d.error || "Upload failed");
        const list = document.getElementById("galleryExisting");
        if (!list) return;
        const empty = list.querySelector(".muted");
        if (empty) empty.remove();
        (d.items || []).forEach((item) => {
          const row = document.createElement("div");
          row.className = "arow";
          row.dataset.id = item.id;
          row.innerHTML = `<div><strong>${esc(item.caption || "Untitled image")}</strong><span class="arow__meta">${esc(item.uploaded_at || "")}</span></div><button class="abtn-del">Delete</button>`;
          row.querySelector(".abtn-del").addEventListener("click", function () { delGallery(item.id, this); });
          list.prepend(row);
        });
        input.value = "";
        const cap = document.getElementById("galCaption");
        if (cap) cap.value = "";
        toast("Gallery updated");
      })
      .catch((e) => toast(e.message, true));
  };

  window.delGallery = function (id, btn) {
    postJSON("/admin/api/gallery/delete", { id })
      .then(() => {
        const row = btn.closest(".arow");
        if (row) row.remove();
        toast("Deleted from gallery");
      })
      .catch((e) => toast(e.message, true));
  };

  window.updateLive = function () {
    const matchId = val("liveMatchId");
    const payload = {
      match_id: matchId,
      event_id: val("liveEvent"),
      status: val("liveStatus"),
      round: val("liveRound"),
      team_a: val("liveTeamA"),
      team_b: val("liveTeamB"),
      score_a: numVal("liveScoreA"),
      score_b: numVal("liveScoreB"),
      details: liveDetailsPayload(),
      append_to_live_matches: (document.getElementById("liveMultiple") && document.getElementById("liveMultiple").checked) ? true : false,
    };
    const request = matchId
      ? requestJSON(`/admin/api/live/matches/${encodeURIComponent(matchId)}`, payload, "PATCH")
      : postJSON("/admin/api/live/matches", payload);
    request
      .then(() => {
        toast(matchId ? "Match updated" : "Match added");
        loadLiveMatches();
      })
      .catch((e) => toast(e.message, true));
  };

  window.clearLiveRecord = function () {
    const eventId = val("liveEvent");
    if (!eventId) return toast("Select an event first", true);
    if (!window.confirm("Remove this match record? This clears live data and completed snapshot for the selected event.")) return;
    postJSON("/admin/api/live/clear", { event_id: eventId })
      .then(() => {
        const st = document.getElementById("liveStatus");
        const sa = document.getElementById("liveScoreA");
        const sb = document.getElementById("liveScoreB");
        if (st) st.value = "upcoming";
        if (sa) sa.value = 0;
        if (sb) sb.value = 0;
        ["raceP1Name", "raceP1Team", "raceP1Score", "raceP2Name", "raceP2Team", "raceP2Score", "crBattingTeam", "crScore", "crWickets", "crOvers", "crStriker", "crNonStriker", "crBowler", "crTarget"]
          .forEach((id) => setField(id, id.includes("Score") || id === "crWickets" ? 0 : ""));
        toast("Match record removed. You can add a new one now.");
      })
      .catch((e) => toast(e.message, true));
  };

  window.addCommentary = function () {
    const text = val("cmtText");
    if (!text) return toast("Commentary cannot be empty", true);
    postJSON("/admin/api/live/commentary", { text, match_id: val("liveMatchId"), event_id: val("liveEvent") })
      .then(() => { toast("Commentary added"); const e = document.getElementById("cmtText"); if (e) e.value = ""; })
      .catch((e) => toast(e.message, true));
  };

  window.updateStandings = function () {
    const payload = {
      entry_id: val("stEntryId"),
      team: val("stTeam"),
      event: val("stEvent"),
      points: numVal("stPoints"),
      penalty: document.getElementById("stPenalty") ? document.getElementById("stPenalty").checked : false,
      note: val("stNote"),
    };
    postJSON("/admin/api/standings/update", payload)
      .then(() => { toast("Standings updated"); clearStandingsFormInner(); loadStandingsEntries(); })
      .catch((e) => toast(e.message, true));
  };

  function clearStandingsFormInner() {
    setField("stEntryId", "");
    setField("stPoints", 0);
    setField("stNote", "");
    const pen = document.getElementById("stPenalty");
    if (pen) pen.checked = false;
  }
  window.clearStandingsForm = clearStandingsFormInner;

  function loadStandingsEntries() {
    const wrap = document.getElementById("stEntries");
    if (!wrap) return;
    fetch("/admin/api/standings/entries?ts=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const rows = ((data && data.rows) || []).map((r) => ({
          id: r.id || "",
          team_id: r.team_id || "",
          team_name: r.team_name || "",
          event: r.event || "",
          points: Number(r.points || 0),
          type: r.type || (Number(r.points || 0) < 0 ? "penalty" : "points"),
          note: r.note || "",
        }));
        rows.reverse();
        wrap.innerHTML = rows.length ? rows.map((r) => `
          <div class="arow">
            <div>
              <strong>${esc(r.team_name)} · ${esc(r.event || "Event")}</strong>
              <span class="arow__meta">${r.type === "penalty" ? "Penalty" : "Points"} · ${r.points > 0 ? "+" : ""}${r.points}${r.note ? " · " + esc(r.note) : ""}</span>
            </div>
            <div class="abtn-row">
              <button class="abtn-del" data-action="st-edit" data-id="${esc(r.id)}">Edit</button>
              <button class="abtn-del" data-action="st-del" data-id="${esc(r.id)}">Delete</button>
            </div>
          </div>
        `).join("") : '<div class="muted">No points entries yet.</div>';

        wrap.querySelectorAll('[data-action="st-edit"]').forEach((btn) => {
          btn.addEventListener("click", () => {
            const row = rows.find((x) => x.id === btn.dataset.id);
            if (!row) return;
            setField("stEntryId", row.id);
            setField("stTeam", row.team_id);
            setField("stEvent", row.event);
            setField("stPoints", Math.abs(Number(row.points || 0)));
            setField("stNote", row.note || "");
            const pen = document.getElementById("stPenalty");
            if (pen) pen.checked = ((row.type || "").toLowerCase() === "penalty") || Number(row.points || 0) < 0;
          });
        });
        wrap.querySelectorAll('[data-action="st-del"]').forEach((btn) => {
          btn.addEventListener("click", () => window.deleteStandingsEntry(btn.dataset.id || ""));
        });
      })
      .catch(() => {
        wrap.innerHTML = '<div class="muted">Could not load points entries.</div>';
      });
  }

  window.deleteStandingsEntry = function (entryId) {
    if (!entryId) return;
    if (!window.confirm("Delete this points entry?")) return;
    postJSON("/admin/api/standings/delete-entry", { entry_id: entryId })
      .then(() => {
        if (val("stEntryId") === entryId) clearStandingsFormInner();
        loadStandingsEntries();
        toast("Points entry deleted");
      })
      .catch((e) => toast(e.message, true));
  };

  window.saveYouTubeLive = function () {
    const youtube_live_url = val("ytLiveUrl");
    postJSON("/admin/api/settings/youtube", { youtube_live_url })
      .then(() => toast("YouTube Live link saved"))
      .catch((e) => toast(e.message, true));
  };

  window.saveMedals = function () {
    const payload = {
      team: val("mdTeam"),
      gold: numVal("mdGold"),
      silver: numVal("mdSilver"),
      bronze: numVal("mdBronze"),
    };
    postJSON("/admin/api/standings/medals", payload)
      .then(() => toast("Medals saved"))
      .catch((e) => toast(e.message, true));
  };

  function sortOverallMvp(rows) {
    return (rows || []).slice().sort((a, b) =>
      (Number(b.points || 0) - Number(a.points || 0)) ||
      (Number(b.gold || 0) - Number(a.gold || 0)) ||
      (Number(b.silver || 0) - Number(a.silver || 0)) ||
      String(a.player_name || "").localeCompare(String(b.player_name || ""))
    );
  }

  function sortFairPlay(rows) {
    return (rows || []).slice().sort((a, b) =>
      (Number(b.fair_play_points || 0) - Number(a.fair_play_points || 0)) ||
      String(a.team_name || "").localeCompare(String(b.team_name || ""))
    );
  }

  function clearOverallMvpFormInner() {
    setField("ovmvpId", "");
    setField("ovmvpPlayer", "");
    setField("ovmvpTeam", "");
    setField("ovmvpGold", 0);
    setField("ovmvpSilver", 0);
    setField("ovmvpPoints", 0);
  }

  function clearFairPlayFormInner() {
    setField("fairPlayId", "");
    setField("fairPlayTeam", "");
    setField("fairPlayPoints", 0);
  }

  window.clearOverallMvpForm = clearOverallMvpFormInner;
  window.clearFairPlayForm = clearFairPlayFormInner;

  function renderAwardBoardRows(payload) {
    const overallRows = sortOverallMvp((payload && payload.overall_mvp) || []);
    const fairRows = sortFairPlay((payload && payload.fair_play) || []);
    const overallWrap = document.getElementById("ovmvpRows");
    const fairWrap = document.getElementById("fairPlayRows");

    if (overallWrap) {
      overallWrap.innerHTML = overallRows.length ? overallRows.map((row) => `
        <div class="arow">
          <div>
            <strong>${esc(row.player_name || "—")}</strong>
            <span class="arow__meta">${esc(row.team_name || "—")} · G ${Number(row.gold || 0)} · S ${Number(row.silver || 0)} · P ${Number(row.points || 0)}</span>
          </div>
          <div class="abtn-row">
            <button class="abtn-del" data-action="edit-overall" data-id="${esc(row.id || "")}">Edit</button>
            <button class="abtn-del" data-action="del-overall" data-id="${esc(row.id || "")}">Delete</button>
          </div>
        </div>
      `).join("") : '<div class="muted">No Overall MVP rows yet.</div>';
    }
    if (fairWrap) {
      fairWrap.innerHTML = fairRows.length ? fairRows.map((row) => `
        <div class="arow">
          <div>
            <strong>${esc(row.team_name || "—")}</strong>
            <span class="arow__meta">Fair play points: ${Number(row.fair_play_points || 0)}</span>
          </div>
          <div class="abtn-row">
            <button class="abtn-del" data-action="edit-fair" data-id="${esc(row.id || "")}">Edit</button>
            <button class="abtn-del" data-action="del-fair" data-id="${esc(row.id || "")}">Delete</button>
          </div>
        </div>
      `).join("") : '<div class="muted">No Fair Play rows yet.</div>';
    }

    if (overallWrap) {
      overallWrap.querySelectorAll('[data-action="edit-overall"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = overallRows.find((r) => r.id === btn.dataset.id);
          if (!row) return;
          setField("ovmvpId", row.id || "");
          setField("ovmvpPlayer", row.player_name || "");
          setField("ovmvpTeam", row.team_name || "");
          setField("ovmvpGold", Number(row.gold || 0));
          setField("ovmvpSilver", Number(row.silver || 0));
          setField("ovmvpPoints", Number(row.points || 0));
        });
      });
      overallWrap.querySelectorAll('[data-action="del-overall"]').forEach((btn) => {
        btn.addEventListener("click", () => window.deleteAwardLeaderboardRow("overall_mvp", btn.dataset.id || ""));
      });
    }

    if (fairWrap) {
      fairWrap.querySelectorAll('[data-action="edit-fair"]').forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = fairRows.find((r) => r.id === btn.dataset.id);
          if (!row) return;
          setField("fairPlayId", row.id || "");
          setField("fairPlayTeam", row.team_name || "");
          setField("fairPlayPoints", Number(row.fair_play_points || 0));
        });
      });
      fairWrap.querySelectorAll('[data-action="del-fair"]').forEach((btn) => {
        btn.addEventListener("click", () => window.deleteAwardLeaderboardRow("fair_play", btn.dataset.id || ""));
      });
    }
  }

  function loadAwardLeaderboards() {
    fetch("/api/award-leaderboards?ts=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => renderAwardBoardRows(data || { overall_mvp: [], fair_play: [] }))
      .catch(() => {});
  }

  window.saveOverallMvpRow = function () {
    const payload = {
      board: "overall_mvp",
      id: val("ovmvpId"),
      player_name: val("ovmvpPlayer"),
      team_name: val("ovmvpTeam"),
      gold: numVal("ovmvpGold"),
      silver: numVal("ovmvpSilver"),
      points: numVal("ovmvpPoints"),
    };
    if (!payload.player_name || !payload.team_name) return toast("Player and team are required", true);
    postJSON("/admin/api/award-leaderboards/upsert", payload)
      .then((d) => {
        renderAwardBoardRows(d.leaderboards || { overall_mvp: [], fair_play: [] });
        clearOverallMvpFormInner();
        toast("Overall MVP row saved");
      })
      .catch((e) => toast(e.message, true));
  };

  window.saveFairPlayRow = function () {
    const payload = {
      board: "fair_play",
      id: val("fairPlayId"),
      team_name: val("fairPlayTeam"),
      fair_play_points: numVal("fairPlayPoints"),
    };
    if (!payload.team_name) return toast("Team name is required", true);
    postJSON("/admin/api/award-leaderboards/upsert", payload)
      .then((d) => {
        renderAwardBoardRows(d.leaderboards || { overall_mvp: [], fair_play: [] });
        clearFairPlayFormInner();
        toast("Fair Play row saved");
      })
      .catch((e) => toast(e.message, true));
  };

  window.deleteAwardLeaderboardRow = function (board, id) {
    if (!id || !board) return;
    if (!window.confirm("Delete this row?")) return;
    postJSON("/admin/api/award-leaderboards/delete", { board, id })
      .then((d) => {
        renderAwardBoardRows(d.leaderboards || { overall_mvp: [], fair_play: [] });
        if (board === "overall_mvp" && val("ovmvpId") === id) clearOverallMvpFormInner();
        if (board === "fair_play" && val("fairPlayId") === id) clearFairPlayFormInner();
        toast("Row deleted");
      })
      .catch((e) => toast(e.message, true));
  };

  window.setEventMvp = function () {
    const player = val("mvpPlayer");
    if (!player) return toast("Player name required", true);
    postJSON("/admin/api/awards/update", { kind: "event_mvp", event_id: val("mvpEvent"), player, team: val("mvpTeam"), image: val("mvpImage") })
      .then(() => toast("Event MVP saved"))
      .catch((e) => toast(e.message, true));
  };
  window.setBestPlayer = function () {
    const player = val("bpPlayer");
    if (!player) return toast("Player name required", true);
    postJSON("/admin/api/awards/update", { kind: "best_player", player, team: val("bpTeam"), image: val("bpImage") })
      .then(() => toast("Best player saved"))
      .catch((e) => toast(e.message, true));
  };
  window.setBestTeam = function () {
    postJSON("/admin/api/awards/update", { kind: "best_team", team: val("btTeam") })
      .then(() => toast("Best team saved"))
      .catch((e) => toast(e.message, true));
  };
  window.setFairPlay = function () {
    postJSON("/admin/api/awards/update", { kind: "fair_play", team: val("fpTeam") })
      .then(() => toast("Fair play award saved"))
      .catch((e) => toast(e.message, true));
  };

  window.toggleChampionType = function () {
    const type = val("chType") || "team";
    const teamBlock = document.getElementById("chTeamBlock");
    const individualBlock = document.getElementById("chIndividualBlock");
    if (teamBlock) teamBlock.classList.toggle("hide", type !== "team");
    if (individualBlock) individualBlock.classList.toggle("hide", type !== "individual");
  };

  function renderChampionsList(rows) {
    const list = document.getElementById("championsExisting");
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML = '<div class="muted">No champions added yet.</div>';
      return;
    }
    list.innerHTML = rows.map((c) => `
      <div class="arow" data-id="${esc(c.event_id)}">
        <div>
          <strong>${esc(c.event_name || c.event_id)}</strong>
          <span class="arow__meta">${esc(c.champion_type || "")}${c.sport_category ? " · " + esc(c.sport_category) : ""}</span>
        </div>
      </div>`).join("");
  }

  function loadChampionsList() {
    fetch("/api/champions?ts=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((rows) => renderChampionsList(rows || []))
      .catch(() => {});
  }

  window.loadChampionRow = function () {
    const id = val("chEvent");
    fetch("/api/champions?ts=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((rows) => {
        const row = (rows || []).find((x) => x.event_id === id) || {};
        setField("chCategory", row.sport_category || "");
        setField("chType", row.champion_type || "team");
        window.toggleChampionType();
        setField("chTeam", row.team || "");
        setField("chTeamName", row.team_name || "");
        setField("chSecondTeam", row.second_team || "");
        setField("chSecondTeamName", row.second_team_name || "");
        setField("chPlayers", (row.players || []).join("\n"));
        setField("chPlayerName", row.player_name || "");
        setField("chIndTeam", row.team || "");
        setField("chIndTeamName", row.team_name || "");
        setField("chSecondPlayerName", row.second_player_name || "");
        setField("chSecondIndTeam", row.second_team || "");
        setField("chSecondIndTeamName", row.second_team_name || "");
      })
      .catch(() => {});
  };

  window.saveChampion = function () {
    const champion_type = val("chType") || "team";
    const payload = {
      event_id: val("chEvent"),
      sport_category: val("chCategory"),
      champion_type,
      team: champion_type === "team" ? val("chTeam") : val("chIndTeam"),
      team_name: champion_type === "team" ? val("chTeamName") : val("chIndTeamName"),
      second_team: champion_type === "team" ? val("chSecondTeam") : val("chSecondIndTeam"),
      second_team_name: champion_type === "team" ? val("chSecondTeamName") : val("chSecondIndTeamName"),
      player_name: champion_type === "individual" ? val("chPlayerName") : "",
      second_player_name: champion_type === "individual" ? val("chSecondPlayerName") : "",
      players: champion_type === "team"
        ? (document.getElementById("chPlayers").value || "").split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
    };
    postJSON("/admin/api/champions/save", payload)
      .then(() => {
        toast("Champion saved");
        loadChampionsList();
        window.loadChampionRow();
      })
      .catch((e) => toast(e.message, true));
  };

  window.deleteChampion = function () {
    const event_id = val("chEvent");
    if (!event_id) return;
    if (!window.confirm("Delete champion entry for this event?")) return;
    postJSON("/admin/api/champions/delete", { event_id })
      .then(() => {
        toast("Champion deleted");
        ["chCategory", "chTeam", "chTeamName", "chSecondTeam", "chSecondTeamName", "chPlayers", "chPlayerName", "chIndTeam", "chIndTeamName", "chSecondPlayerName", "chSecondIndTeam", "chSecondIndTeamName"].forEach((id) => setField(id, ""));
        loadChampionsList();
      })
      .catch((e) => toast(e.message, true));
  };
  window.clearAwards = function () {
    if (!window.confirm("Clear all awards data?")) return;
    postJSON("/admin/api/awards/update", { kind: "clear_all" })
      .then(() => {
        ["mvpPlayer", "mvpImage", "bpPlayer", "bpImage"].forEach((id) => setField(id, ""));
        toast("All awards cleared");
      })
      .catch((e) => toast(e.message, true));
  };

  function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : value;
  }

  window.loadEventDetails = function () {
    const id = val("evEvent");
    if (!id) return;
    fetch("/api/events/" + id)
      .then((r) => r.json())
      .then((e) => {
        setField("evName", e.name);
        setField("evNum", e.num);
        setField("evEmoji", e.emoji);
        setField("evCategory", e.category);
        setField("evDate", e.date);
        setField("evDay", e.day);
        setField("evTime", e.event_time || "");
        setField("evIsoDate", e.iso_date || "");
        setField("evVenue", e.venue);
        setField("evLocation", e.location);
        setField("evMaps", e.venue_maps_link);
        setField("evWeather", e.weather);
        setField("evWeatherIcon", e.weather_icon);
        setField("evWeatherNote", e.weather_note);
        setField("evTournamentFormat", e.tournament_format);
        const badge = document.getElementById("evBadge");
        if (badge && e.badge) badge.value = e.badge;
        const status = document.getElementById("evStatus");
        if (status && e.status) status.value = e.status;
        const banner = document.getElementById("evBanner");
        if (banner && e.banner) banner.value = e.banner;
        const pts = e.points || {};
        setField("evWinnerPts", pts.winner != null ? pts.winner : 300);
        setField("evRunnerPts", pts.runner_up != null ? pts.runner_up : 150);
      })
      .catch(() => toast("Could not load event", true));
  };

  window.saveEventDetails = function () {
    const name = val("evName");
    if (!name) return toast("Event name is required", true);
    const payload = {
      event_id: val("evEvent"),
      name,
      num: val("evNum"),
      emoji: val("evEmoji"),
      category: val("evCategory"),
      date: val("evDate"),
      day: val("evDay"),
      event_time: val("evTime"),
      iso_date: val("evIsoDate"),
      badge: val("evBadge"),
      status: val("evStatus"),
      banner: val("evBanner"),
      venue: val("evVenue"),
      location: val("evLocation"),
      venue_maps_link: val("evMaps"),
      weather: val("evWeather"),
      weather_icon: val("evWeatherIcon"),
      weather_note: val("evWeatherNote"),
      tournament_format: val("evTournamentFormat"),
      winner_points: numVal("evWinnerPts"),
      runner_up_points: numVal("evRunnerPts"),
    };
    postJSON("/admin/api/events/update", payload)
      .then(() => toast("Event details saved"))
      .catch((e) => toast(e.message, true));
  };

  window.loadRules = function () {
    const id = val("ruleEvent");
    if (!id) return;
    fetch("/api/events/" + id)
      .then((r) => r.json())
      .then((e) => { const t = document.getElementById("ruleText"); if (t) t.value = (e.rules || []).join("\n"); })
      .catch(() => {});
  };
  window.saveRules = function () {
    const id = val("ruleEvent");
    const lines = (document.getElementById("ruleText").value || "").split("\n").map((s) => s.trim()).filter(Boolean);
    postJSON("/admin/api/events/rules", { event_id: id, rules: lines })
      .then((d) => toast("Rules saved (" + d.rules.length + ")"))
      .catch((e) => toast(e.message, true));
  };

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  // ===== Player Tracker =====
  function trackerTeamLabels() {
    const select = document.getElementById("ptTeam");
    const labels = {};
    if (!select) return labels;
    Array.from(select.options).forEach((opt) => {
      labels[opt.value] = opt.textContent || opt.value;
    });
    return labels;
  }

  function normalizedPlayed(player) {
    const raw = Array.isArray(player.played) ? player.played : [];
    return Array.from({ length: 5 }, (_, idx) => Boolean(raw[idx]));
  }

  function normalizedGames(player) {
    const raw = Array.isArray(player.games) ? player.games : [];
    return Array.from({ length: 5 }, (_, idx) => String(raw[idx] || ""));
  }

  function renderAdminPlayerTracker(tracker) {
    const wrap = document.getElementById("ptExisting");
    if (!wrap) return;
    const labels = trackerTeamLabels();
    const teams = (tracker && tracker.teams) || {};
    const teamIds = Object.keys(labels).length ? Object.keys(labels) : Object.keys(teams);

    wrap.innerHTML = teamIds.map((teamId) => {
      const players = Array.isArray(teams[teamId]) ? teams[teamId] : [];
      const rows = players.length ? players.map((player) => {
        const played = normalizedPlayed(player);
        const games = normalizedGames(player);
        const count = played.filter(Boolean).length;
        const complete = count >= 5;
        return `
          <div class="ptrow ${complete ? "ptrow--complete" : ""}" data-player-id="${esc(player.id)}">
            <button class="ptrow__head" type="button" onclick="this.closest('.ptrow').classList.toggle('open')">
              <span>
                <strong>${esc(player.name || "Unnamed player")}</strong>
                <span class="arow__meta">${esc(player.employee_id || "-")} · ${esc(player.department || "-")}</span>
              </span>
              <span class="ptrow__count">${count}/5</span>
            </button>
            <div class="ptrow__games">
              ${played.map((checked, idx) => `
                <div class="ptcheck">
                  <label>
                    <input type="checkbox" ${checked ? "checked" : ""} onchange="updatePlayerTrackerSlot('${esc(teamId)}', '${esc(player.id)}', ${idx}, this.checked, this.closest('.ptcheck').querySelector('.ptgame-input').value)">
                    <span>Game ${idx + 1}</span>
                  </label>
                  <input class="ptgame-input" value="${esc(games[idx])}" placeholder="Type game played" onblur="updatePlayerTrackerSlot('${esc(teamId)}', '${esc(player.id)}', ${idx}, this.closest('.ptcheck').querySelector('input[type=checkbox]').checked, this.value)">
                </div>
              `).join("")}
              <button class="ptremove" type="button" onclick="deletePlayerTrackerEmployee('${esc(teamId)}', '${esc(player.id)}', '${esc(player.name || "this player")}')">Remove employee</button>
            </div>
          </div>
        `;
      }).join("") : '<div class="muted">No players added yet.</div>';

      return `
        <div class="ptteam">
          <div class="ptteam__head">
            <strong>${esc(labels[teamId] || teamId)}</strong>
            <span>${players.length} player${players.length === 1 ? "" : "s"}</span>
          </div>
          <div class="ptteam__body">${rows}</div>
        </div>
      `;
    }).join("") || '<div class="muted">No teams available.</div>';
  }

  function loadPlayerTracker() {
    const wrap = document.getElementById("ptExisting");
    if (!wrap) return;
    fetch("/admin/api/player-tracker?ts=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => renderAdminPlayerTracker((data && data.tracker) || { teams: {} }))
      .catch(() => { wrap.innerHTML = '<div class="muted">Could not load player tracker data.</div>'; });
  }

  window.addPlayerTrackerBulk = function () {
    const team = val("ptTeam");
    const bulk = document.getElementById("ptBulkInput");
    const lines = (bulk && bulk.value ? bulk.value : "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!team) return toast("Select a team", true);
    if (!lines.length) return toast("Paste at least one player", true);

    postJSON("/admin/api/player-tracker/bulk-add", { team, lines })
      .then((data) => {
        toast(`${data.added || 0} player${data.added === 1 ? "" : "s"} saved`);
        if (bulk) bulk.value = "";
        renderAdminPlayerTracker(data.tracker || { teams: {} });
      })
      .catch((e) => toast(e.message, true));
  };

  window.clearPlayerTrackerForm = function () {
    const bulk = document.getElementById("ptBulkInput");
    if (bulk) bulk.value = "";
  };

  window.updatePlayerTrackerSlot = function (team, playerId, index, checked, game) {
    postJSON("/admin/api/player-tracker/update-played", {
      team,
      player_id: playerId,
      index,
      checked,
      game,
    })
      .then(() => {
        toast("Player tracker updated");
        loadPlayerTracker();
      })
      .catch((e) => {
        toast(e.message, true);
        loadPlayerTracker();
      });
  };

  window.deletePlayerTrackerEmployee = function (team, playerId, name) {
    if (!window.confirm(`Remove ${name} from this team tracker?`)) return;
    postJSON("/admin/api/player-tracker/delete", { team, player_id: playerId })
      .then((data) => {
        toast("Employee removed");
        renderAdminPlayerTracker(data.tracker || { teams: {} });
      })
      .catch((e) => toast(e.message, true));
  };

  // ===== Comprehensive Live Matches Management =====
  window.switchLiveTab = function(tabName) {
    // Hide all tabs
    document.querySelectorAll(".live-tab-content").forEach(tab => tab.style.display = "none");
    document.querySelectorAll(".live-tab").forEach(btn => btn.classList.remove("active"));
    
    // Show selected tab
    const contentId = "liveTab" + (tabName.charAt(0).toUpperCase() + tabName.slice(1));
    const contentEl = document.getElementById(contentId);
    if (contentEl) contentEl.style.display = "block";
    
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add("active");
    
    // Load matches if needed
    if (["upcoming", "live", "completed"].includes(tabName)) {
      loadLiveMatches(tabName);
    }
  };

  function loadLiveMatches() {
    fetch("/admin/api/live/matches?ts=" + Date.now(), { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          liveMatchesCache = data.matches || [];
          renderLiveMatches(data.matches || []);
        }
      })
      .catch(e => console.error("Failed to load matches:", e));
  }

  function renderLiveMatches(matches) {
    const upcomingEl = document.getElementById("matchesUpcoming");
    const liveEl = document.getElementById("matchesLive");
    const completedEl = document.getElementById("matchesCompleted");
    
    const upcoming = matches.filter(m => m.status === "upcoming");
    const live = matches.filter(m => m.status === "live");
    const completed = matches.filter(m => m.status === "completed");
    
    if (upcomingEl) upcomingEl.innerHTML = renderMatchCards(upcoming);
    if (liveEl) liveEl.innerHTML = renderMatchCards(live);
    if (completedEl) completedEl.innerHTML = renderMatchCards(completed);
  }

  function renderMatchCards(matches) {
    if (!matches || matches.length === 0) {
      return '<div class="muted">No matches</div>';
    }
    
    return matches.map(m => {
      const teamA = m.team_a_name || m.team_a || "TBD";
      const teamB = m.team_b_name || m.team_b || "TBD";
      const scoreDisplay = m.score_a != null && m.score_b != null ? `${m.score_a} - ${m.score_b}` : "—";
      const badgeColor = m.status === "live" ? "#ff4444" : (m.status === "completed" ? "#44aa44" : "#d4af37");
      
      return `
        <div class="match-card" style="border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; background: linear-gradient(135deg, rgba(212,175,55,0.04), rgba(212,175,55,0.01)); position: relative;">
          <div style="position: absolute; top: 8px; right: 12px; font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 10px; background: ${badgeColor}; color: white; border-radius: 6px; font-weight: 700;">${esc(m.status)}</div>
          <div style="display: grid; gap: 10px;">
            <div>
              <div style="font-size: 0.75rem; color: var(--muted); letter-spacing: 0.08em; margin-bottom: 4px;">${esc(m.event_name || "—")}</div>
              <div style="font-family: var(--f-head); font-weight: 700; font-size: 1.1rem;">${esc(teamA)} <span style="color: var(--gold);">${scoreDisplay}</span> ${esc(teamB)}</div>
              <div style="font-size: 0.82rem; color: var(--muted); margin-top: 6px;">${esc(m.round || "")} ${m.commentary && m.commentary.length ? "·  " + m.commentary.length + " updates" : ""}</div>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="match-action" onclick="editMatch('${esc(m.match_id)}')">Edit</button>
              <button class="match-action" onclick="quickUpdateMatch('${esc(m.match_id)}')">Score</button>
              ${statusButtons(m)}
              <button class="match-action match-action--danger" onclick="deleteMatch('${esc(m.match_id)}')">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function statusButtons(match) {
    return ["upcoming", "live", "completed"]
      .filter((status) => status !== match.status)
      .map((status) => `<button class="match-action" onclick="moveMatchStatus('${esc(match.match_id)}', '${status}')">${statusLabel(status)}</button>`)
      .join("");
  }

  function statusLabel(status) {
    return status === "live" ? "Set Live" : (status === "completed" ? "Complete" : "Reopen");
  }

  window.deleteMatch = function(matchId) {
    if (!window.confirm("Delete this match?")) return;
    requestJSON(`/admin/api/live/matches/${encodeURIComponent(matchId)}`, {}, "DELETE")
      .then(() => {
        toast("Match deleted");
        loadLiveMatches();
      })
      .catch(e => toast(e.message, true));
  };

  window.moveMatchStatus = function(matchId, newStatus) {
    requestJSON(`/admin/api/live/matches/${encodeURIComponent(matchId)}/status`, { status: newStatus }, "PATCH")
      .then(() => {
        toast(`Match moved to ${newStatus}`);
        loadLiveMatches();
      })
      .catch(e => toast(e.message, true));
  };

  window.quickUpdateMatch = function(matchId) {
    const scoreA = prompt("Score for Team A:", "0");
    if (scoreA === null) return;
    const scoreB = prompt("Score for Team B:", "0");
    if (scoreB === null) return;
    
    postJSON("/admin/api/live/quick-update", { 
      match_id: matchId, 
      score_a: parseInt(scoreA) || 0, 
      score_b: parseInt(scoreB) || 0 
    })
      .then(() => {
        toast("Scores updated");
        loadLiveMatches();
      })
      .catch(e => toast(e.message, true));
  };

  window.editMatch = function(matchId) {
    const match = liveMatchesCache.find((m) => m.match_id === matchId);
    if (!match) return toast("Could not find match", true);
    setField("liveMatchId", match.match_id || "");
    setField("liveEvent", match.event_id || "");
    fillRoundOptions(match.event_id || val("liveEvent"), match.round || "");
    setField("liveStatus", match.status || "upcoming");
    setField("liveTeamA", match.team_a || "");
    setField("liveTeamB", match.team_b || "");
    setField("liveScoreA", match.score_a != null ? match.score_a : 0);
    setField("liveScoreB", match.score_b != null ? match.score_b : 0);
    hydrateLiveDetails(match.details || {});
    toggleLiveCustomFields();
    switchLiveTab("manage");
    toast("Match loaded for editing");
  };

  function hydrateLiveDetails(details) {
    ["raceP1Name", "raceP1Team", "raceP1Score", "raceP1Status", "raceP2Name", "raceP2Team", "raceP2Score", "raceP2Status", "crBattingTeam", "crScore", "crWickets", "crOvers", "crStriker", "crNonStriker", "crBowler", "crTarget"]
      .forEach((id) => setField(id, id.includes("Score") || id === "crWickets" ? 0 : ""));
    if (details.mode === "race") {
      const p = details.participants || [];
      setField("raceP1Name", p[0]?.name || "");
      setField("raceP1Team", p[0]?.team || "");
      setField("raceP1Score", p[0]?.score || 0);
      setField("raceP1Status", p[0]?.status || "leading");
      setField("raceP2Name", p[1]?.name || "");
      setField("raceP2Team", p[1]?.team || "");
      setField("raceP2Score", p[1]?.score || 0);
      setField("raceP2Status", p[1]?.status || "trailing");
    }
    if (details.mode === "cricket") {
      setField("crBattingTeam", details.batting_team || "");
      setField("crScore", details.score || "");
      setField("crWickets", details.wickets || 0);
      setField("crOvers", details.overs || "");
      setField("crStriker", details.striker || "");
      setField("crNonStriker", details.non_striker || "");
      setField("crBowler", details.bowler || "");
      setField("crTarget", details.target || "");
    }
  }

  window.clearLiveForm = function() {
    setField("liveMatchId", "");
    const eventSelect = document.getElementById("liveEvent");
    if (eventSelect) eventSelect.selectedIndex = 0;
    setField("liveRound", "");
    setField("liveStatus", "live");
    setField("liveTeamA", "");
    setField("liveTeamB", "");
    setField("liveScoreA", "0");
    setField("liveScoreB", "0");
    setField("raceP1Name", "");
    setField("raceP2Name", "");
    setField("raceP1Score", "0");
    setField("raceP2Score", "0");
    setField("crBattingTeam", "");
    setField("crScore", "");
    setField("crWickets", "0");
    setField("crOvers", "");
    onLiveEventChange();
  };

  // Initialize live matches on load
  function initLiveMatches() {
    const livePanel = document.querySelector('[data-panel="live"]');
    if (livePanel) {
      // Load matches when tab becomes active
      loadLiveMatches();
      // Refresh every 10 seconds
      setInterval(() => {
        const activeTab = document.querySelector(".live-tab.active");
        if (activeTab) {
          const status = activeTab.dataset.tab;
          if (["upcoming", "live", "completed"].includes(status)) {
            loadLiveMatches(status);
          }
        }
      }, 10000);
    }
  }

  initLiveForm();
  initLiveMatches();
  if (document.getElementById("evEvent")) loadEventDetails();
  if (document.getElementById("ruleEvent")) loadRules();
  if (document.getElementById("chEvent")) { window.toggleChampionType(); loadChampionsList(); window.loadChampionRow(); }
  if (document.getElementById("stEntries")) loadStandingsEntries();
  if (document.getElementById("ptExisting")) loadPlayerTracker();
  if (document.getElementById("ovmvpRows") || document.getElementById("fairPlayRows")) loadAwardLeaderboards();
})();
