-- Migration 258: store the CollegeFootballData game id on each game.
--
-- The live score updaters matched our games to the CFBD scoreboard by team
-- name, with a loose "first 5 letters" fallback. In 2026 week 10 that matched
-- Kentucky @ Tennessee to Western Kentucky @ Middle Tennessee and scored the
-- game 45-42 instead of 34-6. With the CFBD id stored when the admin saves
-- the slate, the updaters match by id and never guess.
--
-- Rows without an id (saved before this migration) are backfilled by the
-- updaters on an exact home/away name match.

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS cfbd_game_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS games_season_cfbd_game_id_key
  ON public.games (season, cfbd_game_id)
  WHERE cfbd_game_id IS NOT NULL;

COMMENT ON COLUMN public.games.cfbd_game_id IS
  'CollegeFootballData game id. Live score updaters match on this, not team names.';
