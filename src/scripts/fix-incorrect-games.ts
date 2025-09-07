/**
 * Fix incorrect game scoring - runs in browser environment
 * Use this in the browser console on your admin page
 */

import { supabase } from '../lib/supabase'

// Calculate correct winner using unified logic
function calculateCorrectWinner(homeScore: number, awayScore: number, spread: number, homeTeam: string, awayTeam: string) {
  const homeMargin = homeScore - awayScore
  const adjustedMargin = homeMargin + spread

  let winner: string
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

export async function fixIncorrectGames() {
  console.log('🔧 FIXING INCORRECT GAME SCORING')
  console.log('=' .repeat(40))

  try {
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

    console.log(`📊 Checking ${games.length} completed games`)

    // Find incorrect games
    const incorrectGames = []
    
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
        incorrectGames.push({ game, correct })
      }
    }

    console.log(`❌ Found ${incorrectGames.length} incorrectly scored games`)

    if (incorrectGames.length === 0) {
      console.log('✅ All games are correctly scored!')
      return
    }

    // Show what will be fixed
    console.log('\n🔧 GAMES TO FIX:')
    incorrectGames.forEach(({ game, correct }, i) => {
      console.log(`${i + 1}. ${game.away_team} @ ${game.home_team} (Week ${game.week})`)
      console.log(`   Score: ${game.away_score} - ${game.home_score} (spread: ${game.spread})`)
      console.log(`   Current: ${game.winner_against_spread} → Should be: ${correct.winner}`)
    })

    // Ask for confirmation
    const confirmed = confirm(`Fix ${incorrectGames.length} incorrectly scored games? This will update all affected picks.`)
    if (!confirmed) {
      console.log('❌ Fix cancelled by user')
      return
    }

    // Fix each game
    let totalFixed = 0
    let totalPicksUpdated = 0

    for (const { game, correct } of incorrectGames) {
      console.log(`\n🔧 Fixing ${game.away_team} @ ${game.home_team}...`)

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
        console.error(`   ❌ Failed to update game:`, gameUpdateError)
        continue
      }

      // Update regular picks
      const { data: picks } = await supabase
        .from('picks')
        .select('id, selected_team, is_lock')
        .eq('game_id', game.id)

      let picksUpdated = 0
      if (picks) {
        for (const pick of picks) {
          const result = correct.winner === 'push' ? 'push' : 
                        pick.selected_team === correct.winner ? 'win' : 'loss'
          
          const points = result === 'push' ? 10 :
                        result === 'win' ? (20 + correct.marginBonus + (pick.is_lock ? correct.marginBonus : 0)) : 0

          const { error } = await supabase
            .from('picks')
            .update({ result, points_earned: points })
            .eq('id', pick.id)

          if (!error) picksUpdated++
        }
      }

      // Update anonymous picks
      const { data: anonPicks } = await supabase
        .from('anonymous_picks')
        .select('id, selected_team, is_lock')
        .eq('game_id', game.id)

      let anonPicksUpdated = 0
      if (anonPicks) {
        for (const pick of anonPicks) {
          const result = correct.winner === 'push' ? 'push' : 
                        pick.selected_team === correct.winner ? 'win' : 'loss'
          
          const points = result === 'push' ? 10 :
                        result === 'win' ? (20 + correct.marginBonus + (pick.is_lock ? correct.marginBonus : 0)) : 0

          const { error } = await supabase
            .from('anonymous_picks')
            .update({ result, points_earned: points })
            .eq('id', pick.id)

          if (!error) anonPicksUpdated++
        }
      }

      console.log(`   ✅ Fixed! ${picksUpdated} picks, ${anonPicksUpdated} anonymous picks`)
      totalFixed++
      totalPicksUpdated += picksUpdated + anonPicksUpdated
    }

    console.log('\n🎉 ALL FIXES COMPLETE!')
    console.log(`   Games fixed: ${totalFixed}`)
    console.log(`   Total picks updated: ${totalPicksUpdated}`)
    console.log('\n✅ Manual corrections will no longer be overwritten!')

  } catch (error) {
    console.error('❌ Fix failed:', error)
  }
}

// Make available globally for console use
if (typeof window !== 'undefined') {
  (window as any).fixIncorrectGames = fixIncorrectGames
}