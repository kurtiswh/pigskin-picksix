-- Migration 252: stop (or restart) one pick sheet counting, from Week Review
--
-- Week Review flags a player whose counted picks add to more than 6, or more than
-- one lock, and says to hide the extras in Advanced pick tools. That only worked
-- when the extra sheet was an account sheet beside an anonymous entry: Duplicate
-- Pick Sets lists players with BOTH kinds, and its anonymous toggle hides every
-- anonymous pick the player has for the week. A player with two anonymous entries
-- (two addresses, or two submissions under one) never appears there, and hiding
-- "the anonymous picks" would hide both. 2026 Week 6: John Middleton, one sheet
-- under aol.com and one under gmail.com, 12 picks and 2 locks counting.
--
-- wr_set_sheet_counted names a sheet exactly as wr_multiple_pick_sets does
-- (source + set_label, where an anonymous label is the lowercased address plus
-- ' #n' when the address submitted more than once), and flips show_on_leaderboard
-- on that sheet's picks only. Leaderboards are views, so the change is live at once.

CREATE OR REPLACE FUNCTION public.wr_set_sheet_counted(
  p_user_id uuid, p_week integer, p_season integer,
  p_source text, p_set_label text, p_counted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN
  PERFORM public.assert_admin_or_server();

  IF p_source = 'authenticated' THEN
    UPDATE public.picks p
    SET show_on_leaderboard = p_counted
    WHERE p.user_id = p_user_id AND p.season = p_season AND p.week = p_week;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

  ELSIF p_source = 'anonymous' THEN
    WITH subs AS (
      SELECT lower(ap.email) AS sub_email,
             date_trunc('second', ap.submitted_at) AS sub_at,
             row_number() OVER (PARTITION BY lower(ap.email)
                                ORDER BY date_trunc('second', ap.submitted_at)) AS sub_no,
             count(*) OVER (PARTITION BY lower(ap.email)) AS sub_total
      FROM public.anonymous_picks ap
      WHERE ap.season = p_season AND ap.week = p_week AND ap.assigned_user_id = p_user_id
      GROUP BY lower(ap.email), date_trunc('second', ap.submitted_at)
    ), target AS (
      SELECT sub_email, sub_at FROM subs
      WHERE sub_email || CASE WHEN sub_total > 1 THEN ' #' || sub_no ELSE '' END = lower(p_set_label)
    )
    UPDATE public.anonymous_picks ap
    SET show_on_leaderboard = p_counted,
        is_active_pick_set = p_counted
    FROM target t
    WHERE ap.season = p_season AND ap.week = p_week AND ap.assigned_user_id = p_user_id
      AND lower(ap.email) = t.sub_email
      AND date_trunc('second', ap.submitted_at) IS NOT DISTINCT FROM t.sub_at;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'Unknown sheet source %', p_source;
  END IF;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No % sheet "%" for that player in week % of %', p_source, p_set_label, p_week, p_season;
  END IF;

  RETURN jsonb_build_object('counted', p_counted, 'picks_updated', v_updated,
    'source', p_source, 'set_label', p_set_label, 'week', p_week, 'season', p_season);
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_set_sheet_counted(uuid, integer, integer, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_set_sheet_counted(uuid, integer, integer, text, text, boolean) TO authenticated, service_role;
