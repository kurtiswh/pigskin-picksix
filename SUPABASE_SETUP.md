# Supabase Setup Guide

## 1. Get Your Supabase Credentials

From your Supabase dashboard:

1. Go to **Settings** → **API**
2. Copy the **Project URL** (format: `https://yourprojectid.supabase.co`)
3. Copy the **anon public** key from the **Project API keys** section

## 2. Update Environment Variables

Edit your `.env.local` file:

```env
VITE_SUPABASE_URL=https://zgdaqbnpgrabbnljmiqy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8
```

## 3. Run Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy and paste the entire contents of `database/schema.sql`
4. Click **Run** to execute the schema

This will create:
- All required tables (users, games, picks, week_settings)
- Row Level Security policies
- Database triggers for auto-scoring
- Helper functions
- Leaderboard views

## 4. Enable Authentication

1. Go to **Authentication** → **Settings**
2. Make sure **Enable email confirmations** is turned ON
3. Optional: Enable **Google OAuth**
   - Add your site URL to **Redirect URLs**: `http://localhost:5173`
   - For production, add: `https://yourdomain.com`

## 5. Test the Connection

Run your development server:
```bash
npm run dev
```

Visit `http://localhost:5173` and try:
1. Creating a new account (you'll get a confirmation email)
2. Signing in with existing credentials
3. Check that the homepage loads without Supabase connection errors

## 6. Create Your First Admin User

After creating your account:
1. Go to **Authentication** → **Users** in Supabase dashboard
2. Find your user and click the edit button
3. In the **Raw User Meta Data** section, add:
```json
{
  "is_admin": true
}
```
4. Or update directly in SQL Editor:
```sql
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"is_admin": true}'::jsonb 
WHERE email = 'your-email@example.com';
```

## Troubleshooting

**Error: "Invalid API key"**
- Make sure you're using the anon public key, not the service role key
- Check that the URL is correct (should end with `.supabase.co`)

**Error: "relation does not exist"**
- The database schema wasn't run successfully
- Try running the schema again in SQL Editor

**Authentication not working**
- Check that email confirmations are enabled
- Look in spam folder for confirmation emails
- Verify redirect URLs are correct

**RLS policies blocking access**
- Make sure you're signed in when testing
- Check the browser console for detailed error messages