-- Migration 234: resolve an anonymous submission by EVERY address on file
--
-- find_user_id_for_email checked users.email, users.leaguesafe_email, and the
-- season's leaguesafe_payments -- but never user_emails, which is the table
-- the profile page writes when someone adds "the address my LeagueSafe
-- receipt uses", and the table merge_users moves a merged account's addresses
-- into. 211 alternate addresses are on file and none of them could match.
--
-- Consequence for merged players: of 176 tombstones, only 12 of their original
-- addresses resolved to anything. The other 164 resolved to NOBODY, so an
-- anonymous submission under the address that person has always used would
-- land unassigned in the admin queue rather than on their account. Every one
-- of those 164 is recoverable from user_emails.
--
-- Also excludes merged tombstones from every branch. Before migration 227 a
-- tombstone could still be matched by its leaguesafe_email, which is how two
-- players' anonymous picks were tied to dead accounts and showed on the
-- leaderboard as "(Merged)".

CREATE OR REPLACE FUNCTION public.find_user_id_for_email(p_email text, p_season integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN NULL;
  END IF;

  -- 1) the account's own addresses
  SELECT id INTO v_user_id
  FROM public.users
  WHERE (lower(email) = lower(p_email) OR lower(leaguesafe_email) = lower(p_email))
    AND email NOT LIKE '%\_merged\_%'
  LIMIT 1;

  -- 2) any additional address the player has registered, which is also where
  --    a merge deposits the addresses of the account it absorbed
  IF v_user_id IS NULL THEN
    -- An address can sit on more than one account when a person still has
    -- un-merged duplicates. Choose deterministically and prefer the account
    -- that is actually live this season, so a submission does not land on a
    -- dormant twin: paid entry first, then one with picks, then the account
    -- whose primary address this is, then oldest id as a stable tiebreak.
    SELECT ue.user_id INTO v_user_id
    FROM public.user_emails ue
    JOIN public.users u ON u.id = ue.user_id
    WHERE lower(ue.email) = lower(p_email)
      AND u.email NOT LIKE '%\_merged\_%'
    ORDER BY
      EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
              WHERE lp.user_id = u.id AND lp.season = p_season AND lp.status = 'Paid') DESC,
      EXISTS (SELECT 1 FROM public.picks pk
              WHERE pk.user_id = u.id AND pk.season = p_season) DESC,
      (lower(ue.email) = lower(u.email)) DESC,
      u.created_at,
      ue.user_id
    LIMIT 1;
  END IF;

  -- 3) the season's payment register
  IF v_user_id IS NULL THEN
    SELECT lp.user_id INTO v_user_id
    FROM public.leaguesafe_payments lp
    JOIN public.users u ON u.id = lp.user_id
    WHERE lp.season = p_season
      AND lower(lp.leaguesafe_email) = lower(p_email)
      AND u.email NOT LIKE '%\_merged\_%'
    LIMIT 1;
  END IF;

  RETURN v_user_id;
END;
$function$;
