-- Migration 209: let the recap test preview a season that has no entrants yet
--
-- REPORTED FROM USE. Drafting the Week 1 recap for 2026 in preseason, "Send
-- test" fails with "No recipients found for this week (no paid entrants)".
--
-- Not a regression from 203 — the old client-side path threw the identical
-- message from the identical condition — but it is wrong either way. The button
-- says "works on drafts too — safe to preview", and preseason is exactly when
-- you want to look at the template. 2026 has no leaguesafe_payments rows yet,
-- so wr_recap_recipients returns nothing and there is no block to render.
--
-- A test send needs a *shape* to render, not a real player. When nobody has
-- paid for the season yet, this synthesizes one from the week's actual games so
-- the preview shows real matchups and a realistic scorecard, addressed to the
-- admin asking for it. The picks are invented; the layout, the rundown, the CTA
-- and the brand shell are all exactly what recipients will get.
--
-- The bulk send is untouched: queue_recap_emails still mails only real paid
-- entrants, and still queues nothing when there are none.

CREATE OR REPLACE FUNCTION public.queue_recap_test(
  p_post_id uuid,
  p_to_email text,
  p_include_cta boolean DEFAULT false,
  p_force_no_picks boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_cta jsonb := NULL;
  v_r record;
  v_block jsonb;
  v_name text;
  v_sample boolean := false;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT id, week, season, slug, excerpt INTO v_post
  FROM public.blog_posts WHERE id = p_post_id;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF v_post.week IS NULL THEN RAISE EXCEPTION 'Post has no week set'; END IF;

  -- Prefer the tester's own results; otherwise borrow the first recipient's, so
  -- the test still shows a realistic card.
  SELECT * INTO v_r FROM public.wr_recap_recipients(v_post.week, v_post.season) r
  WHERE lower(r.email) = lower(btrim(p_to_email)) LIMIT 1;
  IF v_r.user_id IS NULL THEN
    SELECT * INTO v_r FROM public.wr_recap_recipients(v_post.week, v_post.season) r LIMIT 1;
  END IF;

  IF v_r.user_id IS NOT NULL THEN
    v_block := v_r.block;
    v_name  := v_r.display_name;
  ELSE
    -- Nobody has paid for this season yet. Build a sample card from the week's
    -- real games rather than refusing to render.
    v_sample := true;
    SELECT COALESCE(NULLIF(btrim(u.display_name), ''), 'there') INTO v_name
    FROM public.users u WHERE u.id = auth.uid();

    SELECT jsonb_build_object(
             'played', true,
             'wins', count(*) FILTER (WHERE g.rn % 2 = 1),
             'losses', count(*) FILTER (WHERE g.rn % 2 = 0),
             'pushes', 0,
             'points', 20 * count(*) FILTER (WHERE g.rn % 2 = 1),
             'season_rank', 1,
             'season_rank_prev', 3,
             'picks', COALESCE(jsonb_agg(
               jsonb_build_object(
                 'game', g.away_team || ' @ ' || g.home_team,
                 'team', g.home_team,
                 'is_lock', g.rn = 1,
                 'result', CASE WHEN g.rn % 2 = 1 THEN 'win' ELSE 'loss' END,
                 'points', CASE WHEN g.rn % 2 = 1 THEN 20 ELSE 0 END
               ) ORDER BY g.rn), '[]'::jsonb)
           )
    INTO v_block
    FROM (
      -- This week's real games if the board is up. In preseason it usually is
      -- not, so borrow the most recent season that played this week — a
      -- preview of last year's matchups beats a preview of nothing.
      SELECT home_team, away_team,
             row_number() OVER (ORDER BY kickoff_time) AS rn
      FROM public.games
      WHERE week = v_post.week
        AND season = COALESCE(
          (SELECT gg.season FROM public.games gg
           WHERE gg.week = v_post.week AND gg.season <= v_post.season
           ORDER BY gg.season DESC LIMIT 1),
          v_post.season)
      LIMIT 6
    ) g;

    -- No games on the board either — fall back to an empty card so the shell,
    -- the rundown and the CTA can still be looked at.
    IF v_block IS NULL OR v_block->'picks' = '[]'::jsonb THEN
      v_block := jsonb_build_object(
        'played', false, 'picks', '[]'::jsonb,
        'wins', 0, 'losses', 0, 'pushes', 0, 'points', 0,
        'season_rank', NULL, 'season_rank_prev', NULL
      );
    END IF;
  END IF;

  IF p_force_no_picks THEN
    v_block := v_block || jsonb_build_object(
      'played', false, 'picks', '[]'::jsonb,
      'wins', 0, 'losses', 0, 'pushes', 0, 'points', 0
    );
  END IF;

  IF p_include_cta THEN
    v_cta := public.recap_cta_payload(v_post.week + 1, v_post.season);
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts
  )
  VALUES (
    NULL,
    btrim(p_to_email),
    'weekly_recap',
    format('%s Week %s Recap — your results',
           CASE WHEN p_force_no_picks THEN '[TEST · no-picks variant]' ELSE '[TEST]' END,
           v_post.week),
    NULL, NULL,
    jsonb_build_object(
      'postId', p_post_id::text,
      'week', v_post.week,
      'displayName', COALESCE(v_name, 'there'),
      'block', v_block,
      'cta', v_cta,
      'isTest', true,
      -- Surfaced so the renderer can say so in the subject; a preview built
      -- from invented picks should not be mistaken for real results.
      'isSample', v_sample
    ),
    v_token, now(), 'pending', 0
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token, 'sample', v_sample);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_recap_test(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_recap_test(uuid, text, boolean, boolean) TO authenticated, service_role;
