# GitHub Actions Auto-Update Setup

## Why GitHub Actions Instead of pg_cron?

**Problem discovered:** pg_cron in Supabase is configured to run on the `postgres` database, but your actual database has a different name. This requires Supabase infrastructure-level configuration changes.

**Better Solution:** Use GitHub Actions (free, reliable, easier to set up) to trigger your Edge Functions on a schedule.

---

## Benefits of GitHub Actions

✅ **Free** - Unlimited for public repos, 2000 min/month for private repos
✅ **Reliable** - GitHub's infrastructure is very stable
✅ **Easy to monitor** - View logs in GitHub Actions tab
✅ **Easy to configure** - Just edit YAML file
✅ **Manual triggers** - Can trigger manually for testing
✅ **No database config needed** - Works with any Supabase setup

---

## Setup Instructions

### Step 1: Add GitHub Secret

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `SUPABASE_SERVICE_ROLE_KEY`
5. Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzg0NTYyOCwiZXhwIjoyMDY5NDIxNjI4fQ.6ubEYOeQ7KmFN1B1AiSH9nJVEr10pS86e0VppvbIKaM`
6. Click **Add secret**

### Step 2: Commit the Workflow File

The workflow file has already been created at:
```
.github/workflows/auto-update-games.yml
```

Commit and push it to your repository:

```bash
git add .github/workflows/auto-update-games.yml
git commit -m "Add GitHub Actions auto-update workflow"
git push
```

### Step 3: Enable GitHub Actions (if not already enabled)

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. If prompted, click **"I understand my workflows, go ahead and enable them"**

### Step 4: Verify Setup

After pushing, check:
1. Go to **Actions** tab in GitHub
2. You should see the workflow: "Auto Update Games"
3. It will run automatically on the schedule
4. You can also trigger it manually:
   - Click on the workflow
   - Click **Run workflow** button
   - Select which function to run
   - Click **Run workflow**

---

## Schedule Details

The workflow runs on the same schedule as pg_cron was supposed to:

### Live Score Updates
- **Thu 6pm - Sat 11:59pm CT**: Every 5 minutes
- **Sun 12am - 8am CT**: Every 5 minutes
- Calls: `live-score-updater` Edge Function

### Game Statistics
- **Sat 11am CT**: Once per week
- Calls: `update-game-stats` Edge Function

---

## Monitoring

### View Workflow Runs
1. Go to **Actions** tab
2. Click on **Auto Update Games** workflow
3. See all recent runs with their status

### View Individual Run Logs
1. Click on any run
2. Click on the job name
3. Expand the step to see detailed logs
4. Shows HTTP status and response from Edge Functions

### Check for Errors
- ✅ Green checkmark = Success
- ❌ Red X = Failed (click to see error)

---

## Manual Testing

### Test Live Score Updater
1. Go to **Actions** tab
2. Click **Auto Update Games** workflow
3. Click **Run workflow** dropdown
4. Select: `live-score-updater`
5. Click **Run workflow**
6. Wait ~30 seconds
7. Click on the run to see results

### Test Game Stats Updater
Same process, but select `update-game-stats`

### Test Both
Select `both` to run both functions in sequence

---

## Troubleshooting

### Workflow doesn't appear
- Make sure the file is in `.github/workflows/` directory
- Make sure you pushed to the main branch
- Check that GitHub Actions is enabled

### Runs are failing
- Check the error message in the logs
- Common issues:
  - `401 Unauthorized` - Check SUPABASE_SERVICE_ROLE_KEY secret
  - `404 Not Found` - Edge Functions not deployed
  - `500 Server Error` - Check Edge Function logs in Supabase

### Runs don't happen on schedule
- GitHub Actions schedules can have a ~10 minute delay
- Check the **Actions** tab for any queued runs
- If runs are consistently missing, check GitHub status page

---

## Cost Analysis

### GitHub Actions Usage
**Scheduled runs:**
- Thu-Sat: 6 hours × 12 runs/hour = 72 runs
- Sunday: 8 hours × 12 runs/hour = 96 runs
- Stats: 1 run per week
- **Total per week: ~169 runs**
- **Time per run: ~30 seconds**
- **Total minutes per week: ~85 minutes**

**Free tier limits:**
- Public repos: Unlimited
- Private repos: 2000 minutes/month
- Your usage: ~340 min/month

**Verdict: ✅ Well within free tier!**

---

## Comparison: GitHub Actions vs pg_cron

| Feature | pg_cron | GitHub Actions |
|---------|---------|----------------|
| Setup difficulty | ❌ Complex | ✅ Easy |
| Requires DB config | ❌ Yes | ✅ No |
| Monitoring | ⚠️ Limited | ✅ Excellent |
| Manual triggers | ⚠️ Difficult | ✅ Easy |
| Cost | ✅ Free | ✅ Free |
| Reliability | ✅ Good | ✅ Excellent |
| Works with Supabase | ⚠️ Config issues | ✅ Always |

**Winner: GitHub Actions** 🏆

---

## What About pg_cron?

You can safely **unschedule the pg_cron jobs** since GitHub Actions will handle everything:

```sql
SELECT cron.unschedule('live-scoring-thu-sat');
SELECT cron.unschedule('live-scoring-sunday');
SELECT cron.unschedule('update-game-statistics');
```

This won't break anything - the Edge Functions will now be triggered by GitHub Actions instead.

---

## Next Steps

1. ✅ Add SUPABASE_SERVICE_ROLE_KEY secret to GitHub
2. ✅ Commit and push the workflow file
3. ✅ Test with manual trigger
4. ✅ Monitor first few automatic runs
5. ✅ Unschedule pg_cron jobs (optional cleanup)

---

## Success Criteria

Setup is complete when:
- ✅ Workflow appears in Actions tab
- ✅ Manual trigger succeeds
- ✅ Scheduled runs execute during game hours
- ✅ Edge Function logs show successful updates
- ✅ Games update automatically without manual intervention

---

**Questions?** Check the workflow logs in the Actions tab or the Edge Function logs in Supabase Dashboard.

**This solution is actually BETTER than pg_cron for Supabase!** 🎉
