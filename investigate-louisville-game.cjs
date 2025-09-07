/**
 * Investigation script for Louisville vs James Madison scoring issue
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://zgdaqbnpgrabbdljmiqu.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function investigateLouisvilleGame() {
  try {
    console.log('🔍 Investigating Louisville vs James Madison scoring issue...')
    console.log('')

    // Look for games with Louisville or James Madison
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .or('home_team.ilike.%Louisville%,away_team.ilike.%Louisville%,home_team.ilike.%James Madison%,away_team.ilike.%James Madison%')
      .eq('season', 2025)
      .order('week', { ascending: false })

    if (error) {
      console.error('❌ Error fetching games:', error)
      return
    }

    if (!games || games.length === 0) {
      console.log('❌ No Louisville or James Madison games found for 2025')
      return
    }

    console.log(`📊 Found ${games.length} games involving Louisville or James Madison in 2025:`)
    console.log('')

    games.forEach((game, i) => {
      console.log(`${i + 1}. ${game.away_team} @ ${game.home_team}`)
      console.log(`   Week ${game.week}, Status: ${game.status}`)
      console.log(`   Scores: ${game.away_score} - ${game.home_score}`)
      console.log(`   Spread: ${game.spread}`)
      console.log(`   Winner ATS: ${game.winner_against_spread}`)
      console.log(`   Margin Bonus: ${game.margin_bonus}`)
      console.log(`   Updated: ${game.updated_at}`)
      console.log('')
    })

    // Look specifically for the Louisville vs James Madison matchup
    const louisvilleJMU = games.find(g => 
      (g.home_team.includes('Louisville') && g.away_team.includes('James Madison')) ||
      (g.home_team.includes('James Madison') && g.away_team.includes('Louisville'))
    )

    if (louisvilleJMU) {
      console.log('🎯 ANALYZING LOUISVILLE VS JAMES MADISON:')
      console.log(`   Game ID: ${louisvilleJMU.id}`)
      console.log(`   ${louisvilleJMU.away_team} @ ${louisvilleJMU.home_team}`)
      console.log(`   Final Score: ${louisvilleJMU.away_score} - ${louisvilleJMU.home_score}`)
      console.log(`   Spread: ${louisvilleJMU.spread}`)
      console.log(`   Current Winner ATS: ${louisvilleJMU.winner_against_spread}`)
      console.log('')

      // Calculate what it should be manually
      const homeScore = louisvilleJMU.home_score
      const awayScore = louisvilleJMU.away_score
      const spread = louisvilleJMU.spread

      if (homeScore !== null && awayScore !== null && spread !== null) {
        const homeMargin = homeScore - awayScore
        const adjustedMargin = homeMargin + spread
        const absDiff = Math.abs(adjustedMargin)

        console.log(`📊 SPREAD CALCULATION ANALYSIS:`)
        console.log(`   Home team margin: ${homeMargin} (${homeScore} - ${awayScore})`)
        console.log(`   Spread: ${spread}`)
        console.log(`   Adjusted margin: ${adjustedMargin} (${homeMargin} + ${spread})`)
        console.log(`   Absolute difference: ${absDiff}`)
        console.log('')

        let correctWinner
        let marginBonus = 0

        if (absDiff < 0.5) {
          correctWinner = 'push'
          marginBonus = 0
          console.log(`   → PUSH detected (difference ${absDiff} < 0.5)`)
        } else if (adjustedMargin > 0) {
          correctWinner = louisvilleJMU.home_team
          if (adjustedMargin >= 29) marginBonus = 5
          else if (adjustedMargin >= 20) marginBonus = 3
          else if (adjustedMargin >= 11) marginBonus = 1
          console.log(`   → HOME team wins ATS (adjusted margin ${adjustedMargin} > 0)`)
        } else {
          correctWinner = louisvilleJMU.away_team
          if (absDiff >= 29) marginBonus = 5
          else if (absDiff >= 20) marginBonus = 3
          else if (absDiff >= 11) marginBonus = 1
          console.log(`   → AWAY team wins ATS (adjusted margin ${adjustedMargin} < 0)`)
        }

        console.log(`   Expected margin bonus: ${marginBonus}`)
        console.log('')

        console.log(`🎯 COMPARISON:`)
        console.log(`   CORRECT winner should be: "${correctWinner}"`)
        console.log(`   CURRENT winner is: "${louisvilleJMU.winner_against_spread}"`)
        console.log(`   CORRECT margin bonus: ${marginBonus}`)
        console.log(`   CURRENT margin bonus: ${louisvilleJMU.margin_bonus}`)
        console.log('')

        if (correctWinner !== louisvilleJMU.winner_against_spread || marginBonus !== louisvilleJMU.margin_bonus) {
          console.log('❌ MISMATCH DETECTED! Game is scored incorrectly.')
          
          // Show sample picks for this game to see the impact
          const { data: picks, error: picksError } = await supabase
            .from('picks')
            .select('id, user_id, selected_team, result, points_earned, is_lock')
            .eq('game_id', louisvilleJMU.id)
            .limit(10)

          if (!picksError && picks && picks.length > 0) {
            console.log('')
            console.log(`📋 SAMPLE PICKS (${picks.length} shown):`)
            picks.forEach((pick, i) => {
              const shouldResult = correctWinner === 'push' ? 'push' : 
                                  pick.selected_team === correctWinner ? 'win' : 'loss'
              const shouldPoints = shouldResult === 'push' ? 10 :
                                  shouldResult === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0
              
              console.log(`   ${i + 1}. User ...${pick.user_id.substring(0,8)} picked ${pick.selected_team}:`)
              console.log(`      Current: ${pick.result} (${pick.points_earned} pts)`)
              console.log(`      Should be: ${shouldResult} (${shouldPoints} pts)`)
              if (pick.result !== shouldResult || pick.points_earned !== shouldPoints) {
                console.log(`      ❌ INCORRECT SCORING`)
              } else {
                console.log(`      ✅ Correctly scored`)
              }
            })
          }

          // Check if live update service might be overriding
          console.log('')
          console.log('🔄 CHECKING FOR AUTOMATED PROCESSES:')
          console.log('   This game may be getting re-scored by:')
          console.log('   1. Live Update Service (runs every 2 minutes)')
          console.log('   2. CFBD API updates')
          console.log('   3. Database triggers')
          console.log('   4. Manual score correction scripts')

        } else {
          console.log('✅ Game is scored correctly according to manual calculation.')
        }
      } else {
        console.log('❌ Game missing required data (scores or spread)')
      }
    } else {
      console.log('❌ Could not find specific Louisville vs James Madison game')
    }

  } catch (error) {
    console.error('❌ Investigation failed:', error)
  }
}

// Run the investigation
investigateLouisvilleGame()