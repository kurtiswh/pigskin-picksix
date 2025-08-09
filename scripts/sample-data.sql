-- Sample data for testing the Games & Scoring functionality
-- Run this in your Supabase SQL editor

-- Insert sample games for Week 1, 2024
INSERT INTO public.games (week, season, home_team, away_team, spread, kickoff_time, status, home_score, away_score) VALUES
(1, 2024, 'Georgia', 'Clemson', -13.5, '2024-08-31 20:30:00+00', 'completed', 34, 3),
(1, 2024, 'Texas', 'Colorado State', -21.0, '2024-08-31 19:00:00+00', 'completed', 52, 0),
(1, 2024, 'Notre Dame', 'Texas A&M', -3.5, '2024-08-31 19:30:00+00', 'completed', 23, 13),
(1, 2024, 'Alabama', 'Western Kentucky', -28.0, '2024-08-31 19:00:00+00', 'completed', 63, 0),
(1, 2024, 'Michigan', 'Fresno State', -17.5, '2024-08-31 19:30:00+00', 'completed', 30, 10),
(1, 2024, 'Ohio State', 'Akron', -49.5, '2024-08-31 19:30:00+00', 'completed', 52, 6),
(1, 2024, 'USC', 'LSU', -4.5, '2024-09-01 19:30:00+00', 'in_progress', 14, 10),
(1, 2024, 'Oregon', 'Idaho', -42.0, '2024-09-01 22:00:00+00', 'scheduled', null, null),
(1, 2024, 'Florida State', 'Georgia Tech', -10.5, '2024-08-31 20:00:00+00', 'completed', 24, 21),
(1, 2024, 'Penn State', 'West Virginia', -8.5, '2024-08-31 20:00:00+00', 'completed', 34, 12);

-- Insert sample games for Week 2, 2024
INSERT INTO public.games (week, season, home_team, away_team, spread, kickoff_time, status, home_score, away_score) VALUES
(2, 2024, 'Texas', 'Michigan', -6.5, '2024-09-07 19:00:00+00', 'scheduled', null, null),
(2, 2024, 'Georgia', 'Tennessee Tech', -45.0, '2024-09-07 19:30:00+00', 'scheduled', null, null),
(2, 2024, 'Alabama', 'South Florida', -24.5, '2024-09-07 19:00:00+00', 'scheduled', null, null),
(2, 2024, 'Ohio State', 'Oregon', -3.0, '2024-09-07 19:30:00+00', 'scheduled', null, null),
(2, 2024, 'Notre Dame', 'Northern Illinois', -28.0, '2024-09-07 15:30:00+00', 'scheduled', null, null);

-- Sample picks (you'll need to replace the user_id values with actual user IDs from your users table)
-- First, let's create some sample users if they don't exist
INSERT INTO public.users (id, email, display_name, is_admin) VALUES
('11111111-1111-1111-1111-111111111111', 'test1@example.com', 'Test User 1', false),
('22222222-2222-2222-2222-222222222222', 'test2@example.com', 'Test User 2', false),
('33333333-3333-3333-3333-333333333333', 'test3@example.com', 'Test User 3', false)
ON CONFLICT (email) DO NOTHING;

-- Sample picks for completed games
-- Georgia vs Clemson (Georgia won 34-3, covered -13.5)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '11111111-1111-1111-1111-111111111111',
    g.id,
    1,
    2024,
    'Georgia',
    true,
    true,
    '2024-08-31 18:00:00+00',
    'win',
    45  -- 20 base + 5 bonus (29+ margin) + 20 lock bonus
FROM public.games g WHERE g.home_team = 'Georgia' AND g.away_team = 'Clemson' AND g.week = 1;

INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '22222222-2222-2222-2222-222222222222',
    g.id,
    1,
    2024,
    'Clemson',
    false,
    true,
    '2024-08-31 18:00:00+00',
    'loss',
    0
FROM public.games g WHERE g.home_team = 'Georgia' AND g.away_team = 'Clemson' AND g.week = 1;

-- Texas vs Colorado State (Texas won 52-0, covered -21.0)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '11111111-1111-1111-1111-111111111111',
    g.id,
    1,
    2024,
    'Texas',
    false,
    true,
    '2024-08-31 17:00:00+00',
    'win',
    25  -- 20 base + 5 bonus (29+ margin)
FROM public.games g WHERE g.home_team = 'Texas' AND g.away_team = 'Colorado State' AND g.week = 1;

INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '33333333-3333-3333-3333-333333333333',
    g.id,
    1,
    2024,
    'Texas',
    true,
    true,
    '2024-08-31 17:00:00+00',
    'win',
    30  -- 20 base + 5 bonus + 5 lock bonus
FROM public.games g WHERE g.home_team = 'Texas' AND g.away_team = 'Colorado State' AND g.week = 1;

-- Notre Dame vs Texas A&M (Notre Dame won 23-13, covered -3.5)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '22222222-2222-2222-2222-222222222222',
    g.id,
    1,
    2024,
    'Notre Dame',
    false,
    true,
    '2024-08-31 17:30:00+00',
    'win',
    21  -- 20 base + 1 bonus (11-19.5 margin)
FROM public.games g WHERE g.home_team = 'Notre Dame' AND g.away_team = 'Texas A&M' AND g.week = 1;

-- Alabama vs Western Kentucky (Alabama won 63-0, covered -28.0)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '33333333-3333-3333-3333-333333333333',
    g.id,
    1,
    2024,
    'Alabama',
    false,
    true,
    '2024-08-31 17:00:00+00',
    'win',
    25  -- 20 base + 5 bonus (29+ margin)
FROM public.games g WHERE g.home_team = 'Alabama' AND g.away_team = 'Western Kentucky' AND g.week = 1;

-- Michigan vs Fresno State (Michigan won 30-10, covered -17.5)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '11111111-1111-1111-1111-111111111111',
    g.id,
    1,
    2024,
    'Michigan',
    false,
    true,
    '2024-08-31 17:30:00+00',
    'win',
    20  -- 20 base (2.5 point margin, no bonus)
FROM public.games g WHERE g.home_team = 'Michigan' AND g.away_team = 'Fresno State' AND g.week = 1;

-- Ohio State vs Akron (Ohio State won 52-6, covered -49.5)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '22222222-2222-2222-2222-222222222222',
    g.id,
    1,
    2024,
    'Akron',
    false,
    true,
    '2024-08-31 17:30:00+00',
    'loss',
    0  -- Didn't cover
FROM public.games g WHERE g.home_team = 'Ohio State' AND g.away_team = 'Akron' AND g.week = 1;

-- Florida State vs Georgia Tech (FSU won 24-21, didn't cover -10.5)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '33333333-3333-3333-3333-333333333333',
    g.id,
    1,
    2024,
    'Georgia Tech',
    false,
    true,
    '2024-08-31 18:00:00+00',
    'win',
    25  -- 20 base + 5 bonus (covered by getting 7.5 points)
FROM public.games g WHERE g.home_team = 'Florida State' AND g.away_team = 'Georgia Tech' AND g.week = 1;

-- Penn State vs West Virginia (Penn State won 34-12, covered -8.5)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '11111111-1111-1111-1111-111111111111',
    g.id,
    1,
    2024,
    'Penn State',
    false,
    true,
    '2024-08-31 18:00:00+00',
    'win',
    21  -- 20 base + 1 bonus (13.5 point margin)
FROM public.games g WHERE g.home_team = 'Penn State' AND g.away_team = 'West Virginia' AND g.week = 1;

-- Add some picks for the in-progress game (USC vs LSU)
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '22222222-2222-2222-2222-222222222222',
    g.id,
    1,
    2024,
    'USC',
    true,
    true,
    '2024-09-01 17:30:00+00',
    null,
    null
FROM public.games g WHERE g.home_team = 'USC' AND g.away_team = 'LSU' AND g.week = 1;

-- Add some picks for scheduled games in Week 2
INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '11111111-1111-1111-1111-111111111111',
    g.id,
    2,
    2024,
    'Texas',
    false,
    true,
    '2024-09-06 18:00:00+00',
    null,
    null
FROM public.games g WHERE g.home_team = 'Texas' AND g.away_team = 'Michigan' AND g.week = 2;

INSERT INTO public.picks (user_id, game_id, week, season, selected_team, is_lock, submitted, submitted_at, result, points_earned)
SELECT 
    '33333333-3333-3333-3333-333333333333',
    g.id,
    2,
    2024,
    'Michigan',
    true,
    true,
    '2024-09-06 18:00:00+00',
    null,
    null
FROM public.games g WHERE g.home_team = 'Texas' AND g.away_team = 'Michigan' AND g.week = 2;