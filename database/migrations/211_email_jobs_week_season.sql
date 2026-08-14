-- Migration 211: email_jobs learns which week it is for
--
-- EmailService.cancelScheduledEmails takes a season and a week and silently
-- ignores both:
--
--   .eq('user_id', userId).eq('status','pending')
--   .in('template_type', templateTypes)
--   .gte('scheduled_for', now)
--
-- There was nothing to filter on — the table had no week or season column — so
-- submitting picks for one week cancelled that player's pending reminders for
-- EVERY future week. Harmless today only because reminders are scheduled about
-- a week ahead, so there is rarely anything else queued. It would bite the first
-- time someone scheduled two weeks at once.
--
-- Rather than edit all nine queue_* functions to populate the new columns, a
-- trigger derives them from the payload every job already carries. That also
-- means the columns cannot drift from the payload the email is rendered from,
-- and jobs queued by anything added later get them for free.

ALTER TABLE public.email_jobs
  ADD COLUMN IF NOT EXISTS week integer,
  ADD COLUMN IF NOT EXISTS season integer;

COMMENT ON COLUMN public.email_jobs.week IS
  'Derived from payload->>week by trigger. Lets cancellation and admin queries '
  'scope to a single week instead of everything pending.';

CREATE OR REPLACE FUNCTION public.email_jobs_derive_week_season()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The payload is authoritative: it is what the email is rendered from, so the
  -- columns should never disagree with it.
  IF NEW.payload ? 'week' THEN
    NEW.week := NULLIF(NEW.payload->>'week', '')::integer;
  END IF;
  IF NEW.payload ? 'season' THEN
    NEW.season := NULLIF(NEW.payload->>'season', '')::integer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_jobs_derive_week_season ON public.email_jobs;
CREATE TRIGGER email_jobs_derive_week_season
  BEFORE INSERT OR UPDATE ON public.email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.email_jobs_derive_week_season();

-- Backfill anything already queued.
UPDATE public.email_jobs
SET week = NULLIF(payload->>'week', '')::integer,
    season = NULLIF(payload->>'season', '')::integer
WHERE payload IS NOT NULL
  AND (week IS NULL OR season IS NULL);

-- Cancellation reads (user_id, status, template_type, week, season).
CREATE INDEX IF NOT EXISTS idx_email_jobs_user_week_season
  ON public.email_jobs (user_id, season, week)
  WHERE status = 'pending';
