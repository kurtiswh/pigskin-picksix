-- Migration 231: separate "would block a submission" from "worth knowing"
--
-- The flagged list treated three different things as one:
--
--   * A player's own post-lock change to a pick STILL IN their sheet. This is
--     the real finding, and it is exactly what validate_pick_submission()
--     rejects (Austin B moving his Lock off a finished game).
--   * A deletion after lock. Ruled legitimate: an unsubmitted pick is a draft,
--     not an entry, so removing one and picking a still-open game is the
--     correct move. Four players did this on 2026-09-04 and every replacement
--     beat its own lock. Worth seeing, not a violation.
--   * A commissioner correction (actor_is_owner = false), which is the FIX,
--     not the problem, and was sitting in the list looking like a finding.
--
-- blocks_submission uses the same rule as validate_pick_submission, so the
-- admin list and the submit gate can never disagree.

DROP FUNCTION IF EXISTS public.wr_pick_change_log(integer, integer, boolean);

CREATE FUNCTION public.wr_pick_change_log(
  p_week integer,
  p_season integer,
  p_flagged_only boolean DEFAULT false
)
RETURNS TABLE (
  display_name text, email text, matchup text, change_type text,
  old_value text, new_value text, changed_at timestamptz,
  after_kickoff boolean, after_deadline boolean, by_owner boolean,
  blocks_submission boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  SELECT
    COALESCE(u.display_name, split_part(u.email,'@',1)),
    lower(u.email),
    COALESCE(g.away_team||' @ '||g.home_team, '(unknown game)'),
    l.change_type, l.old_value, l.new_value, l.changed_at,
    COALESCE(l.after_kickoff,false), COALESCE(l.after_deadline,false),
    COALESCE(l.actor_is_owner,false),
    (
      COALESCE(l.actor_is_owner, true)
      AND l.change_type IN ('created','selection_changed','lock_set','lock_cleared')
      AND COALESCE(l.after_kickoff,false)
      -- only counts if the affected pick is still part of the sheet; a pick
      -- that was deleted is no longer being submitted
      AND EXISTS (
        SELECT 1 FROM public.picks p
        WHERE p.user_id = l.user_id AND p.game_id = l.game_id
          AND p.week = l.week AND p.season = l.season
      )
    ) AS blocks_submission
  FROM public.pick_change_log l
  LEFT JOIN public.users u ON u.id = l.user_id
  LEFT JOIN public.games g ON g.id = l.game_id
  WHERE l.season = p_season AND l.week = p_week
    AND (NOT p_flagged_only OR COALESCE(l.after_kickoff,false) OR COALESCE(l.after_deadline,false))
  ORDER BY
    (
      COALESCE(l.actor_is_owner, true)
      AND l.change_type IN ('created','selection_changed','lock_set','lock_cleared')
      AND COALESCE(l.after_kickoff,false)
      AND EXISTS (SELECT 1 FROM public.picks p WHERE p.user_id=l.user_id AND p.game_id=l.game_id
                    AND p.week=l.week AND p.season=l.season)
    ) DESC,
    l.changed_at DESC
  LIMIT 500;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_pick_change_log(integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_pick_change_log(integer,integer,boolean) TO authenticated, service_role;
