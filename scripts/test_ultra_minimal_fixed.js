import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testUltraMinimalTrigger() {
  console.log('🧪 Testing ULTRA-MINIMAL completion trigger (NO calculations)');
  console.log('=' .repeat(65));
  
  try {
    // Find games with scores (including both completed and in_progress)
    const { data: testGames, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .order('kickoff_time');
      
    if (fetchError || !testGames || testGames.length === 0) {
      console.error('❌ No suitable test games found:', fetchError?.message);
      return;
    }
    
    console.log('Found', testGames.length, 'games with scores to test with');
    
    // Use the first in_progress game, or reset a completed one
    let testGame = testGames.find(g => g.status === 'in_progress');
    
    if (!testGame) {
      // Use a completed game and reset it
      testGame = testGames.find(g => g.status === 'completed');
      if (testGame) {
        console.log('🔄 Setting completed game back to in_progress for testing...');
        const { error: resetError } = await supabase
          .from('games')
          .update({ 
            status: 'in_progress', 
            api_completed: false,
            winner_against_spread: null,
            margin_bonus: 0 
          })
          .eq('id', testGame.id);
          
        if (resetError) {
          console.error('❌ Failed to reset game:', resetError.message);
          return;
        }
      }
    }
    
    if (!testGame) {
      console.error('❌ No suitable games found for testing');
      return;
    }
    
    console.log('🎮 Testing with game:', testGame.away_team, '@', testGame.home_team);
    console.log('  Scores:', testGame.away_score, '-', testGame.home_score);
    console.log('  Current status:', testGame.status);
    console.log('  Game ID:', testGame.id);
    
    // Test the ultra-minimal trigger
    console.log('\n🔧 Testing completion with ULTRA-MINIMAL trigger (no calculations)...');
    const startTime = Date.now();
    
    const { data: result, error } = await supabase
      .from('games')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', testGame.id)
      .select();
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error('❌ ULTRA-MINIMAL TRIGGER FAILED after', duration, 'ms');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      if (error.message?.includes('timeout') || error.message?.includes('statement timeout')) {
        console.log('\n🚨 STATEMENT TIMEOUT: Even ultra-minimal trigger times out!');
        console.log('🔍 This means the issue is NOT in calculate_winner_against_spread()');
        console.log('🔍 Issue must be deeper: infrastructure, locks, or competing processes');
      } else if (error.code === '42501') {
        console.log('\n🚨 RLS POLICY: Anonymous user blocked from updating games table');
        console.log('💡 This is expected - the trigger test worked, but RLS blocks the result');
      } else {
        console.log('\n🚨 DIFFERENT ERROR: Not a timeout, something else is wrong');
      }
      
      return false;
    } else {
      console.log('✅ ULTRA-MINIMAL TRIGGER SUCCEEDED in', duration, 'ms');
      console.log('Game updated successfully:');
      console.log('  Status:', result[0].status);
      console.log('  API Completed:', result[0].api_completed);
      console.log('  Winner ATS:', result[0].winner_against_spread, '(should be null)');
      console.log('  Margin Bonus:', result[0].margin_bonus, '(should be 0 or null)');
      
      console.log('\n🎯 SUCCESS: Ultra-minimal trigger works without timeout');
      console.log('🔧 CONCLUSION: The timeout was definitely in calculate_winner_against_spread()');
      console.log('📋 NEXT STEP: Fix the calculate_winner_against_spread() function performance');
      
      return true;
    }
    
  } catch (error) {
    console.error('❌ Test failed with exception:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test and provide diagnosis
testUltraMinimalTrigger().then(success => {
  console.log('\n📊 FINAL DIAGNOSIS:');
  console.log('===================');
  if (success) {
    console.log('✅ CONFIRMED: calculate_winner_against_spread() was causing the timeout');
    console.log('🎯 SOLUTION: Replace or optimize the function');
    console.log('📋 OPTIONS:');
    console.log('  1. Rewrite function with better performance');
    console.log('  2. Move calculations to application layer');
    console.log('  3. Use simpler inline calculations in trigger');
  } else {
    console.log('❌ TIMEOUT PERSISTS: Issue is deeper than function calculations');  
    console.log('🔍 INVESTIGATE:');
    console.log('  1. Database locks or competing processes');
    console.log('  2. Infrastructure performance issues');
    console.log('  3. Supabase plan limits or quotas');
  }
}).catch(console.error);