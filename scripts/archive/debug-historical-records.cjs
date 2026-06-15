const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient('https://zgdaqbnpgrabbgljmiqy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8');

async function debugHistoricalRecords() {
  console.log('=== Debugging Historical Record Calculation ===\n');
  
  // Get weekly_leaderboard data for season 2025, weeks 1-4
  console.log('1. Checking weekly_leaderboard data for season 2025, weeks 1-4:');
  const { data: weeklyData, error: weeklyError } = await supabase
    .from('weekly_leaderboard')
    .select('user_id, display_name, week, wins, losses, pushes, lock_wins, lock_losses, picks_made, total_points')
    .eq('season', 2025)
    .lte('week', 4)
    .order('week', { ascending: true });
  
  if (weeklyError) {
    console.error('Error fetching weekly data:', weeklyError);
    return;
  }
  
  console.log(`Found ${weeklyData?.length} weekly entries`);
  
  // Group by user and week to see the structure
  const userWeeklyData = {};
  weeklyData?.forEach(entry => {
    if (!userWeeklyData[entry.user_id]) {
      userWeeklyData[entry.user_id] = {};
    }
    userWeeklyData[entry.user_id][entry.week] = entry;
  });
  
  // Pick a specific user to examine (Phillip Ryan - first place)
  const phillipUserId = 'ff8f1200-91ba-485c-9cba-a5bd6f7fb67d';
  
  console.log('\n2. Detailed breakdown for Phillip Ryan:');
  if (userWeeklyData[phillipUserId]) {
    let totalWins = 0, totalLosses = 0, totalPushes = 0;
    let totalLockWins = 0, totalLockLosses = 0;
    let totalPicks = 0, totalPoints = 0;
    
    for (let week = 1; week <= 4; week++) {
      const weekData = userWeeklyData[phillipUserId][week];
      if (weekData) {
        console.log(`  Week ${week}: ${weekData.wins}-${weekData.losses}-${weekData.pushes} (${weekData.picks_made} picks, ${weekData.total_points} points)`);
        console.log(`    Lock: ${weekData.lock_wins}-${weekData.lock_losses}`);
        
        totalWins += weekData.wins || 0;
        totalLosses += weekData.losses || 0;
        totalPushes += weekData.pushes || 0;
        totalLockWins += weekData.lock_wins || 0;
        totalLockLosses += weekData.lock_losses || 0;
        totalPicks += weekData.picks_made || 0;
        totalPoints += weekData.total_points || 0;
      } else {
        console.log(`  Week ${week}: No data`);
      }
    }
    
    console.log(`\n  TOTALS through Week 4:`);
    console.log(`    Record: ${totalWins}-${totalLosses}-${totalPushes} (${totalWins + totalLosses + totalPushes} total games)`);
    console.log(`    Lock Record: ${totalLockWins}-${totalLockLosses}`);
    console.log(`    Total Picks Made: ${totalPicks}`);
    console.log(`    Total Points: ${totalPoints}`);
    
    // Expected: 4 weeks × 6 picks = 24 total games
    console.log(`    Expected total games: 24 (4 weeks × 6 picks)`);
    console.log(`    Actual total games: ${totalWins + totalLosses + totalPushes}`);
    
    if (totalWins + totalLosses + totalPushes !== 24) {
      console.log('    ⚠️  MISMATCH DETECTED!');
    }
  } else {
    console.log('  No data found for Phillip Ryan');
  }
  
  // Check if there are duplicate weeks for any user
  console.log('\n3. Checking for duplicate week entries:');
  const weekCounts = {};
  weeklyData?.forEach(entry => {
    const key = `${entry.user_id}-${entry.week}`;
    weekCounts[key] = (weekCounts[key] || 0) + 1;
  });
  
  const duplicates = Object.entries(weekCounts).filter(([key, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log('  ⚠️  DUPLICATE WEEK ENTRIES FOUND:');
    duplicates.forEach(([key, count]) => {
      console.log(`    ${key}: ${count} entries`);
    });
  } else {
    console.log('  ✅ No duplicate week entries found');
  }
  
  // Check the actual picks table for one user to verify
  console.log('\n4. Checking actual picks table for Phillip Ryan:');
  const { data: picksData, error: picksError } = await supabase
    .from('picks')
    .select('week, game_id, is_lock, result')
    .eq('user_id', phillipUserId)
    .eq('season', 2025)
    .lte('week', 4)
    .order('week', { ascending: true });
  
  if (picksError) {
    console.error('Error fetching picks:', picksError);
  } else {
    const picksByWeek = {};
    picksData?.forEach(pick => {
      if (!picksByWeek[pick.week]) picksByWeek[pick.week] = [];
      picksByWeek[pick.week].push(pick);
    });
    
    for (let week = 1; week <= 4; week++) {
      const weekPicks = picksByWeek[week] || [];
      const wins = weekPicks.filter(p => p.result === 'WIN').length;
      const losses = weekPicks.filter(p => p.result === 'LOSS').length;
      const pushes = weekPicks.filter(p => p.result === 'PUSH').length;
      const pending = weekPicks.filter(p => p.result === null).length;
      const lockPicks = weekPicks.filter(p => p.is_lock);
      
      console.log(`  Week ${week}: ${weekPicks.length} picks total`);
      console.log(`    Results: ${wins} wins, ${losses} losses, ${pushes} pushes, ${pending} pending`);
      console.log(`    Lock picks: ${lockPicks.length} (${lockPicks.map(p => p.result || 'pending').join(', ')})`);
    }
  }
}

debugHistoricalRecords().catch(console.error);