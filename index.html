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
  if (day === 0 && hour >= 13) return true;
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

  const allTeams = [];
  const leaguesMeta = [];

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

    for (let w = 1; w <= currentWeek; w++) {
      const matchups = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/matchups/${w}`);
      await sleep(200);

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
    console.log(`  ${rosters.length} rosters, ${currentWeek} weeks fetched`);
  }

  const hasCurrentWeekScores = allTeams.some(t => (t.scores[currentWeek - 1] || 0) > 0);
  const gamesInProgress = hasCurrentWeekScores && isGameWindow();
  const weekConcluded = isWeekConcluded(scheduleData, currentWeek);
  console.log(`\nGame window: ${isGameWindow()}, scores exist: ${hasCurrentWeekScores}, gamesInProgress: ${gamesInProgress}, weekConcluded: ${weekConcluded}`);

  const output = {
    currentWeek, gamesInProgress, weekConcluded,
    lastUpdated: new Date().toISOString(),
    leagues: leaguesMeta,
    teams: allTeams,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output));
  const sizeKB = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`\nWrote ${allTeams.length} teams (${sizeKB} KB) to ${OUT_PATH}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
