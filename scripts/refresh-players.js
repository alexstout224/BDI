/**
 * Fetches all NFL players from Sleeper and saves a cache with
 * player_id -> { position, name, team } for use by the roster view.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'data', 'player-positions.json');

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, {
      headers: { 'User-Agent': 'BigDamInvitational/2.0' }
    }, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching all NFL players from Sleeper...');
  const allPlayers = await fetchJSON('https://api.sleeper.app/v1/players/nfl');

  const cache = {};
  let count = 0;

  for (const [pid, player] of Object.entries(allPlayers)) {
    if (!player || player.sport !== 'nfl') continue;
    const pos = (player.fantasy_positions && player.fantasy_positions[0]) || player.position;
    if (!pos || !['QB','RB','WR','TE'].includes(pos)) continue;

    const first = player.first_name || '';
    const last = player.last_name || '';
    const abbr = first ? `${first.charAt(0)}. ${last}` : last;

    cache[pid] = {
      p: pos,
      n: abbr,
      t: player.team || '',
    };
    count++;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(cache));

  const sizeKB = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`Wrote ${count} players (${sizeKB} KB) to ${OUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
