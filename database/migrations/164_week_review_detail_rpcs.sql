-- Migration 164: Week Review detail RPCs (Part B / B2 follow-up)
--
-- The Week Review screen computed "unpaid submitters" with a client-side query
-- against leaguesafe_payments, which is RLS-restricted (and PostgREST row-caps),
-- so most PAID users looked unpaid — producing a wildly inflated count (e.g. 244
-- when the true number is 0). These SECURITY DEFINER functions compute the
-- detail server-side so counts are correct and the screen can expand to show the
-- underlying rows.

-- Unpaid submitters: users who submitted picks THIS week but have no Paid
-- leaguesafe payment for the season. This is the correct denominator — only
-- people whose submissions we're actually looking at.
CREATE OR REPLACE FUNCTION public.wr_unpaid_submitters(p_week integer, p_season integer)
RETURNS TABLE(user_id uuid, display_name text, email text, pick_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, u.display_name, u.email, count(*) AS pick_count
  FROM public.picks p
  JOIN public.users u ON u.id = p.user_id
  WHERE p.season = p_season AND p.week = p_week AND p.submitted = true
    AND NOT EXISTS (
      SELECT 1 FROM public.leaguesafe_payments lp
      WHERE lp.user_id = p.user_id AND lp.season = p_season AND lp.status = 'Paid'
    )
  GROUP BY p.user_id, u.display_name, u.email
  ORDER BY u.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.wr_unpaid_submitters(integer, integer) TO authenticated;

-- Anonymous entries submitted this week that are neither tied to an account nor
-- already dismissed. Server-side so it isn't RLS/row-capped.
CREATE OR REPLACE FUNCTION public.wr_anonymous_unmatched(p_week integer, p_season integer)
RETURNS TABLE(email text, name text, pick_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ap.email, max(ap.name) AS name, count(*) AS pick_count
  FROM public.anonymous_picks ap
  WHERE ap.season = p_season AND ap.week = p_week AND ap.submitted = true
    AND ap.assigned_user_id IS NULL
    AND COALESCE(ap.validation_status, 'pending') <> 'rejected'
  GROUP BY ap.email
  ORDER BY max(ap.name);
$$;

GRANT EXECUTE ON FUNCTION public.wr_anonymous_unmatched(integer, integer) TO authenticated;

-- Dismiss an unmatched anonymous entry with an admin note (e.g. no payment found,
-- not a real entrant). Marks the email's unassigned picks for the week rejected
-- and records the note; they drop off the "to resolve" list.
CREATE OR REPLACE FUNCTION public.dismiss_anonymous_entry(
  p_email text, p_week integer, p_season integer, p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.anonymous_picks
  SET validation_status = 'rejected',
      admin_note = COALESCE(NULLIF(btrim(p_note), ''), admin_note),
      show_on_leaderboard = false
  WHERE season = p_season AND week = p_week
    AND lower(email) = lower(p_email)
    AND assigned_user_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_anonymous_entry(text, integer, integer, text) TO authenticated;
