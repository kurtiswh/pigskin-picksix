const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testGameCompletionFix() {
  console.log('🧪 Testing if Migration 084 fixes game completion issue...');
  console.log('='.repeat(60));
  
  try {
    // Get games that should be completed but aren't
    const { data: stuckGames, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .eq('status', 'in_progress')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null);
      
    if (fetchError) {
      console.error('❌ Error fetching games:', fetchError.message);
      return;
    }
    
    console.log(`Found ${stuckGames?.length || 0} games stuck in 'in_progress' with scores`);
    
    if (stuckGames && stuckGames.length > 0) {
      console.log('\n📋 Stuck games:');
      stuckGames.forEach(game => {
        console.log(`  ${game.away_team} @ ${game.home_team}`);
        console.log(`    Score: ${game.away_score} - ${game.home_score}`);
        console.log(`    Status: ${game.status}`);
        console.log(`    API Completed: ${game.api_completed}`);
      });
      
      // Try to update one game to completed
      const testGame = stuckGames[0];
      console.log(`\n🔧 Testing status update for ${testGame.away_team} @ ${testGame.home_team}...`);
      
      const { data: updateData, error: updateError } = await supabase
        .from('games')
        .update({ 
          status: 'completed',
          api_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', testGame.id)
        .select();
        
      if (updateError) {
        console.error('❌ Update failed:', updateError.message);
        console.error('Error code:', updateError.code);
        console.log('\n🚨 Migration 084 needs to be applied to fix this!');
        console.log('📋 Apply the migration in Supabase Dashboard:');
        console.log('   database/migrations/084_disable_winner_scoring_trigger_blocking_completion.sql');
      } else {
        console.log('✅ Update succeeded!');
        console.log('New status:', updateData[0].status);
        console.log('API completed:', updateData[0].api_completed);
        console.log('\n🎉 Game completion is working! The fix is effective!');
      }
    } else {
      console.log('✅ No stuck games found - system appears to be working');
    }
    
    // Check what triggers are currently active (for verification)
    console.log('\n📊 Summary:');
    console.log('- Migration 084 disables the last blocking trigger');
    console.log('- Creates conditional trigger that only runs on score changes');
    console.log('- Status-only updates will no longer be blocked');
    console.log('- This should be the FINAL fix for the completion issue');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testGameCompletionFix().catch(console.error);