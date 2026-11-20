# Next season: fixes and setup

A running list of things to fix or check before the next season starts.

## Fixes
- **Player team history.** Each player's NFL team comes from the weekly player refresh, and every past week is rebuilt with the current team. A player traded mid-season shows his new team (and that team's game slot) in older weeks. Points are not affected. Fix: save the team on each week's roster when the week is final, and stop overwriting it.

## Nice to have
- **Smaller main data file.** `data/scores.json` holds every team's full roster for every week (~650 KB raw, ~55 KB compressed by Week 11). If it gets slow, move finished weeks' rosters to a separate file loaded only when a past week, team page or player page is opened.

## History and records (build for 2027)
- **Before 2026 data is cleared:** archive the final 2026 `data/scores.json` (e.g. `data/history/2026.json`). Teams now carry `ownerId` (Sleeper user id), which stays the same across seasons even when team names change, so 2026 can be matched to 2027.
- **Champion badge:** a badge next to the reigning champion's name if they play again.
- **Seasons played on team pages:** list the years that person has played, e.g. "2026 · 2027".
- **Records section** (spot TBD; the site is lean, so maybe a small section under Rules or its own tab):
  - Champion each year, with their stats (Week 17 score, regular season points, record).
  - Most regular season points.
  - Best record and worst record.
  - Possible extras: highest and lowest single week.

## Season setup checklist
- New Sleeper league IDs in `index.html` (CONFIG) and the scripts.
- Season constants: regular season weeks (14), playoff weeks (15–17), advancement (top 2 points + top 2 record per league), playoff cuts (8 → 5 → 3).
- Clear last season's caches in `data/scores.json` (`raceHistory`, `pairingsCache`, `drafts`) so nothing carries over.
- `PLAYER_OVERRIDES` in `scripts/fetch-scores.js`: check for new two-way players missing from Sleeper's player list (2026: Travis Hunter, id 12530). Watch the Fetch Scores log for "unknown player" warnings.
- GitHub token used by the Cloudflare Worker clock: check its expiry and renew it (Worker secret `GH_TOKEN`).
- Cloudflare cron windows: Thanksgiving early games and any odd-day games (e.g. Christmas) only update on the 4 AM CT daily run. Add a temporary cron for those days if live scoring matters.
- Rules section: money example matches the number of leagues ($200 per league, paid 60/25/15).
