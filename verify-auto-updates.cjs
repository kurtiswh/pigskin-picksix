#!/usr/bin/env node

/**
 * Verify Auto-Update Configuration
 *
 * This script checks if automatic game updates are properly configured:
 * 1. pg_cron extension is enabled
 * 2. Cron jobs are scheduled
 * 3. Edge Functions are deployed
 * 4. Environment variables are set
 * 5. Recent job executions
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL environment variable not set');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  console.log('💡 This requires the service role key, not the anon key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

async function checkPgCronExtension() {
  console.log(`\n${colors.cyan}${colors.bold}1. Checking pg_cron Extension${colors.reset}`);
  console.log('='.repeat(50));

  const { data, error } = await supabase.rpc('pg_extension_exists', {
    extension_name: 'pg_cron'
  });

  if (error) {
    // Try alternative query
    const { data: altData, error: altError } = await supabase
      .from('pg_extension')
      .select('extname')
      .eq('extname', 'pg_cron')
      .maybeSingle();

    if (altError) {
      console.log(`${colors.yellow}⚠️  Cannot check pg_cron status (may need direct database access)${colors.reset}`);
      console.log(`   Error: ${altError.message}`);
      return false;
    }

    if (altData) {
      console.log(`${colors.green}✅ pg_cron extension is enabled${colors.reset}`);
      return true;
    }
  } else if (data) {
    console.log(`${colors.green}✅ pg_cron extension is enabled${colors.reset}`);
    return true;
  }

  console.log(`${colors.red}❌ pg_cron extension is NOT enabled${colors.reset}`);
  console.log(`   Run: CREATE EXTENSION IF NOT EXISTS pg_cron;`);
  return false;
}

async function checkCronJobs() {
  console.log(`\n${colors.cyan}${colors.bold}2. Checking Scheduled Cron Jobs${colors.reset}`);
  console.log('='.repeat(50));

  const { data, error } = await supabase
    .from('cron.job')
    .select('*');

  if (error) {
    console.log(`${colors.yellow}⚠️  Cannot query cron jobs (may need direct database access)${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }

  if (!data || data.length === 0) {
    console.log(`${colors.red}❌ No cron jobs found${colors.reset}`);
    console.log(`   Run migration 141 to create jobs`);
    return false;
  }

  console.log(`${colors.green}✅ Found ${data.length} cron job(s)${colors.reset}\n`);

  const expectedJobs = [
    'live-scoring-thu-sat',
    'live-scoring-sunday',
    'update-game-statistics'
  ];

  for (const jobName of expectedJobs) {
    const job = data.find(j => j.jobname === jobName);
    if (job) {
      console.log(`${colors.green}✅${colors.reset} ${jobName}`);
      console.log(`   Schedule: ${job.schedule}`);
      console.log(`   Active: ${job.active ? 'Yes' : 'No'}`);

      // Check if placeholder values are still present
      if (job.command && job.command.includes('YOUR_PROJECT_ID')) {
        console.log(`   ${colors.red}⚠️  Contains placeholder YOUR_PROJECT_ID - needs updating!${colors.reset}`);
      }
      if (job.command && job.command.includes('YOUR_SERVICE_ROLE_KEY')) {
        console.log(`   ${colors.red}⚠️  Contains placeholder YOUR_SERVICE_ROLE_KEY - needs updating!${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}❌${colors.reset} ${jobName} - NOT FOUND`);
    }
  }

  return true;
}

async function checkRecentJobExecutions() {
  console.log(`\n${colors.cyan}${colors.bold}3. Recent Cron Job Executions${colors.reset}`);
  console.log('='.repeat(50));

  const { data, error } = await supabase
    .from('cron.job_run_details')
    .select('*')
    .order('start_time', { ascending: false })
    .limit(10);

  if (error) {
    console.log(`${colors.yellow}⚠️  Cannot query job execution history${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }

  if (!data || data.length === 0) {
    console.log(`${colors.yellow}⚠️  No job executions found yet${colors.reset}`);
    console.log(`   Jobs may not have run yet, or may be scheduled for future times`);
    return true;
  }

  console.log(`${colors.green}✅ Found ${data.length} recent execution(s)${colors.reset}\n`);

  for (const run of data.slice(0, 5)) {
    const status = run.status === 'succeeded' ?
      `${colors.green}✅ ${run.status}${colors.reset}` :
      `${colors.red}❌ ${run.status}${colors.reset}`;

    console.log(`Job: ${run.jobname || 'Unknown'}`);
    console.log(`  Status: ${status}`);
    console.log(`  Started: ${new Date(run.start_time).toLocaleString()}`);
    if (run.return_message) {
      console.log(`  Message: ${run.return_message.substring(0, 100)}`);
    }
    console.log();
  }

  return true;
}

async function checkEdgeFunctions() {
  console.log(`\n${colors.cyan}${colors.bold}4. Checking Edge Functions${colors.reset}`);
  console.log('='.repeat(50));

  const functions = [
    { name: 'live-score-updater', path: 'supabase/functions/live-score-updater/index.ts' },
    { name: 'update-game-stats', path: 'supabase/functions/update-game-stats/index.ts' }
  ];

  const fs = require('fs');
  const path = require('path');

  for (const func of functions) {
    const fullPath = path.join(process.cwd(), func.path);
    if (fs.existsSync(fullPath)) {
      console.log(`${colors.green}✅${colors.reset} ${func.name} - source file exists`);
    } else {
      console.log(`${colors.red}❌${colors.reset} ${func.name} - source file NOT FOUND`);
      console.log(`   Expected: ${fullPath}`);
    }
  }

  console.log(`\n${colors.yellow}Note: To verify deployment, check Supabase Dashboard → Edge Functions${colors.reset}`);
}

async function checkDatabaseFunctions() {
  console.log(`\n${colors.cyan}${colors.bold}5. Checking Database Functions${colors.reset}`);
  console.log('='.repeat(50));

  const functions = [
    'calculate_and_update_completed_game',
    'scheduled_game_statistics',
    'process_picks_for_completed_game'
  ];

  for (const funcName of functions) {
    const { data, error } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', funcName)
      .maybeSingle();

    if (error) {
      console.log(`${colors.yellow}⚠️  Cannot check function ${funcName}${colors.reset}`);
    } else if (data) {
      console.log(`${colors.green}✅${colors.reset} ${funcName}()`);
    } else {
      console.log(`${colors.red}❌${colors.reset} ${funcName}() - NOT FOUND`);
    }
  }
}

async function main() {
  console.log(`${colors.bold}${colors.blue}`);
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Auto-Update Verification Tool                  ║');
  console.log('║   Pigskin Pick Six Pro                           ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(colors.reset);

  try {
    await checkPgCronExtension();
    await checkCronJobs();
    await checkRecentJobExecutions();
    await checkEdgeFunctions();
    await checkDatabaseFunctions();

    console.log(`\n${colors.cyan}${colors.bold}Summary & Next Steps${colors.reset}`);
    console.log('='.repeat(50));
    console.log(`\n${colors.bold}If issues found:${colors.reset}`);
    console.log(`1. Enable pg_cron: Run migration 141`);
    console.log(`2. Update credentials: Replace YOUR_PROJECT_ID and YOUR_SERVICE_ROLE_KEY`);
    console.log(`3. Deploy Edge Functions: npx supabase functions deploy live-score-updater`);
    console.log(`4. Set environment variables in Supabase Dashboard`);
    console.log(`\n${colors.bold}To monitor:${colors.reset}`);
    console.log(`• Check logs: Supabase Dashboard → Edge Functions → Logs`);
    console.log(`• Query job history: SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`);
    console.log();

  } catch (error) {
    console.error(`\n${colors.red}❌ Verification failed:${colors.reset}`, error.message);
    process.exit(1);
  }
}

main();
