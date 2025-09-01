import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testUltraMinimalTrigger() {
  console.log('🧪 Testing ULTRA-MINIMAL completion trigger (NO calculations)');
  console.log('=' .repeat(65));
  
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
          api_completed: false,
          winner_against_spread: null,
          margin_bonus: 0 
        })
        .eq('id', testGame.id);
    }
    
    console.log('🎮 Testing with game:', testGame.away_team, '@', testGame.home_team);
    console.log('  Scores:', testGame.away_score, '-', testGame.home_score);
    console.log('  Current status:', testGame.status);
    
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
      console.error('Error:', error.message);
      console.log('\n🚨 CRITICAL: The timeout is NOT in calculation functions!');
      console.log('🔍 Issue must be:');
      console.log('  - Database infrastructure problem');
      console.log('  - Row-level locks from other processes');
      console.log('  - RLS policy conflicts');
      console.log('  - Supabase connection issues');
      
      return false;
    } else {
      console.log('✅ ULTRA-MINIMAL TRIGGER SUCCEEDED in', duration, 'ms');
      console.log('Game updated:');
      console.log('  Status:', result[0].status);
      console.log('  API Completed:', result[0].api_completed);
      console.log('  Winner ATS:', result[0].winner_against_spread, '(should be null)');
      console.log('  Margin Bonus:', result[0].margin_bonus, '(should be 0 or null)');
      
      console.log('\n🎯 DISCOVERY: The timeout was in calculate_winner_against_spread()');
      console.log('🔧 NEXT: Fix or replace the calculate_winner_against_spread() function');
      console.log('📋 THEORY: Function may have inefficient SQL queries or missing indexes');
      
      return true;
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test and provide diagnosis
testUltraMinimalTrigger().then(success => {
  console.log('\n📊 DIAGNOSIS:');
  console.log('==============');
  if (success) {
    console.log('✅ Ultra-minimal trigger works - issue is in calculate_winner_against_spread()');
    console.log('🎯 SOLUTION PATH:');
    console.log('  1. Fix calculate_winner_against_spread() function performance');
    console.log('  2. Or replace with simpler inline calculations');
    console.log('  3. Or move calculations to application layer');
    console.log('🧪 ROOT CAUSE: Complex database function causing statement timeout');
  } else {
    console.log('❌ Even ultra-minimal trigger fails - issue is infrastructure-related');
    console.log('🎯 SOLUTION PATH:');
    console.log('  1. Check for competing processes or locks');
    console.log('  2. Review RLS policies on games table');
    console.log('  3. Check database connection and performance');
    console.log('🧪 ROOT CAUSE: Non-trigger related database issue');
  }
}).catch(console.error);