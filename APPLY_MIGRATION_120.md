# Apply Migration 120: Fix Leaderboard to Include All Users

## 🔧 Migration Overview

Migration 120 fixes the leaderboard to include **ALL users with picks**, regardless of payment status. This resolves the issue where unpaid users weren't appearing on the leaderboard.

## 📋 How to Apply

### Step 1: Run the Migration
```bash
# Apply the migration to your Supabase database
psql -h [your-db-host] -U [username] -d [database] -f database/migrations/120_fix_leaderboard_inclusion_all_users.sql
```

### Step 2: Refresh All Leaderboards
After applying the migration, run this SQL command to rebuild the leaderboards:

```sql
-- Refresh leaderboards for 2024 season (adjust year as needed)
SELECT * FROM public.refresh_all_leaderboards(2024);
```

This function will:
- Process all users who have made picks (authenticated or anonymous)
- Update season leaderboard entries
- Update weekly leaderboard entries
- Recalculate all rankings properly

### Step 3: Verify the Fix
Check that all users with picks now appear:

```sql
-- Check how many users are on the leaderboard vs how many have picks
SELECT 
    'Leaderboard Users' as type, COUNT(*) as count
FROM season_leaderboard 
WHERE season = 2024

UNION ALL

SELECT 
    'Users with Picks' as type, COUNT(DISTINCT user_id) as count
FROM picks 
WHERE season = 2024;
```

## 🎯 What This Fixes

### Before Migration 120:
- ❌ Only users with `is_verified=true` OR anonymous/mixed picks appeared
- ❌ Unpaid users with only authenticated picks were hidden
- ❌ Leaderboard looked empty despite many users having picks

### After Migration 120:
- ✅ **ALL users** with picks appear on leaderboard (paid and unpaid)
- ✅ Payment status shown via badges for transparency
- ✅ Pick source (Auth/Anon/Mixed) shown for admin visibility
- ✅ Clear visual indicators instead of hiding users

## 🔍 Frontend Changes Applied

The frontend now:
- Shows payment status badges (Paid/Pending/Not Paid)
- Displays pick source for admins (Auth/Anon/Mixed)  
- Includes all users in leaderboard display
- Production service no longer filters by verification status

## 📊 Database Functions Added

### 1. `refresh_all_leaderboards(season)`
Rebuilds all leaderboard entries for a season. Use this to fix missing users.

### 2. `recalculate_season_leaderboard_for_user(user_id, season)`  
Recalculates season stats for a specific user, combining authenticated and anonymous picks.

### 3. `recalculate_weekly_leaderboard_for_user(user_id, week, season)`
Recalculates weekly stats for a specific user/week, combining all pick sources.

## 🚨 Important Notes

1. **Anonymous Pick Filtering**: Anonymous picks must have `show_on_leaderboard = true` to be included
2. **Payment Status**: Users are included regardless of payment status - payment is shown via badges
3. **Pick Sources**: The system properly handles authenticated, anonymous, and mixed pick sources
4. **Manual Refresh**: After major data changes, run `refresh_all_leaderboards()` to rebuild everything

## 🔧 Manual Admin Commands

If you need to troubleshoot or refresh specific data:

```sql
-- Refresh just the current season
SELECT * FROM public.refresh_all_leaderboards(2024);

-- Refresh specific user's data
SELECT public.recalculate_season_leaderboard_for_user('USER-UUID-HERE', 2024);

-- Check user's pick sources
SELECT DISTINCT pick_source, COUNT(*) 
FROM season_leaderboard 
WHERE season = 2024 
GROUP BY pick_source;
```

This migration ensures full transparency - everyone who plays sees their results, with clear indicators of payment status.