-- Migration 259: actually flag the 2026 Best Finish weeks (10-13)
--
-- WHY: migration 188 set best_finish_eligible for 2026 weeks 10-13, but it ran
-- before those week_settings rows existed, so it matched nothing. Weeks 10 and
-- 11 were then created with the column default (false), leaving no 2026 week
-- flagged and the Best Finish leaderboard empty.
--
-- This flags whatever 2026 rows exist in 10-13 now. Weeks 12-13 are flagged at
-- creation by the app (isDefaultBestFinishWeek in src/lib/league.ts). Re-runnable.

UPDATE public.week_settings
SET best_finish_eligible = TRUE
WHERE season = 2026
  AND week BETWEEN 10 AND 13
  AND NOT best_finish_eligible;

UPDATE public.week_settings
SET best_finish_eligible = FALSE
WHERE season = 2026
  AND week NOT BETWEEN 10 AND 13
  AND best_finish_eligible;
