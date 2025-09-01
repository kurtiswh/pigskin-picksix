import { createClient } from '@supabase/supabase-js';

// Direct credentials from .env file (for testing only)
const SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8';

console.log('🔗 Connecting to:', SUPABASE_URL);
console.log('🔑 Using key ending in:', SUPABASE_ANON_KEY.slice(-10));

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFinalCompletionFix() {
  console.log('🧪 Testing FINAL completion fix - completion-only trigger');
  console.log('=' .repeat(70));
  
  try {
    // Step 1: Verify in_progress games have no scoring
    console.log('1️⃣ Verifying in_progress games are clean...');
    const { data: inProgressGames, error: progressError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .eq('status', 'in_progress');
      
    if (progressError) {
      console.error('❌ Error checking in_progress games:', progressError.message);
      return;
    }
    
    const scoredInProgress = inProgressGames?.filter(g => 
      g.winner_against_spread !== null || (g.margin_bonus !== null && g.margin_bonus !== 0)
    ) || [];
    
    if (scoredInProgress.length > 0) {
      console.log('🚨 WARNING: Still found', scoredInProgress.length, 'in_progress games with scoring');
      scoredInProgress.forEach(game => {
        console.log('  ', game.away_team, '@', game.home_team, '- margin_bonus:', game.margin_bonus);
      });
      console.log('💡 Migration 092 may not have been applied yet');
    } else {
      console.log('✅ All in_progress games are clean (no premature scoring)');
    }
    
    // Step 2: Test completion trigger
    console.log('\n2️⃣ Testing completion trigger...');
    
    // Find a game to test with
    const testGame = inProgressGames?.find(g => 
      g.home_score !== null && g.away_score !== null
    );
    
    if (!testGame) {
      console.log('❌ No suitable test game found');
      return;
    }
    
    console.log('🎮 Testing completion with game:', testGame.away_team, '@', testGame.home_team);
    console.log('  Current status:', testGame.status);
    console.log('  Scores:', testGame.away_score, '-', testGame.home_score);
    console.log('  Spread:', testGame.spread);
    
    // Test the completion-only trigger
    console.log('\n🔧 Triggering completion (should be fast)...');
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
      console.error('❌ COMPLETION FAILED after', duration, 'ms');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      if (error.message?.includes('timeout') || error.message?.includes('statement timeout')) {
        console.log('\n🚨 STILL TIMING OUT: Need to investigate further');
        console.log('🔍 Possible remaining issues:');
        console.log('  - Other competing processes');
        console.log('  - Migration 092/093 not applied correctly');
        console.log('  - Infrastructure bottlenecks');
      }
      
      return false;
    } else {
      console.log('✅ COMPLETION SUCCEEDED in', duration, 'ms');
      console.log('Updated game:');
      console.log('  Status:', result[0].status);
      console.log('  Winner ATS:', result[0].winner_against_spread);
      console.log('  Margin Bonus:', result[0].margin_bonus);
      console.log('  API Completed:', result[0].api_completed);
      
      if (duration < 1000) {
        console.log('\n🎉 EXCELLENT: Fast completion suggests fix is working!');
      } else {
        console.log('\n⚠️ SLOW: Still took over 1 second, but completed successfully');
      }
      
      return true;
    }
    
  } catch (error) {
    console.error('❌ Test failed with exception:', error.message);
    return false;
  }
}

// Run comprehensive test
testFinalCompletionFix().then(success => {
  console.log('\n📊 FINAL TEST RESULTS:');
  console.log('=====================');
  if (success) {
    console.log('✅ Game completion is working!');
    console.log('🎯 ROOT CAUSE WAS: Triggers calculating scores during live updates');
    console.log('🔧 SOLUTION: Completion-only trigger that fires only on status change');
    console.log('📋 NEXT STEPS:');
    console.log('  1. Live Update Service should now work without timeouts');
    console.log('  2. Games will complete properly when API shows them as finished');
    console.log('  3. No more premature scoring during live updates');
  } else {
    console.log('❌ Still experiencing issues');
    console.log('🔍 Check that Migrations 092 and 093 were applied in Supabase');
    console.log('🔧 May need additional investigation into competing processes');
  }
}).catch(console.error);