const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testEmergencyCompletion() {
  console.log('🚨 EMERGENCY TEST: Game completion with NO triggers');
  console.log('=' .repeat(60));
  
  try {
    // Find a game to test with
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
      console.log('ℹ️ No in_progress games found. Checking completed games...');
      
      // Try with a completed game to see if we can re-complete it
      const { data: completedGames, error: completedError } = await supabase
        .from('games')
        .select('*')
        .eq('season', 2025)
        .eq('week', 1)
        .eq('status', 'completed')
        .limit(1);
        
      if (completedError || !completedGames || completedGames.length === 0) {
        console.log('❌ No suitable games found for testing');
        return;
      }
      
      // Set one back to in_progress for testing
      console.log('🔄 Setting completed game back to in_progress for testing...');
      await supabase
        .from('games')
        .update({ status: 'in_progress' })
        .eq('id', completedGames[0].id);
        
      testGames = completedGames;
    }
    
    const testGame = testGames[0];
    console.log('🎮 Testing with game:', testGame.away_team, '@', testGame.home_team);
    console.log('  Current status:', testGame.status);
    console.log('  Scores:', testGame.away_score, '-', testGame.home_score);
    console.log('  Spread:', testGame.spread);
    
    // Test 1: Direct status update (should work now with no triggers)
    console.log('\n1️⃣ Testing direct status update (no triggers)...');
    
    const startTime = Date.now();
    const { data: directUpdate, error: directError } = await supabase
      .from('games')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', testGame.id)
      .select();
    const directDuration = Date.now() - startTime;
    
    if (directError) {
      console.error('❌ Direct update FAILED after', directDuration, 'ms');
      console.error('Error:', directError.message);
      console.log('\n🚨 CRITICAL: Issue is NOT trigger-related!');
      console.log('🔍 Issue must be: RLS policies, database locks, or infrastructure');
    } else {
      console.log('✅ Direct update SUCCEEDED in', directDuration, 'ms');
      console.log('New status:', directUpdate[0].status);
      
      // Test 2: Use the manual completion function
      console.log('\n2️⃣ Testing manual completion function...');
      
      // First reset status
      await supabase
        .from('games')
        .update({ status: 'in_progress' })
        .eq('id', testGame.id);
      
      const { data: manualResult, error: manualError } = await supabase
        .rpc('manual_complete_game', { game_id_param: testGame.id });
        
      if (manualError) {
        console.error('❌ Manual function failed:', manualError.message);
      } else {
        console.log('✅ Manual completion function succeeded!');
        console.log('Result:', manualResult[0]);
      }
    }
    
    console.log('\n📊 DIAGNOSIS:');
    console.log('=============');
    if (directError) {
      console.log('❌ The timeout is NOT caused by triggers');
      console.log('🔍 Possible causes:');
      console.log('  - RLS policies blocking access');
      console.log('  - Database connection issues');
      console.log('  - Row-level locks from other processes');
      console.log('  - Infrastructure/network timeouts');
      console.log('  - Missing database indexes');
    } else {
      console.log('✅ Triggers were the problem - completion works without them');
      console.log('🎯 Need to identify which specific trigger was causing the timeout');
    }
    
  } catch (error) {
    console.error('❌ Emergency test failed:', error.message);
  }
}

testEmergencyCompletion().catch(console.error);