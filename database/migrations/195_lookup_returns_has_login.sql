-- Migration 195: lookup_player_by_email reports whether the account can sign in
--
-- BUG: the register page could not tell a real account from an import-created
-- shell. matched_via = 'account' fires whenever ANY users row carries the
-- address as its sign-in email, and the LeagueSafe import creates users rows
-- that have never authenticated. So a returning player typing their own address
-- was told "we recognize that email, please continue creating an account" —
-- they already had one.
--
-- The function already works this out: the ORDER BY added in migration 191
-- ranks live accounts above shells using exactly this predicate. It just threw
-- the answer away after sorting. This returns it as has_login.
--
-- Additive: same query, same rows, one more key. Existing callers that ignore
-- has_login behave identically.

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
  v_live    BOOLEAN;
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

    -- The same predicate the ORDER BY used, kept this time. False here means an
    -- import-created shell: we hold their history, but nobody can sign into it.
    SELECT EXISTS (
      SELECT 1 FROM auth.users a
      WHERE a.id = v_user.id OR lower(a.email) = lower(v_user.email)
    ) INTO v_live;

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
      'has_login', v_live,
      'payment_status', v_status,
      'paid', COALESCE(lower(v_status), '') = 'paid'
    );
  END IF;

  -- Not a known account, but a payment exists under this address (import not
  -- matched to anyone yet) — still a "yes, we know you". No account, so no login.
  SELECT status INTO v_status
  FROM public.leaguesafe_payments
  WHERE season = p_season AND lower(leaguesafe_email) = v_email
  LIMIT 1;

  IF v_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', true, 'matched_via', 'payment',
      'has_login', false,
      'payment_status', v_status,
      'paid', COALESCE(lower(v_status), '') = 'paid'
    );
  END IF;

  -- Last resort: a payment in ANY season means they're a known league member
  IF EXISTS (SELECT 1 FROM public.leaguesafe_payments WHERE lower(leaguesafe_email) = v_email) THEN
    RETURN jsonb_build_object(
      'found', true, 'matched_via', 'payment_history',
      'has_login', false, 'paid', false
    );
  END IF;

  RETURN jsonb_build_object('found', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_player_by_email(TEXT, INTEGER) TO anon, authenticated;
