-- Migration 235: rank every candidate account, don't stop at the first match
--
-- 234 added user_emails as a lookup source but kept the original structure:
-- try users.email/leaguesafe_email, and only if that finds nothing consult
-- user_emails. That short-circuit defeats the ranking. When a duplicate
-- account holds the address as its PRIMARY email, step 1 returns it and the
-- ranking never runs.
--
-- Parker R is the case: one account whose users.email IS the Apple relay
-- address, holding no payment and no picks, and a second holding a Paid entry
-- and six week 1 picks. Step 1 returned the empty one, so his anonymous
-- submissions would attach to the account he does not play from. Seven
-- addresses resolved to a dormant account this way.
--
-- 30 addresses are shared across 61 live accounts -- the same people holding
-- un-merged duplicates, mostly a real address alongside an Apple private
-- relay alias. Until those are merged, resolution has to pick well.
--
-- Now every source contributes candidates and they are ranked once: an account
-- with a paid entry this season, then one with picks, then anonymous picks,
-- then the account whose primary address this is, then the oldest. Tombstones
-- are excluded from every source.

CREATE OR REPLACE FUNCTION public.find_user_id_for_email(p_email text, p_season integer)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT u.id
    FROM public.users u
    WHERE (lower(u.email) = lower(p_email) OR lower(u.leaguesafe_email) = lower(p_email))
      AND u.email NOT LIKE '%\_merged\_%'

    UNION

    SELECT ue.user_id
    FROM public.user_emails ue
    JOIN public.users u ON u.id = ue.user_id
    WHERE lower(ue.email) = lower(p_email)
      AND u.email NOT LIKE '%\_merged\_%'

    UNION

    SELECT lp.user_id
    FROM public.leaguesafe_payments lp
    JOIN public.users u ON u.id = lp.user_id
    WHERE lp.season = p_season
      AND lower(lp.leaguesafe_email) = lower(p_email)
      AND u.email NOT LIKE '%\_merged\_%'
  )
  SELECT u.id
  FROM candidates c
  JOIN public.users u ON u.id = c.id
  WHERE p_email IS NOT NULL AND btrim(p_email) <> ''
  -- Payment first, then picks. Measured both orders against real data: this
  -- one resolves 176/176 merged addresses and leaves 298/300 ordinary players
  -- on their own account, versus 175/176 and 296/300 for picks-first. Where a
  -- person's duplicates split picks from payment, neither order is right --
  -- that needs a merge, not a better tiebreak.
  ORDER BY
    EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
            WHERE lp.user_id = u.id AND lp.season = p_season AND lp.status = 'Paid') DESC,
    EXISTS (SELECT 1 FROM public.picks pk
            WHERE pk.user_id = u.id AND pk.season = p_season) DESC,
    EXISTS (SELECT 1 FROM public.anonymous_picks ap
            WHERE ap.assigned_user_id = u.id AND ap.season = p_season) DESC,
    (lower(u.email) = lower(p_email)) DESC,
    u.created_at,
    u.id
  LIMIT 1;
$function$;
