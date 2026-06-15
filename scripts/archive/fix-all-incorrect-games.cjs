/**
 * Comprehensive fix for all incorrectly scored games
 * Handles Louisville-James Madison, OU-Michigan, Army-Kansas State, and any other misscored games
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://zgdaqbnpgrabbdljmiqu.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY environment variable is required')
  console.error('Run this script like: VITE_SUPABASE_ANON_KEY="your_key_here" node fix-all-incorrect-games.cjs')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Calculate correct winner using unified logic
function calculateCorrectWinner(homeScore, awayScore, spread, homeTeam, awayTeam) {
  const homeMargin = homeScore - awayScore
  const adjustedMargin = homeMargin + spread

  let winner
  let marginBonus = 0

  if (Math.abs(adjustedMargin) < 0.5) {
    winner = 'push'
    marginBonus = 0
  } else if (adjustedMargin > 0) {
    winner = homeTeam
    if (adjustedMargin >= 29) marginBonus = 5
    else if (adjustedMargin >= 20) marginBonus = 3
    else if (adjustedMargin >= 11) marginBonus = 1
  } else {
    winner = awayTeam
    if (Math.abs(adjustedMargin) >= 29) marginBonus = 5
    else if (Math.abs(adjustedMargin) >= 20) marginBonus = 3
    else if (Math.abs(adjustedMargin) >= 11) marginBonus = 1
  }

  return { winner, marginBonus, adjustedMargin, homeMargin }
}

async function fixGame(game) {
  const { homeScore, awayScore, spread, homeTeam, awayTeam } = game
  
  if (homeScore === null || awayScore === null || spread === null) {
    console.log(`   ⏭️ Skipping ${game.away_team} @ ${game.home_team} (missing data)`)
    return { updated: false, reason: 'Missing data' }
  }

  const correct = calculateCorrectWinner(homeScore, awayScore, spread, homeTeam, awayTeam)
  
  if (correct.winner === game.winner_against_spread && correct.marginBonus === game.margin_bonus) {
    console.log(`   ✅ ${game.away_team} @ ${game.home_team} already correctly scored`)
    return { updated: false, reason: 'Already correct' }
  }

  console.log(`   🔧 Fixing ${game.away_team} @ ${game.home_team}:`)
  console.log(`      Score: ${awayScore} - ${homeScore} (spread: ${spread})`)
  console.log(`      Home margin: ${correct.homeMargin}, Adjusted: ${correct.adjustedMargin}`)
  console.log(`      Current: ${game.winner_against_spread} (bonus: ${game.margin_bonus})`)
  console.log(`      Correct: ${correct.winner} (bonus: ${correct.marginBonus})`)

  // Update the game
  const { error: gameUpdateError } = await supabase
    .from('games')
    .update({
      winner_against_spread: correct.winner,
      margin_bonus: correct.marginBonus,
      base_points: 20,
      updated_at: new Date().toISOString()
    })
    .eq('id', game.id)

  if (gameUpdateError) {
    console.error(`      ❌ Failed to update game: ${gameUpdateError.message}`)
    return { updated: false, reason: `Game update failed: ${gameUpdateError.message}` }
  }

  // Update regular picks
  const { data: picks, error: picksError } = await supabase
    .from('picks')
    .select('id, selected_team, is_lock')
    .eq('game_id', game.id)

  let picksUpdated = 0
  if (picksError) {
    console.warn(`      ⚠️ Error fetching picks: ${picksError.message}`)
  } else if (picks && picks.length > 0) {
    for (const pick of picks) {
      const result = correct.winner === 'push' ? 'push' : 
                    pick.selected_team === correct.winner ? 'win' : 'loss'
      
      const points = result === 'push' ? 10 :
                    result === 'win' ? (20 + correct.marginBonus + (pick.is_lock ? correct.marginBonus : 0)) : 0

      const { error } = await supabase
        .from('picks')
        .update({ result, points_earned: points })
        .eq('id', pick.id)

      if (!error) {
        picksUpdated++
      }
    }
  }

  // Update anonymous picks
  const { data: anonPicks, error: anonError } = await supabase
    .from('anonymous_picks')
    .select('id, selected_team, is_lock')
    .eq('game_id', game.id)

  let anonPicksUpdated = 0
  if (anonError) {
    console.warn(`      ⚠️ Error fetching anonymous picks: ${anonError.message}`)
  } else if (anonPicks && anonPicks.length > 0) {
    for (const pick of anonPicks) {
      const result = correct.winner === 'push' ? 'push' : 
                    pick.selected_team === correct.winner ? 'win' : 'loss'
      
      const points = result === 'push' ? 10 :
                    result === 'win' ? (20 + correct.marginBonus + (pick.is_lock ? correct.marginBonus : 0)) : 0

      const { error } = await supabase
        .from('anonymous_picks')
        .update({ result, points_earned: points })
        .eq('id', pick.id)

      if (!error) {
        anonPicksUpdated++
      }
    }
  }

  console.log(`      ✅ Updated ${picksUpdated} picks, ${anonPicksUpdated} anonymous picks`)
  
  return { 
    updated: true, 
    picksUpdated, 
    anonPicksUpdated,
    oldWinner: game.winner_against_spread,
    newWinner: correct.winner,
    oldBonus: game.margin_bonus,
    newBonus: correct.marginBonus
  }
}

async function fixAllIncorrectGames() {
  try {
    console.log('🔧 COMPREHENSIVE FIX FOR ALL INCORRECTLY SCORED GAMES')
    console.log('=' .repeat(60))
    console.log('')

    // Get all completed games for current season
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2025)
      .eq('status', 'completed')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .not('spread', 'is', null)
      .order('week', { ascending: true })

    if (gamesError) {
      console.error('❌ Error fetching games:', gamesError)
      return
    }

    if (!games || games.length === 0) {
      console.log('❌ No completed games found')
      return
    }

    console.log(`📊 Found ${games.length} completed games to check`)
    console.log('')

    // Check each game for incorrect scoring
    const incorrectGames = []
    const alreadyCorrect = []
    
    for (const game of games) {
      if (game.home_score === null || game.away_score === null || game.spread === null) {
        continue
      }

      const correct = calculateCorrectWinner(
        game.home_score, 
        game.away_score, 
        game.spread, 
        game.home_team, 
        game.away_team
      )

      if (correct.winner !== game.winner_against_spread || correct.marginBonus !== game.margin_bonus) {
        incorrectGames.push(game)
      } else {
        alreadyCorrect.push(game)
      }
    }

    console.log(`🎯 ANALYSIS RESULTS:`)
    console.log(`   ✅ Already correct: ${alreadyCorrect.length} games`)
    console.log(`   ❌ Need fixing: ${incorrectGames.length} games`)
    console.log('')

    if (incorrectGames.length === 0) {
      console.log('🎉 All games are already correctly scored!')
      return
    }

    console.log('🔧 GAMES THAT NEED FIXING:')
    incorrectGames.forEach((game, i) => {
      const correct = calculateCorrectWinner(
        game.home_score, 
        game.away_score, 
        game.spread, 
        game.home_team, 
        game.away_team
      )
      
      console.log(`${i + 1}. ${game.away_team} @ ${game.home_team} (Week ${game.week})`)
      console.log(`   Score: ${game.away_score} - ${game.home_score} (spread: ${game.spread})`)
      console.log(`   Current: ${game.winner_against_spread} | Should be: ${correct.winner}`)
      console.log('')
    })

    console.log('🚀 Starting fixes...')
    console.log('')

    // Fix each incorrect game
    let totalGamesFixed = 0
    let totalPicksUpdated = 0
    let totalAnonPicksUpdated = 0
    const fixResults = []

    for (let i = 0; i < incorrectGames.length; i++) {
      const game = incorrectGames[i]
      console.log(`[${i + 1}/${incorrectGames.length}] Processing ${game.away_team} @ ${game.home_team}...`)
      
      const result = await fixGame(game)
      fixResults.push({ game, result })
      
      if (result.updated) {
        totalGamesFixed++
        totalPicksUpdated += result.picksUpdated || 0
        totalAnonPicksUpdated += result.anonPicksUpdated || 0
      }
      
      // Small delay to prevent overwhelming the database
      if (i < incorrectGames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log('')
    console.log('🎉 COMPREHENSIVE FIX COMPLETE!')
    console.log('=' .repeat(60))
    console.log(`📊 RESULTS SUMMARY:`)
    console.log(`   Games analyzed: ${games.length}`)
    console.log(`   Games already correct: ${alreadyCorrect.length}`)
    console.log(`   Games that needed fixing: ${incorrectGames.length}`)
    console.log(`   Games successfully fixed: ${totalGamesFixed}`)
    console.log(`   Regular picks updated: ${totalPicksUpdated}`)
    console.log(`   Anonymous picks updated: ${totalAnonPicksUpdated}`)
    console.log('')

    // Show specific games that were fixed
    if (totalGamesFixed > 0) {
      console.log('✅ GAMES SUCCESSFULLY FIXED:')
      fixResults.filter(f => f.result.updated).forEach(({ game, result }, i) => {
        console.log(`${i + 1}. ${game.away_team} @ ${game.home_team}`)
        console.log(`   ${result.oldWinner} → ${result.newWinner} (bonus: ${result.oldBonus} → ${result.newBonus})`)
        console.log(`   Updated ${result.picksUpdated + result.anonPicksUpdated} total picks`)
      })
      console.log('')
    }

    // Show any failures
    const failures = fixResults.filter(f => !f.result.updated && f.result.reason !== 'Already correct')
    if (failures.length > 0) {
      console.log('❌ GAMES WITH ISSUES:')
      failures.forEach(({ game, result }, i) => {
        console.log(`${i + 1}. ${game.away_team} @ ${game.home_team}: ${result.reason}`)
      })
      console.log('')
    }

    console.log('ℹ️  IMPORTANT NOTES:')
    console.log('   • All services now use unified push calculation logic')
    console.log('   • Manual corrections will no longer be overwritten')
    console.log('   • Push games use < 0.5 point tolerance for floating-point precision')
    console.log('   • Future automated processes will maintain consistency')

  } catch (error) {
    console.error('❌ Comprehensive fix failed:', error)
  }
}

// Run the comprehensive fix
fixAllIncorrectGames()