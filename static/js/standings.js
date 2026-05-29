/* ===================== STANDINGS ===================== */
(function () {
  "use strict";
  const LOGO = {
    creators: "/static/images/logos/creators.png",
    dominators: "/static/images/logos/dominators.png",
    royals: "/static/images/logos/royals.png",
  };
  const RANK_ICON = ["🏆", "🥈", "🥉"];

  CARNIVAL.get("/api/standings").then((data) => {
    const wrap = document.getElementById("standingsTable");
    if (!wrap) return;
    const teams = data.teams || {};
    const rows = Object.entries(teams).map(([id, t]) => ({ id, ...t }));
    rows.sort((a, b) => (b.net_points - a.net_points) || (b.points_earned - a.points_earned));

    wrap.innerHTML = `
      <table class="ptable">
        <thead>
          <tr>
            <th>Rank</th><th>Team</th><th>Played</th><th>Wins</th>
            <th>Gold</th><th>Silver</th>
            <th>Points</th><th>Penalties</th><th>Net</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((t, i) => rowHtml(t, i)).join("")}
        </tbody>
      </table>`;

    // counters
    wrap.querySelectorAll(".cup").forEach((el) => CARNIVAL.countUp(el, parseInt(el.dataset.n || "0", 10), 900));

    // expandable rows
    wrap.querySelectorAll(".ptable__row").forEach((tr) => {
      tr.addEventListener("click", () => {
        const next = tr.nextElementSibling;
        if (next && next.classList.contains("ptable__detail")) {
          const open = next.classList.toggle("open");
          tr.classList.toggle("expanded", open);
        }
      });
    });
  }).catch(() => {
    const wrap = document.getElementById("standingsTable");
    if (wrap) wrap.innerHTML = '<div class="empty">Could not load standings.</div>';
  });

  CARNIVAL.get("/api/award-leaderboards").then((data) => {
    renderOverallMvpBoard((data && data.overall_mvp) || []);
    renderFairPlayBoard((data && data.fair_play) || []);
  }).catch(() => {
    const a = document.getElementById("overallMvpTable");
    const b = document.getElementById("fairPlayTable");
    if (a) a.innerHTML = '<div class="empty">Could not load Overall MVP leaderboard.</div>';
    if (b) b.innerHTML = '<div class="empty">Could not load Fair Play leaderboard.</div>';
  });

  function rowHtml(t, i) {
    const icon = RANK_ICON[i] || (i + 1);
    const breakdown = (t.event_breakdown && t.event_breakdown.length)
      ? `<table class="bk"><tbody>${t.event_breakdown.map((b) => `
          <tr><td>${CARNIVAL.esc(b.event || "—")}</td>
              <td class="${b.points < 0 ? 'neg' : 'pos'}">${b.points > 0 ? "+" : ""}${b.points}</td>
              <td class="bk__note">${CARNIVAL.esc(b.note || "")}</td></tr>`).join("")}</tbody></table>`
      : '<div class="muted" style="padding:14px 18px">No events recorded yet for this team.</div>';

    return `
      <tr class="ptable__row" style="--tc:${t.color}">
        <td class="rank">${icon}</td>
        <td class="teamcell">
          <img src="${LOGO[t.id] || ''}" alt="" class="teamcell__logo">
          <span class="teamcell__name" style="color:${t.color}">${CARNIVAL.esc(t.name)}</span>
          <span class="teamcell__chev">▾</span>
        </td>
        <td><span class="cup" data-n="${t.events_played}">0</span></td>
        <td><span class="cup" data-n="${t.wins}">0</span></td>
        <td><span class="cup" data-n="${t.gold || 0}">0</span></td>
        <td><span class="cup" data-n="${t.silver || 0}">0</span></td>
        <td><span class="cup" data-n="${t.points_earned}">0</span></td>
        <td class="neg">${t.penalty_deductions ? "−" + t.penalty_deductions : "0"}</td>
        <td class="netcell" style="color:${t.color}"><span class="cup" data-n="${t.net_points}">0</span></td>
      </tr>
      <tr class="ptable__detail"><td colspan="9"><div class="ptable__detail-inner">${breakdown}</div></td></tr>`;
  }

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

  function renderOverallMvpBoard(rows) {
    const wrap = document.getElementById("overallMvpTable");
    if (!wrap) return;
    const top10 = sortOverallMvp(rows).slice(0, 10);
    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="ptable ptable--awards">
          <thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Gold</th><th>Silver</th><th>Points</th></tr></thead>
          <tbody>
            ${top10.length ? top10.map((r, idx) => `
              <tr><td class="rank">${idx + 1}</td><td>${CARNIVAL.esc(r.player_name || "—")}</td><td>${CARNIVAL.esc(r.team_name || "—")}</td><td>${Number(r.gold || 0)}</td><td>${Number(r.silver || 0)}</td><td><strong>${Number(r.points || 0)}</strong></td></tr>
            `).join("") : '<tr><td colspan="6" class="muted">No Overall MVP entries yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${rulesToggle("Overall MVP Rules & Regulations", OVERALL_MVP_RULES)}`;
  }

  function renderFairPlayBoard(rows) {
    const wrap = document.getElementById("fairPlayTable");
    if (!wrap) return;
    const sorted = sortFairPlay(rows);
    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="ptable ptable--awards">
          <thead><tr><th>Rank</th><th>Team Name</th><th>Fair Play Points</th></tr></thead>
          <tbody>
            ${sorted.length ? sorted.map((r, idx) => `
              <tr><td class="rank">${idx + 1}</td><td>${CARNIVAL.esc(r.team_name || "—")}</td><td><strong>${Number(r.fair_play_points || 0)}</strong></td></tr>
            `).join("") : '<tr><td colspan="3" class="muted">No Fair Play entries yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${rulesToggle("Fair Play Rules & Regulations", FAIR_PLAY_RULES)}`;
  }

  function rulesToggle(title, htmlBody) {
    return `
      <details class="award-rules">
        <summary>${CARNIVAL.esc(title)}</summary>
        <div class="award-rules__body">${htmlBody}</div>
      </details>`;
  }

  const OVERALL_MVP_RULES = `
    <h3>MVP Award Rules &amp; Regulations</h3>
    <p><em>Applicable for All 3 Teams</em></p>
    <p>The <strong>Most Valuable Player (MVP) Award</strong> will be awarded in the following events: Basketball, Throwball, Kabaddi, Badminton, Cricket, Table Tennis, Carrom, Sand Volleyball, Swimming, Dancing, Skit &amp; Drama.</p>
    <h4>General Rules</h4>
    <ul>
      <li>An MVP will be selected <strong>after every match/event</strong> by the referee/judging panel.</li>
      <li>The referee’s decision will be <strong>final and non-negotiable</strong>.</li>
      <li>MVP is awarded based on: Performance, Skill level, Team contribution, Sportsmanship/Fair play, Impact on the game/event.</li>
      <li>MVP can be awarded to a player from <strong>either team</strong>, not necessarily the winning team.</li>
      <li>Any player showing Misconduct, Abusive language, Unsportsmanlike behaviour, Fighting or cheating will be disqualified from MVP consideration.</li>
      <li>Teams must respect the referee’s decision at all times. Aggressive arguing may lead to warnings or penalties.</li>
      <li>Only officially registered players/participants are eligible for MVP awards. Substitutes who do not actively participate receive <strong>0 points</strong>.</li>
      <li>In team performances like Dancing and Skit &amp; Drama: MVP may be awarded to an individual performer OR a “Best Performer” title may be given based on judges’ discretion.</li>
      <li>In Swimming, the MVP/Best Performer will be selected based on Timing, Technique, and Overall dominance in the event.</li>
      <li>Consistent MVP winners across events will be considered for the <strong>Overall Carnival MVP Award</strong>.</li>
      <li>Fair play, respect, and team spirit are expected from all 3 teams throughout the carnival.</li>
      <li>Any attempt to influence referees/judges will result in immediate disciplinary action.</li>
    </ul>
    <h4>Points System</h4>
    <ul>
      <li>1st Place / Win in an event: 10 points</li>
      <li>2nd Place / Runner-up in an event: 5 points</li>
      <li>Reserve / Sub who does not play in team sports: 0 points</li>
    </ul>
    <p><strong>Notes:</strong> Event MVP is recognised by the referee/panel but does not carry an extra 15-point allocation in the season tally; only the 10/5 placement points apply as above. Points apply equally across all 21 events (Outdoor, Indoor, and Cultural).</p>
    <h4>Tiebreaker</h4>
    <ol>
      <li><strong>Step 1 — Count the Golds.</strong> The player with more 1st place finishes (event wins) across their events is declared the winner.</li>
      <li><strong>Step 2 — If golds are also equal:</strong> All tied players are jointly declared Overall MVP. There is no further tiebreaker.</li>
    </ol>
    <h4>Tracking &amp; Transparency</h4>
    <ul>
      <li>Individual points are tracked by the admin after every event concludes.</li>
      <li>The live Overall MVP leaderboard is publicly visible on the website Awards page and updates after each event.</li>
      <li>All point allocations are final once entered by the admin. Disputes follow the admin dispute process.</li>
    </ul>
  `;

  const FAIR_PLAY_RULES = `
    <h3>Fair Play Award — Official Rules &amp; Regulations</h3>
    <p>The Fair Play Award recognises the team that competes with the most discipline, respect, and sportsmanship throughout the season. It is awarded for conduct across <strong>all 21 events</strong> — outdoor, indoor, and cultural.</p>
    <h4>Which Events Count</h4>
    <p>Fair Play points are eligible in every event across the season (all sports and cultural events).</p>
    <h4>How It Works</h4>
    <p>After every event, Fair Play points are awarded to teams based on conduct and final placing. The evaluation includes:</p>
    <ul>
      <li>Discipline throughout the event</li>
      <li>Respectful behaviour toward opponents, teammates, and officials</li>
      <li>Minimal or no arguments with referees/officials</li>
      <li>Graceful acceptance of decisions — wins and losses</li>
      <li>Overall conduct that reflects the spirit of the carnival</li>
      <li>The umpire/referee may also consider audience behaviour and other contextual criteria when awarding Fair Play points.</li>
    </ul>
    <p><strong>Points System</strong></p>
    <ul>
      <li>1st place team of an event: 2 points</li>
      <li>2nd place team of an event: 1 point</li>
      <li>All other teams: 0 points</li>
    </ul>
    <p><strong>Tie Policy</strong><br>There is <strong>no tiebreaker</strong> for the Fair Play Award. If two or more teams finish the season with equal Fair Play points, the teams will be jointly declared Fair Play Champions.</p>
    <h4>Tracking &amp; Transparency</h4>
    <ul>
      <li>Fair Play points are recorded by the admin after every event.</li>
      <li>The Fair Play leaderboard is publicly visible on the website Awards page.</li>
      <li>All Fair Play allocations are final once submitted by the umpire/referee.</li>
    </ul>
  `;
})();
