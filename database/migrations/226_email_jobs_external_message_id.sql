-- Migration 226: add the column process-reminders has always tried to write
--
-- process-reminders marked a job sent with
--   .update({ status:'sent', sent_at, external_message_id })
-- but email_jobs has no external_message_id column, so the UPDATE failed
-- AFTER Resend had already accepted the message. The job stayed 'pending' and
-- every subsequent run re-sent it. Latent until now because nothing had ever
-- invoked the function successfully -- the render bug failed first.
--
-- Adding the column rather than dropping the field: the provider's message id
-- is the only way to trace a specific delivery in Resend later.

ALTER TABLE public.email_jobs
  ADD COLUMN IF NOT EXISTS external_message_id text;

COMMENT ON COLUMN public.email_jobs.external_message_id IS
  'Provider (Resend) message id for the delivery that marked this job sent.';
