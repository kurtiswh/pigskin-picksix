-- Migration 171: brand shell wrapper for server-sent (preseason) emails
--
-- Mirrors the TS emailShell so preseason emails match every other email's look
-- (brown header + gold rule + white body + footer). The admin-authored body is
-- wrapped at enqueue time.

CREATE OR REPLACE FUNCTION public.wrap_email_shell(p_subtitle text, p_body text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT
    $q$<div style="margin:0;padding:0;background:#F0EEE8"><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;color:#2A2118"><div style="background:#4B3621;border-radius:12px 12px 0 0;padding:22px 24px;text-align:center"><div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.02em">🏈 PIGSKIN PICK SIX</div><div style="height:3px;width:54px;background:#C9A04E;margin:10px auto 0;border-radius:2px"></div><div style="color:#E9DFcd;font-size:12px;margin-top:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:700">$q$
    || COALESCE(p_subtitle, '') ||
    $q$</div></div><div style="background:#ffffff;border:1px solid #E5DFD5;border-top:none;border-radius:0 0 12px 12px;padding:28px 26px">$q$
    || p_body ||
    $q$<div style="border-top:1px solid #E5DFD5;margin-top:28px;padding-top:16px;text-align:center;color:#7A6E60;font-size:12px;line-height:1.6"><div style="font-weight:700;color:#4B3621">The Pigskin Pick Six Team</div><div style="margin-top:4px"><a href="https://pigskinpicksix.com" style="color:#7A6E60">pigskinpicksix.com</a> &middot; <a href="https://pigskinpicksix.com/profile" style="color:#7A6E60">email preferences</a></div></div></div></div></div>$q$;
$fn$;

-- Re-enqueue with the shell wrapper around the admin body.
CREATE OR REPLACE FUNCTION public.enqueue_due_preseason_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
           public.wrap_email_shell('Sign Up', replace(t.body_html, '{{name}}', COALESCE(NULLIF(btrim(u.display_name), ''), 'there'))),
           regexp_replace(replace(t.body_html, '{{name}}', COALESCE(NULLIF(btrim(u.display_name), ''), 'there')), '<[^>]*>', '', 'g'),
           now(), 'pending', 0
    FROM public.users u
    WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    ORDER BY lower(u.email), u.created_at;

    GET DIAGNOSTICS c = ROW_COUNT;
    UPDATE public.preseason_emails
      SET status = 'enqueued', enqueued_at = now(), recipients_count = c, updated_at = now()
      WHERE id = t.id;
    touches := touches + 1;
  END LOOP;
  RETURN touches;
END;
$$;
