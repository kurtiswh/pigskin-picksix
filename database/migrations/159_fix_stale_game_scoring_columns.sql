-- Migration 159: correct 11 stale game winner/bonus columns (Week 14, 2025)
--
-- 11 completed 2025 games have winner_against_spread / margin_bonus columns that
-- disagree with the canonical recompute. The PICKS are already correct (manually
-- fixed last season); only the game columns are stale. Because the pick-scoring
-- trigger reads those columns, editing any of the ~1034 affected picks would
-- re-corrupt them. This migration aligns the game columns to the picks.
--
-- Safety: no picks/anonymous_picks rows are modified; updating a game does not
-- fire pick re-scoring (the only games trigger is update_games_updated_at).
-- Full backups are taken first. Verified beforehand: 0 picks change, standings
-- unchanged (checksums), scoring_discrepancies(2025) -> 0 after.

-- ── 1. Backups (restorable) ────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS backups;

DROP TABLE IF EXISTS backups.picks_pre159;
CREATE TABLE backups.picks_pre159 AS
  SELECT id, user_id, game_id, week, season, selected_team, is_lock, result, points_earned
  FROM public.picks WHERE season = 2025;

DROP TABLE IF EXISTS backups.anon_pre159;
CREATE TABLE backups.anon_pre159 AS
  SELECT id, game_id, week, season, selected_team, is_lock, result, points_earned
  FROM public.anonymous_picks WHERE season = 2025;

DROP TABLE IF EXISTS backups.games_pre159;
CREATE TABLE backups.games_pre159 AS
  SELECT id, week, season, home_team, away_team, home_score, away_score, spread,
         winner_against_spread, margin_bonus, base_points, status
  FROM public.games WHERE season = 2025;

DROP TABLE IF EXISTS backups.season_leaderboard_pre159;
CREATE TABLE backups.season_leaderboard_pre159 AS
  SELECT * FROM public.season_leaderboard WHERE season = 2025;

DROP TABLE IF EXISTS backups.weekly_leaderboard_pre159;
CREATE TABLE backups.weekly_leaderboard_pre159 AS
  SELECT * FROM public.weekly_leaderboard WHERE season = 2025;

-- ── 2. Correct the stale game columns to the canonical recompute ───────────
UPDATE public.games g SET
  winner_against_spread = CASE
    WHEN (g.home_score + g.spread) > g.away_score THEN g.home_team
    WHEN g.away_score > (g.home_score + g.spread) THEN g.away_team
    ELSE 'push' END,
  margin_bonus = CASE
    WHEN ABS((g.home_score - g.away_score) + g.spread) >= 29 THEN 5
    WHEN ABS((g.home_score - g.away_score) + g.spread) >= 20 THEN 3
    WHEN ABS((g.home_score - g.away_score) + g.spread) >= 11 THEN 1
    ELSE 0 END
WHERE g.season = 2025 AND g.status = 'completed'
  AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL AND g.spread IS NOT NULL
  AND (
    g.winner_against_spread IS DISTINCT FROM (CASE
      WHEN (g.home_score + g.spread) > g.away_score THEN g.home_team
      WHEN g.away_score > (g.home_score + g.spread) THEN g.away_team
      ELSE 'push' END)
    OR COALESCE(g.margin_bonus, 0) <> (CASE
      WHEN ABS((g.home_score - g.away_score) + g.spread) >= 29 THEN 5
      WHEN ABS((g.home_score - g.away_score) + g.spread) >= 20 THEN 3
      WHEN ABS((g.home_score - g.away_score) + g.spread) >= 11 THEN 1
      ELSE 0 END)
  );

-- Rollback (manual, if ever needed):
--   UPDATE public.games g SET winner_against_spread = b.winner_against_spread,
--     margin_bonus = b.margin_bonus FROM backups.games_pre159 b WHERE b.id = g.id;
