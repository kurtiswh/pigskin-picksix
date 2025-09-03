-- Check weekly leaderboard table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'weekly_leaderboard' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check sample data to see actual column names
SELECT * FROM public.weekly_leaderboard 
WHERE season = 2025 AND week = 1
LIMIT 3;