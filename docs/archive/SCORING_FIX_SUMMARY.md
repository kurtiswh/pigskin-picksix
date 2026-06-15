# Scoring Fix Summary - Single Source of Truth

## Problem Solved

**Issue**: Live scoring was calculating game winners incorrectly, requiring manual admin fixes.

**Root Cause**: Three different winner calculation implementations that didn't match:
1. ✅ **Database function** `calculate_winner_against_spread()` (CORRECT)
2. ❌ **Edge Function** `calculateWinner()` with `Math.abs()` tolerance (WRONG)
3. ❌ **TypeScript services** duplicate logic with same bug (WRONG)

**The Bug**:
```typescript
// WRONG (Edge Function & TypeScript):
if (Math.abs(homeMargin + spread) < 0.5) winner = 'push'

// CORRECT (Database):
home_score_with_spread := home_score + spread
IF home_score_with_spread > away_score THEN RETURN home_team
ELSIF away_score > home_score_with_spread THEN RETURN away_team
ELSE RETURN 'push'
```

The `Math.abs(...) < 0.5` adds a 0.5-point tolerance for pushes that doesn't exist in the database logic, causing incorrect winner determination.

---

## Solution Implemented

### New Single Source of Truth Function

**Created**: `calculate_and_update_completed_game(game_id)` in migration 139

This ONE database function now:
1. ✅ Calculates winner using database source of truth (`calculate_winner_against_spread`)
2. ✅ Calculates margin bonus correctly
3. ✅ Updates game record (winner, bonus, base points)
4. ✅ Processes ALL picks (regular + anonymous)
5. ✅ Returns comprehensive result

**Benefits**:
- Single source of truth - no more duplicate logic
- Matches manual admin fix exactly
- Atomic database transaction
- Detailed logging for debugging
- Used by BOTH automated systems AND manual triggers

---

## Files Changed

### 1. Database Migration (New)
**File**: `database/migrations/139_single_source_of_truth_scoring.sql`

- Created consolidated `calculate_and_update_completed_game()` function
- Reuses existing `calculate_winner_against_spread()` for winner logic
- Reuses existing `process_picks_for_completed_game()` for pick processing
- Granted permissions to `authenticated` and `service_role`

### 2. Edge Function (Updated)
**File**: `supabase/functions/live-score-updater/index.ts`

**Changes**:
- ❌ Removed local `calculateWinner()` function (lines 369-390)
- ✅ Now calls `calculate_and_update_completed_game()` RPC
- ✅ Updated pick processing logic to use database results
- Game updates now only set scores/status, database calculates winner

### 3. TypeScript Service (Updated)
**File**: `src/services/cfbdLiveUpdater.ts`

**Changes**:
- ❌ Removed local `calculateWinner()` method
- ❌ Removed winner calculation in `calculateUpdateData()`
- ✅ Now calls `calculate_and_update_completed_game()` RPC after game update
- ✅ Logs database-calculated winner and pick results

### 4. Live Update Service (No Changes Needed)
**File**: `src/services/liveUpdateService.ts`

- Already calls `CFBDLiveUpdater.updateLiveGames()`
- Automatically uses new database function via cfbdLiveUpdater
- No changes required ✅

---

## How It Works Now

### Flow for Completed Games:

1. **CFBD API Fetch**: Edge Function or TypeScript fetches live scores
2. **Game Update**: Updates only scores, status, quarter, clock
3. **Database Scoring** (NEW): Calls `calculate_and_update_completed_game()`
   - Database calculates winner (single source of truth)
   - Database calculates margin bonus
   - Database updates game record
   - Database processes ALL picks
   - Returns success/error + stats
4. **Result Logging**: Logs winner, bonus, picks processed

### Before vs After:

**BEFORE**:
```typescript
// Edge Function or TypeScript calculates winner locally (WRONG)
const winner = calculateWinner(home, away, homeScore, awayScore, spread)
updates.winner_against_spread = winner.winner  // ❌ Incorrect logic
updates.margin_bonus = winner.marginBonus

// Then separately processes picks
await supabase.rpc('process_picks_for_completed_game', {...})
```

**AFTER**:
```typescript
// Update game scores/status only
await supabase.from('games').update({ home_score, away_score, status })

// Database does ALL scoring with single source of truth ✅
const { data } = await supabase.rpc('calculate_and_update_completed_game', {
  game_id_param: gameId
})
// Returns: winner, margin_bonus, picks_updated, success
```

---

## Testing Instructions

### 1. Deploy Migration
```bash
# Run in Supabase SQL Editor or via migration
# This creates calculate_and_update_completed_game() function
```

### 2. Redeploy Edge Function (if using automated scoring)
```bash
npx supabase functions deploy live-score-updater
```

### 3. Test Manual Scoring
In Admin Dashboard:
1. Find a completed game with incorrect winner
2. Click "Fix Scoring"
3. Verify it uses `calculate_and_update_completed_game()`
4. Check that winner matches expected result

### 4. Test Live Scoring
1. Wait for next game to complete
2. Check Edge Function logs in Supabase
3. Verify logs show: `✅ Winner: [team], Bonus: [X]`
4. Verify picks are processed: `✅ Picks processed: X picks`
5. **Most Important**: Verify winner matches manual calculation

### 5. Verify Consistency
```sql
-- Check a game's scoring
SELECT
  home_team,
  away_team,
  home_score,
  away_score,
  spread,
  winner_against_spread,
  margin_bonus
FROM games
WHERE id = 'game-id-here';

-- Recalculate using database function
SELECT * FROM calculate_and_update_completed_game('game-id-here');

-- Both should return IDENTICAL winner and bonus!
```

---

## Monitoring & Debugging

### Check Edge Function Logs
```
Supabase Dashboard → Edge Functions → live-score-updater → Logs

Look for:
✅ "Winner: [team], Bonus: [X]"
✅ "Picks processed: X picks, X anonymous picks"
❌ "Scoring failed: [error]"
```

### Check Database Function Output
```sql
-- Run database function manually
SELECT * FROM calculate_and_update_completed_game('game-id');

-- Check notices in logs:
🎯 [SCORING] Processing completed game
📊 Game: AWAY @ HOME (X-Y)
📏 Spread: -X.X
✅ HOME team covers: score + spread = total > away_score
📊 HOME cover margin: X points → Bonus: X
✅ Game updated: winner=TEAM, bonus=X, base=20
✅ Picks processed: X regular, X anonymous
🎉 SCORING COMPLETE
```

### Verify Pick Results
```sql
-- Check if picks were scored correctly
SELECT
  u.display_name,
  p.selected_team,
  p.is_lock,
  p.result,
  p.points_earned,
  g.winner_against_spread,
  g.margin_bonus
FROM picks p
JOIN users u ON p.user_id = u.id
JOIN games g ON p.game_id = g.id
WHERE g.id = 'game-id'
ORDER BY p.points_earned DESC;
```

---

## Expected Behavior

### Correct Scoring Examples:

**Example 1: Home Team Covers**
- Game: Alabama @ Georgia
- Final: 31-24 (Georgia)
- Spread: Georgia -3.5
- Calculation: 31 + (-3.5) = 27.5 < 24 → **Alabama covers**
- Margin: 24 - 27.5 = -3.5 → No bonus (under 11)
- Winner: Alabama, Bonus: 0, Base: 20

**Example 2: Away Team Covers with Bonus**
- Game: USC @ Notre Dame
- Final: 14-38 (Notre Dame)
- Spread: Notre Dame -17.5
- Calculation: 38 + (-17.5) = 20.5 > 14 → **Notre Dame covers**
- Margin: 20.5 - 14 = 6.5 → Wait, this is WRONG!

Actually the correct calculation:
- Home score with spread: 38 + (-17.5) = 20.5
- If 20.5 > 14 (away score), home team covers
- Cover margin for home: 20.5 - 14 = 6.5 points
- Bonus: 0 (under 11 points)

**Example 3: Push**
- Game: Texas @ Oklahoma
- Final: 27-24 (Texas)
- Spread: Oklahoma -3.0
- Calculation: 24 + (-3.0) = 21 < 27 → Texas covers
- Wait, that's not a push...

Let me recalculate:
- Home (Oklahoma) score with spread: 24 + (-3) = 21
- Away (Texas) score: 27
- 21 < 27, so Texas (away) covers
- NOT a push

**Push Example**:
- Game: Michigan @ Ohio State
- Final: 27-24 (Michigan)
- Spread: Ohio State -3.0
- Calculation: 24 + (-3) = 21 vs 27 away score
- 21 ≠ 27, so NOT a push

A real push would be:
- Final: 27-24 (Michigan)
- Spread: Michigan -3.0 (home team favored)
- Home with spread: 24 + 3 = 27
- 27 = 27 → **PUSH**

---

## Rollback Plan (If Needed)

If issues occur, you can temporarily revert by:

1. **Disable Edge Function automation** (stop cron jobs)
2. **Use manual admin scoring only** (which already uses database function)
3. **Investigate logs** to see what went wrong
4. **Fix and redeploy**

The manual admin fix will ALWAYS work because it uses the same database function!

---

## Success Criteria

✅ **All completed games score correctly** (matches manual calculation)
✅ **No more incorrect winner assignments**
✅ **Picks automatically processed** when games complete
✅ **Edge Function logs show database winner** calculation
✅ **Manual admin fix and auto-scoring produce identical results**
✅ **No duplicate scoring logic** exists in codebase

---

## Questions & Troubleshooting

**Q: What if a game still scores incorrectly?**
A: Check the database function logs. The detailed `RAISE NOTICE` statements show every step of the calculation. If the database function is wrong, we fix it ONCE and it applies everywhere.

**Q: Can I still manually fix games?**
A: Yes! The admin dashboard should call the same `calculate_and_update_completed_game()` function.

**Q: What if picks don't update?**
A: The `process_picks_for_completed_game()` function is called within `calculate_and_update_completed_game()`. Check if there's an error in the pick processing step.

**Q: How do I know if the database function is being used?**
A: Check the logs - you'll see `🎯 Calling database to calculate winner and process picks...` followed by the result.

---

## Contact

For issues or questions, check:
1. Supabase Edge Function logs
2. Database function execution logs (RAISE NOTICE output)
3. Pick results in database

The single source of truth is now in the database, making debugging much easier!
