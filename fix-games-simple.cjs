/**
 * Simple fix for incorrectly scored games
 * No command line environment variables needed
 */

const { createClient } = require('@supabase/supabase-js')

// Hardcoded for simplicity - this is the anon key (safe to use)
const supabaseUrl = 'https://zgdaqbnpgrabbdljmiqu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

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

async function fixSpecificGames() {
  try {
    console.log('🔧 FIXING SPECIFIC INCORRECTLY SCORED GAMES')
    console.log('=' .repeat(50))
    console.log('')

    // Target specific games we know are wrong
    const targetGames = [
      { search: 'Louisville', search2: 'James Madison' },
      { search: 'Oklahoma', search2: 'Michigan' },
      { search: 'Army', search2: 'Kansas State' }
    ]

    let totalFixed = 0
    let totalPicks = 0

    for (const target of targetGames) {
      console.log(`🔍 Looking for ${target.search} vs ${target.search2}...`)

      // Search for the game
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', 2025)
        .eq('status', 'completed')
        .or(`home_team.ilike.%${target.search}%,away_team.ilike.%${target.search}%`)

      if (gamesError) {
        console.error(`   ❌ Error searching for ${target.search}:`, gamesError.message)
        continue
      }

      // Find the specific matchup
      const game = games?.find(g => 
        (g.home_team.toLowerCase().includes(target.search.toLowerCase()) && 
         g.away_team.toLowerCase().includes(target.search2.toLowerCase())) ||
        (g.home_team.toLowerCase().includes(target.search2.toLowerCase()) && 
         g.away_team.toLowerCase().includes(target.search.toLowerCase()))
      )

      if (!game) {
        console.log(`   ⏭️ ${target.search} vs ${target.search2} not found`)
        continue
      }

      console.log(`   ✅ Found: ${game.away_team} @ ${game.home_team}`)
      console.log(`      Score: ${game.away_score} - ${game.home_score}`)
      console.log(`      Spread: ${game.spread}`)
      console.log(`      Current winner: ${game.winner_against_spread}`)

      if (game.home_score === null || game.away_score === null || game.spread === null) {
        console.log(`   ⏭️ Skipping (missing data)`)
        continue
      }

      // Calculate correct result
      const correct = calculateCorrectWinner(
        game.home_score, 
        game.away_score, 
        game.spread, 
        game.home_team, 
        game.away_team
      )

      console.log(`      Correct winner: ${correct.winner}`)

      if (correct.winner === game.winner_against_spread && correct.marginBonus === game.margin_bonus) {
        console.log(`   ✅ Already correctly scored!`)
        continue
      }

      console.log(`   🔧 FIXING: ${game.winner_against_spread} → ${correct.winner}`)

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
        console.error(`   ❌ Failed to update game:`, gameUpdateError.message)
        continue
      }

      // Update picks
      const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select('id, selected_team, is_lock')
        .eq('game_id', game.id)

      let picksUpdated = 0
      if (!picksError && picks) {
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

      console.log(`   ✅ FIXED! Updated ${picksUpdated} picks, ${anonPicksUpdated} anonymous picks`)
      totalFixed++
      totalPicks += picksUpdated + anonPicksUpdated
      console.log('')
    }

    console.log('🎉 FIXES COMPLETE!')
    console.log(`   Games fixed: ${totalFixed}`)
    console.log(`   Total picks updated: ${totalPicks}`)
    console.log('')
    console.log('ℹ️  Manual corrections will no longer be overwritten!')

  } catch (error) {
    console.error('❌ Fix failed:', error.message)
  }
}

// Run the fix
fixSpecificGames()