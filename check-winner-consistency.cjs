#!/usr/bin/env node

/**
 * Winner Consistency Checker
 * Detects and optionally fixes games with incorrect winner_against_spread calculations
 * Use this to verify that the race condition fixes are working properly
 */

const { createClient } = require('@supabase/supabase-js')

// Supabase configuration
const supabaseUrl = 'https://zgdaqbnpgrabbljmiqy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Calculate correct winner using unified push logic (< 0.5 tolerance)
 */
function calculateCorrectWinner(homeScore, awayScore, spread, homeTeam, awayTeam) {
  const homeMargin = homeScore - awayScore
  const adjustedMargin = homeMargin + spread
  
  let winner, marginBonus = 0
  
  // Use same logic as CFBD Live Updater and database function
  if (Math.abs(adjustedMargin) < 0.5) {
    winner = 'push'
  } else if (adjustedMargin > 0) {
    winner = homeTeam
    // Calculate margin bonus for home team win
    if (adjustedMargin >= 29) marginBonus = 5
    else if (adjustedMargin >= 20) marginBonus = 3  
    else if (adjustedMargin >= 11) marginBonus = 1
  } else {
    winner = awayTeam
    // Calculate margin bonus for away team win
    if (Math.abs(adjustedMargin) >= 29) marginBonus = 5
    else if (Math.abs(adjustedMargin) >= 20) marginBonus = 3
    else if (Math.abs(adjustedMargin) >= 11) marginBonus = 1
  }
  
  return { winner, marginBonus }
}

/**
 * Check all completed games for winner consistency
 */
async function checkWinnerConsistency(fixIncorrect = false) {
  console.log('🔍 WINNER CONSISTENCY CHECKER')
  console.log('=============================\\n')
  
  try {
    // Get all completed games with scores and winners
    const { data: games, error } = await supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, spread, winner_against_spread, margin_bonus, status, week, season')
      .eq('status', 'completed')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .not('winner_against_spread', 'is', null)
      .order('week', { ascending: true })
    
    if (error) throw error
    
    console.log(`📊 Checking ${games.length} completed games...\\n`)
    
    let correctCount = 0
    let incorrectCount = 0
    let fixedCount = 0
    const incorrectGames = []
    
    for (const game of games) {
      const correct = calculateCorrectWinner(
        game.home_score, 
        game.away_score, 
        game.spread, 
        game.home_team, 
        game.away_team
      )
      
      const isWinnerCorrect = correct.winner === game.winner_against_spread
      const isBonusCorrect = correct.marginBonus === game.margin_bonus
      
      if (isWinnerCorrect && isBonusCorrect) {
        correctCount++
        console.log(`✅ Week ${game.week}: ${game.away_team} @ ${game.home_team} - CORRECT`)
        console.log(`   Final: ${game.away_score}-${game.home_score} (${game.spread}) → Winner: ${game.winner_against_spread}, Bonus: ${game.margin_bonus}`)
      } else {
        incorrectCount++
        incorrectGames.push({
          ...game,
          correctWinner: correct.winner,
          correctBonus: correct.marginBonus
        })
        
        console.log(`❌ Week ${game.week}: ${game.away_team} @ ${game.home_team} - INCORRECT`)
        console.log(`   Final: ${game.away_score}-${game.home_score} (${game.spread})`)
        console.log(`   Current: Winner=${game.winner_against_spread}, Bonus=${game.margin_bonus}`)
        console.log(`   Correct: Winner=${correct.winner}, Bonus=${correct.marginBonus}`)
        
        // Show detailed calculation for pushes
        if (correct.winner === 'push' || game.winner_against_spread === 'push') {
          const homeMargin = game.home_score - game.away_score
          const adjustedMargin = homeMargin + game.spread
          console.log(`   🔍 Push Analysis: Home margin=${homeMargin}, Adjusted=${adjustedMargin}, Abs=${Math.abs(adjustedMargin)}`)
        }
        
        if (fixIncorrect) {
          console.log(`   🔧 FIXING...`)
          const { error: updateError } = await supabase
            .from('games')
            .update({
              winner_against_spread: correct.winner,
              margin_bonus: correct.marginBonus,
              base_points: 20,
              updated_at: new Date().toISOString()
            })
            .eq('id', game.id)
          
          if (updateError) {
            console.log(`   ❌ Fix failed: ${updateError.message}`)
          } else {
            fixedCount++
            console.log(`   ✅ Fixed successfully`)
            
            // Also recalculate affected picks
            try {
              await supabase.rpc('process_picks_for_completed_game', {
                game_id_param: game.id
              })
              console.log(`   ✅ Picks recalculated`)
            } catch (pickError) {
              console.log(`   ⚠️ Pick recalculation failed: ${pickError.message}`)
            }
          }
        }
      }
      console.log() // Empty line for readability
    }
    
    console.log('\\n📊 CONSISTENCY CHECK RESULTS:')
    console.log('============================')
    console.log(`✅ Correct games: ${correctCount}`)
    console.log(`❌ Incorrect games: ${incorrectCount}`)
    if (fixIncorrect) {
      console.log(`🔧 Games fixed: ${fixedCount}`)
    }
    
    if (incorrectCount > 0 && !fixIncorrect) {
      console.log('\\n💡 To fix incorrect games, run: node check-winner-consistency.cjs --fix')
    }
    
    if (incorrectCount === 0) {
      console.log('\\n🎉 All games have correct winner calculations!')
      console.log('✅ Race condition fixes are working properly')
    }
    
    return {
      total: games.length,
      correct: correctCount,
      incorrect: incorrectCount,
      fixed: fixedCount,
      incorrectGames
    }
    
  } catch (error) {
    console.error('❌ Consistency check failed:', error.message)
    return null
  }
}

// Main execution
async function main() {
  const shouldFix = process.argv.includes('--fix')
  
  if (shouldFix) {
    console.log('🔧 Running in FIX mode - will correct incorrect winners\\n')
  } else {
    console.log('🔍 Running in CHECK mode - will only identify issues\\n')
  }
  
  const result = await checkWinnerConsistency(shouldFix)
  
  if (result && result.incorrect > 0) {
    console.log('\\n🚨 POTENTIAL RACE CONDITIONS DETECTED!')
    console.log('Check logs above for games that may have been affected by competing calculations.')
  }
}

main().catch(console.error)