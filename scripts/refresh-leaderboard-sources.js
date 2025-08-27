import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function refreshLeaderboardSources() {
  console.log('🔄 Refreshing Leaderboard Pick Sources');
  console.log('====================================');
  
  try {
    // Get current source stats
    console.log('📊 Current pick source distribution:');
    const { data: stats, error: statsError } = await supabase.rpc('get_pick_source_stats', { 
      target_season: 2024 
    });
    
    if (statsError) {
      console.log('❌ Stats error:', statsError.message);
    } else if (stats) {
      stats.forEach(stat => {
        console.log(`   ${stat.source_type}: ${stat.season_count} season, ${stat.weekly_count} weekly`);
      });
    }
    
    // Check if we need to refresh (look for users with anonymous picks)
    const { data: anonPicks } = await supabase
      .from('anonymous_picks')
      .select('assigned_user_id')
      .eq('season', 2024)
      .not('assigned_user_id', 'is', null)
      .eq('show_on_leaderboard', true)
      .limit(1);
    
    const needsRefresh = anonPicks && anonPicks.length > 0;
    
    if (!needsRefresh) {
      console.log('✅ No anonymous picks assigned yet - no refresh needed');
      console.log('ℹ️  Current pick_source values are accurate');
      return;
    }
    
    console.log('\n🔄 Refreshing season leaderboard sources...');
    const { data: seasonRefresh, error: seasonError } = await supabase.rpc('refresh_season_leaderboard_sources');
    
    if (seasonError) {
      console.log('❌ Season refresh error:', seasonError.message);
    } else {
      console.log('✅ Season refresh completed:', seasonRefresh, 'entries updated');
    }
    
    console.log('\n🔄 Refreshing weekly leaderboard sources...');
    const { data: weeklyRefresh, error: weeklyError } = await supabase.rpc('refresh_all_weekly_leaderboard_sources', {
      target_season: 2024
    });
    
    if (weeklyError) {
      console.log('❌ Weekly refresh error:', weeklyError.message);
    } else {
      console.log('✅ Weekly refresh completed:', weeklyRefresh, 'entries updated');
    }
    
    // Get updated stats
    console.log('\n📊 Updated pick source distribution:');
    const { data: updatedStats, error: updatedStatsError } = await supabase.rpc('get_pick_source_stats', { 
      target_season: 2024 
    });
    
    if (updatedStats) {
      updatedStats.forEach(stat => {
        console.log(`   ${stat.source_type}: ${stat.season_count} season, ${stat.weekly_count} weekly`);
      });
    }
    
    console.log('\n🎉 Leaderboard source refresh completed!');
    console.log('✅ Anonymous picks will now show correct source attribution');
    
  } catch (error) {
    console.error('❌ Refresh failed:', error.message);
  }
}

// Run the refresh
refreshLeaderboardSources().catch(console.error);