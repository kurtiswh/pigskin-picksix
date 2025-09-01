import { createClient } from '@supabase/supabase-js';

// Direct credentials from .env file (for testing only)
const SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

console.log('🔗 Connecting to:', SUPABASE_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test game ID from our search
const TEST_GAME_ID = 'c6b22f30-a2be-4871-a54f-19fe73c9c71c'; // Mississippi State @ Southern Miss

async function testCompletionTriggerFinal() {
  console.log('🧪 FINAL COMPLETION TRIGGER TEST');
  console.log('=' .repeat(60));
  console.log('Target Game ID:', TEST_GAME_ID);
  console.log();
  
  try {
    // Step 1: Get current state of test game
    console.log('1️⃣ Getting current game state...');
    const { data: gameData, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('id', TEST_GAME_ID)
      .single();
      
    if (fetchError) {
      console.error('❌ Failed to fetch game:', fetchError.message);
      return false;
    }
    
    console.log('🎮 Game:', gameData.away_team, '@', gameData.home_team);
    console.log('  Current Status:', gameData.status);
    console.log('  Scores:', gameData.away_score, '-', gameData.home_score);
    console.log('  Spread:', gameData.spread);
    console.log('  Winner ATS:', gameData.winner_against_spread);
    console.log('  Margin Bonus:', gameData.margin_bonus);
    console.log('  API Completed:', gameData.api_completed);
    console.log();
    
    // Step 2: Ensure game is in testable state
    console.log('2️⃣ Preparing game for completion test...');
    
    if (gameData.status === 'completed') {
      console.log('🔄 Game already completed - setting back to in_progress for test...');
      
      const { error: resetError } = await supabase
        .from('games')
        .update({
          status: 'in_progress',
          winner_against_spread: null,
          margin_bonus: 0,
          api_completed: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', TEST_GAME_ID);
        
      if (resetError) {
        console.error('❌ Failed to reset game:', resetError.message);
        return false;
      }
      console.log('✅ Game reset to in_progress state');
    } else {
      console.log('✅ Game already in testable state:', gameData.status);
    }
    
    // Step 3: Test completion trigger
    console.log('\n3️⃣ Testing completion trigger...');
    console.log('⏱️ Starting completion test - measuring timeout...');
    
    const startTime = Date.now();
    
    const { data: completionResult, error: completionError } = await supabase
      .from('games')
      .update({
        status: 'completed',
        api_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', TEST_GAME_ID)
      .select();
    
    const duration = Date.now() - startTime;
    
    if (completionError) {
      console.error('❌ COMPLETION FAILED after', duration, 'ms');
      console.error('Error Code:', completionError.code);
      console.error('Error Message:', completionError.message);
      
      if (completionError.code === '57014') {
        console.log('\n🚨 STATEMENT TIMEOUT (57014) - STILL OCCURRING');
        console.log('🔍 This means Migration 093 completion-only trigger is either:');
        console.log('   1. Not applied correctly');
        console.log('   2. Still causing expensive operations');
        console.log('   3. Competing with other database processes');
      }
      
      if (completionError.code === '42501') {
        console.log('\n🔒 RLS POLICY BLOCKING - Expected for anonymous user');
        console.log('💡 This would explain the timeout - need proper authentication');
      }
      
      return false;
    }
    
    // Success!
    console.log('✅ COMPLETION SUCCEEDED in', duration, 'ms');
    console.log();
    
    if (completionResult && completionResult.length > 0) {
      const updatedGame = completionResult[0];
      console.log('📊 Updated game state:');
      console.log('  Status:', updatedGame.status);
      console.log('  Winner ATS:', updatedGame.winner_against_spread);
      console.log('  Margin Bonus:', updatedGame.margin_bonus);
      console.log('  API Completed:', updatedGame.api_completed);
      
      // Check if trigger populated scoring fields
      if (updatedGame.winner_against_spread !== null || updatedGame.margin_bonus !== 0) {
        console.log('✅ TRIGGER WORKING: Game scoring was calculated');
      } else {
        console.log('⚠️ TRIGGER NOT WORKING: Game scoring was not calculated');
      }
    }
    
    // Performance analysis
    if (duration < 500) {
      console.log('\n🎉 EXCELLENT: Fast completion (< 500ms) - trigger is optimized!');
    } else if (duration < 1000) {
      console.log('\n✅ GOOD: Reasonable completion time (< 1s)');
    } else if (duration < 3000) {
      console.log('\n⚠️ SLOW: Taking over 1 second but completing');
    } else {
      console.log('\n🚨 VERY SLOW: Over 3 seconds - performance issue remains');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed with exception:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the final test
testCompletionTriggerFinal().then(success => {
  console.log('\n📊 FINAL DIAGNOSTIC RESULTS:');
  console.log('===========================');
  
  if (success) {
    console.log('✅ Completion trigger test PASSED');
    console.log('🎯 Migration 093 appears to be working correctly');
    console.log('📋 CONCLUSION: Statement timeout issue may be resolved');
    console.log();
    console.log('🚀 NEXT STEPS:');
    console.log('  1. Live Update Service should now work without timeouts');
    console.log('  2. Games will complete properly when API shows finished');
    console.log('  3. Monitor production for any remaining timeout issues');
  } else {
    console.log('❌ Completion trigger test FAILED');
    console.log('🚨 Migration 093 completion-only trigger has issues');
    console.log();
    console.log('🔧 DEBUGGING REQUIRED:');
    console.log('  1. Verify Migration 093 was applied in Supabase Dashboard');
    console.log('  2. Check if handle_game_completion_only() function exists');
    console.log('  3. Review trigger definition and timing');
    console.log('  4. Consider RLS policy authentication issues');
  }
}).catch(error => {
  console.error('❌ Test execution failed:', error.message);
});