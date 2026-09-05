-- Migration 229: flag pick changes against the RIGHT clock
--
-- The audit log flagged anything touching a pick whose game had kicked off.
-- That is wrong in both directions:
--
--   TOO NOISY. Submitting is a whole-sheet action -- one PATCH updates all six
--   rows, including the Thursday game -- so every ordinary Friday submit
--   flagged. 12 of 17 flags were this: submitted/unsubmitted/deleted rows that
--   said nothing about the pick itself. Real findings were buried in them.
--
--   TOO LOOSE. Raw kickoff is not the lock. A Thursday 19:00 CT game locks at
--   18:00 CT, an hour EARLIER, so a change in that hour was not flagged at all.
--
-- The right clock differs by change:
--   * submitted / unsubmitted  -> the WEEK deadline (whole-sheet action)
--   * created / deleted / selection_changed / lock_set / lock_cleared
--                              -> THAT GAME's lock time
--
-- and the game's lock time follows the league rule the pick sheet already
-- implements (GameCard.calculateDefaultLockTime): Thursday and Friday games
-- lock 18:00 CT on game day; everything else locks at the week deadline
-- (Saturday 11:00 CT), which is why Saturday games share one clock.

CREATE OR REPLACE FUNCTION public.game_effective_lock_time(p_game_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- An explicit per-game lock always wins.
    WHEN g.custom_lock_time IS NOT NULL THEN g.custom_lock_time
    -- Thursday (4) and Friday (5) games lock at 18:00 CT on game day.
    WHEN extract(dow FROM g.kickoff_time AT TIME ZONE 'America/Chicago') IN (4, 5)
      THEN (date_trunc('day', g.kickoff_time AT TIME ZONE 'America/Chicago')
            + interval '18 hours') AT TIME ZONE 'America/Chicago'
    -- Everything else rides the week deadline.
    ELSE ws.deadline
  END
  FROM public.games g
  LEFT JOIN public.week_settings ws ON ws.week = g.week AND ws.season = g.season
  WHERE g.id = p_game_id;
$function$;

REVOKE ALL ON FUNCTION public.game_effective_lock_time(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.game_effective_lock_time(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.pick_change_log.after_kickoff IS
  'Change happened after the clock that governs it: the GAME lock for pick-level changes, the WEEK deadline for whole-sheet submit/unsubmit. Named after_kickoff for compatibility.';

CREATE OR REPLACE FUNCTION public.log_pick_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_player uuid := public.current_player_id();
  v_owner boolean;
  v_lock timestamptz;
  v_deadline timestamptz;
  v_past_lock boolean;
  v_past_deadline boolean;
  r RECORD;
BEGIN
  r := COALESCE(NEW, OLD);
  v_owner := v_player IS NOT NULL AND v_player = r.user_id;

  v_lock := public.game_effective_lock_time(r.game_id);
  SELECT ws.deadline INTO v_deadline
  FROM public.week_settings ws WHERE ws.week = r.week AND ws.season = r.season;

  v_past_lock     := v_lock IS NOT NULL AND now() > v_lock;
  v_past_deadline := v_deadline IS NOT NULL AND now() > v_deadline;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      'created',NULL,NEW.selected_team,v_lock,v_past_lock,v_past_deadline);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (OLD.id,OLD.user_id,v_actor,v_player,v_owner,OLD.week,OLD.season,OLD.game_id,
      'deleted',OLD.selected_team,NULL,v_lock,v_past_lock,v_past_deadline);
    RETURN OLD;
  END IF;

  IF NEW.selected_team IS DISTINCT FROM OLD.selected_team THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      'selection_changed',OLD.selected_team,NEW.selected_team,v_lock,v_past_lock,v_past_deadline);
  END IF;

  IF COALESCE(NEW.is_lock,false) IS DISTINCT FROM COALESCE(OLD.is_lock,false) THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      CASE WHEN NEW.is_lock THEN 'lock_set' ELSE 'lock_cleared' END,
      OLD.selected_team,NEW.selected_team,v_lock,v_past_lock,v_past_deadline);
  END IF;

  -- Whole-sheet action: one PATCH touches all six rows, so the game clock is
  -- meaningless here. Only the week deadline can make a submit suspicious.
  IF COALESCE(NEW.submitted,false) IS DISTINCT FROM COALESCE(OLD.submitted,false) THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      CASE WHEN NEW.submitted THEN 'submitted' ELSE 'unsubmitted' END,
      COALESCE(OLD.submitted,false)::text,COALESCE(NEW.submitted,false)::text,
      v_lock, false, v_past_deadline);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── recompute the rows already written ────────────────────────────────────
UPDATE public.pick_change_log l
SET after_kickoff = false
WHERE l.change_type IN ('submitted','unsubmitted');

UPDATE public.pick_change_log l
SET after_kickoff = (lk.lock_at IS NOT NULL AND l.changed_at > lk.lock_at),
    game_kickoff  = lk.lock_at
FROM (SELECT id, public.game_effective_lock_time(id) AS lock_at FROM public.games) lk
WHERE l.game_id = lk.id
  AND l.change_type IN ('created','deleted','selection_changed','lock_set','lock_cleared');

UPDATE public.pick_change_log l
SET after_deadline = (ws.deadline IS NOT NULL AND l.changed_at > ws.deadline)
FROM public.week_settings ws
WHERE ws.week = l.week AND ws.season = l.season;
