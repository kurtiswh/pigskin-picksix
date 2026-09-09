-- Merge split identities for one season: fold each importer-created ghost
-- account into the account the player actually plays from.
--
-- WHY THESE EXIST
-- matchOrCreateUserForLeagueSafeFallback used to resolve a LeagueSafe address
-- against users.email and users.leaguesafe_email only. A player who paid under
-- any other address matched nothing, so the importer created a second account
-- that took the payment while they kept playing on the first. 2026 week 1 had
-- 23 of them. Nine already had the payment address on file -- four from an
-- earlier merge, five typed in by the player through the LeagueSafe email
-- prompt -- and the import walked past it every time.
--
-- RUN THE CODE FIX FIRST. The importer now resolves through
-- find_user_id_for_email, which reads user_emails and prior payments and skips
-- merged tombstones. Without that deployed, the next CSV upload recreates
-- every ghost this script folds away, and re-points the payment at the new
-- one. That is not hypothetical: Cara Capra, Dan Couch, Dan Kucab and Hayden
-- Peterson were each merged once already and came back.
--
-- WHY THIS DIRECTION IS SAFE
-- merge_users neuters the SOURCE (appends _merged_<ts> to its addresses) and
-- never touches auth.users. Every ghost it selects is checked for an auth row
-- and skipped if it has one, so no one loses a login: a ghost has never been
-- signed into, and the surviving account's login is untouched.
--
-- IDEMPOTENT. A merged ghost is neutered, so it stops matching and a second
-- run is a no-op.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -v season=2026 -v merged_by=ba84da74-626d-4f6d-ac21-4211fe4c1eec \
--     -f database/merge_split_identities.sql
--
-- Wrap in BEGIN; ... ROLLBACK; for a dry run -- the NOTICEs still print.

\set ON_ERROR_STOP on

-- psql does not substitute :variables inside a dollar-quoted block, so hand
-- them to the block through the session instead.
SELECT set_config('pp6.season', :'season', false),
       set_config('pp6.merged_by', :'merged_by', false) \gset ignore_

DO $$
DECLARE
  v_season    int  := current_setting('pp6.season')::int;
  v_merged_by uuid := current_setting('pp6.merged_by')::uuid;
  r RECORD;
  v_result jsonb;
  v_done int := 0;
  v_skipped int := 0;
  v_freed int := 0;
BEGIN
  FOR r IN
    WITH lsp AS (SELECT * FROM public.leaguesafe_payments WHERE season = v_season),
    players AS (
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM public.picks WHERE season = v_season AND submitted
        UNION SELECT assigned_user_id FROM public.anonymous_picks
         WHERE season = v_season AND assigned_user_id IS NOT NULL) x),
    paid_side AS (
      SELECT lsp.user_id, lsp.leaguesafe_owner_name nm, lower(lsp.leaguesafe_email) em,
             u.display_name acct_nm
      FROM lsp JOIN public.users u ON u.id = lsp.user_id
      WHERE lsp.status = 'Paid'
        AND lsp.user_id NOT IN (SELECT user_id FROM players)
        AND u.email NOT LIKE '%\_merged\_%'
        -- never absorb an account someone can sign into
        AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = lsp.user_id)),
    play_side AS (
      SELECT p.user_id, u.display_name nm, lower(u.email) em
      FROM players p JOIN public.users u ON u.id = p.user_id
      WHERE u.email NOT LIKE '%\_merged\_%'
        AND NOT EXISTS (SELECT 1 FROM lsp
                        WHERE lsp.user_id = p.user_id AND lsp.status = 'Paid')),
    -- identity tokens: display name, LeagueSafe owner name, and the email
    -- mailbox with digits and punctuation stripped. Names alone missed CARA C /
    -- Cara Capra, Locksmith / Kirbo, Brandon Long / Brandon L, Jared B / Jared
    -- Bowling and Aaron Shisler / Shis.
    paid_tokens AS (
      SELECT user_id, tok FROM paid_side,
        LATERAL (VALUES (lower(regexp_replace(nm, '[^a-z]', '', 'gi'))),
                        (lower(regexp_replace(acct_nm, '[^a-z]', '', 'gi'))),
                        (lower(regexp_replace(split_part(em, '@', 1), '[^a-z]', '', 'gi')))) t(tok)
      WHERE length(tok) >= 5),
    play_tokens AS (
      SELECT user_id, tok FROM play_side,
        LATERAL (VALUES (lower(regexp_replace(nm, '[^a-z]', '', 'gi'))),
                        (lower(regexp_replace(split_part(em, '@', 1), '[^a-z]', '', 'gi')))) t(tok)
      WHERE length(tok) >= 5),
    pairs AS (
      SELECT a.user_id ghost_id, a.nm ghost_nm, a.em ghost_em,
             b.user_id keep_id, b.nm keep_nm, b.em keep_em,
        min(CASE WHEN EXISTS (SELECT 1 FROM public.user_emails ue
                              WHERE ue.user_id = b.user_id AND lower(ue.email) = a.em) THEN 1
                 WHEN at.tok = bt.tok THEN 2 ELSE 3 END) rank
      FROM paid_side a
      JOIN play_side b ON true
      JOIN paid_tokens at ON at.user_id = a.user_id
      JOIN play_tokens bt ON bt.user_id = b.user_id
      WHERE at.tok = bt.tok
         OR at.tok LIKE bt.tok || '%' OR bt.tok LIKE at.tok || '%'
         OR EXISTS (SELECT 1 FROM public.user_emails ue
                    WHERE ue.user_id = b.user_id AND lower(ue.email) = a.em)
      GROUP BY a.user_id, a.nm, a.em, b.user_id, b.nm, b.em)
    -- one ghost to one survivor: anything ambiguous is left for a human
    SELECT * FROM pairs p
    WHERE (SELECT count(*) FROM pairs q WHERE q.ghost_id = p.ghost_id) = 1
      AND (SELECT count(*) FROM pairs q WHERE q.keep_id = p.keep_id) = 1
    ORDER BY rank, ghost_nm
  LOOP
    -- merge_users moves a payment row only when the survivor has none for that
    -- season. Cary Cox is the case: a NotPaid line on the account he plays
    -- from would block the Paid line moving across, leaving him unpaid. The
    -- register genuinely holds two lines for him, and the importer already
    -- keeps Paid sticky when it sees that, so drop the unpaid duplicate.
    DELETE FROM public.leaguesafe_payments t
    WHERE t.user_id = r.keep_id AND t.season = v_season AND t.status <> 'Paid'
      AND EXISTS (SELECT 1 FROM public.leaguesafe_payments g
                  WHERE g.user_id = r.ghost_id AND g.season = v_season AND g.status = 'Paid');
    IF FOUND THEN
      v_freed := v_freed + 1;
      RAISE NOTICE 'freed a NotPaid % row on % so the Paid row can move', v_season, r.keep_nm;
    END IF;

    BEGIN
      v_result := public.merge_users(
        r.ghost_id, r.keep_id, v_merged_by,
        format('Split identity: paid as %s <%s>, playing as %s <%s>. Absorbed account had no login.',
               r.ghost_nm, r.ghost_em, r.keep_nm, r.keep_em));
      v_done := v_done + 1;
      RAISE NOTICE '% <%>  ->  % <%>  ok', r.ghost_nm, r.ghost_em, r.keep_nm, r.keep_em;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      RAISE WARNING '% -> % SKIPPED: %', r.ghost_nm, r.keep_nm, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '--- merged %, skipped %, unpaid duplicate rows removed %', v_done, v_skipped, v_freed;
END $$;

-- Verification. Every address should now resolve to an account that is paid,
-- holds the picks, and is on the leaderboard.
SELECT u.display_name,
       lower(u.email) AS account,
       (SELECT count(*) FROM public.leaguesafe_payments l
        WHERE l.user_id = u.id AND l.season = :season AND l.status = 'Paid') AS paid,
       (SELECT count(*) FROM public.season_leaderboard sl
        WHERE sl.user_id = u.id AND sl.season = :season) AS on_leaderboard
FROM public.user_merge_history h
JOIN public.users u ON u.id = h.target_user_id
WHERE h.merged_at > now() - interval '10 minutes'
ORDER BY u.display_name;
