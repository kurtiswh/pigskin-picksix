-- Migration 223: an audit trail for pick changes, submits and UNSUBMITS
--
-- WHY. Asked after picks appeared to change post-deadline. They had not: a
-- scoring pass sets updated_at = CURRENT_TIMESTAMP, so all 226 picks on the
-- first completed 2026 game carry updated_at = 2026-09-04 13:26:13 against a
-- submitted_at of Sep 2 -- indistinguishable, in the table, from a player
-- editing after submitting. There was no way to tell the difference because
-- picks had NO audit trail: only created_at and updated_at, the latter
-- overwritten by scoring.
--
-- This logs only the three player-meaningful fields. Scoring writes result
-- and points_earned, which are deliberately NOT tracked, so a scoring pass
-- produces zero log rows and can never again be mistaken for tampering.
--
-- Reads are admin-only (it exposes who picked what). Writes come only from
-- the SECURITY DEFINER trigger -- no client can insert, edit or delete a log
-- row, which is the point of an audit trail.

CREATE TABLE IF NOT EXISTS public.pick_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id uuid,
  user_id uuid,                 -- whose pick
  actor_id uuid,                -- auth.uid() at the time; NULL for service role / cron
  actor_is_owner boolean,
  week integer,
  season integer,
  game_id uuid,
  change_type text NOT NULL,    -- created | selection_changed | lock_set | lock_cleared | submitted | unsubmitted | deleted
  old_value text,
  new_value text,
  game_kickoff timestamptz,
  after_kickoff boolean,        -- the unambiguous red flag
  after_deadline boolean,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pick_change_log_season_week
  ON public.pick_change_log (season, week, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pick_change_log_flagged
  ON public.pick_change_log (season, week) WHERE after_kickoff OR after_deadline;

ALTER TABLE public.pick_change_log ENABLE ROW LEVEL SECURITY;
-- No policies at all: only the SECURITY DEFINER trigger writes, only the
-- SECURITY DEFINER RPC below reads. An append-only trail nobody can rewrite.

CREATE OR REPLACE FUNCTION public.log_pick_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_kick timestamptz;
  v_deadline timestamptz;
  r RECORD;

BEGIN
  r := COALESCE(NEW, OLD);

  SELECT g.kickoff_time INTO v_kick FROM public.games g WHERE g.id = r.game_id;
  SELECT ws.deadline INTO v_deadline
  FROM public.week_settings ws WHERE ws.week = r.week AND ws.season = r.season;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_actor = NEW.user_id,NEW.week,NEW.season,NEW.game_id,
      'created',NULL,NEW.selected_team,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (OLD.id,OLD.user_id,v_actor,v_actor = OLD.user_id,OLD.week,OLD.season,OLD.game_id,
      'deleted',OLD.selected_team,NULL,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
    RETURN OLD;
  END IF;

  -- UPDATE: log ONLY the player-meaningful fields, so scoring is silent.
  IF NEW.selected_team IS DISTINCT FROM OLD.selected_team THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_actor = NEW.user_id,NEW.week,NEW.season,NEW.game_id,
      'selection_changed',OLD.selected_team,NEW.selected_team,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
  END IF;

  IF COALESCE(NEW.is_lock,false) IS DISTINCT FROM COALESCE(OLD.is_lock,false) THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_actor = NEW.user_id,NEW.week,NEW.season,NEW.game_id,
      CASE WHEN NEW.is_lock THEN 'lock_set' ELSE 'lock_cleared' END,
      OLD.selected_team,NEW.selected_team,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
  END IF;

  IF COALESCE(NEW.submitted,false) IS DISTINCT FROM COALESCE(OLD.submitted,false) THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_actor = NEW.user_id,NEW.week,NEW.season,NEW.game_id,
      CASE WHEN NEW.submitted THEN 'submitted' ELSE 'unsubmitted' END,
      COALESCE(OLD.submitted,false)::text,COALESCE(NEW.submitted,false)::text,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_pick_change ON public.picks;
CREATE TRIGGER trg_log_pick_change
  AFTER INSERT OR UPDATE OR DELETE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.log_pick_change();

-- Admin read: flagged changes first, since those are the integrity question.
CREATE OR REPLACE FUNCTION public.wr_pick_change_log(
  p_week integer,
  p_season integer,
  p_flagged_only boolean DEFAULT false
)
RETURNS TABLE (
  display_name text, email text, matchup text, change_type text,
  old_value text, new_value text, changed_at timestamptz,
  after_kickoff boolean, after_deadline boolean, by_owner boolean
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
    COALESCE(l.actor_is_owner,false)
  FROM public.pick_change_log l
  LEFT JOIN public.users u ON u.id = l.user_id
  LEFT JOIN public.games g ON g.id = l.game_id
  WHERE l.season = p_season AND l.week = p_week
    AND (NOT p_flagged_only OR COALESCE(l.after_kickoff,false) OR COALESCE(l.after_deadline,false))
  ORDER BY (COALESCE(l.after_kickoff,false) OR COALESCE(l.after_deadline,false)) DESC, l.changed_at DESC
  LIMIT 500;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_pick_change_log(integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_pick_change_log(integer,integer,boolean) TO authenticated, service_role;
