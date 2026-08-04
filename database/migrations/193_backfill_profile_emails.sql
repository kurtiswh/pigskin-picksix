-- Migration 193: show the matches we already made on the player's profile
--
-- Matching that has ALREADY been done — by a past account merge, by the
-- LeagueSafe import, or by an admin setting users.leaguesafe_email — stays
-- exactly as it is and simply appears on the player's profile. The claim flow
-- (190/191) is only for addresses we don't already know about.
--
-- Two gaps this closes:
--
--   1. 36 accounts carry a leaguesafe_email with no matching user_emails row,
--      so the address was invisible on the profile. Backfilled.
--
--   2. The profile had no way to tell "already matched" from "you just added
--      this, it isn't attached yet" — so a player whose merge was done years
--      ago would still be prompted to confirm an address that already works.
--      my_profile_emails() answers that from ground truth: does a payment under
--      this address actually belong to this account?

-- ── 1. Backfill: every leaguesafe_email becomes a visible profile address ──
INSERT INTO public.user_emails (
  user_id, email, email_type, is_primary, is_verified, source, added_by, notes
)
SELECT
  u.id,
  lower(btrim(u.leaguesafe_email)),
  'leaguesafe',
  false,
  true,
  'leaguesafe payment match',
  u.id,
  'Backfilled from the account''s LeagueSafe email (migration 193)'
FROM public.users u
WHERE COALESCE(btrim(u.leaguesafe_email), '') <> ''
  AND lower(u.leaguesafe_email) <> lower(u.email)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_emails ue
    WHERE ue.user_id = u.id AND lower(ue.email) = lower(u.leaguesafe_email)
  )
ON CONFLICT (user_id, email) DO NOTHING;

-- ── 2. Profile email list, with each address's real status ────────────────
CREATE OR REPLACE FUNCTION public.my_profile_emails()
RETURNS TABLE (
  id           UUID,
  email        TEXT,
  source       TEXT,
  verified_at  TIMESTAMPTZ,
  is_matched   BOOLEAN,
  seasons      INTEGER[],
  can_remove   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := public.current_app_user_id();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ue.id,
    -- email/source are varchar in user_emails; the signature is text
    ue.email::text,
    ue.source::text,
    ue.verified_at,
    -- Ground truth: a payment made under this address belongs to this account.
    -- True for every match already made (merge, import, admin), regardless of
    -- how the row got here.
    EXISTS (
      SELECT 1 FROM public.leaguesafe_payments p
      WHERE lower(p.leaguesafe_email) = lower(ue.email) AND p.user_id = v_user_id
    ) AS is_matched,
    COALESCE((
      SELECT array_agg(DISTINCT p.season ORDER BY p.season)
      FROM public.leaguesafe_payments p
      WHERE lower(p.leaguesafe_email) = lower(ue.email) AND p.user_id = v_user_id
    ), '{}') AS seasons,
    -- Only an address the player added themselves, that isn't earning them
    -- anything yet, is safe for them to delete. Historic matches are not.
    (
      ue.source = 'self-added profile email'
      AND NOT EXISTS (
        SELECT 1 FROM public.leaguesafe_payments p
        WHERE lower(p.leaguesafe_email) = lower(ue.email) AND p.user_id = v_user_id
      )
    ) AS can_remove
  FROM public.user_emails ue
  WHERE ue.user_id = v_user_id
  ORDER BY is_matched DESC, ue.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_profile_emails() TO authenticated;

-- ── 3. Match the delete policy to that rule ───────────────────────────────
-- Migration 190 let a player delete any non-primary address of theirs, which
-- would include an address a past merge attached. Restrict it to their own
-- unmatched additions.
DROP POLICY IF EXISTS "Users can remove own alternate emails" ON public.user_emails;
CREATE POLICY "Users can remove own alternate emails" ON public.user_emails
  FOR DELETE TO authenticated
  USING (
    user_id = public.current_app_user_id()
    AND COALESCE(is_primary, false) = false
    AND email_type <> 'primary'
    AND source = 'self-added profile email'
    AND NOT EXISTS (
      SELECT 1 FROM public.leaguesafe_payments p
      WHERE lower(p.leaguesafe_email) = lower(user_emails.email)
        AND p.user_id = user_emails.user_id
    )
  );

DO $$
DECLARE
  v_backfilled INT;
BEGIN
  SELECT COUNT(*) INTO v_backfilled
  FROM public.user_emails WHERE source = 'leaguesafe payment match';
  RAISE NOTICE '✅ Migration 193: % LeagueSafe address(es) now visible on profiles', v_backfilled;
END;
$$;
