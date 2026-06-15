# Fix: Leaderboard Showing Unsubmitted Picks

## Issue Summary

The leaderboard is currently showing users who have unsubmitted picks (where `submitted = false`). This occurs because the database views `weekly_leaderboard` and `season_leaderboard` are not properly filtering for only submitted picks.

## Root Cause

The current views in `database/schema.sql` use:
- `LEFT JOIN` which includes ALL users, even those without picks
- No filtering by `submitted = true` 
- No filtering by `show_on_leaderboard = true`

This results in leaderboard entries with:
- Users showing 0 picks and 0 points (from the LEFT JOIN)
- Unsubmitted picks being counted in calculations

## Solution

### Step 1: Apply Migration 131

The migration file `database/migrations/131_fix_leaderboard_views_submitted_filter.sql` has been created and contains the proper view definitions.

**Manual Application Required:**
Since direct database access isn't available, you'll need to apply this migration manually through your Supabase dashboard or admin interface:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and execute the contents of `database/migrations/131_fix_leaderboard_views_submitted_filter.sql`

### Step 2: Key Changes Made

The updated views now:

**Weekly Leaderboard:**
```sql
-- OLD (problematic)
FROM public.users u
CROSS JOIN public.week_settings w
LEFT JOIN public.picks p ON u.id = p.user_id AND w.week = p.week AND w.season = p.season

-- NEW (correct)
FROM public.users u
JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
WHERE p.submitted = TRUE
  AND p.show_on_leaderboard = TRUE
GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
HAVING COUNT(p.id) > 0
```

**Season Leaderboard:**
```sql
-- OLD (problematic)  
FROM public.users u
LEFT JOIN public.picks p ON u.id = p.user_id

-- NEW (correct)
FROM public.users u
JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
WHERE p.submitted = TRUE
  AND p.show_on_leaderboard = TRUE
GROUP BY u.id, u.display_name, p.season, lsp.status, lsp.is_matched
HAVING COUNT(p.id) > 0
```

### Step 3: Update LeaderboardService (Optional)

The `src/services/leaderboardService.ts` already uses the correct approach by querying the views. No changes needed there.

### Step 4: Verification

After applying the migration, verify the fix:

```javascript
// Check that leaderboard only shows users with submitted picks
const { data: weeklyData } = await supabase
  .from('weekly_leaderboard')
  .select('user_id, display_name, picks_made, total_points')
  .eq('season', 2024);

// Should not see any entries with picks_made = 0
console.log('Weekly leaderboard entries:', weeklyData);
```

## Additional Views Created

The migration also creates enhanced views:

1. **`weekly_leaderboard_ranked`** - Includes both authenticated and anonymous picks with proper ranking
2. **`season_leaderboard_ranked`** - Combined season view with both pick types
3. **`weekly_leaderboard_combined`** - Base combined view without ranking
4. **`season_leaderboard_combined`** - Base combined season view without ranking

## Impact

✅ **After Fix:**
- Only users with `submitted = true` picks appear on leaderboards
- No more 0-pick, 0-point entries
- Proper filtering by `show_on_leaderboard` flag
- Accurate rankings and statistics

❌ **Before Fix:**
- All users appeared on leaderboard regardless of submission status
- Many entries showing 0 picks and 0 points
- Unsubmitted picks potentially being counted
- Inaccurate leaderboard representation

## Files Modified

1. `database/migrations/130_fix_leaderboard_submitted_filter.sql` - Fixed leaderboard functions
2. `database/migrations/131_fix_leaderboard_views_submitted_filter.sql` - Fixed leaderboard views
3. `FIX_LEADERBOARD_SUBMISSION_ISSUE.md` - This documentation

## Testing

To test the fix is working:

1. Create some test picks with `submitted = false`
2. Check that they don't appear on leaderboards
3. Set `submitted = true` and verify they appear
4. Confirm that `show_on_leaderboard = false` picks are excluded

## Monitoring

After applying the fix, monitor for:
- No users with 0 picks on leaderboards
- All leaderboard entries have meaningful statistics
- Submission status is properly respected
- Performance remains acceptable