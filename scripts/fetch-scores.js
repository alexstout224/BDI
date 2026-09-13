/**
 * Big Dam Invitational — Score Fetcher v2
 * 
 * Computes optimal best ball lineups from individual player scores
 * rather than relying on Sleeper's pre-computed points field,
 * which can lag behind during live games.
 * 
 * No dependencies — uses only Node.js built-ins.
 * Run: node scripts/fetch-scores.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================
const LEAGUES = [
  { id: '1389692043155996674', name: 'League 1' },
  { id: '1401244219137376256', name: 'League 2' },
];

const NAME_OVERRIDES = {
  // 'sleeper_user_id': 'Preferred Display Name',
};

// Lineup slots: QB, RB, RB, WR, WR, WR, TE, FLEX(RB/WR/TE)
const LINEUP = { QB: 1, RB: 2, WR: 3, TE: 1 };

const OUT_PATH = path.join(__dirname, '..', 'data', 'scores.json');

// ============================================================
// API helpers
// ============================================================

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, {
      headers: { 'User-Agent': 'BigDamInvitational/2.0' }
    }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
        res.resume();
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Bad JSON from ${urlStr}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// Optimal lineup solver
// ============================================================

function computeOptimalScore(playersPoints, playerPositions) {
  if (!playersPoints || typeof playersPoints !== 'object') return 0;

  // Group player scores by position
  const byPos = { QB: [], RB: [], WR: [], TE: [] };

  for (const [pid, pts] of Object.entries(playersPoints)) {
    const score = pts || 0;
    if (score <= 0) continue;
    const pos = playerPositions[pid];
    if (pos && byPos[pos]) {
      byPos[pos].push(score);
    }
  }

  // Sort each position descending
  for (const pos in byPos) {
    byPos[pos].sort((a, b) => b - a);
  }

  // Fill required slots
  let total = 0;

  // QB: top 1
  for (let i = 0; i < LINEUP.QB; i++) total += byPos.QB[i] || 0;

  // RB: top 2
  for (let i = 0; i < LINEUP.RB; i++) total += byPos.RB[i] || 0;

  // WR: top 3
  for (let i = 0; i < LINEUP.WR; i++) total += byPos.WR[i] || 0;

  // TE: top 1
  for (let i = 0; i < LINEUP.TE; i++) total += byPos.TE[i] || 0;

  // FLEX: best remaining RB/WR/TE after filling required slots
  const flexCandidates = [];
  if (byPos.RB[LINEUP.RB]) flexCandidates.push(byPos.RB[LINEUP.RB]);
  if (byPos.WR[LINEUP.WR]) flexCandidates.push(byPos.WR[LINEUP.WR]);
  if (byPos.TE[LINEUP.TE]) flexCandidates.push(byPos.TE[LINEUP.TE]);

  if (flexCandidates.length > 0) {
    total += Math.max(...flexCandidates);
  }

  return Math.round(total * 100) / 100;
}

// ============================================================
// Game window detection
// ============================================================

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

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`Fetching scores at ${new Date().toISOString()}`);

  // 1. NFL state
  const state = await fetchJSON('https://api.sleeper.app/v1/state/nfl');
  const currentWeek = state.week;
  const seasonType = state.season_type;

  console.log(`NFL state: week ${currentWeek}, season_type: ${seasonType}`);

  if (!currentWeek || seasonType === 'off') {
    console.log('Offseason — nothing to fetch');
    return;
  }

  if (seasonType === 'pre') {
    console.log('Preseason — writing empty data');
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      currentWeek: 0, gamesInProgress: false,
      lastUpdated: new Date().toISOString(),
      leagues: LEAGUES.map(l => ({ id: l.id, name: l.name })),
      teams: []
    }, null, 2));
    return;
  }

  // 2. Load player positions from cache
  const posPath = path.join(__dirname, '..', 'data', 'player-positions.json');
  if (!fs.existsSync(posPath)) {
    console.error('ERROR: data/player-positions.json not found.');
    console.error('Run the "Refresh Player Positions" workflow first.');
    process.exit(1);
  }
  const playerPositions = JSON.parse(fs.readFileSync(posPath, 'utf8'));
  console.log(`Loaded ${Object.keys(playerPositions).length} player positions from cache`);

  // 3. Process each league
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
        || u.metadata?.team_name
        || u.display_name
        || u.username
        || 'Unknown';
    });

    const rosters = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/rosters`);
    await sleep(200);

    const weeklyScores = {};

    for (let w = 1; w <= currentWeek; w++) {
      const matchups = await fetchJSON(
        `https://api.sleeper.app/v1/league/${league.id}/matchups/${w}`
      );
      await sleep(200);

      matchups.forEach(m => {
        if (!weeklyScores[m.roster_id]) weeklyScores[m.roster_id] = [];

        while (weeklyScores[m.roster_id].length < w - 1) {
          weeklyScores[m.roster_id].push(0);
        }

        // Compute optimal lineup from individual player scores
        const computed = computeOptimalScore(m.players_points, playerPositions);

        // Fall back to Sleeper's points if we computed 0 but they have a value
        const score = computed > 0 ? computed : (m.points || 0);

        weeklyScores[m.roster_id][w - 1] = score;

        // Log roster 1 for sanity check
        if (m.roster_id === 1 && w === currentWeek) {
          console.log(`  Roster 1 wk${w}: computed=${computed} sleeper=${m.points}`);
        }
      });
    }

    rosters.forEach(r => {
      const scores = weeklyScores[r.roster_id] || [];
      const cumulative = scores.reduce((sum, s) => sum + (s || 0), 0);

      allTeams.push({
        rosterId: r.roster_id,
        leagueId: league.id,
        leagueIdx: li,
        name: userMap[r.owner_id] || `Team ${r.roster_id}`,
        scores,
        record: {
          wins: r.settings?.wins || 0,
          losses: r.settings?.losses || 0,
        },
        cumulative: Math.round(cumulative * 100) / 100,
        sleeperUrl: `https://sleeper.com/roster/${league.id}/${r.roster_id}`,
      });
    });

    leaguesMeta.push({ id: league.id, name: league.name });
    console.log(`  ${rosters.length} rosters, ${currentWeek} weeks fetched`);
  }

  // 4. Game state
  const hasCurrentWeekScores = allTeams.some(
    t => (t.scores[currentWeek - 1] || 0) > 0
  );
  const gamesInProgress = hasCurrentWeekScores && isGameWindow();

  console.log(`\nGame window: ${isGameWindow()}, scores exist: ${hasCurrentWeekScores}`);
  console.log(`gamesInProgress: ${gamesInProgress}`);

  // 5. Write output
  const output = {
    currentWeek,
    gamesInProgress,
    lastUpdated: new Date().toISOString(),
    leagues: leaguesMeta,
    teams: allTeams,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${allTeams.length} teams to ${OUT_PATH}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
