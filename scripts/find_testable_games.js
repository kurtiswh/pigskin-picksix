import { createClient } from '@supabase/supabase-js';

// Direct credentials from .env file (for testing only)
const SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findTestableGames() {
  console.log('🔍 Finding games available for completion testing...');
  console.log('=' .repeat(70));
  
  try {
    // Check all games for 2025 Week 1
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .order('kickoff_time');
    
    if (error) {
      console.error('❌ Error fetching games:', error.message);
      return;
    }
    
    console.log('📊 Found', games?.length || 0, 'games for 2025 Week 1:');
    console.log();
    
    const statusGroups = {};
    const testableGames = [];
    
    games?.forEach(game => {
      const status = game.status;
      if (!statusGroups[status]) statusGroups[status] = [];
      statusGroups[status].push(game);
      
      // A game is testable if it has scores (can be set to completed)
      if (game.home_score !== null && game.away_score !== null) {
        testableGames.push({
          id: game.id,
          matchup: game.away_team + ' @ ' + game.home_team,
          status: game.status,
          scores: game.away_score + ' - ' + game.home_score,
          spread: game.spread,
          hasScoring: game.winner_against_spread !== null || (game.margin_bonus !== null && game.margin_bonus !== 0),
          apiCompleted: game.api_completed
        });
      }
    });
    
    console.log('📋 Games by status:');
    Object.keys(statusGroups).forEach(status => {
      console.log('  ' + status + ':', statusGroups[status].length, 'games');
    });
    
    console.log();
    console.log('🎯 Testable games (have scores):');
    if (testableGames.length === 0) {
      console.log('❌ No games found with both home_score and away_score');
      console.log('💡 This explains why the minimal trigger test found no suitable games');
    } else {
      testableGames.forEach((game, index) => {
        console.log(`  ${index + 1}. ${game.matchup}`);
        console.log(`     Status: ${game.status} | Scores: ${game.scores} | Spread: ${game.spread}`);
        console.log(`     Has Scoring: ${game.hasScoring ? '✅ YES' : '❌ NO'} | API Completed: ${game.apiCompleted ? '✅ YES' : '❌ NO'}`);
        console.log();
      });
      
      // Find the best test candidate
      const inProgressWithScores = testableGames.filter(g => g.status === 'in_progress');
      const completedWithScores = testableGames.filter(g => g.status === 'completed');
      
      console.log('🎯 TEST CANDIDATES:');
      if (inProgressWithScores.length > 0) {
        console.log('✅ PERFECT: Found', inProgressWithScores.length, 'in_progress games with scores');
        console.log('   Recommended:', inProgressWithScores[0].matchup);
        console.log('   Game ID:', inProgressWithScores[0].id);
      } else if (completedWithScores.length > 0) {
        console.log('⚠️ ALTERNATIVE: Found', completedWithScores.length, 'completed games');
        console.log('   Can set back to in_progress for testing');
        console.log('   Recommended:', completedWithScores[0].matchup);
        console.log('   Game ID:', completedWithScores[0].id);
      } else {
        console.log('❌ No suitable test candidates found');
      }
    }
    
    return testableGames;
    
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

// Run the search and provide recommendations
findTestableGames().then(testableGames => {
  console.log('\n📋 NEXT STEPS:');
  console.log('=============');
  if (testableGames && testableGames.length > 0) {
    console.log('✅ Found testable games - ready to create completion trigger test');
    console.log('🧪 Will create manual completion test with available games');
  } else {
    console.log('❌ No games available for testing');
    console.log('💡 May need to add test game data or wait for live games');
  }
}).catch(console.error);