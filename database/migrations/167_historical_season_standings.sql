-- Full final standings for pre-2016 seasons (parsed from Final Leaderboard PDFs).
-- 2016+ standings come live from season_leaderboard; this backfills 2006-2015 so
-- all-time career stats can span every season.
CREATE TABLE IF NOT EXISTS public.historical_season_standings (
    season       integer NOT NULL,
    user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    display_name text,
    final_rank   integer,
    total_points integer,
    wins         integer DEFAULT 0,
    losses       integer DEFAULT 0,
    pushes       integer DEFAULT 0,
    lock_wins    integer DEFAULT 0,
    lock_losses  integer DEFAULT 0,
    created_at   timestamptz DEFAULT now(),
    PRIMARY KEY (season, user_id)
);
ALTER TABLE public.historical_season_standings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read historical standings" ON public.historical_season_standings;
CREATE POLICY "Anyone can read historical standings"
    ON public.historical_season_standings FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS idx_hist_standings_user ON public.historical_season_standings(user_id);
