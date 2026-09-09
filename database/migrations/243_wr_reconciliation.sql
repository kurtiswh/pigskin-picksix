-- Migration 243: serve the whole reconciliation as one payload, so the
-- workbook can be a button instead of a script
--
-- The reconciliation existed only as scripts/build-reconciliation-workbook.py,
-- which needs psql, python, openpyxl and the database URL on the machine
-- running it. That is fine for a developer and useless to a commissioner on a
-- phone on a Sunday morning. Same queries, one call, so the browser can build
-- the workbook itself. See docs/WEEKLY_RECONCILIATION.md.
--
-- Split identities are matched on identity tokens -- display name, LeagueSafe
-- owner name, and the email mailbox with digits and punctuation stripped --
-- plus the definitive case where the payment address is already recorded on
-- the playing account. Matching display names alone missed five real splits in
-- 2026 week 1.
--
-- Admin-gated: this is the whole register, every address, and who owes money.

DROP FUNCTION IF EXISTS public.wr_reconciliation(integer, integer);

CREATE FUNCTION public.wr_reconciliation(p_season integer, p_week integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out jsonb;
BEGIN
  PERFORM public.assert_admin_or_server();

  WITH lsp AS (SELECT * FROM public.leaguesafe_payments WHERE season = p_season),
  players AS (
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM public.picks WHERE season = p_season AND submitted
      UNION SELECT assigned_user_id FROM public.anonymous_picks
       WHERE season = p_season AND assigned_user_id IS NOT NULL) x),
  paid_nopicks AS (
    SELECT lsp.user_id, lsp.leaguesafe_owner_name nm, lower(lsp.leaguesafe_email) em,
           lsp.paid, u.display_name acct_nm, lower(u.email) acct_em
    FROM lsp JOIN public.users u ON u.id = lsp.user_id
    WHERE lsp.status = 'Paid' AND lsp.user_id NOT IN (SELECT user_id FROM players)),
  picks_nopay AS (
    SELECT p.user_id, u.display_name nm, lower(u.email) em
    FROM players p JOIN public.users u ON u.id = p.user_id
    WHERE NOT EXISTS (SELECT 1 FROM lsp WHERE lsp.user_id = p.user_id AND lsp.status = 'Paid')),
  paid_tokens AS (
    SELECT user_id, tok FROM paid_nopicks,
      LATERAL (VALUES (lower(regexp_replace(nm, '[^a-z]', '', 'gi'))),
                      (lower(regexp_replace(acct_nm, '[^a-z]', '', 'gi'))),
                      (lower(regexp_replace(split_part(em, '@', 1), '[^a-z]', '', 'gi')))) t(tok)
    WHERE length(tok) >= 5),
  play_tokens AS (
    SELECT user_id, tok FROM picks_nopay,
      LATERAL (VALUES (lower(regexp_replace(nm, '[^a-z]', '', 'gi'))),
                      (lower(regexp_replace(split_part(em, '@', 1), '[^a-z]', '', 'gi')))) t(tok)
    WHERE length(tok) >= 5),
  pairs AS (
    SELECT a.user_id paid_id, a.nm paid_nm, a.em paid_em, a.paid dollars,
           b.user_id play_id, b.nm play_nm, b.em play_em,
      min(CASE WHEN EXISTS (SELECT 1 FROM public.user_emails ue
                            WHERE ue.user_id = b.user_id AND lower(ue.email) = a.em) THEN 1
               WHEN at.tok = bt.tok THEN 2 ELSE 3 END) rank,
      min(CASE WHEN EXISTS (SELECT 1 FROM public.user_emails ue
                            WHERE ue.user_id = b.user_id AND lower(ue.email) = a.em)
                 THEN 'payment address already on the playing account ('
                      || COALESCE((SELECT ue.email_type FROM public.user_emails ue
                                   WHERE ue.user_id = b.user_id AND lower(ue.email) = a.em LIMIT 1), '?') || ')'
               WHEN at.tok = bt.tok THEN 'identity token matches: ' || at.tok
               ELSE 'token is a prefix: ' || at.tok || ' / ' || bt.tok END) evidence
    FROM paid_nopicks a
    JOIN picks_nopay b ON true
    JOIN paid_tokens at ON at.user_id = a.user_id
    JOIN play_tokens bt ON bt.user_id = b.user_id
    WHERE at.tok = bt.tok OR at.tok LIKE bt.tok || '%' OR bt.tok LIKE at.tok || '%'
       OR EXISTS (SELECT 1 FROM public.user_emails ue
                  WHERE ue.user_id = b.user_id AND lower(ue.email) = a.em)
    GROUP BY a.user_id, a.nm, a.em, a.paid, b.user_id, b.nm, b.em),
  dupname AS (
    SELECT lower(regexp_replace(leaguesafe_owner_name, '[^a-z]', '', 'gi')) k
    FROM lsp GROUP BY 1 HAVING count(*) > 1),
  multi AS (SELECT DISTINCT user_id FROM public.wr_multiple_pick_sets(p_week, p_season))
  SELECT jsonb_build_object(
    'season', p_season, 'week', p_week, 'generated_at', now(),
    'summary', jsonb_build_object(
      'register_rows',       (SELECT count(*) FROM lsp),
      'paid',                (SELECT count(*) FROM lsp WHERE status = 'Paid'),
      'not_paid',            (SELECT count(*) FROM lsp WHERE status <> 'Paid'),
      'no_account_linked',   (SELECT count(*) FROM lsp WHERE user_id IS NULL),
      'dollars_collected',   (SELECT COALESCE(sum(paid), 0) FROM lsp),
      'on_leaderboard',      (SELECT count(*) FROM public.season_leaderboard WHERE season = p_season),
      'paid_with_picks',     (SELECT count(*) FROM players p WHERE EXISTS (
                                SELECT 1 FROM lsp WHERE lsp.user_id = p.user_id AND lsp.status = 'Paid')),
      'unpaid_with_picks',   (SELECT count(*) FROM picks_nopay),
      'paid_submitted_none', (SELECT count(*) FROM paid_nopicks),
      'split_identities',    (SELECT count(*) FROM pairs),
      'grace_period_weeks',  (SELECT grace_period_weeks FROM public.app_settings LIMIT 1),
      'weeks_with_games',    (SELECT COALESCE(max(week), 0) FROM public.week_settings
                              WHERE season = p_season AND games_selected)),
    'register', COALESCE((SELECT jsonb_agg(r ORDER BY r->>'flagged' DESC, r->>'leaguesafe_owner')
      FROM (SELECT jsonb_build_object(
              'leaguesafe_owner', lsp.leaguesafe_owner_name,
              'leaguesafe_email', lower(lsp.leaguesafe_email),
              'status', lsp.status, 'entry_fee', lsp.entry_fee, 'paid', lsp.paid,
              'pending', lsp.pending, 'owes', lsp.owes,
              'account_name', u.display_name, 'account_email', lower(u.email),
              'submitted_picks', (SELECT count(*) FROM public.picks p
                                  WHERE p.user_id = lsp.user_id AND p.season = p_season AND p.submitted),
              'anon_picks', (SELECT count(*) FROM public.anonymous_picks a
                             WHERE a.assigned_user_id = lsp.user_id AND a.season = p_season),
              'points', (SELECT COALESCE(sum(total_points), 0) FROM public.season_leaderboard sl
                         WHERE sl.user_id = lsp.user_id AND sl.season = p_season),
              'issues', btrim(concat_ws(', ',
                CASE WHEN lsp.status <> 'Paid' THEN 'NOT PAID' END,
                CASE WHEN lsp.status = 'Paid' AND lsp.paid IS DISTINCT FROM lsp.entry_fee THEN 'paid <> entry fee' END,
                CASE WHEN lsp.pending > 0 THEN 'transfer pending' END,
                CASE WHEN lsp.status = 'Paid' AND lsp.user_id NOT IN (SELECT user_id FROM players)
                          AND lsp.user_id NOT IN (SELECT paid_id FROM pairs) THEN 'paid, no picks' END,
                CASE WHEN lsp.user_id IN (SELECT paid_id FROM pairs)
                  THEN 'SPLIT IDENTITY - playing as '
                       || (SELECT min(play_nm || ' <' || play_em || '>') FROM pairs q WHERE q.paid_id = lsp.user_id) END,
                CASE WHEN lower(regexp_replace(lsp.leaguesafe_owner_name, '[^a-z]', '', 'gi'))
                          IN (SELECT k FROM dupname) THEN 'duplicate name in register' END,
                CASE WHEN lsp.user_id IN (SELECT user_id FROM multi) THEN 'two sheets this week' END)),
              'flagged', CASE WHEN lsp.status <> 'Paid'
                               OR (lsp.status = 'Paid' AND lsp.paid IS DISTINCT FROM lsp.entry_fee)
                               OR lsp.user_id IN (SELECT paid_id FROM pairs) THEN '1' ELSE '0' END) r
            FROM lsp JOIN public.users u ON u.id = lsp.user_id) z), '[]'::jsonb),
    'split_identities', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'paid_as', paid_nm, 'payment_email', paid_em, 'dollars', dollars,
        'playing_as', play_nm, 'account_email', play_em, 'evidence', evidence,
        'ghost_can_log_in', (SELECT count(*) FROM auth.users au WHERE au.id = paid_id),
        'player_can_log_in', (SELECT count(*) FROM auth.users au WHERE au.id = play_id),
        'merge_this_account', paid_id, 'into_this_account', play_id
      ) ORDER BY rank, paid_nm) FROM pairs), '[]'::jsonb),
    'playing_unpaid', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'playing_as', b.nm, 'account_email', b.em,
        'leaguesafe_row', COALESCE((SELECT max(status) FROM lsp WHERE lsp.user_id = b.user_id), 'no record'),
        'owes', COALESCE((SELECT max(owes) FROM lsp WHERE lsp.user_id = b.user_id), 0),
        'submitted_picks', (SELECT count(*) FROM public.picks p
                            WHERE p.user_id = b.user_id AND p.season = p_season AND p.submitted),
        'anon_picks', (SELECT count(*) FROM public.anonymous_picks a
                       WHERE a.assigned_user_id = b.user_id AND a.season = p_season),
        'points_on_board', (SELECT COALESCE(sum(total_points), 0) FROM public.season_leaderboard sl
                            WHERE sl.user_id = b.user_id AND sl.season = p_season)
      ) ORDER BY b.nm) FROM picks_nopay b
      WHERE b.user_id NOT IN (SELECT play_id FROM pairs)), '[]'::jsonb),
    'paid_no_picks', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'paid_as', a.nm, 'payment_email', a.em, 'dollars', a.paid,
        'account_name', a.acct_nm, 'account_email', a.acct_em
      ) ORDER BY a.nm) FROM paid_nopicks a
      WHERE a.user_id NOT IN (SELECT paid_id FROM pairs)), '[]'::jsonb),
    'money_issues', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'leaguesafe_owner', leaguesafe_owner_name, 'leaguesafe_email', lower(leaguesafe_email),
        'status', status, 'entry_fee', entry_fee, 'paid', paid, 'pending', pending, 'owes', owes,
        'reading', CASE WHEN paid > entry_fee THEN 'overpaid - covering another entry?'
                        WHEN status = 'Paid' AND pending > 0 AND paid = 0 THEN 'marked Paid, transfer not landed'
                        WHEN status <> 'Paid' THEN 'owes the entry fee'
                        ELSE 'short' END
      ) ORDER BY status, leaguesafe_owner_name) FROM lsp
      WHERE paid IS DISTINCT FROM entry_fee OR pending > 0 OR owes > 0), '[]'::jsonb),
    'duplicate_sheets', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'player', display_name, 'account_email', account_email, 'sheet', source,
        'submitted_under', set_label, 'pick_count', pick_count, 'counted_picks', counted_picks,
        'lock_count', lock_count, 'counted_locks', counted_locks, 'is_submitted', is_submitted,
        'points_on_file', points, 'counted_points', counted_points,
        'counts', counts_for_leaderboard, 'submitted_at', last_submitted_at
      ) ORDER BY display_name, source) FROM public.wr_multiple_pick_sets(p_week, p_season)), '[]'::jsonb),
    'sheet_differences', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'player', display_name, 'matchup', matchup, 'sheet', source, 'submitted_under', set_label,
        'pick', selected_team, 'is_lock', is_lock, 'counted', counted,
        'differs', game_disagrees, 'result', result, 'points', points_earned
      ) ORDER BY display_name, kickoff_time, source) FROM public.wr_pick_set_diff(p_week, p_season)), '[]'::jsonb),
    'anonymous_to_tie', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'entry_name', nm, 'entry_email', em, 'picks', picks, 'locks', locks, 'submitted_at', at,
        'suggested_account', (SELECT u.display_name FROM public.users u
                              WHERE u.id = public.find_user_id_for_email(em, p_season)),
        'suggested_email', (SELECT lower(u.email) FROM public.users u
                            WHERE u.id = public.find_user_id_for_email(em, p_season)),
        'suggested_is_paid', EXISTS (SELECT 1 FROM lsp
          WHERE lsp.user_id = public.find_user_id_for_email(em, p_season) AND lsp.status = 'Paid')
      ) ORDER BY nm) FROM (
        SELECT lower(ap.email) em, max(ap.name) nm, count(*) picks,
               count(*) FILTER (WHERE ap.is_lock) locks, max(ap.submitted_at) at
        FROM public.anonymous_picks ap
        WHERE ap.season = p_season AND ap.week = p_week AND ap.submitted
          AND ap.assigned_user_id IS NULL
          AND COALESCE(ap.validation_status, 'pending') <> 'rejected'
        GROUP BY lower(ap.email)) un), '[]'::jsonb)
  ) INTO out;

  RETURN out;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_reconciliation(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_reconciliation(integer, integer) TO authenticated, service_role;
