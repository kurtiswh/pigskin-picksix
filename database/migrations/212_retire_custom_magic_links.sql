-- Migration 212: retire the hand-rolled magic link
--
-- The app carried its own magic_link_tokens table and MagicLinkService. It could
-- not have worked from a browser, and the empty table says it never did:
--
--   * RLS on magic_link_tokens is service_role only, so the client cannot read
--     the token it is asked to verify
--   * verifyMagicLink calls supabase.auth.admin.listUsers() and
--     .admin.generateLink(), both service-role APIs, from client code
--   * even on the happy path it returned { success: true, user } without ever
--     establishing a session — so "verifying" a link signed nobody in
--
-- Nothing generated a token either: MagicLinkService.sendMagicLink had no
-- callers, so /magic-login could only ever report "invalid link".
--
-- Supabase Auth already does this properly. signInWithOtp sends the link and
-- creates a real session when it is opened, and useAuth.signInWithMagicLink has
-- wrapped it the whole time with no UI attached to it. The login page now calls
-- that, with shouldCreateUser:false so a login link cannot quietly mint an
-- account for an unregistered address — which matters here, because the
-- LeagueSafe import shells deliberately have no login until someone registers.
--
-- The table goes. Keeping an empty, unreachable auth table around is how the
-- next person concludes there are two ways to sign in.

DROP TABLE IF EXISTS public.magic_link_tokens;

-- 'magic_link' was only ever produced by the removed EmailService.sendMagicLink,
-- which wrote a client-rendered body (and is gone as of the 201 series). Auth
-- emails are sent by Supabase now and never touch this queue.
DELETE FROM public.email_jobs WHERE template_type = 'magic_link';

ALTER TABLE public.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_template_type_check;
ALTER TABLE public.email_jobs ADD CONSTRAINT email_jobs_template_type_check
  CHECK (template_type = ANY (ARRAY[
    'pick_reminder', 'deadline_alert', 'weekly_results', 'game_completed',
    'picks_submitted', 'week_opened', 'password_reset',
    'preseason', 'weekly_recap'
  ]));
