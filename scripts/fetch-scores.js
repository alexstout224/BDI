/**
 * Big Dam Invitational — Score Fetcher v3
 * 
 * Computes optimal best ball lineups and stores the full
 * roster breakdown per week for the roster modal view.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LEAGUES = [
  { id: '1389692043155996674', name: 'League 1' },
  { id: '1401244219137376256', name: 'League 2' },
];

const NAME_OVERRIDES = {};
const LINEUP = { QB: 1, RB: 2, WR: 3, TE: 1 };
const OUT_PATH = path.join(__dirname, '..', 'data', 'scores.json');
const POS_PATH = path.join(__dirname, '..', 'data', 'player-positions.json');
const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'schedule.json');

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, { headers: { 'User-Agent': 'BigDamInvitational/3.0' } }, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`)); res.resume(); return; }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function computeOptimalLineup(playersPoints, playerCache, weekSchedule) {
  if (!playersPoints || typeof playersPoints !== 'object') return { score: 0, roster: [] };

  const players = [];
  for (const [pid, pts] of Object.entries(playersPoints)) {
    const info = playerCache[pid];
    if (!info) continue;
    players.push({ pid, pts: pts || 0, pos: info.p, name: info.n, team: info.t });
  }

  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const pl of players) {
    if (byPos[pl.pos]) byPos[pl.pos].push(pl);
  }
  for (const pos in byPos) byPos[pos].sort((a, b) => b.pts - a.pts);

  const starters = new Set();
  const slots = {};

  // Fill required slots
  for (let i = 0; i < LINEUP.QB; i++) if (byPos.QB[i]) { starters.add(byPos.QB[i].pid); slots[byPos.QB[i].pid] = 'QB'; }
  for (let i = 0; i < LINEUP.RB; i++) if (byPos.RB[i]) { starters.add(byPos.RB[i].pid); slots[byPos.RB[i].pid] = 'RB'; }
  for (let i = 0; i < LINEUP.WR; i++) if (byPos.WR[i]) { starters.add(byPos.WR[i].pid); slots[byPos.WR[i].pid] = 'WR'; }
  for (let i = 0; i < LINEUP.TE; i++) if (byPos.TE[i]) { starters.add(byPos.TE[i].pid); slots[byPos.TE[i].pid] = 'TE'; }

  // FLEX: best remaining RB/WR/TE
  const flexCandidates = [
    byPos.RB[LINEUP.RB] || null,
    byPos.WR[LINEUP.WR] || null,
    byPos.TE[LINEUP.TE] || null,
  ].filter(Boolean).sort((a, b) => b.pts - a.pts);

  // FLEX: best remaining RB/WR/TE — fill it even at 0.0 pts (before that
  // player's game has started) rather than omitting the slot entirely.
  if (flexCandidates.length > 0) {
    starters.add(flexCandidates[0].pid);
    slots[flexCandidates[0].pid] = 'FLX';
  }

  let score = 0;
  const roster = [];

  // Starters sorted by slot order (QB, RB, RB, WR, WR, WR, TE, FLX), then score within position
  const slotOrder = { QB: 0, RB: 1, WR: 2, TE: 3, FLX: 4 };
  const starterList = players.filter(p => starters.has(p.pid))
    .sort((a, b) => (slotOrder[slots[a.pid]] ?? 9) - (slotOrder[slots[b.pid]] ?? 9) || b.pts - a.pts);
  for (const p of starterList) {
    score += p.pts;
    const g = weekSchedule && weekSchedule[p.team];
    roster.push({
      n: p.name, p: p.pos, t: p.team, pts: p.pts, s: true, sl: slots[p.pid],
      ...(g ? { g: { slot: g.slot, k: g.kickoff } } : {}),
    });
  }

  // Bench sorted by position order then score
  const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3 };
  const benchList = players.filter(p => !starters.has(p.pid))
    .sort((a, b) => (posOrder[a.pos] ?? 9) - (posOrder[b.pos] ?? 9) || b.pts - a.pts);
  for (const p of benchList) {
    const g = weekSchedule && weekSchedule[p.team];
    roster.push({
      n: p.name, p: p.pos, t: p.team, pts: p.pts, s: false,
      ...(g ? { g: { slot: g.slot, k: g.kickoff } } : {}),
    });
  }

  return { score: Math.round(score * 100) / 100, roster };
}

function isGameWindow() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  if (day === 0 && hour >= 7) return true;   // 7am ET: covers early international kickoffs
  if (day === 1 && hour < 4) return true;
  if (day === 1 && hour >= 19) return true;
  if (day === 2 && hour < 4) return true;
  if (day === 3 && hour >= 19) return true;
  if (day === 4 && hour < 4) return true;
  if (day === 4 && hour >= 19) return true;
  if (day === 5 && hour < 4) return true;
  if (day === 6 && hour >= 13) return true;
  return false;
}

// Whether the CURRENT week's NFL slate has actually finished — used to
// decide if standings should count it as final. This is deliberately
// separate from isGameWindow(): isGameWindow() answers "is a game live
// right now" (for the live banner), which is false during the Mon/Tue
// morning lull even though MNF hasn't been played yet that night. This
// instead checks the real schedule: the week isn't done until we're past
// the latest kickoff of the week (usually MNF) plus a game-length buffer.
function isWeekConcluded(scheduleData, week) {
  const weekSchedule = scheduleData[week];
  if (!weekSchedule) return true; // no schedule data cached — fall back to old behavior
  const kickoffs = Object.values(weekSchedule)
    .map(g => g.kickoff)
    .filter(Boolean)
    .map(k => new Date(k).getTime())
    .filter(t => !isNaN(t));
  if (kickoffs.length === 0) return true; // nothing to check against — don't block forever
  const latestKickoff = Math.max(...kickoffs);
  const GAME_LENGTH_BUFFER_MS = 5 * 60 * 60 * 1000; // ~5hrs: covers a full game plus likely overtime
  return Date.now() >= latestKickoff + GAME_LENGTH_BUFFER_MS;
}

/* ============================================================
 * PLAYOFF RACE
 *
 * Rules: 4 teams per league advance. The top 2 by total points go
 * first; then the top 2 by record among the other 10 (record ties
 * break on total points).
 *
 * Odds come from a Monte Carlo simulation of the rest of the regular
 * season: each simulated week draws every team's score from its own
 * scoring level (pulled toward the league average early in the
 * season, since a few weeks of data is noisy), plays out the real
 * head-to-head schedule, then applies the advancement rules above.
 * Odds = share of simulations in which the team advances. Only
 * FINALIZED weeks feed the model, so numbers move once per week.
 * ============================================================ */
const REGULAR_SEASON_WEEKS = 14;
const ADVANCE_BY_POINTS = 2;
const ADVANCE_BY_RECORD = 2;
const SIM_COUNT = 10000;

// Small seeded PRNG so the same data always gives the same odds
// (no jitter between runs or page loads).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) { // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function makeNormal(rng) { // Box-Muller
  return function () {
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

// Group a week's matchup entries into [rosterIdA, rosterIdB] pairs.
function groupPairings(matchups) {
  const byId = {};
  (matchups || []).forEach(m => {
    if (m.matchup_id == null) return;
    (byId[m.matchup_id] = byId[m.matchup_id] || []).push(m.roster_id);
  });
  const pairs = Object.values(byId).filter(p => p.length === 2);
  return pairs.length > 0 ? pairs : null;
}

// Pooled estimate of how much teams differ (between) vs. how much one team
// bounces week to week (within). Their ratio, k, says how many weeks of
// "league average" a team's own average is worth blending with.
function estimateScoringModel(teamScores, n) {
  const T = teamScores.length;
  const means = teamScores.map(s => s.reduce((a, b) => a + b, 0) / n);
  const grand = means.reduce((a, b) => a + b, 0) / T;
  let sd = 22, k = 6; // fallbacks for week 1 (not enough data to estimate)
  if (n >= 2 && T >= 3) {
    let ss = 0;
    teamScores.forEach((s, i) => s.forEach(x => { ss += (x - means[i]) ** 2; }));
    const within = ss / (T * (n - 1));
    const varMeans = means.reduce((a, m) => a + (m - grand) ** 2, 0) / (T - 1);
    const between = Math.max(varMeans - within / n, 1);
    sd = Math.sqrt(within);
    k = Math.min(14, Math.max(4, within / between));
  }
  return { grand, means, sd, k };
}

function computeRecords(rosterIds, pairingsByWeek, scoresByRoster, finalWeeks) {
  const rec = {};
  rosterIds.forEach(id => { rec[id] = { w: 0, l: 0, t: 0 }; });
  for (let w = 1; w <= finalWeeks; w++) {
    (pairingsByWeek[w] || []).forEach(([a, b]) => {
      if (!rec[a] || !rec[b]) return;
      const sa = (scoresByRoster[a] || [])[w - 1] || 0;
      const sb = (scoresByRoster[b] || [])[w - 1] || 0;
      if (sa > sb) { rec[a].w++; rec[b].l++; }
      else if (sb > sa) { rec[b].w++; rec[a].l++; }
      else { rec[a].t++; rec[b].t++; }
    });
  }
  return rec;
}

// teams: [{ rosterId, w, t, pts, mean }]  (record + points through finalized weeks)
// remaining: one entry per unplayed week: array of [rosterIdA, rosterIdB] or null
function simulateLeague({ teams, remaining, model, n, seed, sims = SIM_COUNT }) {
  const rng = mulberry32(seed);
  const normal = makeNormal(rng);
  const N = teams.length;
  if (remaining.length === 0) sims = 1; // nothing left to randomize

  const idx = new Map(teams.map((t, i) => [t.rosterId, i]));
  const post = teams.map(t => ({
    m: (n * t.mean + model.k * model.grand) / (n + model.k),
    s: model.sd / Math.sqrt(n + model.k),
  }));
  const weeks = remaining.map(pairs => pairs
    ? pairs.map(([a, b]) => [idx.get(a), idx.get(b)]).filter(p => p[0] !== undefined && p[1] !== undefined)
    : null);

  const viaPts = new Array(N).fill(0);
  const viaRec = new Array(N).fill(0);
  const theta = new Array(N), wins = new Array(N), pts = new Array(N), sc = new Array(N);
  const order = Array.from({ length: N }, (_, i) => i);

  for (let sim = 0; sim < sims; sim++) {
    for (let i = 0; i < N; i++) {
      theta[i] = post[i].m + post[i].s * normal(); // this sim's "true" scoring level
      wins[i] = teams[i].w + 0.5 * teams[i].t;
      pts[i] = teams[i].pts;
    }
    for (const pairs of weeks) {
      for (let i = 0; i < N; i++) {
        sc[i] = Math.max(40, theta[i] + model.sd * normal());
        pts[i] += sc[i];
      }
      let wk = pairs;
      if (!wk) { // schedule unavailable: fall back to a random pairing
        const perm = order.slice();
        for (let i = N - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        wk = [];
        for (let j = 0; j + 1 < N; j += 2) wk.push([perm[j], perm[j + 1]]);
      }
      for (const [a, b] of wk) {
        if (sc[a] > sc[b]) wins[a]++;
        else if (sc[b] > sc[a]) wins[b]++;
        else { wins[a] += 0.5; wins[b] += 0.5; }
      }
    }
    const byPts = order.slice().sort((a, b) => pts[b] - pts[a]);
    for (let j = 0; j < ADVANCE_BY_POINTS && j < N; j++) viaPts[byPts[j]]++;
    const rest = byPts.slice(ADVANCE_BY_POINTS).sort((a, b) => (wins[b] - wins[a]) || (pts[b] - pts[a]));
    for (let j = 0; j < ADVANCE_BY_RECORD && j < rest.length; j++) viaRec[rest[j]]++;
  }
  return teams.map((t, i) => ({ rosterId: t.rosterId, viaPts: viaPts[i] / sims, viaRec: viaRec[i] / sims }));
}

// Attaches team.race = { w, l, t, pts, odds, viaPts, viaRec } to every team and
// returns league-wide metadata (or null if no week is final yet).
function computePlayoffRace(allTeams, leaguePairings, finalWeeksRaw) {
  const finalWeeks = Math.min(finalWeeksRaw, REGULAR_SEASON_WEEKS);
  if (finalWeeks < 1) return null;

  const teamScores = allTeams.map(t => Array.from({ length: finalWeeks }, (_, i) => t.scores[i] || 0));
  const model = estimateScoringModel(teamScores, finalWeeks);
  const r3 = x => Math.round(x * 1000) / 1000;

  leaguePairings.forEach((pairingsByWeek, li) => {
    const members = allTeams.map((t, i) => ({ t, i })).filter(x => x.t.leagueIdx === li);
    if (members.length < ADVANCE_BY_POINTS + ADVANCE_BY_RECORD) return;

    const scoresByRoster = {};
    members.forEach(({ t }) => { scoresByRoster[t.rosterId] = t.scores; });
    const rec = computeRecords(members.map(x => x.t.rosterId), pairingsByWeek, scoresByRoster, finalWeeks);

    const remaining = [];
    for (let w = finalWeeks + 1; w <= REGULAR_SEASON_WEEKS; w++) remaining.push(pairingsByWeek[w] || null);

    const simTeams = members.map(({ t, i }) => ({
      rosterId: t.rosterId,
      w: rec[t.rosterId].w,
      t: rec[t.rosterId].t,
      pts: teamScores[i].reduce((a, b) => a + b, 0),
      mean: model.means[i],
    }));
    const seed = hashString(`${members[0].t.leagueId}|${finalWeeks}|${simTeams.map(s => s.pts.toFixed(2)).join(',')}`);
    const results = simulateLeague({ teams: simTeams, remaining, model, n: finalWeeks, seed });

    members.forEach(({ t }, j) => {
      const r = results[j], s = simTeams[j], rc = rec[t.rosterId];
      t.race = {
        w: rc.w, l: rc.l, t: rc.t,
        pts: Math.round(s.pts * 100) / 100,
        odds: r3(r.viaPts + r.viaRec),
        viaPts: r3(r.viaPts),
        viaRec: r3(r.viaRec),
      };
    });
    const total = results.reduce((a, r) => a + r.viaPts + r.viaRec, 0);
    console.log(`  League ${li + 1} race: ${remaining.length} weeks left, odds sum ${total.toFixed(2)} (expect ${ADVANCE_BY_POINTS + ADVANCE_BY_RECORD})`);
  });

  return {
    finalWeeks,
    remainingWeeks: REGULAR_SEASON_WEEKS - finalWeeks,
    regularSeasonWeeks: REGULAR_SEASON_WEEKS,
    sims: SIM_COUNT,
    weeklySd: Math.round(model.sd * 10) / 10,
    shrinkK: Math.round(model.k * 10) / 10,
  };
}

async function main() {
  console.log(`Fetching scores at ${new Date().toISOString()}`);

  const state = await fetchJSON('https://api.sleeper.app/v1/state/nfl');
  const currentWeek = state.week;
  const seasonType = state.season_type;
  console.log(`NFL state: week ${currentWeek}, season_type: ${seasonType}`);

  if (!currentWeek || seasonType === 'off') { console.log('Offseason'); return; }
  if (seasonType === 'pre') {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      currentWeek: 0, gamesInProgress: false, lastUpdated: new Date().toISOString(),
      leagues: LEAGUES.map(l => ({ id: l.id, name: l.name })), teams: []
    }, null, 2));
    return;
  }

  // Load player cache
  if (!fs.existsSync(POS_PATH)) {
    console.error('ERROR: data/player-positions.json not found. Run Refresh Player Positions first.');
    process.exit(1);
  }
  const playerCache = JSON.parse(fs.readFileSync(POS_PATH, 'utf8'));
  console.log(`Loaded ${Object.keys(playerCache).length} players from cache`);

  // Schedule cache is optional — if it's missing, roster entries just won't
  // carry game-slot info and the site falls back to its old display.
  let scheduleData = {};
  if (fs.existsSync(SCHEDULE_PATH)) {
    try {
      scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
      console.log(`Loaded schedule cache for ${Object.keys(scheduleData).length} weeks`);
    } catch (e) {
      console.warn('WARNING: could not parse data/schedule.json, continuing without it.');
    }
  } else {
    console.warn('WARNING: data/schedule.json not found — game windows will not display. Run Refresh Schedule.');
  }

  // Future head-to-head pairings never change mid-season, so they're cached in
  // scores.json and only re-fetched once per NFL week instead of every run.
  let pairingsCache = { week: null, leagues: {} };
  try {
    const prev = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    if (prev && prev.pairingsCache) pairingsCache = prev.pairingsCache;
  } catch (e) { /* first run or unreadable file: just fetch fresh */ }

  const allTeams = [];
  const leaguesMeta = [];
  const leaguePairings = []; // per league: { week: [[rosterA, rosterB], ...] }

  for (let li = 0; li < LEAGUES.length; li++) {
    const league = LEAGUES[li];
    console.log(`\nLeague ${li + 1}: ${league.name} (${league.id})`);

    const users = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/users`);
    await sleep(200);
    const userMap = {};
    users.forEach(u => {
      userMap[u.user_id] = NAME_OVERRIDES[u.user_id]
        || u.metadata?.team_name || u.display_name || u.username || 'Unknown';
    });

    const rosters = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/rosters`);
    await sleep(200);

    // Per-roster: weekly scores and roster breakdowns
    const weeklyData = {}; // rosterId -> { scores: [], rosters: [] }
    const pairingsByWeek = {}; // week -> [[rosterA, rosterB], ...]

    for (let w = 1; w <= currentWeek; w++) {
      const matchups = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/matchups/${w}`);
      await sleep(200);
      pairingsByWeek[w] = groupPairings(matchups);

      matchups.forEach(m => {
        if (!weeklyData[m.roster_id]) weeklyData[m.roster_id] = { scores: [], rosters: [] };
        const wd = weeklyData[m.roster_id];

        while (wd.scores.length < w - 1) { wd.scores.push(0); wd.rosters.push([]); }

        const weekSchedule = scheduleData[w];
        const result = computeOptimalLineup(m.players_points, playerCache, weekSchedule);
        const fallback = result.score > 0 ? result.score : (m.points || 0);

        wd.scores[w - 1] = fallback;
        wd.rosters[w - 1] = result.roster;

        if (m.roster_id === 1 && w === currentWeek) {
          console.log(`  Roster 1 wk${w}: computed=${result.score} sleeper=${m.points} starters=${result.roster.filter(r=>r.s).length}`);
        }
      });
    }

    // Future head-to-head pairings (regular season only) for the playoff-race
    // simulation. Sleeper publishes the whole schedule up front; reuse the copy
    // cached by an earlier run this NFL week, and only fetch what's missing.
    // A failed fetch just means that week gets simulated with random pairings.
    const cachedFuture = (pairingsCache.week === currentWeek && pairingsCache.leagues[league.id]) || {};
    for (let w = currentWeek + 1; w <= REGULAR_SEASON_WEEKS; w++) {
      if (cachedFuture[w]) { pairingsByWeek[w] = cachedFuture[w]; continue; }
      try {
        const future = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/matchups/${w}`);
        pairingsByWeek[w] = groupPairings(future);
      } catch (err) {
        console.warn(`  Could not load week ${w} pairings: ${err.message}`);
        pairingsByWeek[w] = null;
      }
      await sleep(200);
    }

    rosters.forEach(r => {
      const wd = weeklyData[r.roster_id] || { scores: [], rosters: [] };
      const cumulative = wd.scores.reduce((sum, s) => sum + (s || 0), 0);

      allTeams.push({
        rosterId: r.roster_id,
        leagueId: league.id,
        leagueIdx: li,
        name: userMap[r.owner_id] || `Team ${r.roster_id}`,
        scores: wd.scores,
        rosters: wd.rosters,
        record: { wins: r.settings?.wins || 0, losses: r.settings?.losses || 0 },
        cumulative: Math.round(cumulative * 100) / 100,
        sleeperUrl: `https://sleeper.com/roster/${league.id}/${r.roster_id}`,
      });
    });

    leaguesMeta.push({ id: league.id, name: league.name });
    leaguePairings.push(pairingsByWeek);
    console.log(`  ${rosters.length} rosters, ${currentWeek} weeks fetched`);
  }

  const hasCurrentWeekScores = allTeams.some(t => (t.scores[currentWeek - 1] || 0) > 0);
  const gamesInProgress = hasCurrentWeekScores && isGameWindow();
  const weekConcluded = isWeekConcluded(scheduleData, currentWeek);
  console.log(`\nGame window: ${isGameWindow()}, scores exist: ${hasCurrentWeekScores}, gamesInProgress: ${gamesInProgress}, weekConcluded: ${weekConcluded}`);

  // Weeks that count as final. Odds only update when a week finalizes.
  const finalWeeks = (hasCurrentWeekScores && weekConcluded) ? currentWeek : currentWeek - 1;
  let race = null;
  try {
    race = computePlayoffRace(allTeams, leaguePairings, finalWeeks);
  } catch (e) {
    // never let the odds break the score update
    console.warn('WARNING: playoff race calculation failed, continuing without it:', e.message);
  }

  // Save future pairings for the next run (see pairingsCache above)
  const newPairingsCache = { week: currentWeek, leagues: {} };
  leaguesMeta.forEach((lg, li) => {
    const future = {};
    for (let w = currentWeek + 1; w <= REGULAR_SEASON_WEEKS; w++) {
      if (leaguePairings[li][w]) future[w] = leaguePairings[li][w];
    }
    newPairingsCache.leagues[lg.id] = future;
  });

  const output = {
    currentWeek, gamesInProgress, weekConcluded,
    lastUpdated: new Date().toISOString(),
    leagues: leaguesMeta,
    race,
    pairingsCache: newPairingsCache,
    teams: allTeams,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output));
  const sizeKB = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`\nWrote ${allTeams.length} teams (${sizeKB} KB) to ${OUT_PATH}`);
}

if (require.main === module) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}

module.exports = { simulateLeague, computePlayoffRace, computeRecords, estimateScoringModel, groupPairings };
