-- Migration 161b: make per-game lock enforcement actually bind (Part B / B4a fix)
--
-- 161 added lock-gated INSERT/UPDATE policies, but production still had a broad
-- permissive policy "Users can manage own picks" (FOR ALL, USING auth.uid()=user_id
-- with NO time check). Because permissive policies are OR'd together, that policy
-- let users write to LOCKED games regardless of the new lock policies — defeating
-- the enforcement entirely.
--
-- This migration removes that broad policy and, since it also covered DELETE,
-- adds a lock-gated DELETE policy so users can still remove their own picks while
-- a game is open. Net effect: all user writes (INSERT/UPDATE/DELETE) now go
-- through game_is_open_for_picks(); admins are unaffected ("Admins can manage all
-- picks" FOR ALL remains).

DROP POLICY IF EXISTS "Users can manage own picks" ON public.picks;

DROP POLICY IF EXISTS "Users can delete own picks before game lock" ON public.picks;
CREATE POLICY "Users can delete own picks before game lock" ON public.picks
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND public.game_is_open_for_picks(game_id)
  );

-- Resulting user-facing picks policies:
--   SELECT  : "Public read picks" / "anonymous_read_picks"  (unchanged)
--   INSERT  : "Users can insert own picks before game lock"  (161)
--   UPDATE  : "Users can update own picks before game lock"  (161)
--   DELETE  : "Users can delete own picks before game lock"  (this migration)
--   ALL     : "Admins can manage all picks"                  (admin bypass)
