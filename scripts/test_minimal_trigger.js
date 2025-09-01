import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://zgdaqbnpgrabbnljmiqy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
);

async function testMinimalTrigger() {
  console.log('🧪 Testing MINIMAL completion trigger (game scoring only)');
  console.log('=' .repeat(60));
  
  try {
    // Find a test game
    const { data: testGames, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('week', 1)
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .limit(2);
      
    if (fetchError || !testGames || testGames.length === 0) {
      console.error('❌ No suitable test games found');
      return;
    }
    
    // Use first in_progress game, or set a completed one back to in_progress
    let testGame = testGames.find(g => g.status === 'in_progress');
    if (!testGame) {
      testGame = testGames[0];
      console.log('🔄 Setting completed game back to in_progress for testing...');
      await supabase
        .from('games')
        .update({ 
          status: 'in_progress', 
          winner_against_spread: null,
          margin_bonus: 0 
        })
        .eq('id', testGame.id);
    }
    
    console.log('🎮 Testing with game:', testGame.away_team, '@', testGame.home_team);
    console.log('  Scores:', testGame.away_score, '-', testGame.home_score);
    console.log('  Spread:', testGame.spread);
    console.log('  Current status:', testGame.status);
    
    // Test the minimal trigger
    console.log('\n🔧 Testing completion with MINIMAL trigger...');
    const startTime = Date.now();
    
    const { data: result, error } = await supabase
      .from('games')
      .update({ 
        status: 'completed',
        api_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', testGame.id)
      .select();
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error('❌ MINIMAL TRIGGER FAILED after', duration, 'ms');
      console.error('Error:', error.message);
      console.log('\n🚨 PROBLEM: Even the minimal game scoring trigger causes timeout');
      console.log('🔍 Issue might be in:');
      console.log('  - calculate_winner_against_spread() function');
      console.log('  - Complex CASE statements for margin_bonus');
      console.log('  - Database performance during calculations');
      
      return false;
    } else {
      console.log('✅ MINIMAL TRIGGER SUCCEEDED in', duration, 'ms');
      console.log('Game updated:');
      console.log('  Status:', result[0].status);
      console.log('  Winner ATS:', result[0].winner_against_spread);
      console.log('  Margin Bonus:', result[0].margin_bonus);
      
      // Check if picks were updated (they shouldn't be with minimal trigger)
      const { data: picks } = await supabase
        .from('picks')
        .select('result, points_earned')
        .eq('game_id', testGame.id)
        .not('result', 'is', null)
        .limit(1);
        
      if (picks && picks.length > 0) {
        console.log('⚠️  WARNING: Picks were updated but we only added game scoring trigger');
        console.log('  This suggests there might be another trigger still active');
      } else {
        console.log('✅ GOOD: Picks were NOT updated (as expected with minimal trigger)');
      }
      
      console.log('\n🎯 NEXT STEP: Add the pick update trigger and test again');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test and provide next steps
testMinimalTrigger().then(success => {
  console.log('\n📋 RESULTS:');
  console.log('============');
  if (success) {
    console.log('✅ Minimal game scoring trigger works fine');
    console.log('🎯 NEXT: Apply Migration 090 to add pick update trigger');
    console.log('🧪 THEORY: The timeout was likely in the pick update process');
  } else {
    console.log('❌ Even minimal trigger causes timeout');
    console.log('🎯 NEXT: Need to simplify the trigger even further');
    console.log('🧪 THEORY: Issue is in calculate_winner_against_spread() or margin calculations');
  }
}).catch(console.error);