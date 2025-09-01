const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function debugManualCompletion() {
  console.log('🔍 Debugging manual game completion issue...');
  console.log('=' .repeat(60));
  
  try {
    // Get a game that's currently in_progress with scores
    const { data: testGames, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .eq('status', 'in_progress')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .limit(1);
      
    if (fetchError) {
      console.error('❌ Error fetching test game:', fetchError.message);
      return;
    }
    
    if (!testGames || testGames.length === 0) {
      console.log('ℹ️ No in_progress games with scores found to test');
      return;
    }
    
    const testGame = testGames[0];
    console.log('🎮 Testing manual completion for:', testGame.away_team, '@', testGame.home_team);
    console.log('Current data:');
    console.log('  Status:', testGame.status);
    console.log('  Scores:', testGame.away_score, '-', testGame.home_score);
    console.log('  API Clock:', testGame.api_clock);
    console.log('  API Period:', testGame.api_period);
    console.log('  Winner ATS:', testGame.winner_against_spread);
    
    // Try the manual update that's failing
    console.log('\n🔧 Attempting manual completion...');
    
    const { data: updateResult, error: updateError } = await supabase
      .from('games')
      .update({ 
        status: 'completed',
        api_completed: true,
        // Don't update api_clock/api_period - let them stay as-is or be NULL
        updated_at: new Date().toISOString()
      })
      .eq('id', testGame.id)
      .select();
      
    if (updateError) {
      console.error('❌ Manual completion FAILED:');
      console.error('Error code:', updateError.code);
      console.error('Error message:', updateError.message);
      console.error('Error details:', JSON.stringify(updateError, null, 2));
      
      // Check for specific error patterns
      if (updateError.message.includes('api_clock')) {
        console.log('\n💡 ISSUE: api_clock field is causing problems');
      }
      if (updateError.message.includes('api_period')) {
        console.log('\n💡 ISSUE: api_period field is causing problems');
      }
      if (updateError.message.includes('trigger')) {
        console.log('\n💡 ISSUE: Database trigger is causing problems');
      }
      if (updateError.message.includes('function')) {
        console.log('\n💡 ISSUE: Function error in trigger');
      }
      
    } else {
      console.log('✅ Manual completion SUCCEEDED!');
      console.log('Updated game:');
      console.log('  Status:', updateResult[0].status);
      console.log('  Winner ATS:', updateResult[0].winner_against_spread);
      console.log('  Margin Bonus:', updateResult[0].margin_bonus);
      console.log('  API Clock:', updateResult[0].api_clock);
      console.log('  API Period:', updateResult[0].api_period);
    }
    
  } catch (error) {
    console.error('❌ Debug failed with exception:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugManualCompletion().catch(console.error);