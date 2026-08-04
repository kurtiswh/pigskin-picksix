-- Migration 192: open self-service email confirmation to everyone
--
-- Migration 191 installed the claim flow with sending held behind an allowlist
-- (the commissioner's three addresses) so nothing could reach a real player
-- mid-build. That gate is now lifted at the commissioner's instruction: any
-- player adding a LeagueSafe email to their profile can confirm it themselves
-- with a code, and the payment/history link happens without an admin.
--
-- To pull the switch back (e.g. mid-season, or if Resend has a bad day):
--   UPDATE public.email_claim_config SET sending_enabled = FALSE WHERE id;
-- The allowlist stays populated, so confirmation emails keep working for the
-- commissioner's own addresses while everyone else falls back to "saved — the
-- commissioner will match your payment."
--
-- Rate limits still apply regardless of this flag: 5 codes/hour per player,
-- 5 codes/hour per claimed address, 15-minute expiry, 5 wrong guesses.

UPDATE public.email_claim_config
SET sending_enabled = TRUE,
    updated_at = NOW()
WHERE id;

DO $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT sending_enabled INTO v_enabled FROM public.email_claim_config WHERE id;
  IF NOT COALESCE(v_enabled, FALSE) THEN
    RAISE EXCEPTION 'email_claim_config.sending_enabled did not flip — check migration 191 ran';
  END IF;
  RAISE NOTICE '✅ Migration 192: self-service confirmation emails are live for all players';
END;
$$;
