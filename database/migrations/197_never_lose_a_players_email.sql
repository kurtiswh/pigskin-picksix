-- Migration 197: never lose an address a player has been known by
--
-- Both lookups resolve a player from three places: users.email,
-- users.leaguesafe_email, and rows in user_emails. The first two are single
-- columns — overwrite one and the address it held is gone from the system.
--
-- Nothing preserved it. public.users carried only two triggers,
-- enforce_leaguesafe_email_unique and update_users_updated_at, so changing a
-- sign-in email (Supabase Dashboard, an admin edit, a future change-email
-- screen) silently dropped the old one. A LeagueSafe payment recorded under
-- that address would stop resolving to the account: lookup_player_by_email
-- falls back to its 'payment' branch and reports has_login false, and
-- resolve_primary_user_id — which assigns anonymous picks — stops finding
-- them by it entirely.
--
-- This keeps the old value in user_emails whenever either column changes, so
-- a player stays matchable by every address they have ever used: the old one,
-- the new one, and the LeagueSafe one.
--
-- Archive only. Nothing is deleted, no payment moves, and matching stays
-- manual. Existing rows are left alone (ON CONFLICT DO NOTHING) — a value
-- already recorded is already safe.

CREATE OR REPLACE FUNCTION public.preserve_replaced_user_emails()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The address they used to sign in with. It was theirs and it was confirmed,
  -- so it goes in verified — 'alternate' rather than 'primary' because
  -- NEW.email holds that job now.
  IF NEW.email IS DISTINCT FROM OLD.email
     AND COALESCE(btrim(OLD.email), '') <> '' THEN
    INSERT INTO public.user_emails (
      user_id, email, email_type, is_primary, is_verified, verified_at,
      source, added_by, notes
    ) VALUES (
      OLD.id, lower(btrim(OLD.email)), 'alternate', false, true, NOW(),
      'previous sign-in email', OLD.id,
      'Kept when the sign-in email changed to ' || COALESCE(NEW.email, '(none)') ||
      ' so payments made under it still match'
    )
    ON CONFLICT (user_id, email) DO NOTHING;
  END IF;

  -- The LeagueSafe address. Deliberately not marked verified: it was set by an
  -- import or an admin, not proved by the player, and an emailed code can still
  -- confirm it later.
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

  -- is_primary_user_email is left unset on purpose: it carries a partial unique
  -- index (one true row per user), and the archived address is not the primary.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_replaced_user_emails ON public.users;

CREATE TRIGGER preserve_replaced_user_emails
  AFTER UPDATE OF email, leaguesafe_email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_replaced_user_emails();

COMMENT ON FUNCTION public.preserve_replaced_user_emails() IS
  'Archives users.email / users.leaguesafe_email into user_emails when either is '
  'replaced, so a player stays matchable by every address they have used.';
