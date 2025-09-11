# Apply Migration 132: Fix Mixed User Leaderboard Display

## Issue
Users like Elizabeth Kreeb who have both authenticated and anonymous picks are not showing both on the leaderboard. Currently, the database views exclude ALL anonymous picks if a user has ANY authenticated picks for that season/week.

## Problem Analysis
Looking at the screenshots:
- Elizabeth Kreeb shows up 3 times in the leaderboard with 5-1-0 record and 104 points (Week 1 authenticated)
- But her Week 2 anonymous picks with 4-2-0 record and 88 points are missing
- This is because the current views (lines 105-112 and 220-226 in migration 131d) use `NOT EXISTS` to exclude anonymous picks if ANY authenticated picks exist for the season

## Solution
Created Migration 132 (`database/migrations/132_fix_mixed_user_leaderboard_display.sql`) that:

### Weekly Leaderboard Fix
- Changes exclusion logic from season-wide to week-specific
- Only excludes anonymous picks if authenticated picks exist for the SAME week
- Allows users to show authenticated picks for Week 1 AND anonymous picks for Week 2

### Season Leaderboard Fix  
- Combines authenticated and anonymous picks for the same user into one entry
- Adds up points from both sources (Week 1 auth + Week 2 anon = total points)
- Marks pick_source as "mixed" when user has both types

## To Apply
1. Connect to your production Supabase database
2. Run the SQL from `database/migrations/132_fix_mixed_user_leaderboard_display.sql`
3. The views will be recreated with the fixed logic

## Expected Result
After applying:
- Elizabeth Kreeb will appear ONCE on season leaderboard:
  - "Elizabeth Kreeb" - 192 points total (104 from Week 1 auth + 88 from Week 2 anon)
  - Record will show combined stats from both pick sources
  - Pick source will be marked as "mixed"
- Weekly leaderboards will show the appropriate entry for each individual week
- Users get full credit for all their picks regardless of source

## Backend Code
The current leaderboard service (`src/services/leaderboardService.ts`) doesn't need changes - it already properly handles multiple entries per user and includes the `pick_source` field to distinguish between authenticated and anonymous picks.