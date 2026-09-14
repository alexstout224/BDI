
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

function computeOptimalLineup(playersPoints, playerCache) {
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

  if (flexCandidates.length > 0 && flexCandidates[0].pts > 0) {
    starters.add(flexCandidates[0].pid);
    slots[flexCandidates[0].pid] = 'FLX';
  }

  let score = 0;
  const roster = [];

  // Starters first, sorted by score desc
  const starterList = players.filter(p => starters.has(p.pid)).sort((a, b) => b.pts - a.pts);
  for (const p of starterList) {
    score += p.pts;
    roster.push({ n: p.name, p: p.pos, t: p.team, pts: p.pts, s: true, sl: slots[p.pid] });
  }

  // Bench sorted by position order then score
  const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3 };
  const benchList = players.filter(p => !starters.has(p.pid))
    .sort((a, b) => (posOrder[a.pos] ?? 9) - (posOrder[b.pos] ?? 9) || b.pts - a.pts);
  for (const p of benchList) {
    roster.push({ n: p.name, p: p.pos, t: p.team, pts: p.pts, s: false });
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

        const result = computeOptimalLineup(m.players_points, playerCache);
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
  console.log(`\nGame window: ${isGameWindow()}, scores exist: ${hasCurrentWeekScores}, gamesInProgress: ${gamesInProgress}`);

  const output = {
    currentWeek, gamesInProgress,
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
