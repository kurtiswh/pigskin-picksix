-- Migration 198: every users row carries its own address in user_emails
--
-- Migration 193 backfilled user_emails once, in August 2025. handle_new_user
-- never wrote one, so every account created since has been missing the row for
-- its own sign-in address — 1,168 of them, and growing by roughly a dozen a
-- month. Proof of the cutoff: every live account WITH a row was created
-- 2025-07-30..2025-08-31; every live account without one was created after.
--
-- Nothing is broken today. lookup_player_by_email checks users.email directly,
-- and resolve_primary_user_id keeps a legacy fallback to it (step 3). But that
-- fallback is load-bearing rather than belt-and-braces, and my_profile_emails
-- reads user_emails ONLY — so those players open their profile and their own
-- sign-in address is missing from the list.
--
-- This does NOT create or grant accounts. A user_emails row records an address
-- that is already sitting in users.email; it confers no login. Import-created
-- shells stay exactly as they are — no auth.users row, has_login false, and
-- still required to register before anyone can sign in as them.
--
-- Two parts: stop the leak, then close the gap.

-- ── 1. New registrations record their address ──────────────────────────────
-- Note the v_created guard. When somebody registers with an address an import
-- shell already holds, the INSERT below hits users_email_key and is swallowed,
-- so NO users row exists for NEW.id — writing a user_emails row for it would
-- violate the foreign key. (See the note at the bottom: that swallowed
-- collision is how registration currently adopts a shell.)
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

  -- The address they registered with, so it is theirs on the record and not
  -- only in users.email. Matches the shape migration 193 backfilled.
  IF v_created AND NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    INSERT INTO public.user_emails (
      user_id, email, email_type, is_primary, is_verified, verified_at,
      is_primary_user_email, source, added_by, notes
    ) VALUES (
      NEW.id, lower(btrim(NEW.email)), 'primary', true, true, NOW(),
      true, 'original account', NEW.id,
      'Sign-in address, recorded at registration'
    )
    ON CONFLICT (user_id, email) DO NOTHING;
  END IF;

  -- Opting in again by registering (the signup form says so).
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

-- ── 2. Close the existing gap ──────────────────────────────────────────────
-- is_primary_user_email carries a partial unique index of one true row per
-- user, so it is only claimed where the account does not already have one
-- pointing somewhere else.
INSERT INTO public.user_emails (
  user_id, email, email_type, is_primary, is_verified, verified_at,
  is_primary_user_email, source, added_by, notes
)
SELECT
  u.id,
  lower(btrim(u.email)),
  'primary',
  true,
  true,
  NOW(),
  NOT EXISTS (
    SELECT 1 FROM public.user_emails p
    WHERE p.user_id = u.id AND p.is_primary_user_email
  ),
  'original account',
  u.id,
  'Backfilled by migration 198 — sign-in address was only in users.email'
FROM public.users u
WHERE COALESCE(btrim(u.email), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.user_emails ue
    WHERE ue.user_id = u.id AND lower(ue.email) = lower(u.email)
  )
ON CONFLICT (user_id, email) DO NOTHING;

-- ── Note on registering against an import shell ────────────────────────────
-- Worth writing down because it is load-bearing and entirely implicit.
--
-- users.email is UNIQUE. When somebody registers with an address a shell
-- already holds, handle_new_user's INSERT raises unique_violation, the handler
-- above logs a NOTICE, and no new users row is created. The app then resolves
-- them by email (fetchUserProfile falls back to an email lookup after missing
-- on id) and signs them in as the shell — inheriting its picks, payments and
-- history. So registration IS required and it DOES link to the prior record,
-- which is the intended behaviour.
--
-- But auth.uid() never equals users.id for those players — 451 of them today —
-- so any RLS policy keyed on that equality cannot match, and the link survives
-- only while the two email columns agree. Making that adoption explicit is a
-- separate change, deliberately not bundled here.
