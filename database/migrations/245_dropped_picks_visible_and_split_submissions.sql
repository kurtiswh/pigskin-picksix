-- Migration 245: keep a dropped pick on the sheet, and split anonymous entries
-- by submission
--
-- TWO THINGS THE WEEK 2 RULINGS EXPOSED.
--
-- 1. validate_pick_constraints counted ROWS, so a sheet already holding six
-- picks could not take a seventh even when one was disqualified. That is
-- inconsistent with how the league already works: the over-submission penalty
-- disqualifies a pick rather than deleting it, so a seven-row sheet with one
-- dropped is a state the system produces on its own. The row count made
-- carrying a locked pick back onto Griffin Knipp's and Schroeder's sheets
-- impossible without deleting the penalised pick, which erased the evidence --
-- the panel then showed six counted picks and no sign anything had been taken
-- away. Count live picks instead, so a dropped pick can stay on the sheet and
-- be seen.
--
-- 2. Anonymous sheets were grouped by address alone, so a player who submits
-- twice under the same address appeared as one sheet. Schroeder submitted
-- twice, Thursday 7:15pm and Friday 3:04pm, and the panel showed a single row
-- reading "0 of 12" with one timestamp -- which hid the fact that his second
-- submission still carried the Kansas pick he later dropped. Whether a
-- resubmission removed a pick before it locked decides the ruling, so each
-- submission has to be its own row. Group by the submission instant (truncated
-- to the second, since rows in one batch share it), and label repeat
-- submissions from one address #1, #2 in time order.

-- ---------------------------------------------------------------------------
-- 1. the pick-count guard counts live picks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_pick_constraints()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    pick_count INTEGER;
    lock_count INTEGER;
BEGIN
    -- Live picks only. A disqualified pick has been dropped from scoring and
    -- must not count against the six, or a sheet can never hold the record of
    -- what was taken off it.
    SELECT COUNT(*) INTO pick_count
    FROM public.picks
    WHERE user_id = NEW.user_id AND week = NEW.week AND season = NEW.season
      AND NOT disqualified;

    IF TG_OP = 'INSERT' AND NEW.disqualified IS NOT TRUE AND pick_count >= 6 THEN
        RAISE EXCEPTION 'Cannot have more than 6 picks per week';
    END IF;

    IF NEW.is_lock = TRUE AND NEW.disqualified IS NOT TRUE THEN
        SELECT COUNT(*) INTO lock_count
        FROM public.picks
        WHERE user_id = NEW.user_id AND week = NEW.week AND season = NEW.season
          AND is_lock = TRUE AND NOT disqualified;

        IF TG_OP = 'INSERT' AND lock_count >= 1 THEN
            RAISE EXCEPTION 'Cannot have more than 1 lock pick per week';
        END IF;

        IF TG_OP = 'UPDATE' AND lock_count > 1 THEN
            RAISE EXCEPTION 'Cannot have more than 1 lock pick per week';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. one row per anonymous SUBMISSION, not per address
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.wr_multiple_pick_sets(integer, integer);

CREATE FUNCTION public.wr_multiple_pick_sets(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text, account_email text,
  source text, set_label text,
  pick_count integer, counted_picks integer,
  lock_count integer, counted_locks integer,
  is_submitted boolean, disqualified_count integer,
  points integer, counted_points integer,
  last_submitted_at timestamptz,
  counts_for_leaderboard boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  WITH gate AS (
    SELECT DISTINCT p.user_id AS gated_user
    FROM public.picks p
    WHERE p.season = p_season AND p.week = p_week
      AND p.submitted = true AND p.show_on_leaderboard = true
  ), anon_subs AS (
    -- each distinct submission instant under an address is its own sheet
    SELECT ap.assigned_user_id AS sub_user,
           lower(ap.email) AS sub_email,
           date_trunc('second', ap.submitted_at) AS sub_at,
           row_number() OVER (PARTITION BY ap.assigned_user_id, lower(ap.email)
                              ORDER BY date_trunc('second', ap.submitted_at)) AS sub_no,
           count(*) OVER (PARTITION BY ap.assigned_user_id, lower(ap.email)) AS sub_total
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season AND ap.week = p_week AND ap.assigned_user_id IS NOT NULL
    GROUP BY ap.assigned_user_id, lower(ap.email), date_trunc('second', ap.submitted_at)
  ), sets AS (
    SELECT
      p.user_id AS set_user_id,
      'authenticated'::text AS set_source,
      lower(u.email) AS label,
      count(*)::int AS n_picks,
      count(*) FILTER (WHERE p.submitted AND p.show_on_leaderboard AND NOT p.disqualified)::int AS n_counted,
      count(*) FILTER (WHERE p.is_lock)::int AS n_locks,
      count(*) FILTER (WHERE p.is_lock AND p.submitted AND p.show_on_leaderboard AND NOT p.disqualified)::int AS n_counted_locks,
      bool_or(p.submitted) AS any_submitted,
      count(*) FILTER (WHERE p.disqualified)::int AS n_disqualified,
      COALESCE(sum(p.points_earned), 0)::int AS set_points,
      COALESCE(sum(p.points_earned) FILTER (
        WHERE p.submitted AND p.show_on_leaderboard AND NOT p.disqualified), 0)::int AS counted_set_points,
      max(p.submitted_at) AS last_submit
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.season = p_season AND p.week = p_week
    GROUP BY p.user_id, lower(u.email)

    UNION ALL

    SELECT
      ap.assigned_user_id,
      'anonymous'::text,
      lower(ap.email) || CASE WHEN s.sub_total > 1 THEN ' #' || s.sub_no ELSE '' END,
      count(*)::int,
      count(*) FILTER (
        WHERE ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
          AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id))::int,
      count(*) FILTER (WHERE ap.is_lock)::int,
      count(*) FILTER (
        WHERE ap.is_lock AND ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
          AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id))::int,
      bool_or(COALESCE(ap.submitted, true)),
      count(*) FILTER (WHERE COALESCE(ap.disqualified, false))::int,
      COALESCE(sum(ap.points_earned), 0)::int,
      COALESCE(sum(CASE WHEN g.status = 'completed'::game_status THEN ap.points_earned ELSE 0 END) FILTER (
        WHERE ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
          AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id)), 0)::int,
      max(ap.submitted_at)
    FROM public.anonymous_picks ap
    JOIN public.games g ON g.id = ap.game_id
    JOIN anon_subs s ON s.sub_user = ap.assigned_user_id
                    AND s.sub_email = lower(ap.email)
                    AND s.sub_at = date_trunc('second', ap.submitted_at)
    WHERE ap.season = p_season AND ap.week = p_week AND ap.assigned_user_id IS NOT NULL
    GROUP BY ap.assigned_user_id, lower(ap.email), s.sub_no, s.sub_total
  )
  SELECT
    s.set_user_id, u.display_name, lower(u.email),
    s.set_source, s.label,
    s.n_picks, s.n_counted, s.n_locks, s.n_counted_locks,
    s.any_submitted, s.n_disqualified,
    s.set_points, s.counted_set_points, s.last_submit,
    s.n_counted > 0
  FROM sets s
  JOIN public.users u ON u.id = s.set_user_id
  WHERE s.set_user_id IN (
    SELECT set_user_id FROM sets GROUP BY set_user_id HAVING count(*) > 1
  )
  ORDER BY u.display_name, s.set_source, s.label;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_multiple_pick_sets(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_multiple_pick_sets(integer, integer) TO authenticated, service_role;
