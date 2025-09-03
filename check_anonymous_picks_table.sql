-- Check if anonymous_picks table exists and its structure
SELECT 'Checking if anonymous_picks table exists' as check_step;

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'anonymous_picks';

-- Check the column structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'anonymous_picks' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there are any records
SELECT COUNT(*) as total_records FROM public.anonymous_picks;

-- Check a few sample records to see the structure
SELECT * FROM public.anonymous_picks LIMIT 3;