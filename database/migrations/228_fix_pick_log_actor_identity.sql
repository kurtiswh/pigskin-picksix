-- Migration 228: the audit log called 900+ players "admin"
--
-- log_pick_change tested ownership as `auth.uid() = NEW.user_id`. That is the
-- WRONG test in this schema. Migration 215 introduced current_player_id(),
-- which resolves a signed-in person to their public.users row BY EMAIL when
-- their auth id has no users row -- and the picks RLS policies use exactly
-- that (is_current_user -> current_player_id), which is why those players can
-- write picks at all.
--
-- For 82 people whose auth id differs from their player id, the naive test
-- evaluated false and Week Review rendered "(by admin)". Verified: all 82
-- actor ids exist in auth only (0 are public.users rows, 0 are admins), and
-- each touches exactly one player's picks. Every one of those entries was a
-- player editing their own sheet. No admin changed anyone's picks.
--
-- Fixed by using the same resolution the policy uses, and by recording the
-- resolved player id so the two identities are never conflated again.

ALTER TABLE public.pick_change_log
  ADD COLUMN IF NOT EXISTS actor_player_id uuid;

COMMENT ON COLUMN public.pick_change_log.actor_id IS
  'Raw auth.uid() of the request. May not exist in public.users -- see current_player_id().';
COMMENT ON COLUMN public.pick_change_log.actor_player_id IS
  'actor_id resolved to a public.users row (by id, else by email), matching the picks RLS policy.';

CREATE OR REPLACE FUNCTION public.log_pick_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  -- The identity the RLS policy itself used. Comparing raw auth.uid() to
  -- picks.user_id mislabels every player whose auth id differs from their
  -- player row.
  v_player uuid := public.current_player_id();
  v_owner boolean;
  v_kick timestamptz;
  v_deadline timestamptz;
  r RECORD;
BEGIN
  r := COALESCE(NEW, OLD);
  v_owner := v_player IS NOT NULL AND v_player = r.user_id;

  SELECT g.kickoff_time INTO v_kick FROM public.games g WHERE g.id = r.game_id;
  SELECT ws.deadline INTO v_deadline
  FROM public.week_settings ws WHERE ws.week = r.week AND ws.season = r.season;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      'created',NULL,NEW.selected_team,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (OLD.id,OLD.user_id,v_actor,v_player,v_owner,OLD.week,OLD.season,OLD.game_id,
      'deleted',OLD.selected_team,NULL,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
    RETURN OLD;
  END IF;

  IF NEW.selected_team IS DISTINCT FROM OLD.selected_team THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      'selection_changed',OLD.selected_team,NEW.selected_team,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
  END IF;

  IF COALESCE(NEW.is_lock,false) IS DISTINCT FROM COALESCE(OLD.is_lock,false) THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      CASE WHEN NEW.is_lock THEN 'lock_set' ELSE 'lock_cleared' END,
      OLD.selected_team,NEW.selected_team,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
  END IF;

  IF COALESCE(NEW.submitted,false) IS DISTINCT FROM COALESCE(OLD.submitted,false) THEN
    INSERT INTO public.pick_change_log (pick_id,user_id,actor_id,actor_player_id,actor_is_owner,week,season,game_id,
      change_type,old_value,new_value,game_kickoff,after_kickoff,after_deadline)
    VALUES (NEW.id,NEW.user_id,v_actor,v_player,v_owner,NEW.week,NEW.season,NEW.game_id,
      CASE WHEN NEW.submitted THEN 'submitted' ELSE 'unsubmitted' END,
      COALESCE(OLD.submitted,false)::text,COALESCE(NEW.submitted,false)::text,v_kick,
      v_kick IS NOT NULL AND now() > v_kick, v_deadline IS NOT NULL AND now() > v_deadline);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── correct the rows already written ──────────────────────────────────────
-- An actor id that is not a public.users row can only have reached these rows
-- through current_player_id()'s email fallback, and the picks RLS policy
-- permits that solely for the pick's own owner. So those are self-service.
-- Anything left false is a genuine third party (an admin, who does have a
-- users row) and stays flagged.
UPDATE public.pick_change_log l
SET actor_is_owner = true,
    actor_player_id = l.user_id
WHERE l.actor_is_owner = false
  AND l.actor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.actor_id);

UPDATE public.pick_change_log l
SET actor_player_id = l.actor_id
WHERE l.actor_player_id IS NULL AND l.actor_id IS NOT NULL;
