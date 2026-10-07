-- Migration 250: a pick's week and season always come from its game
--
-- In 2026, 13 sheets from Weeks 2-5 (78 picks: 72 anonymous, 6 account) were
-- saved as Week 14. The pick pages asked for the active week once with the
-- 2025 fallback season (whose last week is 14) and once with 2026; when the
-- 2025 answer landed last, the page showed the real week's games but saved
-- week = 14. The pages are fixed, but the database trusted whatever week the
-- page sent, so nothing stopped it.
--
-- This makes the game the authority: on insert, or on any update that touches
-- game_id, week or season, the row's week and season are set from games. A
-- page can no longer file a pick under a week its game isn't in.
--
-- It does not touch existing rows. The 78 misfiled picks stay where they are
-- until they are moved deliberately; an UPDATE of their week will then be
-- corrected to the game's week by this same trigger.
--
-- Applied to production Oct 7, 2026. Checked inside a rolled-back block: setting
-- week = 99 on a pick saved its game's week instead.
--
-- CREATE OR REPLACE TRIGGER (not DROP + CREATE) keeps the file re-runnable
-- without a destructive statement. Supabase's MCP tools wait for a confirmation
-- on DROP statements that never reaches a remote session, so the DROP version
-- timed out; this version applied through apply_migration and is recorded in
-- supabase_migrations.schema_migrations.
--
-- Trigger names start with "aa_" so they fire before the other BEFORE triggers
-- (PostgreSQL fires them in name order): validate_pick_constraints counts picks
-- per NEW.week and must see the corrected week.

CREATE OR REPLACE FUNCTION public.pick_week_from_game()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  g_week integer;
  g_season integer;
BEGIN
  SELECT g.week, g.season INTO g_week, g_season
  FROM public.games g WHERE g.id = NEW.game_id;

  IF FOUND THEN
    NEW.week := g_week;
    NEW.season := g_season;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER aa_pick_week_from_game
  BEFORE INSERT OR UPDATE OF game_id, week, season ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.pick_week_from_game();

CREATE OR REPLACE TRIGGER aa_pick_week_from_game
  BEFORE INSERT OR UPDATE OF game_id, week, season ON public.anonymous_picks
  FOR EACH ROW EXECUTE FUNCTION public.pick_week_from_game();
