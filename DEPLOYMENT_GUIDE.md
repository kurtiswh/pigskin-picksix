# Leaderboard Trigger System Deployment Guide

## Overview
This guide walks through deploying the new trigger-based leaderboard system that eliminates performance issues and provides real-time updates.

## Migration Files Created
The following migration files have been created and need to be applied in order:

1. `028_convert_leaderboard_views_to_tables_with_payment_status.sql`
2. `029_create_leaderboard_update_triggers.sql` 
3. `030_create_leaderboard_triggers.sql`
4. `031_populate_initial_payment_status.sql`

## Manual Deployment Steps

### Step 1: Apply Migration 028 (Convert Views to Tables)
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `database/migrations/028_convert_leaderboard_views_to_tables_with_payment_status.sql`
3. Execute the SQL
4. Verify tables were created with: `SELECT * FROM weekly_leaderboard LIMIT 1;`

### Step 2: Apply Migration 029 (Create Trigger Functions)
1. In SQL Editor, paste contents of `database/migrations/029_create_leaderboard_update_triggers.sql`
2. Execute the SQL
3. Verify functions were created with: `\df public.update_leaderboard_payment_status`

### Step 3: Apply Migration 030 (Create Triggers)
1. In SQL Editor, paste contents of `database/migrations/030_create_leaderboard_triggers.sql`
2. Execute the SQL
3. Verify triggers were created

### Step 4: Apply Migration 031 (Populate Payment Status)
1. In SQL Editor, paste contents of `database/migrations/031_populate_initial_payment_status.sql`
2. Execute the SQL
3. Check results with: `SELECT payment_status, is_verified, COUNT(*) FROM season_leaderboard GROUP BY payment_status, is_verified;`

## Testing the New System

After deployment, test with:
```bash
VITE_SUPABASE_URL="your_url" VITE_SUPABASE_ANON_KEY="your_key" node test_triggers.js
```

## Benefits of the New System

### Before (Old System)
- Complex joins between `leaguesafe_payments` and leaderboard views on every request
- Browser timeout issues with large datasets
- Hardcoded user data to work around performance problems
- No real-time updates when payment status changes

### After (New System) 
- Direct queries to materialized leaderboard tables
- Payment status stored directly in leaderboard tables
- Automatic updates via database triggers when:
  - LeagueSafe payment status changes
  - Game results are updated (via existing pick calculation triggers)
  - Anonymous picks are assigned to users
- Fast, indexed queries with `WHERE is_verified = true`

## Trigger Flow
1. **LeagueSafe Payment Changes** → `update_leaderboard_payment_status()` → Updates `payment_status` and `is_verified` in leaderboard tables
2. **Game Results Updated** → Existing `calculate_pick_results()` → `recalculate_weekly_leaderboard()` + `recalculate_season_leaderboard()`
3. **Pick Changes** → `recalculate_weekly_leaderboard()` + `recalculate_season_leaderboard()`
4. **Anonymous Pick Assignment** → `handle_anonymous_pick_assignment()` → Leaderboard recalculation

## Service Layer Changes
The `LeaderboardService` has been updated to:
- Remove all hardcoded data
- Query `weekly_leaderboard` and `season_leaderboard` tables directly
- Filter with `WHERE is_verified = true` for paid users only
- Provide fast, real-time leaderboard data

## Rollback Plan
If issues occur, you can rollback by:
1. Dropping the new tables: `DROP TABLE weekly_leaderboard, season_leaderboard CASCADE;`
2. Recreating the original views from `database/schema.sql` (lines 278-312)
3. Reverting `LeaderboardService` to use the original hardcoded approach

## Maintenance
- Leaderboard data updates automatically via triggers
- Rankings recalculate automatically when points change
- Payment status updates automatically when LeagueSafe data changes
- No manual intervention needed for normal operations