-- Rollback for migration 255 (RLS phase 3). Run ONLY if 255 breaks the site.
-- Kept outside database/migrations so it is never applied in sequence.
--
-- Restores the open SELECT policies exactly as they were before 255. This re-opens the
-- exposure 255 closed, so treat it as a stopgap: fix forward and re-apply 255.
-- The rotated unsubscribe tokens are NOT restored (the old ones were public).

DROP POLICY IF EXISTS "Read own picks, or any pick once its game locks" ON public.picks;

CREATE POLICY "Public read display name" ON public.users
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read picks" ON public.picks
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anonymous_read_picks" ON public.picks
  FOR SELECT TO public USING (true);

CREATE POLICY "Allow anonymous read access" ON public.anonymous_picks
  FOR SELECT TO public USING (true);
CREATE POLICY "Allow authenticated users to read all" ON public.anonymous_picks
  FOR SELECT TO authenticated USING (true);

-- open_pick_game_ids() is left in place; it is harmless on its own.
