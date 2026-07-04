-- Migration 163: drop the orphaned competing scoring functions (Part B / B1 cleanup)
--
-- These functions were the OTHER scoring implementations that ScoreManager's
-- retired manual buttons used to call — the ones that computed pick points a
-- different way than the canonical calculate_and_update_completed_game and were
-- the source of last season's inconsistent scoring.
--
-- Verified safe before dropping (production, 2026-07-04):
--   * only the (now-deleted) ScoreManager dead code referenced them
--   * no other DB function/trigger/view references them (only
--     process_picks_for_week_with_timeout referenced calculate_pick_results...,
--     and both are dropped here)
--   * no pg_cron job references them (pg_cron not in use)
--   * no edge function references them (only the canonical RPC is used)
--
-- recalculate_leaderboards_for_week was already absent (not listed here).

DROP FUNCTION IF EXISTS public.process_picks_for_week_with_timeout(week_param integer, season_param integer, max_games_per_batch integer);
DROP FUNCTION IF EXISTS public.calculate_pick_results_for_game_optimized(game_id_param uuid);
DROP FUNCTION IF EXISTS public.calculate_pick_results_for_game(game_id_param uuid);
DROP FUNCTION IF EXISTS public.get_completed_games_for_week(week_param integer, season_param integer);
DROP FUNCTION IF EXISTS public.update_week_game_pick_counts(week_param integer, season_param integer);
