-- Create custom types
CREATE TYPE game_status AS ENUM ('scheduled', 'in_progress', 'completed');
CREATE TYPE pick_result AS ENUM ('win', 'loss', 'push');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    leaguesafe_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Games table
CREATE TABLE public.games (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    spread DECIMAL(4,1) NOT NULL,
    kickoff_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status game_status DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_game_week_teams UNIQUE (week, season, home_team, away_team)
);

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Picks table
CREATE TABLE public.picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    selected_team TEXT NOT NULL,
    is_lock BOOLEAN DEFAULT FALSE,
    submitted BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    result pick_result,
    points_earned INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_game_pick UNIQUE (user_id, game_id)
);

-- Enable RLS
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;

-- Week settings table
CREATE TABLE public.week_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    games_selected BOOLEAN DEFAULT FALSE,
    picks_open BOOLEAN DEFAULT FALSE,
    games_locked BOOLEAN DEFAULT FALSE,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_week_season UNIQUE (week, season)
);

-- Enable RLS
ALTER TABLE public.week_settings ENABLE ROW LEVEL SECURITY;

-- Row Level Security Policies

-- Users policies
CREATE POLICY "Users can view all profiles" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.users FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Games policies
CREATE POLICY "Anyone can view games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Only admins can modify games" ON public.games FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Picks policies
CREATE POLICY "Users can view all picks" ON public.picks FOR SELECT USING (true);
CREATE POLICY "Users can insert own picks" ON public.picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own picks before deadline" ON public.picks FOR UPDATE USING (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.week_settings ws 
        WHERE ws.week = picks.week AND ws.season = picks.season 
        AND ws.picks_open = true AND NOW() < ws.deadline
    )
);
CREATE POLICY "Admins can update any picks" ON public.picks FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Week settings policies
CREATE POLICY "Anyone can view week settings" ON public.week_settings FOR SELECT USING (true);
CREATE POLICY "Only admins can modify week settings" ON public.week_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Functions

-- Function to validate pick constraints
CREATE OR REPLACE FUNCTION public.validate_pick_constraints()
RETURNS TRIGGER AS $$
DECLARE
    pick_count INTEGER;
    lock_count INTEGER;
BEGIN
    -- Check max 6 picks per week
    SELECT COUNT(*) INTO pick_count
    FROM public.picks 
    WHERE user_id = NEW.user_id AND week = NEW.week AND season = NEW.season;
    
    IF TG_OP = 'INSERT' AND pick_count >= 6 THEN
        RAISE EXCEPTION 'Cannot have more than 6 picks per week';
    END IF;
    
    -- Check max 1 lock per week
    IF NEW.is_lock = TRUE THEN
        SELECT COUNT(*) INTO lock_count
        FROM public.picks 
        WHERE user_id = NEW.user_id AND week = NEW.week AND season = NEW.season AND is_lock = TRUE;
        
        IF TG_OP = 'INSERT' AND lock_count >= 1 THEN
            RAISE EXCEPTION 'Cannot have more than 1 lock pick per week';
        END IF;
        
        IF TG_OP = 'UPDATE' AND lock_count > 1 THEN
            RAISE EXCEPTION 'Cannot have more than 1 lock pick per week';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for pick validation
CREATE TRIGGER validate_pick_constraints_trigger
    BEFORE INSERT OR UPDATE ON public.picks
    FOR EACH ROW EXECUTE FUNCTION public.validate_pick_constraints();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_picks_updated_at BEFORE UPDATE ON public.picks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_week_settings_updated_at BEFORE UPDATE ON public.week_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate pick results and points
CREATE OR REPLACE FUNCTION public.calculate_pick_results()
RETURNS TRIGGER AS $$
DECLARE
    home_covered BOOLEAN;
    away_covered BOOLEAN;
    margin DECIMAL;
    base_points INTEGER;
    bonus_points INTEGER;
    total_points INTEGER;
    pick_record RECORD;
BEGIN
    -- Only calculate if game is completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Calculate if teams covered and by how much
        home_covered = (NEW.home_score + NEW.spread) > NEW.away_score;
        away_covered = (NEW.away_score - NEW.spread) > NEW.home_score;
        
        -- Update all picks for this game
        FOR pick_record IN SELECT * FROM public.picks WHERE game_id = NEW.id LOOP
            -- Determine result
            IF (NEW.home_score + NEW.spread) = NEW.away_score THEN
                -- Push (exact spread) - no bonus points for pushes
                base_points := 10;
                bonus_points := 0;
            ELSIF (pick_record.selected_team = NEW.home_team AND home_covered) OR 
                  (pick_record.selected_team = NEW.away_team AND away_covered) THEN
                -- Win - calculate margin and bonus
                base_points := 20;
                
                -- Calculate margin of victory vs spread
                IF pick_record.selected_team = NEW.home_team THEN
                    margin := NEW.home_score - NEW.away_score - NEW.spread;
                ELSE
                    margin := NEW.away_score - NEW.home_score + NEW.spread;
                END IF;
                
                -- Calculate bonus points based on margin
                IF margin >= 29 THEN
                    bonus_points := 5;
                ELSIF margin >= 20 AND margin <= 28.5 THEN
                    bonus_points := 3;
                ELSIF margin >= 11 AND margin <= 19.5 THEN
                    bonus_points := 1;
                ELSE
                    bonus_points := 0;
                END IF;
            ELSE
                -- Loss
                base_points := 0;
                bonus_points := 0;
            END IF;
            
            -- Calculate total points (only bonus points doubled for lock picks)
            IF pick_record.is_lock THEN
                total_points := base_points + (bonus_points * 2);
            ELSE
                total_points := base_points + bonus_points;
            END IF;
            
            -- Update the pick
            UPDATE public.picks SET 
                result = CASE 
                    WHEN (NEW.home_score + NEW.spread) = NEW.away_score THEN 'push'
                    WHEN (pick_record.selected_team = NEW.home_team AND home_covered) OR 
                         (pick_record.selected_team = NEW.away_team AND away_covered) THEN 'win'
                    ELSE 'loss'
                END,
                points_earned = total_points
            WHERE id = pick_record.id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for calculating pick results
CREATE TRIGGER calculate_pick_results_trigger
    AFTER UPDATE ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.calculate_pick_results();

-- Views for leaderboard data
CREATE VIEW public.weekly_leaderboard AS
SELECT 
    u.id as user_id,
    u.display_name,
    w.week,
    w.season,
    COUNT(p.id) as picks_made,
    COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
    COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
    COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
    COALESCE(SUM(p.points_earned), 0) as total_points,
    RANK() OVER (PARTITION BY w.week, w.season ORDER BY COALESCE(SUM(p.points_earned), 0) DESC) as weekly_rank
FROM public.users u
CROSS JOIN public.week_settings w
LEFT JOIN public.picks p ON u.id = p.user_id AND w.week = p.week AND w.season = p.season
GROUP BY u.id, u.display_name, w.week, w.season;

CREATE VIEW public.season_leaderboard AS
SELECT 
    u.id as user_id,
    u.display_name,
    p.season,
    COUNT(p.id) as total_picks,
    COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
    COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
    COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
    COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
    COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
    COALESCE(SUM(p.points_earned), 0) as total_points,
    RANK() OVER (PARTITION BY p.season ORDER BY COALESCE(SUM(p.points_earned), 0) DESC) as season_rank
FROM public.users u
LEFT JOIN public.picks p ON u.id = p.user_id
GROUP BY u.id, u.display_name, p.season;