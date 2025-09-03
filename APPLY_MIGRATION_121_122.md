# Apply Migration 121 & 122: Admin Leaderboard Visibility Controls

## 🔧 Migration Overview

Migrations 121 & 122 add comprehensive admin controls for leaderboard visibility:
- **Migration 121**: Adds `show_on_leaderboard` flag to picks table and admin control functions
- **Migration 122**: Adds summary function for the admin interface

## 📋 How to Apply

### Step 1: Run the Migrations
```bash
# Apply migration 121 - visibility controls
psql -h [your-db-host] -U [username] -d [database] -f database/migrations/121_add_leaderboard_visibility_controls.sql

# Apply migration 122 - admin interface support
psql -h [your-db-host] -U [username] -d [database] -f database/migrations/122_add_visibility_summary_function.sql
```

### Step 2: Refresh Leaderboards  
Run this to ensure all visibility changes are applied:

```sql
-- Refresh leaderboards to respect new visibility controls
SELECT * FROM public.refresh_all_leaderboards(2024);
```

## 🎯 What This Adds

### Admin Control Features:

1. **Authenticated Picks Control**: 
   - New `show_on_leaderboard` column on `picks` table (defaults to TRUE)
   - Admin can hide/show any user's authenticated picks

2. **Anonymous Picks Control**: 
   - Enhanced use of existing `show_on_leaderboard` on `anonymous_picks` table
   - Admin can control visibility per email/week

3. **Payment Status Display**:
   - Only shows indicators for unpaid users (Pending/Not Paid)
   - Paid users show no payment badge (clean interface)

4. **Admin Interface**:
   - New "📊 Leaderboard" tab in Admin Dashboard
   - Bulk show/hide controls
   - Per-user visibility management
   - Real-time leaderboard status

## 🔧 Admin Functions Added

### 1. Toggle Authenticated Picks Visibility
```sql
-- Hide/show user's authenticated picks for specific week
SELECT * FROM toggle_picks_leaderboard_visibility(
    'user-uuid-here', 
    2024,           -- season
    5,              -- week (optional, NULL for all weeks)
    FALSE           -- show_on_leaderboard
);
```

### 2. Toggle Anonymous Picks Visibility
```sql
-- Hide/show user's anonymous picks
SELECT * FROM toggle_anonymous_picks_leaderboard_visibility(
    'user-uuid-here',
    2024,           -- season  
    5,              -- week (optional)
    'user@email.com', -- email (optional, for specific pick set)
    FALSE           -- show_on_leaderboard
);
```

### 3. Get Visibility Summary
```sql
-- Get overview of all users and their pick visibility status
SELECT * FROM get_user_picks_visibility_summary(2024);
```

## 🎮 Admin Interface Usage

### Access the Controls:
1. Go to Admin Dashboard (`/admin`)
2. Click "📊 Leaderboard" tab
3. Select season/week scope
4. Click "Load Users" to see current status

### Control Options:
- **Show All / Hide All**: Bulk operations for all users
- **Individual Control**: Show/Hide buttons per user  
- **Status Overview**: See which users are currently on leaderboard
- **Pick Breakdown**: View authenticated vs anonymous pick counts

### Visual Indicators:
- 🟢 Green numbers = picks visible on leaderboard  
- 🔴 Red numbers = some picks hidden from leaderboard
- 👁️ Eye icon = user currently on leaderboard
- 🚫 Eye-off icon = user not on leaderboard

## 🔍 Frontend Changes

### Leaderboard Display:
- **Payment badges only for unpaid users**:
  - "Payment Pending" (yellow) for pending payments
  - "Payment Due" (red) for unpaid users
  - No badge shown for paid users
- **Pick source badges** (admin only):
  - "Auth" (blue) for authenticated picks
  - "Anon" (purple) for anonymous picks  
  - "Mixed" (orange) for combined pick sources

### Behavior:
- Only users with visible picks appear on leaderboard
- Calculations exclude hidden picks from scoring
- Real-time updates when admin changes visibility

## 🚨 Important Notes

### Default Behavior:
- **All new picks default to visible** (`show_on_leaderboard = TRUE`)
- **Existing picks remain visible** until admin changes them
- **Anonymous picks** use existing `show_on_leaderboard` field

### Admin Permissions:
- Only users with `is_admin = TRUE` can use visibility functions
- All visibility changes are logged and traceable
- Changes trigger automatic leaderboard recalculation

### Performance:
- Leaderboard queries filter by `total_picks > 0` or `picks_made > 0`
- Indexes added for efficient visibility filtering
- Functions use `SECURITY DEFINER` for consistent permissions

## 📊 Use Cases

### 1. Hide Problematic Picks
```sql
-- Hide all picks for a user who submitted invalid data
SELECT * FROM toggle_picks_leaderboard_visibility(
    'problem-user-uuid', 2024, NULL, FALSE
);
```

### 2. Show Only Specific Week
```sql  
-- Hide user's picks for all weeks except week 5
SELECT * FROM toggle_picks_leaderboard_visibility(
    'user-uuid', 2024, week_num, FALSE
) FROM generate_series(1,18) week_num WHERE week_num != 5;
```

### 3. Anonymous Pick Management
```sql
-- Hide picks from specific email that were incorrectly validated
SELECT * FROM toggle_anonymous_picks_leaderboard_visibility(
    'user-uuid', 2024, NULL, 'problem@email.com', FALSE  
);
```

## 🔧 Troubleshooting

### User Missing from Leaderboard:
1. Check if their picks are marked as visible:
   ```sql
   SELECT show_on_leaderboard, * FROM picks 
   WHERE user_id = 'user-uuid' AND season = 2024;
   ```

2. Check anonymous picks visibility:
   ```sql
   SELECT show_on_leaderboard, * FROM anonymous_picks 
   WHERE assigned_user_id = 'user-uuid' AND season = 2024;
   ```

3. Manually recalculate if needed:
   ```sql
   SELECT recalculate_season_leaderboard_for_user('user-uuid', 2024);
   ```

### Bulk Reset:
```sql
-- Make all picks visible (emergency reset)
UPDATE picks SET show_on_leaderboard = TRUE WHERE season = 2024;
UPDATE anonymous_picks SET show_on_leaderboard = TRUE WHERE season = 2024;
SELECT * FROM refresh_all_leaderboards(2024);
```

This system gives you complete control over leaderboard visibility while maintaining transparency about payment status.