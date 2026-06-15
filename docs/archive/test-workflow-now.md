# Testing GitHub Actions Workflow

## Issue
The scheduled workflow isn't running automatically.

## Common Causes

1. **GitHub Actions is disabled** in the repository settings
2. **Scheduled workflows have delays** - GitHub doesn't guarantee exact timing
3. **Workflow needs at least one successful manual run** before schedules activate
4. **Repository is private** - Some limitations apply

## Verification Steps

### Step 1: Check if Actions is Enabled
1. Go to your GitHub repo
2. Click **Settings** tab
3. Scroll to **Actions** → **General** in left sidebar
4. Under "Actions permissions", ensure it's set to:
   - "Allow all actions and reusable workflows" OR
   - "Allow [your org] actions and reusable workflows"
5. Make sure "Disable actions" is NOT selected

### Step 2: Check Workflow Status in GitHub
1. Go to **Actions** tab
2. Look for "Auto Update Games" in the left sidebar
3. Click on it
4. Check if there's a message saying:
   - "This workflow has a workflow_dispatch event trigger" ✅ Good
   - Any error messages? ❌ Problem

### Step 3: Manual Run Test
**This is critical!** GitHub sometimes requires a successful manual run before enabling schedules.

1. Go to **Actions** tab
2. Click **Auto Update Games** workflow (left sidebar)
3. Click **Run workflow** button (right side)
4. Select `live-score-updater`
5. Click **Run workflow**
6. Wait for it to complete successfully
7. **After a successful manual run**, schedules should start working

### Step 4: Check Repository Settings
If the repo is **private**:
- Free accounts: Limited to 2000 minutes/month
- If you're over quota, workflows won't run

### Step 5: Force Immediate Test
Add this to `.github/workflows/auto-update-games.yml` temporarily:

```yaml
on:
  schedule:
    # TEST: Run every minute for 1 hour
    - cron: '* * * * *'

    # ... rest of schedules
```

This will run every minute so you can see it working immediately.

## What to Do Now

1. **First**: Run the workflow manually (Step 3 above) - this is most important!
2. **Second**: Check that Actions is enabled (Step 1)
3. **Third**: If still not working after 30 minutes, we'll add the every-minute test schedule

## GitHub Actions Schedule Limitations

From GitHub's documentation:
- Scheduled workflows run on the **default branch** only
- Can be **delayed during high-load times** (up to 15+ minutes)
- May not run if there's been **no repository activity** in 60 days
- Minimum interval is **5 minutes**
- **First run** after creating/updating a schedule can take up to 1 hour

## Alternative: Manual Trigger for Now

While we troubleshoot, you can manually trigger the workflow every hour or so:
1. Go to Actions → Auto Update Games
2. Click Run workflow
3. Select `live-score-updater`
4. Click Run workflow

This will keep your games updated while we fix the automatic scheduling.
