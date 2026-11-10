# Next season: fixes and setup

A running list of things to fix or check before the next season starts.

## Fixes
- **Player team history.** Each player's NFL team comes from the weekly player refresh, and every past week is rebuilt with the current team. A player traded mid-season shows his new team (and that team's game slot) in older weeks. Points are not affected. Fix: save the team on each week's roster when the week is final, and stop overwriting it.

## Season setup checklist
- New Sleeper league IDs in `index.html` (CONFIG) and the scripts.
- Season constants: regular season weeks (14), playoff weeks (15–17), advancement (top 2 points + top 2 record per league), playoff cuts (8 → 5 → 3).
- Clear last season's caches in `data/scores.json` (`raceHistory`, `pairingsCache`, `drafts`) so nothing carries over.
- `PLAYER_OVERRIDES` in `scripts/fetch-scores.js`: check for new two-way players missing from Sleeper's player list (2026: Travis Hunter, id 12530). Watch the Fetch Scores log for "unknown player" warnings.
- GitHub token used by the Cloudflare Worker clock: check its expiry and renew it (Worker secret `GH_TOKEN`).
- Cloudflare cron windows: Thanksgiving early games and any odd-day games (e.g. Christmas) only update on the 4 AM CT daily run. Add a temporary cron for those days if live scoring matters.
- Rules section: money example matches the number of leagues ($200 per league, paid 60/25/15).
