-- Migration 161: server-side per-game lock enforcement (Part B / B4a)
--
-- Today the picks RLS is too coarse:
--   * INSERT policy has NO time check at all (a user could create a pick anytime)
--   * UPDATE policy uses the single week-level deadline (week_settings.deadline)
-- Neither respects a game's own lock time. This migration enforces locks
-- per-game: a pick may be inserted/updated only while THAT game is open, using
-- the effective lock time = COALESCE(games.custom_lock_time, week_settings.deadline).
--
-- This is what makes the Thu/Fri-auto-lock + Saturday-override behavior correct:
-- each game closes at its own time, so a locked Thursday pick stays put while
-- Saturday games remain editable. (The resulting >6-pick case is handled by the
-- disqualification step in B4b.)
--
-- Admins are unaffected — the "Admins can update any picks" FOR ALL policy still
-- lets them edit after lock for manual corrections.

-- Effective per-game gate: picks open AND now < this game's lock time.
CREATE OR REPLACE FUNCTION public.game_is_open_for_picks(p_game_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.games g
    JOIN public.week_settings ws ON ws.week = g.week AND ws.season = g.season
    WHERE g.id = p_game_id
      AND ws.picks_open = true
      AND NOW() < COALESCE(g.custom_lock_time, ws.deadline)
  );
$$;

GRANT EXECUTE ON FUNCTION public.game_is_open_for_picks(uuid) TO authenticated, anon;

-- Replace the coarse user INSERT/UPDATE policies with per-game enforcement.
DROP POLICY IF EXISTS "Users can insert own picks" ON public.picks;
DROP POLICY IF EXISTS "Users can update own picks before deadline" ON public.picks;

CREATE POLICY "Users can insert own picks before game lock" ON public.picks
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.game_is_open_for_picks(game_id)
  );

CREATE POLICY "Users can update own picks before game lock" ON public.picks
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.game_is_open_for_picks(game_id)
  );

-- Note: "Users can view all picks" (SELECT) and "Admins can update any picks"
-- (FOR ALL) are unchanged. Admin edits still bypass the per-game lock.
