-- Create anonymous_picks table for non-logged-in users
CREATE TABLE public.anonymous_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    selected_team TEXT NOT NULL,
    is_lock BOOLEAN DEFAULT FALSE,
    is_validated BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_anonymous_pick_per_game_user UNIQUE (email, week, season, game_id),
    CONSTRAINT only_one_lock_per_user_week EXCLUDE USING btree (email, week, season WITH =) WHERE (is_lock = true)
);

-- Create indexes for performance
CREATE INDEX idx_anonymous_picks_email_week_season ON public.anonymous_picks(email, week, season);
CREATE INDEX idx_anonymous_picks_week_season ON public.anonymous_picks(week, season);
CREATE INDEX idx_anonymous_picks_is_validated ON public.anonymous_picks(is_validated);
CREATE INDEX idx_anonymous_picks_submitted_at ON public.anonymous_picks(submitted_at);

-- Enable RLS
ALTER TABLE public.anonymous_picks ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous_picks
CREATE POLICY "Allow insert for anonymous users" ON public.anonymous_picks
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read all" ON public.anonymous_picks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow admins to update validation status" ON public.anonymous_picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_anonymous_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_anonymous_picks_updated_at_trigger
    BEFORE UPDATE ON public.anonymous_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_anonymous_picks_updated_at();

-- Grant permissions
GRANT INSERT ON public.anonymous_picks TO anon;
GRANT SELECT ON public.anonymous_picks TO authenticated;
GRANT UPDATE ON public.anonymous_picks TO authenticated;