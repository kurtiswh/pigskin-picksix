-- Migration 191: profile emails that actually get recognized at pick time
--
-- WHAT PLAYERS ACTUALLY DO: they add their LeagueSafe email to their Pigskin
-- profile. Migration 190 built the confirm-by-code path for that; this makes the
-- everyday version work and puts a hard switch on outbound mail.
--
--   1. SENDING IS OFF. request_email_claim only mails an allowlisted address
--      (seeded with the commissioner's three). Everyone else gets 'not_enabled'
--      and no mail leaves the building. Flip email_claim_config.sending_enabled
--      when you're ready to open it up.
--
--   2. add_my_leaguesafe_email() — the simple add. Records the address on the
--      profile so lookups find it. It deliberately does NOT move payments or
--      merge accounts: recognition is safe to self-serve, moving money is not.
--
--   3. lookup_player_by_email() — resolves ANY email a player has on their
--      profile (sign-in, leaguesafe_email, or user_emails) to their account and
--      that season's payment. This is what makes "submit picks with any of my
--      emails and it knows who I am" true, on the pick sheet and on the
--      anonymous pick page.
--
--   4. link_email_to_user() — the money move (link payments, fold in a
--      placeholder account), factored out of verify_email_claim so an admin can
--      run the exact same thing with one click while sending is off.

-- ── 1. Outbound switch ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_claim_config (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE,
  sending_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allowlist       TEXT[]  NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_claim_config_singleton CHECK (id)
);

INSERT INTO public.email_claim_config (id, sending_enabled, allowlist)
VALUES (TRUE, FALSE, ARRAY[
  'kurtiswh@gmail.com',
  'kwh@bisoncfo.com',
  'newsletter@smbfinanceos.com'
])
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.email_claim_config IS
  'Kill switch for self-service claim emails. While sending_enabled is false, confirmation codes only go to addresses in allowlist.';

ALTER TABLE public.email_claim_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage email claim config" ON public.email_claim_config;
CREATE POLICY "Admins manage email claim config" ON public.email_claim_config
  FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Gate the send inside request_email_claim, right before the http call.
CREATE OR REPLACE FUNCTION public.email_claim_send_allowed(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT sending_enabled OR lower(p_email) = ANY (
       SELECT lower(unnest(allowlist)) FROM public.email_claim_config WHERE id
     )
     FROM public.email_claim_config WHERE id),
    FALSE
  );
$$;

-- ── 2. The money move, factored out so admins can run it too ───────────────
CREATE OR REPLACE FUNCTION public.link_email_to_user(p_user_id UUID, p_email TEXT, p_confirmed BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email      TEXT := lower(btrim(p_email));
  v_other_id   UUID;
  v_other_live BOOLEAN;
  v_merged     JSONB := NULL;
  v_linked     INTEGER := 0;
  v_seasons    INTEGER[] := '{}';
  v_conflicts  INTEGER[] := '{}';
BEGIN
  -- A placeholder account (never signed in) holding this address gets folded in;
  -- an account someone actually signs into never does.
  SELECT u.id INTO v_other_id
  FROM public.users u
  WHERE u.id <> p_user_id
    AND (
      lower(u.email) = v_email
      OR lower(COALESCE(u.leaguesafe_email, '')) = v_email
      OR EXISTS (SELECT 1 FROM public.user_emails ue
                 WHERE ue.user_id = u.id AND lower(ue.email) = v_email)
    )
  LIMIT 1;

  IF v_other_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      JOIN auth.users a ON a.id = u.id OR lower(a.email) = lower(u.email)
      WHERE u.id = v_other_id
    ) INTO v_other_live;

    IF v_other_live THEN
      RETURN jsonb_build_object('status', 'blocked', 'blocked_by', v_other_id);
    END IF;

    -- Free the address on the placeholder so the guard in 189 doesn't fire.
    UPDATE public.users
    SET leaguesafe_email = NULL
    WHERE id = v_other_id AND lower(COALESCE(leaguesafe_email, '')) = v_email;

    v_merged := public.merge_users(
      v_other_id, p_user_id, p_user_id,
      CASE WHEN p_confirmed
        THEN 'Confirmed email claim: ' || v_email
        ELSE 'Admin-approved profile email: ' || v_email
      END
    );
  END IF;

  -- Record the address (confirmed claims stamp verified_at; admin links don't)
  INSERT INTO public.user_emails (
    user_id, email, email_type, is_primary, is_verified, verified_at,
    source, added_by, notes
  ) VALUES (
    p_user_id, v_email, 'leaguesafe', false, true,
    CASE WHEN p_confirmed THEN NOW() ELSE NULL END,
    CASE WHEN p_confirmed THEN 'self-service claim' ELSE 'admin-linked profile email' END,
    p_user_id,
    CASE WHEN p_confirmed THEN 'Confirmed by emailed code' ELSE 'Linked by an admin' END
  )
  ON CONFLICT (user_id, email) DO UPDATE
  SET is_verified = true,
      verified_at = CASE WHEN p_confirmed THEN NOW() ELSE public.user_emails.verified_at END,
      email_type  = 'leaguesafe',
      updated_at  = NOW();

  UPDATE public.users
  SET leaguesafe_email = v_email, updated_at = NOW()
  WHERE id = p_user_id
    AND COALESCE(btrim(leaguesafe_email), '') = '';

  -- Seasons this account already has a payment for are left alone, not clobbered
  SELECT array_agg(DISTINCT season) INTO v_conflicts
  FROM public.leaguesafe_payments lp
  WHERE lower(lp.leaguesafe_email) = v_email
    AND lp.user_id IS DISTINCT FROM p_user_id
    AND EXISTS (SELECT 1 FROM public.leaguesafe_payments mine
                WHERE mine.user_id = p_user_id AND mine.season = lp.season);

  UPDATE public.leaguesafe_payments lp
  SET user_id = p_user_id, is_matched = true, updated_at = NOW()
  WHERE lower(lp.leaguesafe_email) = v_email
    AND lp.user_id IS DISTINCT FROM p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.leaguesafe_payments mine
                    WHERE mine.user_id = p_user_id AND mine.season = lp.season);

  -- Report the end state: merge_users may already have moved most of these.
  SELECT COUNT(*), COALESCE(array_agg(DISTINCT season ORDER BY season), '{}')
  INTO v_linked, v_seasons
  FROM public.leaguesafe_payments
  WHERE lower(leaguesafe_email) = v_email AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'status', 'linked',
    'payments_linked', v_linked,
    'seasons', to_jsonb(v_seasons),
    'season_conflicts', to_jsonb(COALESCE(v_conflicts, '{}')),
    'merged_account', v_other_id,
    'merge_result', v_merged
  );
END;
$$;

-- ── 3. The simple add: record it, don't move anything ──────────────────────
CREATE OR REPLACE FUNCTION public.add_my_leaguesafe_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_email      TEXT;
  v_own_email  TEXT;
  v_other_id   UUID;
  v_other_live BOOLEAN;
BEGIN
  v_user_id := public.current_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to add an email address.';
  END IF;

  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('status', 'invalid_email');
  END IF;

  SELECT lower(email) INTO v_own_email FROM public.users WHERE id = v_user_id;
  IF v_email = v_own_email THEN
    RETURN jsonb_build_object('status', 'own_email');
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_emails
             WHERE user_id = v_user_id AND lower(email) = v_email) THEN
    RETURN jsonb_build_object('status', 'already_added');
  END IF;

  -- Refuse an address that a real, signed-in account uses. Placeholder accounts
  -- (import-created, never logged in) are fine — that's the normal case, and
  -- nothing moves until it's confirmed or an admin links it.
  SELECT u.id INTO v_other_id
  FROM public.users u
  WHERE u.id <> v_user_id
    AND (lower(u.email) = v_email OR lower(COALESCE(u.leaguesafe_email, '')) = v_email)
  LIMIT 1;

  IF v_other_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users u
      JOIN auth.users a ON a.id = u.id OR lower(a.email) = lower(u.email)
      WHERE u.id = v_other_id
    ) INTO v_other_live;
    IF v_other_live THEN
      RETURN jsonb_build_object('status', 'blocked');
    END IF;
  END IF;

  -- Another player already put this address on their profile
  IF EXISTS (SELECT 1 FROM public.user_emails
             WHERE lower(email) = v_email AND user_id <> v_user_id
               AND source IN ('self-added profile email', 'self-service claim')) THEN
    RETURN jsonb_build_object('status', 'claimed_by_other');
  END IF;

  INSERT INTO public.user_emails (
    user_id, email, email_type, is_primary, is_verified,
    source, added_by, notes
  ) VALUES (
    v_user_id, v_email, 'leaguesafe', false, false,
    'self-added profile email', v_user_id,
    'Added by the player on their profile; not yet confirmed'
  );

  RETURN jsonb_build_object('status', 'added', 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_my_leaguesafe_email(TEXT) TO authenticated;

-- ── 4. Resolve any profile email -> account + payment ──────────────────────
-- Callable by anon so the anonymous pick sheet and the register page can stop
-- querying users/leaguesafe_payments directly. Returns only what the player
-- needs to see about themselves.
CREATE OR REPLACE FUNCTION public.lookup_player_by_email(p_email TEXT, p_season INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(btrim(COALESCE(p_email, '')));
  v_user    RECORD;
  v_status  TEXT;
  v_via     TEXT;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Any address the player has on their profile counts: sign-in email,
  -- leaguesafe_email, or anything in user_emails.
  SELECT u.id, u.display_name, u.email INTO v_user
  FROM public.users u
  WHERE lower(u.email) = v_email
     OR lower(COALESCE(u.leaguesafe_email, '')) = v_email
     OR EXISTS (SELECT 1 FROM public.user_emails ue
                WHERE ue.user_id = u.id AND lower(ue.email) = v_email)
  -- A real, signed-in account outranks an import-created shell that happens to
  -- carry the same address — otherwise adding your old LeagueSafe email to your
  -- profile would resolve to the old shell instead of you.
  ORDER BY
    EXISTS (SELECT 1 FROM auth.users a
            WHERE a.id = u.id OR lower(a.email) = lower(u.email)) DESC,
    (lower(u.email) = v_email) DESC
  LIMIT 1;

  IF FOUND THEN
    v_via := CASE WHEN lower(v_user.email) = v_email THEN 'account' ELSE 'profile' END;

    -- Payment for the season: on the account, or under this very address
    SELECT status INTO v_status
    FROM public.leaguesafe_payments
    WHERE season = p_season AND user_id = v_user.id
    LIMIT 1;

    IF v_status IS NULL THEN
      SELECT status INTO v_status
      FROM public.leaguesafe_payments
      WHERE season = p_season AND lower(leaguesafe_email) = v_email
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'found', true,
      'user_id', v_user.id,
      'display_name', v_user.display_name,
      'matched_via', v_via,
      'payment_status', v_status,
      'paid', COALESCE(lower(v_status), '') = 'paid'
    );
  END IF;

  -- Not a known account, but a payment exists under this address (import not
  -- matched to anyone yet) — still a "yes, we know you".
  SELECT status INTO v_status
  FROM public.leaguesafe_payments
  WHERE season = p_season AND lower(leaguesafe_email) = v_email
  LIMIT 1;

  IF v_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', true, 'matched_via', 'payment',
      'payment_status', v_status,
      'paid', COALESCE(lower(v_status), '') = 'paid'
    );
  END IF;

  -- Last resort: a payment in ANY season means they're a known league member
  IF EXISTS (SELECT 1 FROM public.leaguesafe_payments WHERE lower(leaguesafe_email) = v_email) THEN
    RETURN jsonb_build_object('found', true, 'matched_via', 'payment_history', 'paid', false);
  END IF;

  RETURN jsonb_build_object('found', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_player_by_email(TEXT, INTEGER) TO anon, authenticated;

-- ── 5. Signed-in player: am I paid, and which address did it match? ────────
CREATE OR REPLACE FUNCTION public.my_payment_status(p_season INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_row     RECORD;
BEGIN
  v_user_id := public.current_app_user_id();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Directly on the account first
  SELECT status, leaguesafe_email INTO v_row
  FROM public.leaguesafe_payments
  WHERE season = p_season AND user_id = v_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found', true, 'linked', true,
      'payment_status', v_row.status,
      'paid', COALESCE(lower(v_row.status), '') = 'paid',
      'matched_email', v_row.leaguesafe_email
    );
  END IF;

  -- Otherwise under any address on the profile. Reported as linked = false:
  -- we can see the payment, but it isn't attached to this account yet, so the
  -- leaderboards won't count it until it's confirmed or an admin links it.
  SELECT p.status, p.leaguesafe_email INTO v_row
  FROM public.leaguesafe_payments p
  WHERE p.season = p_season
    AND (
      lower(p.leaguesafe_email) = (SELECT lower(email) FROM public.users WHERE id = v_user_id)
      OR lower(p.leaguesafe_email) = (SELECT lower(COALESCE(leaguesafe_email, '~none~')) FROM public.users WHERE id = v_user_id)
      OR EXISTS (SELECT 1 FROM public.user_emails ue
                 WHERE ue.user_id = v_user_id AND lower(ue.email) = lower(p.leaguesafe_email))
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'found', true, 'linked', false,
      'payment_status', v_row.status,
      'paid', COALESCE(lower(v_row.status), '') = 'paid',
      'matched_email', v_row.leaguesafe_email
    );
  END IF;

  RETURN jsonb_build_object('found', false, 'linked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_payment_status(INTEGER) TO authenticated;

-- ── 6. Admin: approve a self-added address with one click ──────────────────
CREATE OR REPLACE FUNCTION public.admin_link_profile_email(p_user_id UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN public.link_email_to_user(p_user_id, p_email, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_link_profile_email(UUID, TEXT) TO authenticated;

-- ── 7. Point the confirmed path at the shared helper + the send switch ─────
CREATE OR REPLACE FUNCTION public.verify_email_claim(p_email TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email   TEXT;
  v_claim   RECORD;
  v_result  JSONB;
BEGIN
  v_user_id := public.current_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to confirm an email address.';
  END IF;

  v_email := lower(btrim(COALESCE(p_email, '')));

  SELECT * INTO v_claim
  FROM public.email_claims
  WHERE user_id = v_user_id AND lower(email) = v_email AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_pending');
  END IF;

  IF v_claim.expires_at <= NOW() THEN
    UPDATE public.email_claims SET status = 'expired' WHERE id = v_claim.id;
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF v_claim.attempts >= 5 THEN
    UPDATE public.email_claims SET status = 'failed' WHERE id = v_claim.id;
    RETURN jsonb_build_object('status', 'too_many_attempts');
  END IF;

  IF v_claim.code_hash <> encode(digest(v_email || ':' || btrim(COALESCE(p_code, '')), 'sha256'), 'hex') THEN
    UPDATE public.email_claims SET attempts = attempts + 1 WHERE id = v_claim.id;
    RETURN jsonb_build_object('status', 'bad_code', 'attempts_left', 4 - v_claim.attempts);
  END IF;

  v_result := public.link_email_to_user(v_user_id, v_email, TRUE);

  IF v_result ->> 'status' = 'blocked' THEN
    UPDATE public.email_claims
    SET status = 'failed', resolution = v_result
    WHERE id = v_claim.id;
    RETURN jsonb_build_object('status', 'blocked');
  END IF;

  UPDATE public.email_claims
  SET status = 'verified', verified_at = NOW(), resolution = v_result
  WHERE id = v_claim.id;

  RETURN jsonb_build_object('status', 'verified', 'email', v_email) || v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_email_claim(TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 191: profile emails + lookup installed; claim emails restricted to the allowlist';
END;
$$;
