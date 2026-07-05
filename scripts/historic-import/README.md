# PP6 Historic Import

Brings pre-2025 season data from `data/imports/historic/` into the database.
See `memory` note `pp6-historic-import` for the full plan and decisions.

## Stages

- **Stage 0 — staging (READ-ONLY)** — `stage0.py`. Parses a season's Master
  workbook + LeagueSafe file into reviewable JSON. **No DB writes.**
- **Stage 1 — load** (not built yet) — team-alias table → `games`, players →
  `anonymous_picks` (linked to `users` by email), re-scored, validated vs the
  season's Final Results PDF.

## Usage

```bash
cd scripts/historic-import
python3 stage0.py 2016            # one season
python3 stage0.py 2016 2017 2018  # several
```

Requires `python3` + `openpyxl` (already installed). Outputs land in
`data/imports/historic/_staging/<season>/` (gitignored):

| file | contents |
|------|----------|
| `games.json` | slate per (week, slot): favorite/underdog, spread, scores, status |
| `picks.json` | one row per selected game: player, team, is_lock, re-derived result/points |
| `payments.json` | LeagueSafe rows (owner, email, paid, status) |
| `players.json` | distinct players (name + both emails) — for identity matching |
| `team_names.json` | distinct team names — build the CFBD/DB alias table from this |
| `reconciliation.json` | re-derived weekly points vs the workbook's own total |
| `summary.json` | counts + parse warnings |

## Data model notes (validated on 2016)

- Weekly workbooks are **cumulative**; the **Master** (or the last week) is the
  single source of truth. Games are keyed by **(week, slot)** — slot numbers
  restart each week.
- `Games` sheet: col2 `Game`=slot, col4 `Dog`, col5 `Favorite`, col6 favorite
  spread (negative), col7 favorite score, col8 dog score. UPPER-CASE team name
  in the raw pick string denotes the favorite.
- `Picks` sheet: one row per player-week; `Game N:` columns hold `"Team ±spread"`
  strings; `Which game is your LOCK?` = `"Game N"`; a trailing `Points` column
  holds the workbook's own weekly total (used for reconciliation).
- Scoring re-derived from `common.score_pick` (mirrors `schema.sql`
  `calculate_pick_results`: 20 win / 10 push / 0 loss + margin bonus 1/3/5, lock
  doubles the bonus only).

## Points policy (decided)

Import **each workbook's own points** (historical truth), not re-derived scoring —
the league's scoring rules evolved (2020 changed margin-bonus tiers; manual
corrections/voids each year). `stage0` extracts authoritative per-pick points from
the Picks sheet's 2nd `Game N` block (loss=-1→0, push=10, win=value) and attributes
the lock's doubled bonus so per-pick `points_earned` sum to the official `Points`
total. Achieves **100% points integrity for 2016-2022**. `points_derived`/
`result_derived` are kept only as an informational cross-check.

## Coverage

- **2016-2022**: local `.xlsm/.xlsx` Masters — fully parsed, 100% points integrity.
- **2023-2025**: moved to Google Sheets (`.gsheet`); 2023's `.xlsm` is a Week-1 stub,
  2024 has no local workbook. Export the 2023/2024 Masters to `.xlsx` to parse them.

## 2016 pilot result

210 games, 28,990 picks, 379 players, 377 payments, 149 team names.
**Score reconciliation: 4,839 / 4,839 player-weeks = 100%.** 0 unmatched picks.
Rebuilt season #1 (Rick Wampler) matches the workbook's Final Leaderboard.

### Known items for Stage 1 (surfaced by the pilot)
- **Payment format varies**: `payment details*.csv` (2017+) vs `Leaguesafe.xlsx`
  (2016). `parse_payments` handles both; watch for new variants per season.
- **Blank first name** on a few rows collapses the display name (e.g. "Phelan"
  for "Travis Phelan"). Fold into identity matching by email.
- **3 player-weeks had >1 lock** in 2016 — needs a load-time rule (DQ, or
  first-lock-wins).
- Final leaderboard ordering will only match after applying the live system's
  **payment-gating + disqualification** rules; the raw rebuild is pre-gate.
- **Team-name → CFBD/DB alias table** (149 names in 2016) must be built and
  reviewed before load, for `games.home_team/away_team` and pick matching.
