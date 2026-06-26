/* ===================== AWARDS ===================== */
(function () {
  "use strict";
  const META = {
    creators: { name: "Team Creators", color: "#D4A017", logo: "/static/images/logos/creators.png" },
    dominators: { name: "Team Dominators", color: "#800000", logo: "/static/images/logos/dominators.png" },
    royals: { name: "Team Royals", color: "#4169E1", logo: "/static/images/logos/royals.png" },
  };
  const GAME_ORDER = [
    "basketball",
    "throwball",
    "cycling",
    "tug-of-war",
    "sack-race",
    "lemon-spoon",
    "kabaddi",
    "badminton",
    "cricket",
    "table-tennis",
    "carrom",
    "sand-volleyball",
    "swimming",
    "dancing",
    "skit",
  ];
  const gameOrderIndex = (id) => {
    const idx = GAME_ORDER.indexOf(id);
    return idx === -1 ? 999 : idx;
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

  let AWARD_LEADERBOARDS = null;
  async function loadAwards() {
    const awardsResp = await fetch("/api/awards", { credentials: "same-origin" });
    if (!awardsResp.ok) throw new Error("Awards unavailable");
    const awards = await awardsResp.json();
    const events = await CARNIVAL.get("/api/events") || [];
    events.sort((a, b) => gameOrderIndex(a.id) - gameOrderIndex(b.id) || (a.iso_date || "").localeCompare(b.iso_date || ""));
    const MVP_ELIGIBLE = ['basketball','throwball','kabaddi','badminton','cricket','table-tennis','carrom','sand-volleyball','swimming','dancing','skit'];
    const mvpEvents = events.filter((e) => MVP_ELIGIBLE.includes(e.id));

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
    topHtml += `<div id="fairPlayTile">` + (fp && META[fp] ? filled("Fair Play Award", null, META[fp].name, fp) : tba("Fair Play Award", null)) + `</div>`;
    top.innerHTML = topHtml;

    // insert hidden details container for Fair Play
    let fairDetails = document.getElementById('fairPlayDetails');
    if (!fairDetails && top) {
      fairDetails = document.createElement('div');
      fairDetails.id = 'fairPlayDetails';
      fairDetails.className = 'reveal';
      fairDetails.style.display = 'none';
      top.parentNode.insertBefore(fairDetails, top.nextSibling);
    }

    const grid = document.getElementById("eventMvps");
    const mvps = awards.event_mvps || {};
    const initialGridHtml = mvpEvents.map((e) => {
      const m = mvps[e.id];
      return `<div class="reveal">${(m && m.player) ? filled("MVP", e.name, m.player, m.team, m.image) : tba("MVP", e.name)}</div>`;
    }).join("");
    grid.innerHTML = initialGridHtml;
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.08 });
    grid.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));

    // Search results container (appears when searching)
    let searchResults = document.getElementById('awardsSearchResults');
    if (!searchResults && grid && grid.parentNode) {
      searchResults = document.createElement('div');
      searchResults.id = 'awardsSearchResults';
      searchResults.style.marginTop = '18px';
      grid.parentNode.appendChild(searchResults);
    }
    const initialTopHtml = top.innerHTML;

    // MVP eligibility table and rules
    const eligible = (events || []).filter((e) => MVP_ELIGIBLE.includes(e.id)).map((e) => e.name);
    const notEligible = (events || []).filter((e) => !MVP_ELIGIBLE.includes(e.id)).map((e) => e.name);
    const tableEl = document.getElementById('mvpEligibilityTable');
    if (tableEl) {
      tableEl.innerHTML = `
        <div class="mvp-eligibility-wrapper">
          <div class="mvp-eligibility-grid">
            <div class="mvp-eligible-col">
              <div class="mvp-col-header mvp-eligible">✓ Eligible for MVP</div>
              <div class="mvp-col-content">
                ${eligible.map(n=>`<div class="mvp-sport-badge mvp-eligible">${CARNIVAL.esc(n)}</div>`).join('')}
              </div>
            </div>
            <div class="mvp-noteligible-col">
              <div class="mvp-col-header mvp-noteligible">✗ Not Eligible for MVP</div>
              <div class="mvp-col-content">
                ${notEligible.map(n=>`<div class="mvp-sport-badge mvp-noteligible">${CARNIVAL.esc(n)}</div>`).join('')}
              </div>
            </div>
          </div>
        </div>`;
    }

    const rulesEl = document.getElementById('mvpRules');
    if (rulesEl) {
      const rulesId = 'mvpRulesContent_' + Math.random().toString(36).substr(2, 9);
      rulesEl.innerHTML = `
        <button class="mvp-rules-toggle" style="width:100%;text-align:left;padding:16px;background:linear-gradient(135deg,rgba(212,175,55,0.08),rgba(212,175,55,0.04));border:1px solid var(--border);border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;color:var(--white);font-size:1rem;font-weight:600;transition:all .3s;margin-bottom:16px;">
          <span style="display:flex;align-items:center;gap:12px;"><span style="font-size:1.3rem;">📋</span>MVP Award Rules &amp; Regulations</span>
          <span style="font-size:1.2rem;transition:transform .3s;" class="toggle-icon">▼</span>
        </button>
        <div id="${rulesId}" class="mvp-rules-content" style="display:none;">
        <div class="detailcard">
          <p><strong>Applicable for All 3 Teams</strong></p>
          <p>The <em>Most Valuable Player (MVP) Award</em> will be awarded in the following events:</p>
          <ul>
            ${eligible.map(n=>`<li>${CARNIVAL.esc(n)}</li>`).join('')}
          </ul>
          <h4>General Rules</h4>
          <ul>
            <li>An MVP will be selected <strong>after every match/event</strong> by the referee/judging panel.</li>
            <li>The referee’s decision will be <strong>final and non-negotiable</strong>.</li>
            <li>MVP is awarded based on: Performance, Skill level, Team contribution, Sportsmanship/Fair play, Impact on the game/event.</li>
            <li>MVP can be awarded to a player from <strong>either team</strong>, not necessarily the winning team.</li>
            <li>Any player showing misconduct, abusive language, unsportsmanlike behaviour, fighting or cheating will be disqualified from MVP consideration.</li>
            <li>Only officially registered players/participants are eligible for MVP awards.</li>
          </ul>
        </div>
        </div>`;
      const toggleBtn = rulesEl.querySelector('.mvp-rules-toggle');
      const contentDiv = document.getElementById(rulesId);
      const icon = toggleBtn ? toggleBtn.querySelector('.toggle-icon') : null;
      if (toggleBtn && contentDiv) {
        toggleBtn.addEventListener('click', function(e) {
          e.preventDefault();
          const isHidden = contentDiv.style.display === 'none';
          contentDiv.style.display = isHidden ? 'block' : 'none';
          if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0)';
        });
      }
    }
    // fetch award leaderboards (fair play / overall mvp lists)
    CARNIVAL.get('/api/award-leaderboards').then((lbs) => {
      AWARD_LEADERBOARDS = lbs || { overall_mvp: [], fair_play: [] };
      const tile = document.getElementById('fairPlayTile');
      const details = document.getElementById('fairPlayDetails');
      if (tile && details && AWARD_LEADERBOARDS) {
        tile.style.cursor = 'pointer';
        tile.addEventListener('click', () => {
          if (details.style.display === 'none') {
            const rows = (AWARD_LEADERBOARDS.fair_play || []).slice().sort((a,b)=>Number(b.fair_play_points||0)-Number(a.fair_play_points||0));
            details.innerHTML = rows.length ? `<div class="detailcard"><strong>Fair Play Leaderboard</strong>${rows.map(r=>`<div class="inforow"><span class="k">${CARNIVAL.esc(r.team_name||'')}</span><span class="v">Points: ${Number(r.fair_play_points||0)} · ${CARNIVAL.esc(r.updated_at||'')}</span></div>`).join('')}</div>` : '<div class="muted">No fair play leaderboard rows available.</div>';
            details.style.display = 'block';
          } else {
            details.style.display = 'none';
          }
        });
      }
    }).catch(()=>{});
    // search input handling
    const searchInput = document.getElementById('awardsSearch');
    if (searchInput) {
      let last = '';
      searchInput.addEventListener('input', function (e) {
        const q = (e.target.value || '').trim().toLowerCase();
        if (q === last) return; last = q;
        if (!q) {
          // clear search
          searchResults.innerHTML = '';
          grid.innerHTML = initialGridHtml;
          top.innerHTML = initialTopHtml;
          grid.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
          return;
        }
        // filter event MVPs
        const evHtml = mvpEvents.map((e) => {
          const m = mvps[e.id];
          if (!m || !m.player) return '';
          const hay = ( (m.player || '') + ' ' + (m.team || '') + ' ' + (e.name || '') ).toLowerCase();
          if (hay.indexOf(q) !== -1) return `<div class="reveal">${filled('MVP', e.name, m.player, m.team, m.image)}</div>`;
          return '';
        }).filter(Boolean).join('') || '<div class="muted">No matching MVPs found.</div>';

        // filter overall MVP leaderboard (if available)
        const ovRows = (AWARD_LEADERBOARDS && AWARD_LEADERBOARDS.overall_mvp) ? AWARD_LEADERBOARDS.overall_mvp.filter(r => ((r.player_name||'') + ' ' + (r.team_name||'')).toLowerCase().indexOf(q) !== -1) : [];
        const ovHtml = ovRows.length ? `<div class="sec-label"><span class="num">★</span><span class="txt">Overall MVP Matches</span></div><div class="grid cols-2">${ovRows.map(r=>`<div class="card"><div class="award__winner">${CARNIVAL.esc(r.player_name)}</div><div class="award__meta">${CARNIVAL.esc(r.team_name)} · P ${Number(r.points||0)}</div></div>`).join('')}</div>` : '';

        searchResults.innerHTML = ovHtml + `<div class="sec-label"><span class="num">001</span><span class="txt">Event MVP Matches</span></div><div class="grid cols-3">${evHtml}</div>`;
        grid.innerHTML = '';
        top.innerHTML = initialTopHtml;
      });
    }
  }

  loadAwards().catch(() => {});
})();
