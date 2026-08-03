-- Migration 184: real one-click unsubscribe (no login required)
--
-- PROBLEM:
--   The preseason blast goes to every address in the system (~1,933), but the
--   only "email preferences" link in the footer points at /profile, which
--   requires an account and a login. Most of those recipients have never
--   logged in, so there was no working opt-out at all:
--     * CAN-SPAM requires a functioning opt-out that does not require the
--       recipient to log in or create an account.
--     * Practically worse: no unsubscribe means spam complaints instead, which
--       burns the sending domain's reputation and starts pushing the
--       transactional mail (magic links, password resets) into spam folders.
--   enqueue_due_preseason_emails() also ignored users.preferences entirely, so
--   even someone who had turned email_notifications off still got the blast.
--
-- FIX:
--   * users.unsubscribe_token — stable, unguessable, per-user.
--   * unsubscribe_by_token() / resubscribe_by_token() / unsubscribe_status() —
--     SECURITY DEFINER RPCs callable by anon, so the public /unsubscribe page
--     works with no session.
--   * wrap_email_shell() gains an optional unsubscribe URL and renders a real
--     "unsubscribe" link next to the preferences link.
--   * The preseason blast now skips anyone opted out and stamps each
--     recipient's own token into their copy.
--
-- Opting out sets preferences.email_notifications = false, which the existing
-- getUsersForNotification() filter already honors for reminders/results.
-- Registering (or re-registering) flips it back on — the signup form says so.

-- ── token ────────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS unsubscribe_token uuid;
UPDATE public.users SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;
ALTER TABLE public.users ALTER COLUMN unsubscribe_token SET DEFAULT gen_random_uuid();
ALTER TABLE public.users ALTER COLUMN unsubscribe_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_unsubscribe_token_key ON public.users(unsubscribe_token);

-- ── RPCs (anon-callable; token is the only credential) ───────────────────
CREATE OR REPLACE FUNCTION public.unsubscribe_status(p_token uuid)
RETURNS TABLE(email text, display_name text, subscribed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.email, u.display_name,
         COALESCE((u.preferences->>'email_notifications')::boolean, true)
  FROM public.users u WHERE u.unsubscribe_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(p_token uuid)
RETURNS TABLE(email text, display_name text, subscribed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.users u
     SET preferences = COALESCE(u.preferences, '{}'::jsonb)
                       || jsonb_build_object('email_notifications', false,
                                             'pick_reminders', false,
                                             'deadline_alerts', false,
                                             'weekly_results', false),
         updated_at = now()
   WHERE u.unsubscribe_token = p_token;
  RETURN QUERY SELECT * FROM public.unsubscribe_status(p_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.resubscribe_by_token(p_token uuid)
RETURNS TABLE(email text, display_name text, subscribed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.users u
     SET preferences = COALESCE(u.preferences, '{}'::jsonb)
                       || jsonb_build_object('email_notifications', true,
                                             'pick_reminders', true,
                                             'deadline_alerts', true,
                                             'weekly_results', true),
         updated_at = now()
   WHERE u.unsubscribe_token = p_token;
  RETURN QUERY SELECT * FROM public.unsubscribe_status(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubscribe_status(uuid)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resubscribe_by_token(uuid) TO anon, authenticated;

-- ── email shell: real unsubscribe link ───────────────────────────────────
-- Third arg is optional so existing 2-arg calls keep working.
CREATE OR REPLACE FUNCTION public.wrap_email_shell(
  p_subtitle text,
  p_body text,
  p_unsubscribe_url text DEFAULT NULL
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT
    $q$<div style="margin:0;padding:0;background:#F0EEE8"><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;color:#2A2118"><div style="background:#4B3621;border-radius:12px 12px 0 0;padding:22px 24px;text-align:center"><div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.02em">🏈 PIGSKIN PICK SIX</div><div style="height:3px;width:54px;background:#C9A04E;margin:10px auto 0;border-radius:2px"></div><div style="color:#E9DFcd;font-size:12px;margin-top:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:700">$q$
    || COALESCE(p_subtitle, '') ||
    $q$</div></div><div style="background:#ffffff;border:1px solid #E5DFD5;border-top:none;border-radius:0 0 12px 12px;padding:28px 26px">$q$
    || p_body ||
    $q$<div style="border-top:1px solid #E5DFD5;margin-top:28px;padding-top:16px;text-align:center;color:#7A6E60;font-size:12px;line-height:1.6"><div style="font-weight:700;color:#4B3621">The Pigskin Pick Six Team</div><div style="margin-top:4px"><a href="https://pigskinpicksix.com" style="color:#7A6E60">pigskinpicksix.com</a>$q$
    || CASE WHEN p_unsubscribe_url IS NULL THEN ''
            ELSE $q$ &middot; <a href="$q$ || p_unsubscribe_url || $q$" style="color:#7A6E60;text-decoration:underline">unsubscribe</a>$q$ END
    || $q$</div></div></div></div></div>$q$;
$function$;

-- ── preseason blast: honor the opt-out, stamp each recipient's token ─────
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
      -- never mail someone who opted out (missing preferences = still subscribed)
      AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
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

-- ── signing up is fresh consent → re-enable emails for that address ──────
-- Done in the signup trigger rather than a client RPC: only a genuine
-- auth.users insert can reach it, so nobody can re-subscribe a stranger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  user_display_name TEXT;
  user_payment_status TEXT;
BEGIN
  IF NEW.raw_user_meta_data ? 'display_name' AND
     NEW.raw_user_meta_data->>'display_name' IS NOT NULL AND
     TRIM(NEW.raw_user_meta_data->>'display_name') != '' THEN
    user_display_name := TRIM(NEW.raw_user_meta_data->>'display_name');
  ELSIF NEW.email IS NOT NULL AND NEW.email != '' THEN
    user_display_name := SPLIT_PART(NEW.email, '@', 1);
  ELSE
    user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;

  IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
    user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;

  user_payment_status := 'NotPaid';

  BEGIN
    INSERT INTO public.users (
      id, email, display_name, created_at, payment_status, is_admin
    ) VALUES (
      NEW.id, NEW.email, user_display_name,
      COALESCE(NEW.created_at, NOW()), user_payment_status, FALSE
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'User % already exists', NEW.email;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to create user profile: % %', SQLSTATE, SQLERRM;
  END;

  -- Opting in again by registering (the signup form says so).
  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    UPDATE public.users u
       SET preferences = COALESCE(u.preferences, '{}'::jsonb)
                         || jsonb_build_object('email_notifications', true,
                                               'pick_reminders', true,
                                               'deadline_alerts', true,
                                               'weekly_results', true)
     WHERE lower(u.email) = lower(NEW.email)
       AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = false;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── recap recipients: carry the token, skip opt-outs ─────────────────────
-- Dropped first: adding an OUT column changes the return type.
DROP FUNCTION IF EXISTS public.wr_recap_recipients(integer, integer);
CREATE OR REPLACE FUNCTION public.wr_recap_recipients(p_week integer, p_season integer)
RETURNS TABLE(user_id uuid, email text, display_name text, block jsonb, unsubscribe_token uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH paid AS (
    SELECT DISTINCT lp.user_id
    FROM leaguesafe_payments lp
    WHERE lp.season = p_season AND lp.status = 'Paid' AND lp.user_id IS NOT NULL
  ),
  cum AS (
    SELECT p.user_id,
           sum(p.points_earned) FILTER (WHERE p.week<=p_week)   AS pts_n,
           sum(p.points_earned) FILTER (WHERE p.week<=p_week-1) AS pts_prev
    FROM picks p
    WHERE p.season=p_season AND p.submitted=true AND NOT p.disqualified
      AND EXISTS (SELECT 1 FROM leaguesafe_payments lp WHERE lp.user_id=p.user_id AND lp.season=p_season AND lp.status='Paid')
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT user_id,
           rank() OVER (ORDER BY COALESCE(pts_n,0)    DESC) AS rank_n,
           rank() OVER (ORDER BY COALESCE(pts_prev,0) DESC) AS rank_prev
    FROM cum
  ),
  mp AS (
    SELECT p.user_id,
           jsonb_agg(jsonb_build_object('team',p.selected_team,'is_lock',p.is_lock,
             'result',p.result::text,'points',p.points_earned,
             'game',g.away_team||' @ '||g.home_team) ORDER BY g.kickoff_time) AS picks,
           count(*) FILTER (WHERE p.result='win')  AS wins,
           count(*) FILTER (WHERE p.result='loss') AS losses,
           count(*) FILTER (WHERE p.result='push') AS pushes,
           COALESCE(sum(p.points_earned),0) AS points
    FROM picks p JOIN games g ON g.id=p.game_id
    WHERE p.season=p_season AND p.week=p_week AND p.submitted=true AND NOT p.disqualified
    GROUP BY p.user_id
  )
  SELECT pd.user_id, u.email, u.display_name,
    jsonb_build_object(
      'played', (mp.user_id IS NOT NULL),
      'wins', COALESCE(mp.wins,0), 'losses', COALESCE(mp.losses,0), 'pushes', COALESCE(mp.pushes,0),
      'points', COALESCE(mp.points,0),
      'season_rank', r.rank_n, 'season_rank_prev', r.rank_prev,
      'picks', COALESCE(mp.picks, '[]'::jsonb)
    ),
    u.unsubscribe_token
  FROM paid pd
  JOIN users u ON u.id=pd.user_id
  LEFT JOIN mp ON mp.user_id=pd.user_id
  LEFT JOIN ranked r ON r.user_id=pd.user_id
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
  ORDER BY u.display_name;
$function$;
