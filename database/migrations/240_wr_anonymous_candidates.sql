-- Migration 240: propose accounts for an anonymous entry, so it can be tied
-- from Week Review instead of the advanced tools
--
-- The Anonymous picks row offers exactly two moves: auto-tie, which only
-- resolves an address find_user_id_for_email can match outright, and dismiss.
-- Anything in between meant leaving Week Review for Advanced pick tools and
-- picking an account out of a list of every player in the league.
--
-- Week 1 of 2026 shows why that is the wrong shape. Four entries are
-- unresolved. One of them, David Luke, resolves cleanly to a PAID account --
-- his submission address belongs to an account that was merged away, and
-- user_emails still carries the trail to the live one -- so auto-tie handles
-- it and simply had not been run. The rest have no exact match at all: one is
-- a near-miss on the mailbox name (kurtiswh-testflow against an account at
-- kurtiswh+test), and two have no account in the system. A list of 900 players
-- is no help with any of those; the candidates are.
--
-- So return every plausible account per entry with the reason it is plausible,
-- ranked: an exact address beats the trail through a merged account, which
-- beats a payment record, which beats a name, which beats a shared mailbox
-- name. Ties break toward the account that paid this season and then toward
-- the one already holding picks, which is the same preference
-- find_user_id_for_email applies. auto_tie_target repeats what auto-tie would
-- choose, so the caller can mark an entry the button already handles instead
-- of asking for a decision twice.
--
-- Merged accounts never appear as candidates -- they are excluded everywhere
-- else and tying an entry to one would hide it from the leaderboard.
--
-- Admin-gated: carries submission and account addresses, as 218, 238 and 239.

DROP FUNCTION IF EXISTS public.wr_anonymous_candidates(integer, integer);

CREATE FUNCTION public.wr_anonymous_candidates(p_week integer, p_season integer)
RETURNS TABLE(
  entry_email text, entry_name text,
  pick_count integer, lock_count integer, submitted_at timestamptz,
  auto_tie_target uuid,
  candidate_user_id uuid, candidate_name text, candidate_email text,
  basis text, basis_rank integer,
  is_paid boolean, has_picks boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  WITH entries AS (
    SELECT
      lower(ap.email) AS e_email,
      max(ap.name) AS e_name,
      count(*)::int AS e_picks,
      count(*) FILTER (WHERE ap.is_lock)::int AS e_locks,
      max(ap.submitted_at) AS e_at
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season AND ap.week = p_week
      AND ap.submitted = true
      AND ap.assigned_user_id IS NULL
      AND COALESCE(ap.validation_status, 'pending') <> 'rejected'
    GROUP BY lower(ap.email)
  ), live AS (
    SELECT u.id, u.display_name, lower(u.email) AS email, u.leaguesafe_email
    FROM public.users u
    WHERE u.email NOT LIKE '%\_merged\_%'
  ), raw AS (
    SELECT e.e_email, l.id AS cand, 'account email'::text AS why, 1 AS rnk
    FROM entries e JOIN live l ON l.email = e.e_email

    UNION ALL
    SELECT e.e_email, l.id, 'leaguesafe address on the account', 2
    FROM entries e JOIN live l ON lower(l.leaguesafe_email) = e.e_email

    UNION ALL
    SELECT e.e_email, l.id,
           CASE WHEN ue.email_type = 'merged' THEN 'address of an account merged into this one'
                ELSE 'alternate address on file' END, 3
    FROM entries e
    JOIN public.user_emails ue ON lower(ue.email) = e.e_email
    JOIN live l ON l.id = ue.user_id

    UNION ALL
    SELECT e.e_email, l.id, 'address on a payment record', 4
    FROM entries e
    JOIN public.leaguesafe_payments lp
      ON lower(lp.leaguesafe_email) = e.e_email AND lp.season = p_season
    JOIN live l ON l.id = lp.user_id

    UNION ALL
    SELECT e.e_email, l.id, 'same display name', 5
    FROM entries e JOIN live l
      ON lower(regexp_replace(l.display_name, '[^a-z]', '', 'gi'))
       = lower(regexp_replace(e.e_name, '[^a-z]', '', 'gi'))
    WHERE btrim(COALESCE(e.e_name, '')) <> ''

    UNION ALL
    SELECT e.e_email, l.id, 'same name on a payment record', 6
    FROM entries e
    JOIN public.leaguesafe_payments lp
      ON lp.season = p_season
     AND lower(regexp_replace(lp.leaguesafe_owner_name, '[^a-z]', '', 'gi'))
       = lower(regexp_replace(e.e_name, '[^a-z]', '', 'gi'))
    JOIN live l ON l.id = lp.user_id
    WHERE btrim(COALESCE(e.e_name, '')) <> ''

    UNION ALL
    SELECT e.e_email, l.id, 'same mailbox name, different domain', 7
    FROM entries e JOIN live l
      ON split_part(l.email, '@', 1) = split_part(e.e_email, '@', 1)
     AND l.email <> e.e_email
  ), best AS (
    SELECT r.e_email, r.cand, min(r.rnk) AS rnk
    FROM raw r GROUP BY r.e_email, r.cand
  ), ranked AS (
    SELECT
      b.e_email, b.cand, b.rnk,
      (SELECT min(r2.why) FROM raw r2
        WHERE r2.e_email = b.e_email AND r2.cand = b.cand AND r2.rnk = b.rnk) AS why,
      EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
              WHERE lp.user_id = b.cand AND lp.season = p_season AND lp.status = 'Paid') AS paid,
      EXISTS (SELECT 1 FROM public.picks pk
              WHERE pk.user_id = b.cand AND pk.season = p_season
              UNION ALL
              SELECT 1 FROM public.anonymous_picks ap2
              WHERE ap2.assigned_user_id = b.cand AND ap2.season = p_season) AS playing,
      row_number() OVER (
        PARTITION BY b.e_email
        ORDER BY b.rnk,
          EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
                  WHERE lp.user_id = b.cand AND lp.season = p_season AND lp.status = 'Paid') DESC,
          b.cand
      ) AS seq
    FROM best b
  )
  SELECT
    e.e_email, e.e_name, e.e_picks, e.e_locks, e.e_at,
    public.find_user_id_for_email(e.e_email, p_season),
    l.id, l.display_name, l.email,
    rk.why, rk.rnk,
    rk.paid, rk.playing
  FROM entries e
  LEFT JOIN ranked rk ON rk.e_email = e.e_email AND rk.seq <= 6
  LEFT JOIN live l ON l.id = rk.cand
  ORDER BY e.e_name, rk.rnk, rk.seq;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_anonymous_candidates(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_anonymous_candidates(integer, integer) TO authenticated, service_role;
