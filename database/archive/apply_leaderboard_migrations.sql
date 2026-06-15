-- Apply Migrations 121 & 122 for Leaderboard Visibility Controls
-- Run this in your Supabase SQL Editor

-- First, apply Migration 121
\i database/migrations/121_add_leaderboard_visibility_controls.sql

-- Then, apply Migration 122  
\i database/migrations/122_add_visibility_summary_function.sql

-- Finally, refresh leaderboards to ensure all visibility changes are applied
SELECT * FROM public.refresh_all_leaderboards(2025);