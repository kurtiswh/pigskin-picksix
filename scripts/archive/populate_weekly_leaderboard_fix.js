import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateWeeklyLeaderboard() {
  console.log('🔄 Populating weekly leaderboard from existing picks...');
  
  try {
    // First, check what picks we have
    const { data: allPicks, error: picksError } = await supabase
      .from('picks')
      .select('user_id, week, season, result, points_earned, is_lock')
      .eq('season', 2024);
      
    if (picksError) {
      console.error('❌ Error fetching picks:', picksError);
      return;
    }
    
    console.log(`📊 Found ${allPicks.length} picks for 2024`);
    
    // Get all users we need display names for
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name');
      
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }
    
    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = user.display_name;
    });
    
    // Group picks by user, week, season
    const weeklyStats = {};
    
    allPicks.forEach(pick => {
      const key = `${pick.user_id}-${pick.week}-${pick.season}`;
      
      if (!weeklyStats[key]) {
        weeklyStats[key] = {
          user_id: pick.user_id,
          display_name: userMap[pick.user_id] || 'Unknown User',
          week: pick.week,
          season: pick.season,
          picks_made: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
          lock_wins: 0,
          lock_losses: 0,
          total_points: 0
        };
      }
      
      const stats = weeklyStats[key];
      stats.picks_made++;
      stats.total_points += pick.points_earned || 0;
      
      if (pick.result === 'win') {
        stats.wins++;
        if (pick.is_lock) stats.lock_wins++;
      } else if (pick.result === 'loss') {
        stats.losses++;
        if (pick.is_lock) stats.lock_losses++;
      } else if (pick.result === 'push') {
        stats.pushes++;
      }
    });
    
    console.log(`📊 Generated ${Object.keys(weeklyStats).length} weekly stat entries`);
    
    // Clear existing weekly leaderboard data for 2024
    console.log('🗑️ Clearing existing weekly leaderboard data...');
    const { error: deleteError } = await supabase
      .from('weekly_leaderboard')
      .delete()
      .eq('season', 2024);
      
    if (deleteError) {
      console.error('❌ Error clearing weekly leaderboard:', deleteError);
      return;
    }
    
    // Insert new weekly leaderboard entries
    const weeklyEntries = Object.values(weeklyStats).map(stats => ({
      ...stats,
      payment_status: 'NotPaid', // Will be updated by triggers if payment info exists
      is_verified: false,
      weekly_rank: null // Will be calculated after insert
    }));
    
    console.log('📝 Inserting weekly leaderboard entries...');
    const { data: insertedData, error: insertError } = await supabase
      .from('weekly_leaderboard')
      .insert(weeklyEntries)
      .select();
      
    if (insertError) {
      console.error('❌ Error inserting weekly leaderboard:', insertError);
      return;
    }
    
    console.log(`✅ Inserted ${insertedData.length} weekly leaderboard entries`);
    
    // Update rankings for each week
    const weeks = [...new Set(weeklyEntries.map(e => e.week))];
    console.log(`🏆 Calculating rankings for weeks: ${weeks.join(', ')}`);
    
    for (const week of weeks) {
      // Get all entries for this week, sorted by points
      const { data: weekEntries, error: weekError } = await supabase
        .from('weekly_leaderboard')
        .select('id, total_points')
        .eq('week', week)
        .eq('season', 2024)
        .order('total_points', { ascending: false });
        
      if (weekError) {
        console.error(`❌ Error fetching week ${week} entries:`, weekError);
        continue;
      }
      
      // Calculate ranks (handle ties properly)
      let currentRank = 1;
      let lastPoints = null;
      const rankUpdates = weekEntries.map((entry, index) => {
        if (lastPoints !== null && entry.total_points < lastPoints) {
          currentRank = index + 1;
        }
        lastPoints = entry.total_points;
        
        return {
          id: entry.id,
          rank: currentRank
        };
      });
      
      // Update ranks in batches
      for (const update of rankUpdates) {
        await supabase
          .from('weekly_leaderboard')
          .update({ weekly_rank: update.rank })
          .eq('id', update.id);
      }
      
      console.log(`✅ Updated ranks for week ${week}`);
    }
    
    // Final verification
    const { data: finalData, error: finalError } = await supabase
      .from('weekly_leaderboard')
      .select('week, count(*)')
      .eq('season', 2024);
      
    if (!finalError && finalData) {
      console.log('📊 Final weekly leaderboard summary:');
      finalData.forEach(week => {
        console.log(`  Week ${week.week}: ${week.count} entries`);
      });
    }
    
    console.log('🎉 Weekly leaderboard population complete!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

populateWeeklyLeaderboard().catch(console.error);