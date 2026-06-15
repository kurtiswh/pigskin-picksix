// BROWSER CONSOLE DIAGNOSTIC SCRIPT - Copy and paste this entire script
// This version works with the current page context

console.log('🔍 PICK PROCESSING DIAGNOSTIC - Starting...');

// Function to check picks data
const checkPicksData = async () => {
  try {
    // Create Supabase client directly (same way the app does it)
    const { createClient } = await import('https://cdn.skypack.dev/@supabase/supabase-js');
    
    const supabase = createClient(
      'https://zgdaqbnpgrabbnljmiqy.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
    );

    console.log('✅ Supabase client created');

    // Get Week 2 games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, home_team, away_team, status, winner_against_spread')
      .eq('season', 2025)
      .eq('week', 2)
      .order('kickoff_time');

    if (gamesError) {
      console.error('❌ Error fetching games:', gamesError);
      return;
    }

    console.log(`📊 Found ${games.length} Week 2 games`);
    console.log('─'.repeat(60));

    for (const game of games) {
      console.log(`\n🏈 ${game.away_team} @ ${game.home_team}`);
      console.log(`   Status: ${game.status}, Winner ATS: ${game.winner_against_spread || 'Not set'}`);

      // Check regular picks
      const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select('id, selected_team, result, points_earned, is_lock')
        .eq('game_id', game.id);

      // Check anonymous picks
      const { data: anonPicks, error: anonError } = await supabase
        .from('anonymous_picks')
        .select('id, selected_team, result, points_earned, is_lock')
        .eq('game_id', game.id);

      if (!picksError && !anonError) {
        const totalPicks = (picks?.length || 0) + (anonPicks?.length || 0);
        const processedPicks = (picks?.filter(p => p.result !== null).length || 0) + 
                              (anonPicks?.filter(p => p.result !== null).length || 0);
        
        console.log(`   📈 Total picks: ${totalPicks} (${picks?.length || 0} regular + ${anonPicks?.length || 0} anonymous)`);
        console.log(`   ✅ Processed picks: ${processedPicks}/${totalPicks}`);
        
        if (totalPicks === 0) {
          console.log('   ❌ ISSUE: No picks found for this game!');
        } else if (processedPicks === 0) {
          console.log('   ⚠️  ISSUE: Picks exist but none are processed!');
        } else if (processedPicks < totalPicks) {
          console.log(`   ⚠️  ISSUE: Only ${processedPicks}/${totalPicks} picks are processed!`);
        }

        // Show sample picks if they exist
        if (picks && picks.length > 0) {
          const samplePick = picks[0];
          console.log(`   📋 Sample pick: selected=${samplePick.selected_team}, result=${samplePick.result}, points=${samplePick.points_earned}`);
        }
      } else {
        console.log('   ❌ Error fetching picks:', picksError || anonError);
      }
    }

    // Summary statistics
    console.log('\n' + '='.repeat(60));
    console.log('📈 WEEK 2 SUMMARY');
    
    const completedGames = games.filter(g => g.status === 'completed');
    const gamesWithWinner = games.filter(g => g.winner_against_spread);
    
    console.log(`   Games completed: ${completedGames.length}/${games.length}`);
    console.log(`   Games with ATS winner: ${gamesWithWinner.length}/${games.length}`);
    
    // Check total week picks
    const { data: weekPicks } = await supabase
      .from('picks')
      .select('id')
      .eq('season', 2025)
      .eq('week', 2);
    
    const { data: weekAnonPicks } = await supabase
      .from('anonymous_picks')
      .select('id')
      .eq('season', 2025)
      .eq('week', 2);
    
    const totalWeekPicks = (weekPicks?.length || 0) + (weekAnonPicks?.length || 0);
    console.log(`   Total Week 2 picks: ${totalWeekPicks}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
};

// Run the diagnostic
checkPicksData();