-- Migration 190: self-service LeagueSafe email claims (verified by emailed code)
--
-- PROBLEM: people pay on LeagueSafe with an old address and submit picks under a
-- new one. Today the only fix is the commissioner hand-running a user merge, and
-- the result (multiple emails on one account) is invisible to the player.
--
-- FIX: the player claims the old address themselves and proves they control it.
--   request_email_claim(email)  -> stores a hashed 6-digit code, emails it to
--                                  THAT address via the send-email edge function
--   verify_email_claim(email,code) -> on success: records a verified user_emails
--                                  row, links unmatched leaguesafe_payments for
--                                  that address, and folds in an import-created
--                                  placeholder account (existing merge_users).
--
-- The code never reaches the browser — it is generated inside a SECURITY DEFINER
-- function and posted straight to the edge function with the Vault service-role
-- key (same path as public.invoke_edge, migration 173). Without that, "claim an
-- email" would just be a button that steals another player's entry.
--
-- REQUIRES migration 191, which creates the outbound switch this file calls
-- (email_claim_send_allowed) and rewires verify_email_claim onto the shared
-- link helper. Apply 190 and 191 together.
--
-- SAFETY RAILS
--   * An address owned by an account that has actually signed in is refused
--     outright (status 'blocked') — two live people are never auto-merged.
--   * An address owned by an import-created placeholder (no auth login) IS
--     merged, because the claimant just proved they own the address.
--   * A season that both accounts already have a payment for is left alone and
--     reported as a conflict instead of being overwritten.
--   * 5 codes per hour per player, 5 codes per hour per claimed address,
--     15-minute expiry, 5 wrong guesses and the claim is dead.

-- ── Caller identity ────────────────────────────────────────────────────────
-- Same id-or-verified-JWT-email match used by is_current_user_admin(): some
-- accounts have public.users.id != auth.users.id (merge leftovers, see 168/174).
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users
  WHERE id = auth.uid()
     OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '~none~'))
  ORDER BY (id = auth.uid()) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;

-- ── Claim ledger ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_claims (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  resolution   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at  TIMESTAMPTZ,
  CONSTRAINT email_claims_status_check
    CHECK (status IN ('pending', 'verified', 'expired', 'canceled', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_email_claims_user ON public.email_claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_claims_email ON public.email_claims(lower(email), created_at DESC);

COMMENT ON TABLE public.email_claims IS
  'Audit trail of self-service email claims. Written only by request_email_claim/verify_email_claim (SECURITY DEFINER); players never read it directly.';

ALTER TABLE public.email_claims ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy for players: everything they need comes back in the
-- RPC result. Admins can read the trail (and revoke a claim by hand).
DROP POLICY IF EXISTS "Admins can manage email claims" ON public.email_claims;
CREATE POLICY "Admins can manage email claims" ON public.email_claims
  FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── user_emails: stop players hand-writing their own "verified" rows ───────
-- The old policy was FOR ALL on own rows, which let any player insert a row
-- claiming any address with is_verified = true — exactly what the code round
-- trip exists to prevent. Reads/deletes stay self-service; writes go through
-- the claim RPC (or an admin).
DROP POLICY IF EXISTS "Users can manage own emails" ON public.user_emails;
DROP POLICY IF EXISTS "Users can view all emails" ON public.user_emails;

CREATE POLICY "Users can view own emails" ON public.user_emails
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_app_user_id()
    OR public.is_current_user_admin()
  );

CREATE POLICY "Users can remove own alternate emails" ON public.user_emails
  FOR DELETE TO authenticated
  USING (
    user_id = public.current_app_user_id()
    AND COALESCE(is_primary, false) = false
    AND email_type <> 'primary'
  );

-- ── Request a claim: generate + email a code ───────────────────────────────
CREATE OR REPLACE FUNCTION public.request_email_claim(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- extensions: pgcrypto (digest, gen_random_bytes) lives there; http lives in public
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id     UUID;
  v_own_email   TEXT;
  v_email       TEXT;
  v_other       RECORD;
  v_has_other   BOOLEAN := FALSE;
  v_other_live  BOOLEAN;
  v_code        TEXT;
  v_claim_id    UUID;
  v_expires     TIMESTAMPTZ;
  v_token       TEXT;
  v_resp        http_response;
  v_html        TEXT;
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

  -- Only a real round trip counts as linked. ~790 legacy rows carry
  -- is_verified = true from the original import with no verified_at; treating
  -- those as confirmed would refuse the very claims that still need to run the
  -- payment linking.
  IF EXISTS (
    SELECT 1 FROM public.user_emails
    WHERE user_id = v_user_id AND lower(email) = v_email AND verified_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('status', 'already_linked');
  END IF;

  -- Who else holds this address?
  SELECT u.id, u.display_name, u.email
    INTO v_other
  FROM public.users u
  WHERE u.id <> v_user_id
    AND (
      lower(u.email) = v_email
      OR lower(COALESCE(u.leaguesafe_email, '')) = v_email
      OR EXISTS (SELECT 1 FROM public.user_emails ue
                 WHERE ue.user_id = u.id AND lower(ue.email) = v_email)
    )
  LIMIT 1;

  v_has_other := FOUND;

  IF v_has_other THEN
    -- "Live" = someone has actually authenticated as that account. Those are
    -- real, separate people; a claim must never absorb one.
    SELECT EXISTS (
      SELECT 1 FROM auth.users a
      WHERE a.id = v_other.id OR lower(a.email) = lower(v_other.email)
    ) INTO v_other_live;

    IF v_other_live THEN
      RETURN jsonb_build_object('status', 'blocked');
    END IF;
  END IF;

  -- Outbound switch (migration 191): while sending is disabled, codes only go
  -- to allowlisted addresses so nothing reaches real players mid-build.
  IF NOT public.email_claim_send_allowed(v_email) THEN
    RETURN jsonb_build_object('status', 'not_enabled');
  END IF;

  -- Rate limits (per player, and per address across all players)
  IF (SELECT COUNT(*) FROM public.email_claims
      WHERE user_id = v_user_id AND created_at > NOW() - INTERVAL '1 hour') >= 5
     OR
     (SELECT COUNT(*) FROM public.email_claims
      WHERE lower(email) = v_email AND created_at > NOW() - INTERVAL '1 hour') >= 5
  THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  -- Supersede anything still outstanding for this pair
  UPDATE public.email_claims
  SET status = 'canceled'
  WHERE user_id = v_user_id AND lower(email) = v_email AND status = 'pending';

  v_code := lpad(abs((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::int) % 1000000)::text, 6, '0');
  v_expires := NOW() + INTERVAL '15 minutes';

  INSERT INTO public.email_claims (user_id, email, code_hash, expires_at)
  VALUES (
    v_user_id,
    v_email,
    encode(digest(v_email || ':' || v_code, 'sha256'), 'hex'),
    v_expires
  )
  RETURNING id INTO v_claim_id;

  -- Deliver the code server-side. The browser must never see it.
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_token IS NULL THEN
    UPDATE public.email_claims SET status = 'failed' WHERE id = v_claim_id;
    RAISE EXCEPTION 'Email is not configured (missing service key). Please contact admin@pigskinpicksix.com.';
  END IF;

  v_html :=
    '<div style="font-family:Inter,Arial,sans-serif;color:#3b3b3b">' ||
    '<h2 style="color:#4B3621;margin:0 0 12px">Confirm this email address</h2>' ||
    '<p>Someone (hopefully you) is adding <strong>' || v_email || '</strong> to a Pigskin Pick Six account ' ||
    'so a LeagueSafe payment can be matched to it.</p>' ||
    '<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#4B3621;margin:20px 0">' || v_code || '</p>' ||
    '<p>Enter that code on your profile page within 15 minutes.</p>' ||
    '<p style="color:#7a7a7a;font-size:13px">If this wasn''t you, ignore this email — nothing changes until the code is entered.</p>' ||
    '</div>';

  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  SELECT * INTO v_resp FROM http((
    'POST',
    'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/send-email',
    ARRAY[http_header('Authorization', 'Bearer ' || v_token)],
    'application/json',
    jsonb_build_object(
      'to', v_email,
      'subject', 'Your Pigskin Pick Six confirmation code',
      'html', v_html,
      'text', 'Your Pigskin Pick Six confirmation code is ' || v_code || '. It expires in 15 minutes.',
      'from', 'Pigskin Pick Six <admin@pigskinpicksix.com>'
    )::text
  )::http_request);

  IF v_resp.status < 200 OR v_resp.status >= 300 THEN
    UPDATE public.email_claims SET status = 'failed' WHERE id = v_claim_id;
    RAISE EXCEPTION 'Could not send the confirmation email (status %). Please try again shortly.', v_resp.status;
  END IF;

  RETURN jsonb_build_object(
    'status', 'sent',
    'email', v_email,
    'expires_at', v_expires,
    'merge_pending', v_has_other
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_email_claim(TEXT) TO authenticated;

-- ── Verify a claim: record the email, link the money ───────────────────────
CREATE OR REPLACE FUNCTION public.verify_email_claim(p_email TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id       UUID;
  v_email         TEXT;
  v_claim         RECORD;
  v_other_id      UUID;
  v_other_live    BOOLEAN;
  v_merged        JSONB := NULL;
  v_linked        INTEGER := 0;
  v_seasons       INTEGER[] := '{}';
  v_conflicts     INTEGER[] := '{}';
  v_resolution    JSONB;
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

  -- ── Proven. Fold the address in. ──
  -- 1. Placeholder account holding this address (re-checked at verify time, not
  --    just at request time — a real account could have appeared in between).
  SELECT u.id INTO v_other_id
  FROM public.users u
  WHERE u.id <> v_user_id
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
      UPDATE public.email_claims
      SET status = 'failed',
          resolution = jsonb_build_object('blocked_by_live_account', v_other_id)
      WHERE id = v_claim.id;
      RETURN jsonb_build_object('status', 'blocked');
    END IF;

    -- Free the address on the placeholder so the uniqueness guard (migration
    -- 189) doesn't fire, then run the existing merge.
    UPDATE public.users
    SET leaguesafe_email = NULL
    WHERE id = v_other_id AND lower(COALESCE(leaguesafe_email, '')) = v_email;

    v_merged := public.merge_users(
      v_other_id,
      v_user_id,
      v_user_id,
      'Self-service email claim: ' || v_email
    );
  END IF;

  -- 2. Record the verified address
  INSERT INTO public.user_emails (
    user_id, email, email_type, is_primary, is_verified, verified_at,
    source, added_by, notes
  ) VALUES (
    v_user_id, v_email, 'leaguesafe', false, true, NOW(),
    'self-service claim', v_user_id, 'Confirmed by emailed code'
  )
  ON CONFLICT (user_id, email) DO UPDATE
  SET is_verified = true,
      verified_at = NOW(),
      email_type  = 'leaguesafe',
      source      = 'self-service claim',
      updated_at  = NOW();

  -- 3. Mirror onto users.leaguesafe_email when the player hasn't set one
  UPDATE public.users
  SET leaguesafe_email = v_email, updated_at = NOW()
  WHERE id = v_user_id
    AND COALESCE(btrim(leaguesafe_email), '') = '';

  -- 4. Link payments made under that address, skipping seasons where this
  --    account already has a payment (don't overwrite a real record).
  SELECT array_agg(DISTINCT season) INTO v_conflicts
  FROM public.leaguesafe_payments lp
  WHERE lower(lp.leaguesafe_email) = v_email
    AND lp.user_id IS DISTINCT FROM v_user_id
    AND EXISTS (
      SELECT 1 FROM public.leaguesafe_payments mine
      WHERE mine.user_id = v_user_id AND mine.season = lp.season
    );

  UPDATE public.leaguesafe_payments lp
  SET user_id = v_user_id,
      is_matched = true,
      updated_at = NOW()
  WHERE lower(lp.leaguesafe_email) = v_email
    AND lp.user_id IS DISTINCT FROM v_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.leaguesafe_payments mine
      WHERE mine.user_id = v_user_id AND mine.season = lp.season
    );

  -- Report the end state, not just this statement's row count: when a
  -- placeholder account was merged above, merge_users has already moved most of
  -- the payments, and saying "0 linked" would read as a failure.
  SELECT COUNT(*), COALESCE(array_agg(DISTINCT season ORDER BY season), '{}')
  INTO v_linked, v_seasons
  FROM public.leaguesafe_payments
  WHERE lower(leaguesafe_email) = v_email
    AND user_id = v_user_id;

  v_resolution := jsonb_build_object(
    'payments_linked', v_linked,
    'seasons', to_jsonb(v_seasons),
    'season_conflicts', to_jsonb(COALESCE(v_conflicts, '{}')),
    'merged_account', v_other_id,
    'merge_result', v_merged
  );

  UPDATE public.email_claims
  SET status = 'verified', verified_at = NOW(), resolution = v_resolution
  WHERE id = v_claim.id;

  RETURN jsonb_build_object('status', 'verified', 'email', v_email) || v_resolution;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_email_claim(TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 190: self-service verified email claims installed';
END;
$$;
