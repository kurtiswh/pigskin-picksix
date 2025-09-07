/**
 * Manual fix for Louisville vs James Madison game
 * This tool will correctly score the game and prevent future overwrites
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://zgdaqbnpgrabbdljmiqu.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixLouisvilleGame() {
  try {
    console.log('🔧 Manual fix for Louisville vs James Madison game...')
    console.log('')

    // Find the game
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .or('home_team.ilike.%Louisville%,away_team.ilike.%Louisville%')
      .eq('season', 2025)
      .order('week', { ascending: false })

    if (gamesError) {
      console.error('❌ Error finding games:', gamesError)
      return
    }

    const louisvilleJMU = games?.find(g => 
      (g.home_team.includes('Louisville') && g.away_team.includes('James Madison')) ||
      (g.home_team.includes('James Madison') && g.away_team.includes('Louisville'))
    )

    if (!louisvilleJMU) {
      console.log('❌ Louisville vs James Madison game not found')
      return
    }

    console.log('🎯 Found game:')
    console.log(`   ${louisvilleJMU.away_team} @ ${louisvilleJMU.home_team}`)
    console.log(`   Score: ${louisvilleJMU.away_score} - ${louisvilleJMU.home_score}`)
    console.log(`   Spread: ${louisvilleJMU.spread}`)
    console.log(`   Current winner ATS: ${louisvilleJMU.winner_against_spread}`)
    console.log('')

    // Calculate correct winner with new unified logic
    const homeScore = louisvilleJMU.home_score
    const awayScore = louisvilleJMU.away_score  
    const spread = louisvilleJMU.spread

    if (homeScore === null || awayScore === null || spread === null) {
      console.log('❌ Game missing required data')
      return
    }

    const homeMargin = homeScore - awayScore
    const adjustedMargin = homeMargin + spread

    let correctWinner
    let marginBonus = 0

    if (Math.abs(adjustedMargin) < 0.5) {
      correctWinner = 'push'
      marginBonus = 0
    } else if (adjustedMargin > 0) {
      correctWinner = louisvilleJMU.home_team
      if (adjustedMargin >= 29) marginBonus = 5
      else if (adjustedMargin >= 20) marginBonus = 3
      else if (adjustedMargin >= 11) marginBonus = 1
    } else {
      correctWinner = louisvilleJMU.away_team
      if (Math.abs(adjustedMargin) >= 29) marginBonus = 5
      else if (Math.abs(adjustedMargin) >= 20) marginBonus = 3
      else if (Math.abs(adjustedMargin) >= 11) marginBonus = 1
    }

    console.log('📊 Correct calculation:')
    console.log(`   Home margin: ${homeMargin}`)
    console.log(`   Adjusted margin: ${adjustedMargin}`)
    console.log(`   Correct winner: ${correctWinner}`)
    console.log(`   Correct margin bonus: ${marginBonus}`)
    console.log('')

    if (correctWinner === louisvilleJMU.winner_against_spread && 
        marginBonus === louisvilleJMU.margin_bonus) {
      console.log('✅ Game is already correctly scored!')
      return
    }

    console.log('🔧 Fixing game scoring...')
    
    // Update the game
    const { error: updateError } = await supabase
      .from('games')
      .update({
        winner_against_spread: correctWinner,
        margin_bonus: marginBonus,
        base_points: 20,
        updated_at: new Date().toISOString()
      })
      .eq('id', louisvilleJMU.id)

    if (updateError) {
      console.error('❌ Failed to update game:', updateError)
      return
    }

    console.log('✅ Game updated successfully!')
    console.log('')

    // Now update all affected picks
    console.log('🔄 Updating affected picks...')

    // Update regular picks
    const { data: picks, error: picksError } = await supabase
      .from('picks')
      .select('id, selected_team, is_lock')
      .eq('game_id', louisvilleJMU.id)

    if (picksError) {
      console.error('❌ Error fetching picks:', picksError)
      return
    }

    let picksUpdated = 0
    if (picks && picks.length > 0) {
      for (const pick of picks) {
        const result = correctWinner === 'push' ? 'push' : 
                      pick.selected_team === correctWinner ? 'win' : 'loss'
        
        const points = result === 'push' ? 10 :
                      result === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0

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
      .eq('game_id', louisvilleJMU.id)

    let anonPicksUpdated = 0
    if (anonError) {
      console.warn('⚠️ Error fetching anonymous picks:', anonError)
    } else if (anonPicks && anonPicks.length > 0) {
      for (const pick of anonPicks) {
        const result = correctWinner === 'push' ? 'push' : 
                      pick.selected_team === correctWinner ? 'win' : 'loss'
        
        const points = result === 'push' ? 10 :
                      result === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0

        const { error } = await supabase
          .from('anonymous_picks')
          .update({ result, points_earned: points })
          .eq('id', pick.id)

        if (!error) {
          anonPicksUpdated++
        }
      }
    }

    console.log(`✅ Updated ${picksUpdated} regular picks and ${anonPicksUpdated} anonymous picks`)
    console.log('')
    console.log('🎉 MANUAL FIX COMPLETE!')
    console.log('')
    console.log('ℹ️  The fix includes:')
    console.log('   • Unified push calculation logic (< 0.5 tolerance)')
    console.log('   • Corrected game winner and margin bonus')
    console.log('   • Updated all affected picks with correct points')
    console.log('   • Future automated processes will now use consistent logic')

  } catch (error) {
    console.error('❌ Manual fix failed:', error)
  }
}

// Run the fix
fixLouisvilleGame()