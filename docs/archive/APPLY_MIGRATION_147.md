# Apply Migration 147 - Season Winners Table

## The weekly winners button won't work until you apply this migration!

### Steps to Apply:

1. **Go to Supabase Dashboard**
   - Open: https://supabase.com/dashboard/project/zgdaqbnpgrabbnljmiqu
   - Click "SQL Editor" in the left sidebar

2. **Open Migration File**
   - In your code editor, open: `database/migrations/147_create_season_winners.sql`
   - Select ALL the SQL code (Cmd+A / Ctrl+A)
   - Copy it (Cmd+C / Ctrl+C)

3. **Run the Migration**
   - In Supabase SQL Editor, click "New Query"
   - Paste the SQL from migration 147
   - Click "Run" button (or press Cmd+Enter)
   - Wait for it to complete

4. **Verify It Worked**
   - You should see green checkmarks in the output
   - Look for: "✅ Migration 147 COMPLETED!"

5. **Test the Feature**
   - Go back to the app
   - Go to Admin Dashboard → Score Updates tab
   - Click "Update Weekly Winners" button
   - The weekly winners should now populate on the Winners tab

## What This Creates:

- `season_winners` table to store all winner data
- Helper function `get_or_create_season_winners()`
- RLS policies for public viewing, admin editing

## After Migration is Applied:

The buttons will work:
- ✅ "Update Weekly Winners" - syncs from weekly_leaderboard
- ✅ "Calculate Season Winners" - calculates point/lock/best finish
- ✅ "Set Total Pot" - enables dollar amount display
- ✅ Bracket winners management

## Need Help?

If you get an error, share the error message and I can help debug it.
