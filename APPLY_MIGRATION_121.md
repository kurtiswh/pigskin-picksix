# 🔧 Apply Migration 121 - Smart Leaderboard Notice System

## Overview
This migration adds smart notice functionality to the leaderboard with admin controls for marking scoring and leaderboard completion status.

## Migration Purpose
- Adds `scoring_complete` and `leaderboard_complete` boolean fields to `week_settings`
- Adds `admin_custom_message` text field for custom admin messages
- Updates RLS policies for proper admin access

## Step 1: Apply Migration
1. Go to Supabase Dashboard → SQL Editor → New Query
2. Copy and paste the contents of `database/migrations/121_add_scoring_completion_status.sql`
3. Execute the migration
4. Verify no errors in the output

## Step 2: Test the Features

### For Admins:
1. Go to Leaderboard page
2. In the "Live Update Controls" section, you should see:
   - **Scoring Status Controls** section with:
     - Game Scoring toggle (Complete/Incomplete)
     - Leaderboard toggle (Complete/Incomplete)
     - Custom Message input field

### Notice Banner Behavior:
- **🔄 LIVE SCORING** (Orange): Shows when live updates are running OR scoring/leaderboard not complete
- **✅ RESULTS CONFIRMED** (Green): Shows when both scoring and leaderboard are marked complete
- **⚠️ IMPORTANT NOTICE** (Yellow): Default fallback message

### Messages:
- **Experimental**: "LIVE SCORING/LEADERBOARD IS EXPERIMENTAL AND ALL RESULTS MAY NOT BE ACCURATE. RESULTS AREN'T FINAL UNTIL REVIEW AND VALIDATION BY AN ADMIN. THIS HEADER WILL REFLECT WHEN RESULTS ARE CONFIRMED."
- **Final**: "SCORING AND LEADERBOARD ARE COMPLETE AND VALIDATED. IF YOU SEE ANY ERRORS, PLEASE EMAIL US AT ADMIN@PIGSKINPICKSIX.COM."
- **Custom Message**: Admin can add custom text that appears in both experimental and final messages

## New Features Added:

### 1. Dynamic Notice System
- Notice banner color and message changes based on completion status
- Live update status affects the notice display
- Custom admin messages can be added

### 2. Admin Controls
- Toggle buttons to mark game scoring complete/incomplete
- Toggle buttons to mark leaderboard complete/incomplete
- Input field for custom admin messages
- Real-time updates to notice banner

### 3. Database Integration
- New fields in `week_settings` table
- Proper RLS policies for admin access
- Service layer for managing week settings

## Files Modified:
- `src/components/TabbedLeaderboard.tsx` - Main component with dynamic notices and admin controls
- `src/services/weekSettingsService.ts` - New service for managing week settings
- `src/lib/supabase.ts` - Updated TypeScript types
- `database/migrations/121_add_scoring_completion_status.sql` - Database migration

## Usage Instructions:

### For Admins:
1. Complete your normal scoring/leaderboard updates
2. When satisfied with accuracy, mark "Game Scoring" as complete
3. When satisfied with leaderboard, mark "Leaderboard" as complete
4. Optionally add a custom message (e.g., "Week 12 results verified on 11/28")
5. Notice banner will automatically switch to green "RESULTS CONFIRMED" state

### For Users:
- Orange banner = Results are still being processed/validated
- Green banner = Results are final and confirmed by admin
- Users can always email admin@pigskinpicksix.com for questions

## Testing Checklist:
- [ ] Migration applies without errors
- [ ] Admin can see scoring status controls (admins only)
- [ ] Toggle buttons work for scoring/leaderboard complete
- [ ] Custom message input works and updates notice
- [ ] Notice banner changes color and message appropriately
- [ ] Non-admin users see notices but not controls
- [ ] Live update status affects notice display correctly