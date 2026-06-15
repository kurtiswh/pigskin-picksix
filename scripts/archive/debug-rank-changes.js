// Debug script to check rank change functionality
console.log('🔍 Testing rank change functionality...');
console.log('='.repeat(50));

// Let's check if the rank change function is being called properly
import { LeaderboardService } from './src/services/leaderboardService.js';

async function testRankChanges() {
  try {
    console.log('📊 Testing getSeasonLeaderboardWithRankChanges...');
    
    const season = 2025;
    const currentWeek = 2;
    
    console.log(`Getting season leaderboard with rank changes for season ${season}, week ${currentWeek}`);
    
    const leaderboard = await LeaderboardService.getSeasonLeaderboardWithRankChanges(season, currentWeek);
    
    console.log('✅ Result:', leaderboard.length, 'entries');
    
    // Show first few entries with rank change data
    leaderboard.slice(0, 5).forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.display_name}:`);
      console.log(`   Points: ${entry.total_points}`);
      console.log(`   Current Rank: ${entry.season_rank}`);
      console.log(`   Previous Rank: ${entry.previous_rank || 'N/A'}`);
      console.log(`   Rank Change: ${entry.rank_change || 'N/A'}`);
      console.log(`   Trend: ${entry.trend || 'N/A'}`);
      console.log('');
    });
    
    // Check how many entries have rank change data
    const entriesWithRankChange = leaderboard.filter(e => e.rank_change !== undefined).length;
    console.log(`📈 ${entriesWithRankChange} out of ${leaderboard.length} entries have rank change data`);
    
  } catch (error) {
    console.error('❌ Error testing rank changes:', error);
    
    // Try fallback to basic leaderboard
    try {
      console.log('🔄 Falling back to basic season leaderboard...');
      const basicLeaderboard = await LeaderboardService.getSeasonLeaderboard(season);
      console.log('✅ Basic leaderboard:', basicLeaderboard.length, 'entries');
      
      // Check if basic entries have rank change fields
      const firstEntry = basicLeaderboard[0];
      if (firstEntry) {
        console.log('📝 First entry fields:');
        console.log('   Has rank_change:', 'rank_change' in firstEntry);
        console.log('   Has previous_rank:', 'previous_rank' in firstEntry);
        console.log('   Has trend:', 'trend' in firstEntry);
      }
    } catch (fallbackError) {
      console.error('❌ Even basic leaderboard failed:', fallbackError);
    }
  }
}

testRankChanges();