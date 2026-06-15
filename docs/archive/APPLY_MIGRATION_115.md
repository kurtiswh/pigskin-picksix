# 🔧 URGENT: Apply Migration 115 - Add Missing Columns to Anonymous Picks

## Problem
The anonymous_picks table is missing the `result` and `points_earned` columns that the pick processing system is trying to update. This causes the pick processing to fail silently for anonymous picks.

## Root Cause
The `anonymous_picks` table was created without the scoring columns that exist in the `picks` table:
- ❌ `result` column is missing (needed to store 'win', 'loss', 'push', 'pending')
- ❌ `points_earned` column is missing (needed to store calculated points)

## Solution: Apply Migration 115

### Step 1: Copy Migration SQL
```sql
-- Migration: Add missing result and points_earned columns to anonymous_picks table
-- These columns are needed for the pick processing system to update anonymous picks

-- Add the missing columns that exist in the picks table
ALTER TABLE public.anonymous_picks 
ADD COLUMN result TEXT CHECK (result IN ('win', 'loss', 'push', 'pending'));

ALTER TABLE public.anonymous_picks 
ADD COLUMN points_earned INTEGER DEFAULT 0;

-- Add index for performance when querying by result
CREATE INDEX idx_anonymous_picks_result ON public.anonymous_picks(result);

-- Add comments for clarity
COMMENT ON COLUMN public.anonymous_picks.result IS 'Pick result: win, loss, push, or pending';
COMMENT ON COLUMN public.anonymous_picks.points_earned IS 'Points earned for this pick (20 for win, 10 for lock win, 0 for loss/push)';
```

### Step 2: Apply Migration
1. Go to Supabase Dashboard → SQL Editor → New Query
2. Paste the entire SQL above
3. Execute the migration
4. Verify no errors in the output

### Step 3: Test the Fix
After applying the migration, test the picks scoring system:
1. Go to Admin Dashboard → Score Manager
2. Click "Update Picks Scoring" 
3. Anonymous picks should now be processed and updated

### Step 4: Fix Leaderboard Constraint Violations
The leaderboard functions also need updating. Apply this additional fix:

```sql
-- Update the leaderboard functions to handle anonymous picks correctly
-- The issue is that anonymous_picks don't have season/week columns directly

CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    p_user_id UUID, 
    p_week INTEGER, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
    existing_entry RECORD;
BEGIN
    -- Get user display name
    SELECT display_name INTO user_stats 
    FROM public.users 
    WHERE id = p_user_id;
    
    IF user_stats IS NULL THEN
        RETURN;
    END IF;
    
    -- Calculate combined stats from regular picks and assigned anonymous picks
    SELECT 
        COUNT(*) as picks_made,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM (
        -- Regular picks
        SELECT result, is_lock, points_earned
        FROM public.picks 
        WHERE user_id = p_user_id AND week = p_week AND season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks (now with direct result/points_earned columns)
        SELECT result, is_lock, points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = p_user_id AND g.week = p_week AND g.season = p_season
    ) combined_picks;
    
    -- Upsert the weekly leaderboard entry (should handle constraint gracefully)
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        (SELECT display_name FROM public.users WHERE id = p_user_id),
        p_week,
        p_season,
        user_stats.picks_made,
        user_stats.wins,
        user_stats.losses,
        user_stats.pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        COALESCE((SELECT status FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
        COALESCE((SELECT (status = 'Paid' AND is_matched = TRUE) FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), FALSE)
    )
    ON CONFLICT (user_id, week, season) 
    DO UPDATE SET
        picks_made = EXCLUDED.picks_made,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        pushes = EXCLUDED.pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Recalculate rankings for this week/season
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = p_week AND season = p_season
    ) subq
    WHERE public.weekly_leaderboard.id = subq.id
        AND public.weekly_leaderboard.week = p_week
        AND public.weekly_leaderboard.season = p_season;
END;
$$ LANGUAGE plpgsql;

-- Same fix for season leaderboard
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    p_user_id UUID, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate combined season stats from regular picks and assigned anonymous picks
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM (
        -- Regular picks
        SELECT result, is_lock, points_earned
        FROM public.picks 
        WHERE user_id = p_user_id AND season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks (now with direct result/points_earned columns)
        SELECT result, is_lock, points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = p_user_id AND g.season = p_season
    ) combined_picks;
    
    -- Upsert the season leaderboard entry (should handle constraint gracefully)
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        (SELECT display_name FROM public.users WHERE id = p_user_id),
        p_season,
        user_stats.total_picks,
        user_stats.total_wins,
        user_stats.total_losses,
        user_stats.total_pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        COALESCE((SELECT status FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
        COALESCE((SELECT (status = 'Paid' AND is_matched = TRUE) FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), FALSE)
    )
    ON CONFLICT (user_id, season) 
    DO UPDATE SET
        total_picks = EXCLUDED.total_picks,
        total_wins = EXCLUDED.total_wins,
        total_losses = EXCLUDED.total_losses,
        total_pushes = EXCLUDED.total_pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Recalculate rankings for this season
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = p_season
    ) subq
    WHERE public.season_leaderboard.id = subq.id
        AND public.season_leaderboard.season = p_season;
END;
$$ LANGUAGE plpgsql;
```

## Expected Results
✅ **BEFORE**: Anonymous picks not updating, constraint violations on leaderboard  
✅ **AFTER**: Anonymous picks process correctly, leaderboards update without errors

## Key Changes Made
1. **Added Missing Columns**: `result` and `points_earned` to `anonymous_picks` table
2. **Simplified Anonymous Pick Processing**: Now uses direct columns instead of calculated values
3. **Fixed Leaderboard JOIN Logic**: Anonymous picks join through games table to get week/season
4. **Maintained UPSERT Logic**: Constraint violations should be handled gracefully

## Testing Steps
1. Apply Migration 115 
2. Run scheduled pick processing
3. Verify anonymous picks show updated results and points
4. Check leaderboards refresh without constraint errors