-- Migration 196: record "I paid under this same address"
--
-- The post-sign-in prompt asks players whose account has no matched payment
-- which email they used on LeagueSafe. Most of them will answer "the same one
-- I'm signed in with" — and that answer is worth keeping rather than just
-- dismissing the prompt.
--
-- It tells the admin doing the matching that an unmatched payment is NOT an
-- email mismatch, which is otherwise something you work out by hand. And it's
-- what stops the prompt asking again forever.
--
-- Deliberately not a user_emails row: their sign-in address is already on the
-- account, and add_my_leaguesafe_email rejects it as 'own_email'. Nothing here
-- moves money — matching stays manual.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS leaguesafe_email_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.leaguesafe_email_confirmed_at IS
  'Set when the player confirmed they paid LeagueSafe under their sign-in email. '
  'An unmatched payment on such an account is a matching gap, not a wrong address.';

-- Players cannot UPDATE their own users row directly under RLS, so this goes
-- through a definer function like every other self-service action (190-191).
CREATE OR REPLACE FUNCTION public.confirm_my_leaguesafe_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := public.current_app_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to confirm your LeagueSafe email.';
  END IF;

  UPDATE public.users
  SET leaguesafe_email_confirmed_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object('status', 'confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_my_leaguesafe_email() TO authenticated;
