const { createClient } = require('@supabase/supabase-js');

// Test the enhanced completion detection logic
async function testCompletionFix() {
  console.log('🧪 Testing enhanced completion detection...');
  
  const supabase = createClient(
    'https://zgdaqbnpgrabbnljmiqy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
  );
  
  // Simulate the enhanced completion detection logic
  function shouldGameBeCompleted(game) {
    const hasScores = (game.away_score || 0) > 0 && (game.home_score || 0) > 0;
    
    // Check multiple completion indicators
    const apiSaysCompleted = game.api_completed === true;
    
    const clockIndicatesFinished = (
      game.game_clock === '00:00' || 
      game.game_clock === '0:00' ||
      game.api_clock === '00:00' ||
      game.api_clock === '0:00' ||
      (game.game_period >= 4 && (game.game_clock === null || game.game_clock === '00:00')) ||
      (game.api_period >= 4 && (game.api_clock === null || game.api_clock === '00:00'))
    );
    
    return apiSaysCompleted || (hasScores && clockIndicatesFinished);
  }
  
  try {
    // Get the stuck in_progress games
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'in_progress')
      .eq('season', 2025)
      .eq('week', 1);
    
    if (error) {
      console.error('❌ Error fetching games:', error.message);
      return;
    }
    
    console.log(`📊 Found ${games?.length || 0} stuck in_progress games to analyze:\n`);
    
    games?.forEach((game, index) => {
      const shouldComplete = shouldGameBeCompleted(game);
      
      console.log(`Game ${index + 10}: ${game.away_team} @ ${game.home_team}`);
      console.log(`  Scores: ${game.away_score}-${game.home_score}`);
      console.log(`  Clock: Q${game.game_period || game.api_period} ${game.game_clock || game.api_clock}`);
      console.log(`  API completed: ${game.api_completed}`);
      console.log(`  🎯 Should be completed: ${shouldComplete ? '✅ YES' : '❌ NO'}`);
      
      if (shouldComplete && game.status !== 'completed') {
        console.log(`  🔧 Action needed: Update to completed status`);
      }
      console.log('');
    });
    
    // Count how many need completion
    const needsCompletion = games?.filter(g => shouldGameBeCompleted(g)) || [];
    console.log(`\n📈 Summary: ${needsCompletion.length} games should be marked as completed`);
    
    if (needsCompletion.length > 0) {
      console.log('\n🚀 Enhanced completion detection would fix these games!');
      console.log('The next live update cycle should automatically mark them as completed.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCompletionFix().catch(console.error);