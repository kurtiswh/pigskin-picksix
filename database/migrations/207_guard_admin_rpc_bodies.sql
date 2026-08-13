-- Migration 207: the admin RPCs check who is calling
--
-- 206 took these off the public internet. It could not do more than that: the
-- admin UI calls them from the browser, so `authenticated` has to keep EXECUTE,
-- and with ~600 accounts "any signed-in user" is not an acceptable audience for
-- merge_users or update_bracket_winners. A grant cannot express "admins only" —
-- the function has to ask.
--
-- Each of these now opens with assert_admin_or_server() (from 205), which
-- allows cron and the service role (no JWT role claim), allows admins, and
-- refuses everyone else.
--
-- ── Why the guard is injected rather than retyped ──────────────────────────
--
-- These are large functions — merge_users alone is hundreds of lines of
-- conflict resolution. Retyping twelve bodies to add one line each is how you
-- introduce a scoring bug while fixing a security bug. Instead the guard is
-- spliced into the existing definition read back from pg_get_functiondef(), so
-- every body is preserved byte for byte apart from the inserted line. The DO
-- block raises if it cannot find the insertion point, so a function is either
-- guarded correctly or the migration fails.
--
-- ── The trigger exception ──────────────────────────────────────────────────
--
-- update_season_leaderboard_with_source is called by
-- handle_anonymous_pick_assignment. That trigger function is currently attached
-- to no table, so there is no live path today — but if it is ever wired up it
-- would fire during an ordinary pick assignment, and a blanket guard would
-- break it. Its guard is therefore skipped inside trigger context, which is
-- exactly what pg_trigger_depth() is for.

DO $mig$
DECLARE
  r record;
  v_def text;
  v_new text;
  v_guard text;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND l.lanname = 'plpgsql'
      AND p.proname IN (
        'auto_tie_anonymous_picks', 'calculate_and_update_completed_game',
        'consolidate_user_under_primary', 'create_custom_pick_combination',
        'dismiss_anonymous_entry', 'get_or_create_season_winners',
        'merge_users', 'process_picks_for_completed_game',
        'select_user_pick_set', 'update_bracket_winners',
        'update_season_leaderboard_with_source'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);

    IF v_def ~ 'assert_admin_or_server' THEN
      RAISE NOTICE 'already guarded, skipping: %(%)', r.proname, r.args;
      CONTINUE;
    END IF;

    v_guard := CASE
      WHEN r.proname = 'update_season_leaderboard_with_source'
        THEN E'\n  IF pg_trigger_depth() = 0 THEN PERFORM public.assert_admin_or_server(); END IF;'
      ELSE E'\n  PERFORM public.assert_admin_or_server();'
    END;

    -- Splice after the first BEGIN of the function body (the one following the
    -- dollar-quoted opener), leaving everything else untouched.
    v_new := regexp_replace(v_def, '(AS \$[a-zA-Z_]*\$.*?)(\mBEGIN\M)', '\1\2' || v_guard, 'is');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'Could not find an insertion point in %(%) — aborting rather than guessing',
        r.proname, r.args;
    END IF;

    EXECUTE v_new;
    v_count := v_count + 1;
    RAISE NOTICE 'guarded: %(%)', r.proname, r.args;
  END LOOP;

  RAISE NOTICE 'guarded % function(s)', v_count;
END
$mig$;

-- set_pick_disqualified is LANGUAGE sql — no body to splice into — and short
-- enough to restate in full. Same UPDATE, now behind the same check.
CREATE OR REPLACE FUNCTION public.set_pick_disqualified(
  p_pick_id uuid,
  p_disqualified boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_or_server();

  UPDATE public.picks
  SET disqualified = p_disqualified, updated_at = now()
  WHERE id = p_pick_id;
END;
$$;

-- CREATE OR REPLACE preserves privileges, but set_pick_disqualified changed
-- language above, so restate its grants to be certain 206 still holds.
REVOKE EXECUTE ON FUNCTION public.set_pick_disqualified(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pick_disqualified(uuid, boolean) TO authenticated, service_role;
