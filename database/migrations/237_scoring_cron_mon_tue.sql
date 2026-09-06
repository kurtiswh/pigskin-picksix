-- Migration 237: live scoring had no coverage for Monday-night games
--
-- The scoring jobs ran on UTC days 4,5,6 (Thu-Sat) and 0 (Sun). Two windows
-- were uncovered, both of which contain real week 1 games:
--
--   * SMU @ Florida State kicks off Mon Sep 7 23:30 UTC (Mon 18:30 CT) and
--     finishes early Tuesday UTC. Neither day was scheduled, so that game
--     would never have been scored automatically.
--   * Sunday-night games kick at 23:30 UTC and finish after midnight, i.e. on
--     Monday UTC. The Sunday job stops at 23:59 UTC, so the last hours of
--     Wisconsin @ Notre Dame and Louisville @ Ole Miss were uncovered too.
--
-- Scheduled to the hours games actually occupy rather than around the clock,
-- to keep CFBD API usage down: Monday 22:00-23:59 for the kickoff, and
-- Monday/Tuesday 00:00-06:59 for games running past midnight UTC.

SELECT cron.schedule('live-scoring-mon-tue', '*/5 0-6,22-23 * * 1',
                     $$SELECT public.invoke_edge('live-score-updater');$$);
SELECT cron.schedule('live-scoring-tue-early', '*/5 0-6 * * 2',
                     $$SELECT public.invoke_edge('live-score-updater');$$);
SELECT cron.schedule('game-stats-mon-tue', '*/30 0-6,22-23 * * 1',
                     $$SELECT public.invoke_edge('update-game-stats');$$);
SELECT cron.schedule('game-stats-tue-early', '*/30 0-6 * * 2',
                     $$SELECT public.invoke_edge('update-game-stats');$$);
