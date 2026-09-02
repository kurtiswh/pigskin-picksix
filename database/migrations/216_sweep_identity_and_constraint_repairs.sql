-- Migration 216: sweep repairs — identity fallback + constraint mismatches
--
-- Follow-up to 215, from a systematic sweep rather than the next player to
-- complain. Two families of defect, both long-standing and both invisible
-- until the strict policies landed (161/200) or the write path was exercised:
--
-- (1) Policies still keyed on bare auth.uid() = <user column>. 480 signed-in
--     players have profile id != auth id (profiles created by import before
--     the person ever signed up), so these policies simply do not see them.
--
-- (2) Functions writing values their own CHECK constraint rejects.
--     dismiss_anonymous_entry sets validation_status='rejected', which the
--     constraint has never allowed: the data confirms it -- zero 'rejected'
--     rows among 319k. The Week Review "dismiss entry" action has never
--     completed successfully. auto_tie_anonymous_picks (the batch RPC behind
--     Week Review's tie-up step; the singular trigger was fixed in 214) still
--     writes hyphenated 'auto-validated'.

-- ── (2a) batch auto-tie: same hyphen bug as the trigger, fixed in place ────
CREATE OR REPLACE FUNCTION public.auto_tie_anonymous_picks(p_week integer, p_season integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  r RECORD;
  v_user_id uuid;
BEGIN
  PERFORM public.assert_admin_or_server();

  FOR r IN
    SELECT DISTINCT email, season
    FROM public.anonymous_picks
    WHERE week = p_week AND season = p_season AND assigned_user_id IS NULL
  LOOP
    v_user_id := public.find_user_id_for_email(r.email, r.season);
    IF v_user_id IS NOT NULL THEN
      UPDATE public.anonymous_picks
      SET assigned_user_id = v_user_id,
          validation_status = 'auto_validated',
          show_on_leaderboard = TRUE
      WHERE week = p_week AND season = p_season
        AND lower(email) = lower(r.email)
        AND assigned_user_id IS NULL;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ── (2b) allow the status the dismiss flow was built around ────────────────
-- wr_anonymous_unmatched already filters <> 'rejected'; the only thing missing
-- was the constraint's permission to store it. No existing row conflicts.
ALTER TABLE public.anonymous_picks
  DROP CONSTRAINT anonymous_picks_validation_status_check;
ALTER TABLE public.anonymous_picks
  ADD CONSTRAINT anonymous_picks_validation_status_check
  CHECK (validation_status::text = ANY (ARRAY[
    'pending_validation', 'auto_validated', 'manually_validated',
    'duplicate_conflict', 'rejected'
  ]::text[]));

-- ── (1) identity fallback for the remaining player-facing policies ─────────
DROP POLICY IF EXISTS "Users can manage assigned anonymous picks" ON public.anonymous_picks;
CREATE POLICY "Users can manage assigned anonymous picks" ON public.anonymous_picks
  FOR ALL
  USING (public.is_current_user(assigned_user_id));

-- View your own payment row even when unmatched: the pick sheet's entry banner
-- reads this, so a mismatched or not-yet-matched player was told "we can't
-- find your entry" about a payment sitting right there under their email.
DROP POLICY IF EXISTS "Users can view own payments" ON public.leaguesafe_payments;
CREATE POLICY "Users can view own payments" ON public.leaguesafe_payments
  FOR SELECT
  USING (
    public.is_current_user(user_id)
    OR lower(leaguesafe_email) = lower(COALESCE(auth.jwt() ->> 'email', '~none~'))
  );

-- Claim your own payment row on login (useAuth does this PATCH). Scoped hard:
-- only the row carrying your verified email, and only to link it to yourself.
DROP POLICY IF EXISTS "Users can claim own payment by email" ON public.leaguesafe_payments;
CREATE POLICY "Users can claim own payment by email" ON public.leaguesafe_payments
  FOR UPDATE
  USING (lower(leaguesafe_email) = lower(COALESCE(auth.jwt() ->> 'email', '~none~')))
  WITH CHECK (
    lower(leaguesafe_email) = lower(COALESCE(auth.jwt() ->> 'email', '~none~'))
    AND public.is_current_user(user_id)
  );

DROP POLICY IF EXISTS "Users can manage own profile" ON public.users;
CREATE POLICY "Users can manage own profile" ON public.users
  FOR ALL
  USING (public.is_current_user(id));
