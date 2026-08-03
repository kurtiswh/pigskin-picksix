-- Migration 186: per-touch audience targeting for the preseason sequence
--
-- Every touch previously went to every address in the system (~1,933). That is
-- right for a first announcement but wrong for follow-ups — most of that list
-- is people who last played years ago, and repeatedly mailing them is what
-- generates spam complaints. Now each touch chooses its own audience:
--
--   audience = 'all'      -> every mailable address (the old behavior, default)
--   audience = 'seasons'  -> only people who played in the listed seasons
--
-- "Played in season N" comes from all_season_finishes (the materialized view
-- behind career stats), which covers the full 2006+ archive. Sizes today:
--   everyone 1,933 · last 5 seasons 902 · last 2 seasons 710
--
-- Opt-outs are excluded from both the audience count and the send, so the
-- number the admin sees before scheduling is the number that gets mailed.

ALTER TABLE public.preseason_emails
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS audience_seasons integer[];

ALTER TABLE public.preseason_emails DROP CONSTRAINT IF EXISTS preseason_emails_audience_check;
ALTER TABLE public.preseason_emails ADD CONSTRAINT preseason_emails_audience_check
  CHECK (audience IN ('all', 'seasons'));

-- ── seasons available to target, with participant counts (for the picker) ──
CREATE OR REPLACE FUNCTION public.preseason_audience_seasons()
RETURNS TABLE(season integer, participants bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.season, count(DISTINCT f.user_id)
  FROM all_season_finishes f
  GROUP BY f.season
  ORDER BY f.season DESC;
$$;

-- ── how many people a given audience would actually reach ────────────────
-- Mirrors the enqueue query exactly (same email/opt-out filters and the same
-- dedupe by lowercased address) so the preview cannot disagree with the send.
CREATE OR REPLACE FUNCTION public.preseason_audience_count(
  p_audience text,
  p_seasons integer[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(DISTINCT lower(u.email))
  FROM public.users u
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
    AND (
      p_audience = 'all'
      OR (
        p_seasons IS NOT NULL AND array_length(p_seasons, 1) > 0
        AND EXISTS (
          SELECT 1 FROM all_season_finishes f
          WHERE f.user_id = u.id AND f.season = ANY(p_seasons)
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.preseason_audience_seasons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preseason_audience_count(text, integer[]) TO authenticated;

-- ── enqueue honors each touch's audience ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_due_preseason_emails()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  t record;
  c integer;
  touches integer := 0;
BEGIN
  FOR t IN SELECT * FROM public.preseason_emails
           WHERE status = 'scheduled' AND send_at <= now()
  LOOP
    INSERT INTO public.email_jobs (user_id, email, template_type, subject, html_content, text_content, scheduled_for, status, attempts)
    SELECT DISTINCT ON (lower(u.email))
           u.id, u.email, 'preseason', t.subject,
           public.wrap_email_shell(
             'Sign Up',
             replace(t.body_html, '{{name}}', COALESCE(NULLIF(btrim(u.display_name), ''), 'there')),
             'https://pigskinpicksix.com/unsubscribe?t=' || u.unsubscribe_token::text
           ),
           regexp_replace(replace(t.body_html, '{{name}}', COALESCE(NULLIF(btrim(u.display_name), ''), 'there')), '<[^>]*>', '', 'g')
             || E'\n\nUnsubscribe: https://pigskinpicksix.com/unsubscribe?t=' || u.unsubscribe_token::text,
           now(), 'pending', 0
    FROM public.users u
    WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
      AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
      AND (
        t.audience = 'all'
        OR (
          -- 'seasons' with nothing selected reaches nobody, deliberately:
          -- failing closed beats silently blasting the whole list.
          t.audience_seasons IS NOT NULL AND array_length(t.audience_seasons, 1) > 0
          AND EXISTS (
            SELECT 1 FROM all_season_finishes f
            WHERE f.user_id = u.id AND f.season = ANY(t.audience_seasons)
          )
        )
      )
    ORDER BY lower(u.email), u.created_at;

    GET DIAGNOSTICS c = ROW_COUNT;
    UPDATE public.preseason_emails
      SET status = 'enqueued', enqueued_at = now(), recipients_count = c, updated_at = now()
      WHERE id = t.id;
    touches := touches + 1;
  END LOOP;
  RETURN touches;
END;
$function$;
