const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearPrematureWinners() {
  try {
    console.log('🔍 Finding games with premature winner calculations...\n');
    
    // Find games that have winner_against_spread or margin_bonus but aren't completed
    const { data: problematicGames, error: fetchError } = await supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, status, winner_against_spread, margin_bonus, week, season')
      .neq('status', 'completed')
      .or('winner_against_spread.not.is.null,margin_bonus.not.is.null')
      .order('week', { ascending: false });
    
    if (fetchError) throw fetchError;
    
    if (!problematicGames || problematicGames.length === 0) {
      console.log('✅ No games found with premature winner calculations');
      return;
    }
    
    console.log(`Found ${problematicGames.length} games with premature winner calculations:\n`);
    
    for (const game of problematicGames) {
      console.log(`Game: ${game.away_team} @ ${game.home_team} (Week ${game.week})`);
      console.log(`  Status: ${game.status}`);
      console.log(`  Score: ${game.away_score || 0} - ${game.home_score || 0}`);
      console.log(`  Winner ATS: ${game.winner_against_spread || 'null'}`);
      console.log(`  Margin Bonus: ${game.margin_bonus || 0}`);
      console.log('');
    }
    
    // Prompt for confirmation
    console.log('⚠️  These fields will be cleared for all non-completed games:');
    console.log('  - winner_against_spread');
    console.log('  - margin_bonus');
    console.log('  - base_points\n');
    
    // Clear the premature winner data
    const { data: updatedGames, error: updateError } = await supabase
      .from('games')
      .update({
        winner_against_spread: null,
        margin_bonus: 0,
        base_points: null
      })
      .neq('status', 'completed')
      .or('winner_against_spread.not.is.null,margin_bonus.not.is.null')
      .select();
    
    if (updateError) throw updateError;
    
    console.log(`\n✅ Cleared premature winner data from ${updatedGames?.length || 0} games`);
    
    // Verify the fix
    const { data: remainingProblematic, error: verifyError } = await supabase
      .from('games')
      .select('id')
      .neq('status', 'completed')
      .or('winner_against_spread.not.is.null,margin_bonus.not.is.null');
    
    if (verifyError) throw verifyError;
    
    if (remainingProblematic && remainingProblematic.length > 0) {
      console.log(`\n⚠️  Warning: ${remainingProblematic.length} games still have premature winner data`);
    } else {
      console.log('\n✅ All non-completed games now have cleared winner data');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

clearPrematureWinners();