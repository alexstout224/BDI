/**
 * Big Dam Invitational — Score Fetcher
 * 
 * Pulls rosters, users, and matchups from the Sleeper API
 * and writes data/scores.json for the site to read.
 * 
 * No dependencies — uses only Node.js built-ins.
 * Run: node scripts/fetch-scores.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG — your league IDs go here
// ============================================================
const LEAGUES = [
  { id: '1401244219137376256', name: 'League 1' },
  { id: '1389692043155996674', name: 'League 2' },
];

const NAME_OVERRIDES = {
  // 'sleeper_user_id': 'Preferred Display Name',
};

const OUT_PATH = path.join(__dirname, '..', 'data', 'scores.json');

// ============================================================
// API helpers
// ============================================================

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, {
      headers: { 'User-Agent': 'BigDamInvitational/1.0' }
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
// Game window detection
// ============================================================

function isGameWindow() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu
  const hour = et.getHours();

  // Sunday 1pm through early Monday
  if (day === 0 && hour >= 13) return true;
  if (day === 1 && hour < 4) return true;

  // Monday Night Football through early Tuesday
  if (day === 1 && hour >= 19) return true;
  if (day === 2 && hour < 4) return true;

  // Wednesday opener (Week 1: Sep 9, 2026) through early Thursday
  if (day === 3 && hour >= 19) return true;
  if (day === 4 && hour < 4) return true;

  // Thursday Night Football through early Friday
  if (day === 4 && hour >= 19) return true;
  if (day === 5 && hour < 4) return true;

  // Saturday games (late season / playoffs)
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

  // During preseason, write an empty file so the site shows empty states
  if (seasonType === 'pre') {
    console.log('Preseason — writing empty data');
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      currentWeek: 0,
      gamesInProgress: false,
      lastUpdated: new Date().toISOString(),
      leagues: LEAGUES.map(l => ({ id: l.id, name: l.name })),
      teams: []
    }, null, 2));
    return;
  }

  const allTeams = [];
  const leaguesMeta = [];

  for (let li = 0; li < LEAGUES.length; li++) {
    const league = LEAGUES[li];
    console.log(`\nLeague ${li + 1}: ${league.name} (${league.id})`);

    // 2. Users (display names)
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

    // 3. Rosters (record + owner mapping)
    const rosters = await fetchJSON(`https://api.sleeper.app/v1/league/${league.id}/rosters`);
    await sleep(200);

    // 4. Matchups for each week through current
    const weeklyScores = {}; // rosterId -> [score, score, ...]

    for (let w = 1; w <= currentWeek; w++) {
      const matchups = await fetchJSON(
        `https://api.sleeper.app/v1/league/${league.id}/matchups/${w}`
      );
      await sleep(200);

      matchups.forEach(m => {
        if (!weeklyScores[m.roster_id]) weeklyScores[m.roster_id] = [];
        // Pad with 0s if weeks were skipped
        while (weeklyScores[m.roster_id].length < w - 1) {
          weeklyScores[m.roster_id].push(0);
        }
        weeklyScores[m.roster_id][w - 1] = m.points || 0;
      });
    }

    // 5. Build team objects
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

  // 6. Determine if games are in progress
  const hasCurrentWeekScores = allTeams.some(
    t => (t.scores[currentWeek - 1] || 0) > 0
  );
  const gamesInProgress = hasCurrentWeekScores && isGameWindow();

  console.log(`\nGame window: ${isGameWindow()}, current week has scores: ${hasCurrentWeekScores}`);
  console.log(`gamesInProgress: ${gamesInProgress}`);

  // 7. Write output
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
