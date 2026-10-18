-- Regenerates src/data/weekRecordsHistory.json "rows" for completed seasons.
-- Run after a season ends (bump the upper season), paste the output into "rows",
-- and update "seasons". Columns match the JSON: season, week, entries, perfect,
-- zero, over100, points, wins, losses, lock wins, lock losses.
with w as (
  select season s, week w, count(*) n,
    count(*) filter (where wins = 6 and losses = 0 and pushes = 0) p,
    count(*) filter (where wins = 0 and losses = 6 and pushes = 0) z,
    count(*) filter (where total_points > 100) o,
    sum(total_points) pts, sum(wins) wi, sum(losses) lo, sum(lock_wins) lw, sum(lock_losses) ll
  from weekly_leaderboard
  where picks_made > 0 and season between 2016 and 2025
  group by 1, 2
)
select string_agg(format('[%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s]', s, w, n, p, z, o, pts, wi, lo, lw, ll), ',' order by s, w)
from w;
