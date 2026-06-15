# Resilient Leaderboard System - Application Guide

## Overview
This document provides a comprehensive plan for applying the new resilient leaderboard system that eliminates duplicate key errors and provides robust error recovery.

## ✅ What Was Fixed

### 1. **Root Cause Analysis** (Migration 111)
- **Problem**: Original trigger functions used separate INSERT/UPDATE logic causing race conditions
- **Problem**: Multiple triggers firing simultaneously created duplicate key violations
- **Problem**: `show_on_leaderboard` flag wasn't properly respected in calculations

### 2. **UPSERT Pattern Implementation** (Migration 111)
- **Solution**: Replaced INSERT/UPDATE logic with `INSERT ... ON CONFLICT DO UPDATE`
- **Solution**: Made functions thread-safe for concurrent operations
- **Solution**: Added proper filtering for `show_on_leaderboard = true` in all calculations

### 3. **Safe Visibility Toggle Functions** (Migration 112)
- **Solution**: Created new functions that work harmoniously with fixed triggers
- **Solution**: Proper admin authentication using email lookup
- **Solution**: Detailed success/error reporting with operation tracking

### 4. **Comprehensive Recovery System** (Migration 113)
- **Solution**: Complete rebuild capabilities for both season and weekly leaderboards
- **Solution**: Health diagnostic tools to identify missing or incorrect data
- **Solution**: Manual refresh functions with granular targeting
- **Solution**: Extensive error logging and recovery mechanisms

## 🚀 Migration Application Steps

### Step 1: Apply Core UPSERT Fixes
```sql
-- Copy and paste into Supabase SQL Editor
-- This fixes the fundamental duplicate key issues
```
Apply: `database/migrations/111_fix_trigger_upsert_patterns.sql`

### Step 2: Apply Safe Visibility Functions  
```sql
-- Copy and paste into Supabase SQL Editor
-- This provides the Show/Hide functionality that works with triggers
```
Apply: `database/migrations/112_safe_visibility_toggle_functions.sql`

### Step 3: Apply Recovery and Diagnostic Tools
```sql
-- Copy and paste into Supabase SQL Editor  
-- This provides comprehensive rebuild and diagnostic capabilities
```
Apply: `database/migrations/113_comprehensive_leaderboard_refresh.sql`

## 🧪 Testing and Validation Plan

### Phase 1: Basic Functionality Tests
1. **Test visibility toggle for individual user**
   ```javascript
   // In browser console or admin panel
   const result = await supabase.rpc('toggle_picks_leaderboard_visibility', {
     target_user_id: 'your-test-user-id',
     target_season: 2024,
     show_on_leaderboard: false
   });
   console.log('Hide result:', result);
   ```

2. **Test visibility toggle back to visible**
   ```javascript
   const result = await supabase.rpc('toggle_picks_leaderboard_visibility', {
     target_user_id: 'your-test-user-id', 
     target_season: 2024,
     show_on_leaderboard: true
   });
   console.log('Show result:', result);
   ```

3. **Verify leaderboard calculations respect visibility**
   - Check that hidden picks don't count toward leaderboard totals
   - Verify that user disappears/reappears from leaderboards correctly

### Phase 2: Stress Testing
1. **Concurrent operations test**
   - Toggle multiple users simultaneously
   - Verify no duplicate key errors occur
   - Check all operations complete successfully

2. **Large dataset test**
   - Test with users who have many picks across multiple weeks
   - Verify performance remains acceptable
   - Check that all weeks/seasons are handled correctly

### Phase 3: Recovery System Tests
1. **Health diagnostic**
   ```javascript
   const health = await supabase.rpc('diagnose_leaderboard_health', {
     target_season: 2024
   });
   console.log('Health report:', health);
   ```

2. **Manual refresh test**
   ```javascript
   const refresh = await supabase.rpc('manual_refresh_user_leaderboards', {
     target_user_id: 'test-user-id',
     target_season: 2024
   });
   console.log('Refresh result:', refresh);
   ```

3. **Full rebuild test** (use with caution on production)
   ```javascript
   const rebuild = await supabase.rpc('rebuild_season_leaderboard', {
     target_season: 2024,
     force_rebuild: true
   });
   console.log('Rebuild result:', rebuild);
   ```

## 🔍 Key Validation Points

### ✅ Verification Checklist
- [ ] No more "duplicate key value violates unique constraint" errors
- [ ] Show/Hide buttons work immediately without page refresh
- [ ] Hidden users don't appear on leaderboards
- [ ] Hidden picks don't count toward point totals  
- [ ] Leaderboard rankings update correctly when visibility changes
- [ ] System handles concurrent operations gracefully
- [ ] Error messages are clear and actionable
- [ ] Admin authentication works properly
- [ ] Performance remains acceptable with large datasets

### 📊 Monitoring Points
- [ ] Database query performance (check slow query log)
- [ ] Trigger execution times
- [ ] Error rates in application logs
- [ ] User experience during visibility toggles
- [ ] Leaderboard accuracy after changes

## 🔧 Available Admin Functions

### Visibility Control
- `toggle_picks_leaderboard_visibility(user_id, season, week, show_on_leaderboard)`
- `toggle_anonymous_picks_leaderboard_visibility(user_id, season, week, show_on_leaderboard)`

### Recovery & Diagnostics  
- `diagnose_leaderboard_health(season)` - Check for issues
- `manual_refresh_user_leaderboards(user_id, season, week)` - Quick refresh
- `rebuild_season_leaderboard(season, user_id, force_rebuild)` - Complete rebuild
- `rebuild_weekly_leaderboard(season, week, user_id, force_rebuild)` - Weekly rebuild

## 🚨 Rollback Plan

If issues occur, the system can be rolled back by:
1. Dropping the new functions
2. Restoring the original trigger functions from migration 058
3. The core data remains intact throughout

## 💡 Success Indicators

The system is working correctly when:
1. ✅ No duplicate key errors in logs
2. ✅ Show/Hide buttons respond instantly
3. ✅ Leaderboards update automatically
4. ✅ Hidden users/picks are properly excluded
5. ✅ Rankings recalculate correctly
6. ✅ System handles concurrent operations
7. ✅ Recovery functions work when needed

---

**Next Step**: Apply Migration 111 first and test basic functionality before proceeding to migrations 112 and 113.