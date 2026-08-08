-- Migration 199: stop players rewriting their own privileged columns
--
-- FOUND BY SECURITY REVIEW. Two problems, one root cause.
--
-- ROOT CAUSE (pre-existing, critical). `authenticated` holds table-level
-- UPDATE on public.users — every column, including is_admin — and the RLS
-- policies gate which ROW you may write, not which COLUMNS:
--     users_update_own              USING (auth.uid() = id OR lower(email) = jwt email)
--     "Users can manage own profile" USING (auth.uid() = id)
-- Both pass with is_admin flipped, because the row still belongs to the
-- caller. So any signed-in player could
--     PATCH /rest/v1/users?id=eq.<self>  {"is_admin": true}
-- and become an admin. Nothing in the app does this; nothing stopped it.
--
-- The same hole let a player set users.leaguesafe_email to any address, which
-- migration 197's archiving trigger then turned into a permanent, undeletable
-- ownership claim in user_emails — a table migration 190 deliberately closed
-- to direct writes so that claiming an address required a code emailed to it.
-- That chain fed resolve_primary_user_id (which assigns anonymous picks) and
-- the "Verified" badge an admin sees while reconciling payments.
--
-- WHY A TRIGGER AND NOT COLUMN GRANTS. Column-level privileges are checked
-- before RLS and apply to admins too — admins are just `authenticated` with
-- is_admin set — so REVOKE would break UserManagement's is_admin toggle and
-- UserDetailsModal's leaguesafe_email edit. A guard trigger can tell the two
-- apart.

CREATE OR REPLACE FUNCTION public.guard_privileged_user_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No end-user JWT: direct psql, service_role, imports, scheduled jobs.
  -- Those already hold full access by other means; leave them alone.
  IF auth.uid() IS NULL AND (auth.jwt() ->> 'email') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins keep the tools they have (is_admin toggle, LeagueSafe email edits,
  -- merges via link_email_to_user).
  IF public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  -- Everyone else: these columns are not theirs to set. Silently held rather
  -- than raised, so the ordinary profile save (display_name, preferences)
  -- still succeeds instead of erroring on an untouched column.
  NEW.is_admin          := OLD.is_admin;
  NEW.email             := OLD.email;
  NEW.leaguesafe_email  := OLD.leaguesafe_email;
  NEW.user_status       := OLD.user_status;
  NEW.payment_status    := OLD.payment_status;
  NEW.canonical_user_id := OLD.canonical_user_id;

  RETURN NEW;
END;
$$;

-- BEFORE, so the held values are what actually land — and so migration 197's
-- AFTER trigger never sees a player-driven email change to archive.
DROP TRIGGER IF EXISTS guard_privileged_user_columns ON public.users;
CREATE TRIGGER guard_privileged_user_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_privileged_user_columns();

COMMENT ON FUNCTION public.guard_privileged_user_columns() IS
  'RLS on public.users gates rows, not columns, and authenticated holds UPDATE '
  'on all of them. Holds privileged columns at their old values for non-admin '
  'end users so a player cannot grant themselves is_admin or claim an address.';


-- ── Archived addresses are no longer stamped "verified" ────────────────────
-- Nothing that matters reads is_verified for matching: neither
-- lookup_player_by_email nor resolve_primary_user_id filters on it. It is a
-- trust signal shown to admins (UserDetailsModal) and it is what
-- verify_email_claim's mailed code exists to earn. An archived address has
-- earned nothing, so it should not carry the badge.
CREATE OR REPLACE FUNCTION public.preserve_replaced_user_emails()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND COALESCE(btrim(OLD.email), '') <> '' THEN
    INSERT INTO public.user_emails (
      user_id, email, email_type, is_primary, is_verified,
      source, added_by, notes
    ) VALUES (
      OLD.id, lower(btrim(OLD.email)), 'alternate', false, false,
      'previous sign-in email', OLD.id,
      'Kept when the sign-in email changed to ' || COALESCE(NEW.email, '(none)') ||
      ' so payments made under it still match'
    )
    ON CONFLICT (user_id, email) DO NOTHING;
  END IF;

  IF NEW.leaguesafe_email IS DISTINCT FROM OLD.leaguesafe_email
     AND COALESCE(btrim(OLD.leaguesafe_email), '') <> '' THEN
    INSERT INTO public.user_emails (
      user_id, email, email_type, is_primary, is_verified,
      source, added_by, notes
    ) VALUES (
      OLD.id, lower(btrim(OLD.leaguesafe_email)), 'leaguesafe', false, false,
      'previous leaguesafe email', OLD.id,
      'Kept when the LeagueSafe email changed to ' || COALESCE(NEW.leaguesafe_email, '(none)') ||
      ' so payments made under it still match'
    )
    ON CONFLICT (user_id, email) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- ── Signup no longer asserts a verified address ────────────────────────────
-- handle_new_user fires AFTER INSERT ON auth.users, which is BEFORE the player
-- clicks the confirmation link. Writing is_verified = true there let anyone
-- register with someone else's address, never confirm, and still have that
-- address show as verified against their account.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_display_name TEXT;
  user_payment_status TEXT;
  v_created BOOLEAN := false;
BEGIN
  IF NEW.raw_user_meta_data ? 'display_name' AND
     NEW.raw_user_meta_data->>'display_name' IS NOT NULL AND
     TRIM(NEW.raw_user_meta_data->>'display_name') != '' THEN
    user_display_name := TRIM(NEW.raw_user_meta_data->>'display_name');
  ELSIF NEW.email IS NOT NULL AND NEW.email != '' THEN
    user_display_name := SPLIT_PART(NEW.email, '@', 1);
  ELSE
    user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;

  IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
    user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;

  user_payment_status := 'NotPaid';

  BEGIN
    INSERT INTO public.users (
      id, email, display_name, created_at, payment_status, is_admin
    ) VALUES (
      NEW.id, NEW.email, user_display_name,
      COALESCE(NEW.created_at, NOW()), user_payment_status, FALSE
    );
    v_created := true;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'User % already exists', NEW.email;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to create user profile: % %', SQLSTATE, SQLERRM;
  END;

  -- Recorded, not vouched for: they have not confirmed the address yet.
  IF v_created AND NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    INSERT INTO public.user_emails (
      user_id, email, email_type, is_primary, is_verified,
      is_primary_user_email, source, added_by, notes
    ) VALUES (
      NEW.id, lower(btrim(NEW.email)), 'primary', true, false,
      true, 'original account', NEW.id,
      'Sign-in address, recorded at registration'
    )
    ON CONFLICT (user_id, email) DO NOTHING;
  END IF;

  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    UPDATE public.users u
       SET preferences = COALESCE(u.preferences, '{}'::jsonb)
                         || jsonb_build_object('email_notifications', true,
                                               'pick_reminders', true,
                                               'deadline_alerts', true,
                                               'weekly_results', true)
     WHERE lower(u.email) = lower(NEW.email)
       AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = false;
  END IF;

  RETURN NEW;
END;
$$;


-- ── Undo migration 198's over-claim ────────────────────────────────────────
-- 198 backfilled is_verified = true for every account missing its own address,
-- including 1,143 import shells that have never authenticated and so have
-- never proved anything. Live accounts keep the badge — signing in confirmed
-- the address. Shells lose it.
UPDATE public.user_emails ue
SET is_verified = false, verified_at = NULL
FROM public.users u
WHERE ue.user_id = u.id
  AND ue.notes = 'Backfilled by migration 198 — sign-in address was only in users.email'
  AND ue.is_verified
  AND NOT EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.id = u.id OR lower(a.email) = lower(u.email)
  );


-- ── confirm_my_leaguesafe_email reports what actually happened ─────────────
-- It returned 'confirmed' even when the UPDATE matched no row (merged-away or
-- deleted account), so the prompt said "thanks" and nothing was written.
CREATE OR REPLACE FUNCTION public.confirm_my_leaguesafe_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_rows    INTEGER;
BEGIN
  v_user_id := public.current_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to confirm your LeagueSafe email.';
  END IF;

  UPDATE public.users
  SET leaguesafe_email_confirmed_at = NOW()
  WHERE id = v_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  RETURN jsonb_build_object('status', 'confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_my_leaguesafe_email() TO authenticated;
