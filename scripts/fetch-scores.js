INDEX.HTML EDITS (5 small ones). Order doesn't matter; either file can be committed first.

=====================================================================
EDIT 1 (CSS): paste this block right ABOVE the line  /* ---- league filter ---- */
=====================================================================
/* ---- playoff race: week selector + odds change ---- */
.race-weeks { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; margin: 4px 0 14px; }
.race-weeks .lbl { font-size: 9px; font-weight: bold; letter-spacing: .12em; color: var(--muted); margin-right: 4px; }
.race-wk {
  font-family: inherit; font-size: 10px; font-weight: bold; letter-spacing: .08em;
  min-width: 32px; padding: 5px 9px; border-radius: 2px;
  border: 1px solid rgba(242,237,227,.18); background: transparent;
  color: var(--muted); cursor: pointer; transition: all .15s;
}
.race-wk:hover { border-color: var(--concrete); color: var(--concrete); }
.race-wk.active { background: var(--gold); color: var(--ground); border-color: var(--gold); }
table.race .od-d { display: block; font-size: 9px; font-weight: normal; color: var(--muted); line-height: 1; margin-top: 2px; }

=====================================================================
EDIT 2 (CSS): paste this right AFTER the line that starts  .modal-header .label {
=====================================================================
.modal-header .vs {
  font-size: 10px; font-weight: bold; letter-spacing: .08em; color: var(--muted);
  cursor: pointer; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.modal-header .vs .vs-name { color: var(--concrete); border-bottom: 1px solid rgba(242,237,227,.25); }
.modal-header .vs:hover .vs-name { border-bottom-color: var(--concrete); }

=====================================================================
EDIT 3 (JS, inside function openRoster): find these two lines
=====================================================================
  html += `<span class="league-badge ${CONFIG.leagueColors[leagueIdx]||"league-0"}">L${leagueIdx+1}</span>`;
  html += `</div>`;

...and put the new block BETWEEN them, so it reads:

  html += `<span class="league-badge ${CONFIG.leagueColors[leagueIdx]||"league-0"}">L${leagueIdx+1}</span>`;
  // opponent that week (tap to open their roster for the same week)
  const oppId = team.opp ? team.opp[weekIdx] : null;
  const opp = oppId != null ? _appData.teams.find(t => t.leagueId === leagueId && t.rosterId === oppId) : null;
  if (opp && opp.rosters && opp.rosters[weekIdx]) {
    html += `<span class="vs" onclick="openRoster('${leagueId}',${opp.rosterId},${weekIdx})">vs <span class="vs-name">${opp.name}</span></span>`;
  }
  html += `</div>`;

=====================================================================
EDIT 4 (JS, also in openRoster): find this line
=====================================================================
  document.getElementById("roster-modal").classList.add("open");

...and add ONE line right after it:

  document.getElementById("roster-modal").scrollTop = 0;

=====================================================================
EDIT 5 (JS): REPLACE the whole renderRace function.
Select from the line  function renderRace(data) {  down to its closing }
(the line just before  /* ---- live ---- */ ), delete it, and paste everything below.
Keep function fmtOdds above it as is. This version also uses your wording
"in on points" / "in on record" in the legend.
=====================================================================
let raceWeek = null; // week picked in the selector; null = latest finalized week

function setRaceWeek(w) {
  raceWeek = w;
  if (_appData) renderRace(_appData);
}

function renderRace(data) {
  const race = data.race;
  if (!race || !race.finalWeeks) return;
  const box = document.getElementById("playoffs-content");
  if (!box) return;

  // which finalized week are we showing? (history = odds stored for each week, scores.json `raceHistory`)
  const latest = race.finalWeeks;
  const hist = data.raceHistory || {};
  const histWeeks = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const week = (raceWeek && histWeeks.includes(raceWeek)) ? raceWeek : latest;
  const viewingLatest = week === latest;
  const isFinal = week >= race.regularSeasonWeeks;
  const keyOf = t => t.leagueId + ":" + t.rosterId;

  const teams = data.teams
    .map(t => ({ ...t, race: viewingLatest ? t.race : (hist[week] || {})[keyOf(t)] }))
    .filter(t => t.race);
  if (teams.length === 0) return;

  const sub = document.getElementById("race-sub");
  if (sub) sub.textContent = "THROUGH WEEK " + week;
  let html = `<p class="race-rules">Playoffs start Week 15. Top 2 in points advance, then the next 2 by record, with points as the tiebreaker.</p>`;

  if (histWeeks.length > 1) {
    html += `<div class="race-weeks"><span class="lbl">WEEK</span>`;
    histWeeks.forEach(w => {
      html += `<button class="race-wk${w === week ? " active" : ""}" onclick="setRaceWeek(${w})">${w}</button>`;
    });
    html += `</div>`;
  }

  const winsOf = r => r.w + 0.5 * r.t;
  const byRecord = (a, b) => (winsOf(b.race) - winsOf(a.race)) || (b.race.pts - a.race.pts);
  const prevWeek = hist[week - 1];

  data.leagues.forEach((lg, li) => {
    const lt = teams.filter(t => t.leagueIdx === li);
    if (lt.length === 0) return;

    // who is in a qualifying spot (same rules as the real cut)
    const byPts = [...lt].sort((a, b) => b.race.pts - a.race.pts);
    const leaderPts = byPts[0].race.pts;
    const bestWins = Math.max(...lt.map(t => winsOf(t.race))); // most wins in this league (ties all count)
    const slot = new Map();
    byPts.slice(0, 2).forEach(t => slot.set(t.rosterId, "pts"));
    byPts.slice(2).sort(byRecord).slice(0, 2).forEach(t => slot.set(t.rosterId, "rec"));

    const sorted = [...lt].sort((a, b) => (b.race.odds - a.race.odds) || (b.race.pts - a.race.pts));

    html += `<div class="race-league"><div class="race-league-head">${(lg.name || "League " + (li + 1)).toUpperCase()}</div>`;
    html += `<table class="race"><thead><tr><th class="r-rank">#</th><th class="r-name">TEAM</th><th class="r-back">POINTS</th><th class="r-rec">WINS</th><th class="r-odds">${isFinal ? "" : "ODDS"}</th></tr></thead><tbody>`;
    sorted.forEach((t, i) => {
      const r = t.race;
      const lead = r.pts === leaderPts;
      const back = '<span class="n">' + r.pts.toFixed(1) + '</span><span class="gap">' + (lead ? "" : "(−" + (leaderPts - r.pts).toFixed(1) + ")") + '</span>';
      const cls = slot.get(t.rosterId) ? ` in-${slot.get(t.rosterId)}` : "";
      const oddsCls = isFinal ? (r.odds >= 0.5 ? "odds-hi" : "odds-lo") : (r.odds >= 0.5 ? "odds-hi" : (r.odds < 0.1 ? "odds-lo" : ""));

      // change in odds vs the previous week (percentage points, same rounding as shown)
      let delta = "";
      const pr = prevWeek && prevWeek[keyOf(t)];
      if (!isFinal && pr) {
        const d = Math.round(r.odds * 100) - Math.round(pr.odds * 100);
        // no change still gets an invisible line so every row keeps the same height
        delta = `<span class="od-d">${d === 0 ? "&nbsp;" : (d > 0 ? "▲" : "▼") + Math.abs(d)}</span>`;
      }

      html += `<tr class="${cls.trim()}"><td class="r-rank">${i + 1}</td>`;
      html += `<td class="r-name"><span class="team-link" onclick="openRoster('${t.leagueId}',${t.rosterId},${week - 1})">${t.name}</span></td>`;
      html += `<td class="r-back${lead ? " lead" : ""}">${back}</td>`;
      // wins, shown like the POINTS column: everyone tied for the most wins shows their
      // total, everyone else shows how many wins back (−1, −2, ...)
      const fw = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
      const winsLead = winsOf(r) === bestWins;
      html += `<td class="r-rec${winsLead ? " lead" : ""}"><span class="n">${fw(winsOf(r))}</span><span class="gap">${winsLead ? "" : "(−" + fw(bestWins - winsOf(r)) + ")"}</span></td>`;
      html += `<td class="r-odds ${oddsCls}">${fmtOdds(r.odds, isFinal)}${delta}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  });

  html += `<p class="race-note"><span class="race-key" style="background:var(--gold)"></span>in on points &nbsp; <span class="race-key" style="background:var(--spill-out)"></span>in on record</p>`;
  if (!viewingLatest) html += `<p class="race-note">Odds as they stood after Week ${week}. Arrows show the change from the week before.</p>`;
  else if (!isFinal) html += `<p class="race-note">Updates when each week finalizes after MNF.</p>`;
  box.innerHTML = html;
}
