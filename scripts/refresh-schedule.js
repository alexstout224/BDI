/**
 * Big Dam Invitational — Schedule Refresher
 *
 * Fetches each team's kickoff time / opponent for the current NFL week
 * (and backfills any earlier weeks missing from the cache) from ESPN's
 * public scoreboard endpoint, and writes data/schedule.json:
 *
 *   { "1": { "CIN": { opp:"PIT", home:true, slot:"SUN 12P", kickoff:"2026-09-14T17:00Z" }, ... }, "2": {...} }
 *
 * fetch-scores.js reads this cache (same pattern as player-positions.json)
 * and stamps each player's game slot onto their roster entry so the site
 * can show "SUN 12P", "SNF", "MNF", "THU", or "BYE" next to their team,
 * and dim bench players only once their game window has passed.
 *
 * ESPN's scoreboard is an unofficial/undocumented endpoint. It's free and
 * requires no key, but treat it gently — this script only fetches once
 * per run and skips weeks it already has cached.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'data', 'schedule.json');

// All 32 team abbreviations, in Sleeper's convention (matches player-positions.json).
const ALL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB',
  'HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG',
  'NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS',
];

// ESPN uses a couple of abbreviations that differ from Sleeper's.
const ESPN_TO_SLEEPER_ABBR = { WSH: 'WAS', JAC: 'JAX' };
function normalizeAbbr(abbr) {
  return ESPN_TO_SLEEPER_ABBR[abbr] || abbr;
}

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, { headers: { 'User-Agent': 'BigDamInvitational/1.0' } }, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`)); res.resume(); return; }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Classify a kickoff time (ISO, UTC) into a display slot using US Central time,
// since the rest of the site is standardized on CT.
function slotLabel(kickoffISO) {
  const ct = new Date(new Date(kickoffISO).toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const day = ct.getDay(); // 0 Sun, 1 Mon, ... 4 Thu, 6 Sat
  const hour = ct.getHours() + ct.getMinutes() / 60;

  if (day === 4) return 'THU';
  if (day === 1) return 'MNF';
  if (day === 6) return 'SAT';
  if (day === 2) return 'TUE'; // rare weather/rescheduled game
  if (day === 0) {
    if (hour >= 18) return 'SNF';
    if (hour >= 13) return 'SUN 3P';
    return 'SUN 12P';
  }
  // Fallback for any other oddity (e.g. international windows)
  return ct.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

async function fetchWeekSchedule(week, seasonYear) {
  // NOTE: site.api.espn.com started rejecting non-browser requests (GitHub
  // Actions, server-side scripts, etc.) with a permission error in Aug 2026.
  // site.web.api.espn.com is the same endpoint, same path/params, and isn't
  // affected — that's why this uses .web instead of the "documented" host.
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${seasonYear}`;
  const data = await fetchJSON(url);

  const teams = {};
  const playing = new Set();

  (data.events || []).forEach(ev => {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp || !comp.date) return;

    const kickoff = comp.date;
    const slot = slotLabel(kickoff);

    const home = (comp.competitors || []).find(c => c.homeAway === 'home');
    const away = (comp.competitors || []).find(c => c.homeAway === 'away');
    if (!home || !away || !home.team || !away.team) return;

    const homeAbbr = normalizeAbbr(home.team.abbreviation);
    const awayAbbr = normalizeAbbr(away.team.abbreviation);

    teams[homeAbbr] = { opp: awayAbbr, home: true, slot, kickoff };
    teams[awayAbbr] = { opp: homeAbbr, home: false, slot, kickoff };
    playing.add(homeAbbr);
    playing.add(awayAbbr);
  });

  ALL_TEAMS.forEach(t => {
    if (!playing.has(t)) teams[t] = { opp: null, home: null, slot: 'BYE', kickoff: null };
  });

  return teams;
}

async function main() {
  console.log(`Refreshing schedule at ${new Date().toISOString()}`);

  const state = await fetchJSON('https://api.sleeper.app/v1/state/nfl');
  const currentWeek = state.week;
  const seasonYear = state.league_season || state.season;
  const seasonType = state.season_type;
  console.log(`NFL state: week ${currentWeek}, season ${seasonYear}, season_type: ${seasonType}`);

  if (!currentWeek || seasonType === 'off') { console.log('Offseason, skipping.'); return; }

  let cache = {};
  if (fs.existsSync(OUT_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch (e) { cache = {}; }
  }

  // Weeks strictly before the current one are done and won't change — reuse
  // the cache for those. Always refetch the current week since flex
  // scheduling can move Sunday/Monday/Thursday games later in the season.
  // A week that's cached but empty (e.g. from a prior failed fetch) is NOT
  // considered done — Object.keys check ensures those get retried.
  for (let w = 1; w <= currentWeek; w++) {
    if (cache[w] && Object.keys(cache[w]).length > 0 && w < currentWeek) continue;
    console.log(`Fetching schedule for week ${w}...`);
    try {
      cache[w] = await fetchWeekSchedule(w, seasonYear);
    } catch (err) {
      console.error(`  Failed to fetch week ${w}: ${err.message}`);
      if (!cache[w]) cache[w] = {}; // don't crash the whole run over one bad week
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(cache));
  const sizeKB = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`Wrote schedule for ${Object.keys(cache).length} weeks (${sizeKB} KB) to ${OUT_PATH}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
