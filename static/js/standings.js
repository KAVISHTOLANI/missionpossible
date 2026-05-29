/* ===================== STANDINGS ===================== */
(function () {
  "use strict";

  const LOGO = {
    creators: "/static/images/logos/creators.png",
    dominators: "/static/images/logos/dominators.png",
    royals: "/static/images/logos/royals.png",
  };

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
        <tbody>${rows.map((t, i) => rowHtml(t, i)).join("")}</tbody>
      </table>`;

    wrap.querySelectorAll(".cup").forEach((el) => CARNIVAL.countUp(el, parseInt(el.dataset.n || "0", 10), 900));
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
    const breakdown = (t.event_breakdown && t.event_breakdown.length)
      ? `<table class="bk"><tbody>${t.event_breakdown.map((b) => `
          <tr><td>${CARNIVAL.esc(b.event || "-")}</td>
              <td class="${b.points < 0 ? "neg" : "pos"}">${b.points > 0 ? "+" : ""}${b.points}</td>
              <td class="bk__note">${CARNIVAL.esc(b.note || "")}</td></tr>`).join("")}</tbody></table>`
      : '<div class="muted" style="padding:14px 18px">No events recorded yet for this team.</div>';

    return `
      <tr class="ptable__row" style="--tc:${t.color}">
        <td class="rank">${i + 1}</td>
        <td class="teamcell">
          <img src="${LOGO[t.id] || ""}" alt="" class="teamcell__logo">
          <span class="teamcell__name" style="color:${t.color}">${CARNIVAL.esc(t.name)}</span>
          <span class="teamcell__chev">v</span>
        </td>
        <td><span class="cup" data-n="${t.events_played}">0</span></td>
        <td><span class="cup" data-n="${t.wins}">0</span></td>
        <td><span class="cup" data-n="${t.gold || 0}">0</span></td>
        <td><span class="cup" data-n="${t.silver || 0}">0</span></td>
        <td><span class="cup" data-n="${t.points_earned}">0</span></td>
        <td class="neg">${t.penalty_deductions ? "-" + t.penalty_deductions : "0"}</td>
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
              <tr><td class="rank">${idx + 1}</td><td>${CARNIVAL.esc(r.player_name || "-")}</td><td>${CARNIVAL.esc(r.team_name || "-")}</td><td>${Number(r.gold || 0)}</td><td>${Number(r.silver || 0)}</td><td><strong>${Number(r.points || 0)}</strong></td></tr>
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
              <tr><td class="rank">${idx + 1}</td><td>${CARNIVAL.esc(r.team_name || "-")}</td><td><strong>${Number(r.fair_play_points || 0)}</strong></td></tr>
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
    <h3>Annual Carnival 2026 Overall MVP Award - Official Rules &amp; Regulations</h3>
    <h4>What is the Overall MVP?</h4>
    <p>The Overall MVP is Annual Carnival 2026's individual excellence award. It runs parallel to the team competition across all 21 events. Every eligible participant earns personal points based on their performance throughout the season. The person with the highest points at the end of the season is crowned <strong>Overall MVP of Annual Carnival 2026</strong> and recognised at the Grand Finale on 15th August 2026.</p>
    <p>The purpose of this award is simple: to reward individuals who show up, compete hard, and perform consistently across multiple events, not just one.</p>
    <h4>Eligibility</h4>
    <ol>
      <li>Any confirmed participant across any of the 3 teams is eligible.</li>
      <li>A participant must be on the official submitted list, submitted to the WhatsApp group before 6:00 PM the day prior, to be eligible for Overall MVP points for that event.</li>
      <li>A participant may compete in a <strong>maximum of 5 events</strong> across the season. Points are only counted across your participating events.</li>
      <li>In <strong>team sports</strong> (Basketball, Throwball, Cricket, Kabaddi, Cycling &amp; Tug of War, Swimming &amp; Sand Volleyball), a player must have actively participated to be eligible for points from that event. Substitutes and reserves who do not participate in the game get <strong>zero points</strong> for that event regardless of the team result.</li>
      <li>In <strong>individual and cultural events</strong> (Carrom, Chess, Table Tennis, Lemon &amp; Spoon Race, Sack Race, Rangoli, Cooking Competition, 8-Ball Pool), all active participants are eligible.</li>
    </ol>
    <h4>Points System</h4>
    <table class="rules-table"><thead><tr><th>Achievement</th><th>Points Awarded</th></tr></thead><tbody><tr><td>1st Place / Win in an event</td><td>10 points</td></tr><tr><td>2nd Place / Runner-up in an event</td><td>5 points</td></tr><tr><td>Reserve / Sub with no participation in team sports</td><td>0 points</td></tr></tbody></table>
    <p><strong>Important:</strong> Points apply to <strong>all 21 events</strong> - Outdoor, Indoor, and Cultural equally. Every event counts the same.</p>
    <h4>Tiebreaker</h4>
    <ol>
      <li><strong>Step 1 - Count the Golds.</strong> The player with more 1st place finishes, or event wins, across their events is declared the winner.</li>
      <li><strong>Step 2 - If golds are also equal.</strong> All tied players are <strong>jointly declared Overall MVP</strong> of Annual Carnival 2026. There is no further tiebreaker. Everyone wins.</li>
    </ol>
    <h4>Tracking &amp; Transparency</h4>
    <ul>
      <li>Individual points are tracked by the admin after every event concludes.</li>
      <li>The <strong>live Overall MVP leaderboard</strong> is publicly visible on the website Awards page and updates after each event.</li>
      <li>Players can track their own standing throughout the season in real time.</li>
      <li>All point allocations are final once entered by the admin. Disputes follow the same process as general disputes: all 3 overall coordinators must be present.</li>
    </ul>
    <h4>The Award</h4>
    <p>The Overall MVP is announced and presented on <strong>15th August 2026</strong> at the Annual Carnival Grand Finale alongside the Best Team trophy. The award recognises individual consistency, effort, and excellence across the season, not just a single moment.</p>
    <p>These rules are final and apply to all participants across Team Creators, Team Dominators, and Team Royals.</p>
  `;

  const FAIR_PLAY_RULES = `
    <h3>Fair Play Award - Official Rules &amp; Regulations</h3>
    <p>The Fair Play Award recognises the team that competes with the most discipline, respect, and sportsmanship throughout the season. It is awarded for conduct across <strong>all 21 events</strong> - outdoor, indoor, and cultural.</p>
    <h4>Which Events Count</h4>
    <p>Fair Play points are eligible in every event across the season (all sports and cultural events).</p>
    <h4>How It Works</h4>
    <p>After every event, Fair Play points are awarded to teams based on conduct and final placing. The evaluation includes:</p>
    <ul>
      <li>Discipline throughout the event</li>
      <li>Respectful behaviour toward opponents, teammates, and officials</li>
      <li>Minimal or no arguments with referees/officials</li>
      <li>Graceful acceptance of decisions, wins and losses</li>
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
