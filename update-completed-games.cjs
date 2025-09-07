const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function updateCompletedGames() {
  try {
    console.log('🚀 Updating completed Week 2 games...\n');
    
    // List of completed games with final scores from CFBD API
    const completedGames = [
      { 
        away_team: 'James Madison', 
        home_team: 'Louisville',
        away_score: 14,
        home_score: 28,
        spread: 14,  // Louisville -14
        winner_ats: 'push',  // 14-28 = -14 + 14 = 0 (push)
        margin_bonus: 0
      },
      {
        away_team: 'Illinois',
        home_team: 'Duke', 
        away_score: 45,
        home_score: 19,
        spread: -3,  // Illinois -3
        winner_ats: 'Illinois',  // 45-19 = 26 - 3 = 23 point win
        margin_bonus: 3  // 23 points = 3 bonus
      },
      {
        away_team: 'Baylor',
        home_team: 'SMU',
        away_score: 48,
        home_score: 45,
        spread: -1.5,  // Baylor -1.5
        winner_ats: 'Baylor',  // 48-45 = 3 - 1.5 = 1.5 point win
        margin_bonus: 0  // Under 11 points
      },
      {
        away_team: 'Iowa',
        home_team: 'Iowa State',
        away_score: 13,
        home_score: 16,
        spread: 3.5,  // Iowa +3.5
        winner_ats: 'Iowa',  // 13-16 = -3 + 3.5 = 0.5 point win
        margin_bonus: 0
      },
      {
        away_team: 'Virginia',
        home_team: 'NC State',
        away_score: 31,
        home_score: 35,
        spread: 5,  // Virginia +5
        winner_ats: 'NC State',  // Actually Virginia covers but let me recalculate
        // 31-35 = -4 + 5 = 1, so Virginia covers (+5)
        // Actually, home_margin + spread: -4 + (-5) = -9, NC State wins ATS
        margin_bonus: 0
      }
    ];
    
    // Recalculate Virginia @ NC State correctly
    completedGames[4].winner_ats = 'Virginia';  // Virginia +5 covers (loses by 4)
    
    for (const game of completedGames) {
      console.log(`\n🎯 Updating: ${game.away_team} @ ${game.home_team}`);
      console.log(`   Score: ${game.away_score} - ${game.home_score}`);
      console.log(`   Winner ATS: ${game.winner_ats}, Bonus: ${game.margin_bonus}`);
      
      // Find the game in database
      const { data: dbGame, error: findError } = await supabase
        .from('games')
        .select('id')
        .eq('season', 2025)
        .eq('week', 2)
        .eq('home_team', game.home_team)
        .eq('away_team', game.away_team)
        .single();
      
      if (findError || !dbGame) {
        console.log(`   ❌ Game not found in database`);
        continue;
      }
      
      // Update with minimal fields first to avoid trigger issues
      console.log(`   🔄 Step 1: Updating scores...`);
      const { error: scoreError } = await supabase
        .from('games')
        .update({
          home_score: game.home_score,
          away_score: game.away_score
        })
        .eq('id', dbGame.id);
      
      if (scoreError) {
        console.log(`   ❌ Score update failed: ${scoreError.message}`);
        continue;
      }
      
      // Then update status and winner
      console.log(`   🔄 Step 2: Updating status and winner...`);
      const { error: statusError } = await supabase
        .from('games')
        .update({
          status: 'completed',
          winner_against_spread: game.winner_ats,
          margin_bonus: game.margin_bonus,
          base_points: 20,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbGame.id);
      
      if (statusError) {
        console.log(`   ❌ Status update failed: ${statusError.message}`);
      } else {
        console.log(`   ✅ Game updated successfully!`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Update complete!');
    console.log('='.repeat(50));
    
    // Check the results
    const { data: games } = await supabase
      .from('games')
      .select('home_team, away_team, status, home_score, away_score')
      .eq('season', 2025)
      .eq('week', 2)
      .order('kickoff_time');
    
    console.log('\nCurrent Week 2 game statuses:');
    games?.forEach(g => {
      console.log(`  ${g.away_team} @ ${g.home_team}: ${g.status} (${g.away_score}-${g.home_score})`);
    });
    
  } catch (error) {
    console.error('❌ Update failed:', error.message);
  }
}

// Run the update
updateCompletedGames();