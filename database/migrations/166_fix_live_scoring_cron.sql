-- Migration 166: fix the broken edge-function cron jobs (Part B / the real bug)
--
-- Discovery: the cron jobs that call edge functions were failing on multiple
-- levels, so server-side live scoring (and email reminders) never actually ran:
--   1. live-scoring / update-game-statistics called net.http_post(), but the
--      pg_net extension is NOT installed -> "schema net does not exist".
--   2. Those jobs' URL had a typo'd project ref (...rabbXljmiqy).
--   3. ALL of them carried a stale, legacy-format service-role JWT that the
--      edge functions now reject with 401 UNAUTHORIZED_LEGACY_JWT (this even
--      silently broke process-reminder-emails at the function level, though its
--      cron "succeeded" because the http call returned *a* response).
--
-- Fix: recreate every edge-function cron job using the installed `http`
-- extension, the correct URL, and the current service-role key read from
-- Supabase Vault at runtime (secret name 'service_role_key'). Reading from Vault
-- means the token is never stored in the cron command or this repo, and the jobs
-- keep working across key rotations.
--
-- Prerequisite (applied out-of-band, not in this file so no secret is committed):
--   the current service-role key is stored in Vault:
--     SELECT vault.create_secret('<key>', 'service_role_key', '...');
-- Verified: cron -> Vault key -> live-score-updater returns HTTP 200.

DO $$
DECLARE
  base text := 'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/';
  auth text := $auth$ARRAY[http_header('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key'))]$auth$;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    RAISE EXCEPTION 'Vault secret service_role_key is missing — create it before running this migration';
  END IF;

  -- Live scoring: every 5 minutes across the game week (Thu-Sat, and Sunday).
  PERFORM cron.schedule('live-scoring-thu-sat', '*/5 * * * 4,5,6', format(
    $c$SELECT http(('POST','%slive-score-updater',%s,'application/json','{}')::http_request);$c$, base, auth));

  PERFORM cron.schedule('live-scoring-sunday', '*/5 * * * 0', format(
    $c$SELECT http(('POST','%slive-score-updater',%s,'application/json','{}')::http_request);$c$, base, auth));

  -- Game statistics (pick counts): Saturdays.
  PERFORM cron.schedule('update-game-statistics', '0 16 * * 6', format(
    $c$SELECT http(('POST','%supdate-game-stats',%s,'application/json','{}')::http_request);$c$, base, auth));

  -- Email reminders: keep existing cadence, fix the token (was legacy/401).
  PERFORM cron.schedule('process-reminder-emails', '0 */15 6-23 * * *', format(
    $c$SELECT http(('POST','%sprocess-reminders',%s,'application/json','{}')::http_request);$c$, base, auth));
END $$;
