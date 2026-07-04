-- Migration 157: drop orphaned/redundant scoring functions (tier 1)
-- These 9 functions have ZERO references (frontend, other functions, triggers).
-- Verified via reference + internal-dependency analysis. Dropping does not
-- touch any stored data; the 2025 pick/anon checksums are unchanged.
-- Canonical scoring path retained: calculate_and_update_completed_game ->
-- process_picks_for_completed_game + the update_picks_from_completed_games trigger.

DROP FUNCTION IF EXISTS public.calculate_anonymous_pick_results(game_id uuid);
DROP FUNCTION IF EXISTS public.calculate_anonymous_picks_for_week(week_param integer, season_param integer);
DROP FUNCTION IF EXISTS public.calculate_comprehensive_pick_points(selected_team text, is_lock boolean, home_team text, away_team text, home_score integer, away_score integer, spread numeric, base_points integer, margin_bonus integer);
DROP FUNCTION IF EXISTS public.calculate_pick_from_game(selected_team text, is_lock boolean, winner_against_spread text, base_points integer, margin_bonus integer);
DROP FUNCTION IF EXISTS public.calculate_pick_results_for_week(week_param integer, season_param integer);
DROP FUNCTION IF EXISTS public.force_recalculate_specific_picks();
DROP FUNCTION IF EXISTS public.force_recalculate_using_existing_functions();
DROP FUNCTION IF EXISTS public.process_picks_on_completion();
DROP FUNCTION IF EXISTS public.recalculate_all_pick_statistics();
