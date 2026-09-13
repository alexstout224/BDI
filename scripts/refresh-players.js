/**
 * Fetches all NFL players from Sleeper and saves a slim
 * player_id -> position map to data/player-positions.json.
 * 
 * Run manually or weekly. The main fetch-scores.js reads this file
 * instead of hitting the massive players endpoint every 10 minutes.
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
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching all NFL players from Sleeper...');
  const allPlayers = await fetchJSON('https://api.sleeper.app/v1/players/nfl');

  const positions = {};
  let count = 0;

  for (const [pid, player] of Object.entries(allPlayers)) {
    if (!player || player.sport !== 'nfl') continue;
    const pos = (player.fantasy_positions && player.fantasy_positions[0]) || player.position;
    if (pos && ['QB', 'RB', 'WR', 'TE'].includes(pos)) {
      positions[pid] = pos;
      count++;
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(positions));

  const sizeKB = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`Wrote ${count} players (${sizeKB} KB) to ${OUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
