-- Migration 189: let players record their own LeagueSafe email (safely)
--
-- WHY: LeagueSafe payments are matched to accounts by email address. When a
-- player pays with a different address than they log in with, that match has to
-- be made by hand today. The profile page now exposes users.leaguesafe_email so
-- the player can tell us themselves.
--
-- Two things that needs from the database:
--
-- 1. A guard. leaguesafe_email is the key that pulls a payment onto an account,
--    so a self-service field must not let one player claim an address that
--    already belongs to another account. Enforced in a trigger (not a unique
--    index) so the error message is something the UI can show, and so existing
--    rows are left alone.
--
-- 2. An RLS fallback. The live self-service policy ("Users can manage own
--    profile") is USING (auth.uid() = id), but some accounts have
--    public.users.id != auth.users.id (account-merge leftovers, see migrations
--    168/174/182) — for those the save silently updates 0 rows. Add a policy
--    with the same verified-JWT-email fallback used for admin checks; policies
--    are OR'd, so this widens rather than replaces.

-- ── 1. Guard: normalize + reject an address another account already owns ────
CREATE OR REPLACE FUNCTION public.enforce_leaguesafe_email_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimant_name TEXT;
BEGIN
  IF NEW.leaguesafe_email IS NULL OR btrim(NEW.leaguesafe_email) = '' THEN
    NEW.leaguesafe_email := NULL;
    RETURN NEW;
  END IF;

  NEW.leaguesafe_email := lower(btrim(NEW.leaguesafe_email));

  -- Unchanged value: nothing to check (avoids failing unrelated updates on a
  -- row that already carries a duplicate from the pre-guard days).
  IF TG_OP = 'UPDATE' AND OLD.leaguesafe_email IS NOT DISTINCT FROM NEW.leaguesafe_email THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO claimant_name
  FROM public.users
  WHERE id <> NEW.id
    AND (
      lower(email) = NEW.leaguesafe_email
      OR lower(leaguesafe_email) = NEW.leaguesafe_email
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'That LeagueSafe email is already attached to another account (%). Email admin@pigskinpicksix.com and we will sort it out.',
      COALESCE(claimant_name, 'another player')
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_leaguesafe_email_unique ON public.users;
CREATE TRIGGER enforce_leaguesafe_email_unique
  BEFORE INSERT OR UPDATE OF leaguesafe_email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_leaguesafe_email_unique();

-- ── 2. RLS: own-row update also matches on the verified JWT email ───────────
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '~none~'))
  )
  WITH CHECK (
    auth.uid() = id
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '~none~'))
  );

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 189: self-serve leaguesafe_email guarded + own-row RLS email fallback';
END;
$$;
