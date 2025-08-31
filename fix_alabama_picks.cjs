const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Calculate pick result based on game outcome and spread (from scoreCalculation.ts)
 */
function calculatePickResult(
  selectedTeam,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  spread,
  isLock = false
) {
  // Determine if user picked home or away team
  const pickedHome = selectedTeam === homeTeam;
  const actualMargin = homeScore - awayScore;
  
  // Calculate spread result
  let result;
  
  if (pickedHome) {
    // User picked home team - home team must cover the spread
    if (actualMargin > Math.abs(spread)) {
      result = 'win'; // Home team covered the spread
    } else if (actualMargin === Math.abs(spread)) {
      result = 'push'; // Exactly hit the spread
    } else {
      result = 'loss'; // Home team didn't cover
    }
  } else {
    // User picked away team - away team must cover the spread
    if (spread < 0) {
      // Home team is favored, away team is underdog
      if (actualMargin < Math.abs(spread)) {
        result = 'win'; // Away team covered the spread
      } else if (actualMargin === Math.abs(spread)) {
        result = 'push'; // Exactly hit the spread
      } else {
        result = 'loss'; // Away team didn't cover
      }
    } else {
      // Away team is favored, home team is underdog
      if (Math.abs(actualMargin) > spread) {
        result = 'win'; // Away team covered the spread
      } else if (Math.abs(actualMargin) === spread) {
        result = 'push'; // Exactly hit the spread
      } else {
        result = 'loss'; // Away team didn't cover
      }
    }
  }
  
  // Calculate base points
  let basePoints = 0;
  if (result === 'win') {
    basePoints = 20;
  } else if (result === 'push') {
    basePoints = 10;
  } else {
    basePoints = 0;
  }
  
  // Calculate bonus points for wins
  let bonusPoints = 0;
  if (result === 'win') {
    let coverMargin = 0;
    if (pickedHome) {
      coverMargin = actualMargin - Math.abs(spread);
    } else {
      if (spread < 0) {
        coverMargin = Math.abs(spread) - actualMargin;
      } else {
        coverMargin = Math.abs(actualMargin) - spread;
      }
    }
    
    if (coverMargin >= 29) {
      bonusPoints = 5; // Cover by 29+
    } else if (coverMargin >= 20) {
      bonusPoints = 3; // Cover by 20-28.5
    } else if (coverMargin >= 11) {
      bonusPoints = 1; // Cover by 11-19.5
    }
  }
  
  // Apply lock multiplier (doubles the bonus)
  if (isLock) {
    bonusPoints = bonusPoints * 2;
  }
  
  const totalPoints = basePoints + bonusPoints;
  
  console.log(`Pick result: ${selectedTeam} | ${result} | ${totalPoints} pts (${basePoints} base + ${bonusPoints} bonus)${isLock ? ' [LOCK]' : ''}`);
  
  return {
    result,
    points: totalPoints,
    bonusPoints
  };
}

async function fixAlabamaFloridaStateScoring() {
  console.log('🎯 Manually calculating picks for Alabama @ Florida State...');
  
  const gameId = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe';
  
  try {
    // Get game details
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();
    
    if (gameError) throw gameError;
    if (!game) throw new Error('Game not found');
    
    console.log('📋 Game Details:');
    console.log(`  ${game.away_team} @ ${game.home_team}`);
    console.log(`  Score: ${game.away_score} - ${game.home_score}`);
    console.log(`  Spread: ${game.spread}`);
    console.log(`  Winner ATS: ${game.winner_against_spread}`);
    
    // Get all unprocessed picks for this game
    const { data: picks, error: picksError } = await supabase
      .from('picks')
      .select('*')
      .eq('game_id', gameId)
      .is('result', null);
    
    if (picksError && picksError.code !== '42501') {
      throw picksError;
    } else if (picksError?.code === '42501') {
      console.log('🔒 Cannot access picks table with anonymous key - using database function approach');
      
      // Try calling the database function directly
      const { data: functionResult, error: functionError } = await supabase.rpc('calculate_pick_results', {
        game_id_param: gameId
      });
      
      if (functionError) {
        console.error('❌ Database function error:', functionError.message);
        console.log('💡 You need to run this SQL in Supabase Dashboard:');
        console.log(`SELECT calculate_pick_results('${gameId}'::UUID);`);
        return;
      } else {
        console.log('✅ Database function executed successfully');
        return;
      }
    }
    
    if (!picks || picks.length === 0) {
      console.log('✅ No unprocessed picks found - all picks may already be scored');
      return;
    }
    
    console.log(`📊 Found ${picks.length} unprocessed picks`);
    
    // Calculate results for each pick
    const updates = [];
    
    for (const pick of picks) {
      const { result, points, bonusPoints } = calculatePickResult(
        pick.selected_team,
        game.home_team,
        game.away_team,
        game.home_score,
        game.away_score,
        game.spread,
        pick.is_lock
      );
      
      updates.push({
        id: pick.id,
        result,
        points_earned: points
      });
    }
    
    console.log('🔄 Updating picks in database...');
    
    // Update picks one by one (avoiding bulk operations due to RLS)
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        const { error: updateError } = await supabase
          .from('picks')
          .update({
            result: update.result,
            points_earned: update.points_earned,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id)
          .is('result', null); // Only update if still unprocessed
        
        if (updateError) {
          console.error(`❌ Failed to update pick ${update.id}:`, updateError.message);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Exception updating pick ${update.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ Pick scoring complete: ${successCount} updated, ${errorCount} errors`);
    
    // Now check anonymous picks
    const { data: anonPicks, error: anonError } = await supabase
      .from('anonymous_picks')
      .select('*')
      .eq('game_id', gameId)
      .is('result', null);
    
    if (anonError) {
      console.error('❌ Error fetching anonymous picks:', anonError.message);
    } else if (anonPicks && anonPicks.length > 0) {
      console.log(`📊 Found ${anonPicks.length} unprocessed anonymous picks`);
      
      let anonSuccessCount = 0;
      let anonErrorCount = 0;
      
      for (const pick of anonPicks) {
        const { result, points, bonusPoints } = calculatePickResult(
          pick.selected_team,
          game.home_team,
          game.away_team,
          game.home_score,
          game.away_score,
          game.spread,
          pick.is_lock
        );
        
        try {
          const { error: updateError } = await supabase
            .from('anonymous_picks')
            .update({
              result: result,
              points_earned: points
            })
            .eq('id', pick.id)
            .is('result', null);
          
          if (updateError) {
            console.error(`❌ Failed to update anonymous pick ${pick.id}:`, updateError.message);
            anonErrorCount++;
          } else {
            anonSuccessCount++;
          }
        } catch (error) {
          console.error(`❌ Exception updating anonymous pick ${pick.id}:`, error.message);
          anonErrorCount++;
        }
      }
      
      console.log(`✅ Anonymous picks complete: ${anonSuccessCount} updated, ${anonErrorCount} errors`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('42501') || error.code === '42501') {
      console.log('');
      console.log('🔒 RLS POLICY BLOCKING - Use Supabase Dashboard instead:');
      console.log('');
      console.log('1. Go to Supabase Dashboard > SQL Editor');
      console.log('2. Run this SQL:');
      console.log(`   SELECT calculate_pick_results('${gameId}'::UUID);`);
      console.log('');
      console.log('This will manually trigger the pick scoring for Alabama @ Florida State');
    }
  }
}

fixAlabamaFloridaStateScoring().catch(console.error);